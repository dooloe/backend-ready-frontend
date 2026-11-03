"""Import an existing SQLite installation into an empty PostgreSQL database.

The source is copied with SQLite's online backup API, migrated on the copy, and
opened read-only afterwards. The original database and its WAL files are never
modified by this command.
"""

from __future__ import annotations

import argparse
from collections import OrderedDict
import json
from pathlib import Path
import sqlite3
import tempfile
from urllib.parse import quote

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import URL, inspect, make_url, select, text
from sqlalchemy.engine import Connection, Engine

from .database import Database
from .orm import Base
from .settings import database_url_from_environment


def _snapshot_sqlite(source_path: Path, snapshot_path: Path) -> None:
    source_path = source_path.expanduser().resolve(strict=True)
    source_uri = f"file:{quote(str(source_path), safe='/')}?mode=ro"
    with sqlite3.connect(source_uri, uri=True, timeout=10) as source:
        with sqlite3.connect(snapshot_path) as snapshot:
            source.backup(snapshot)
            snapshot.commit()


def _assert_sqlite_integrity(database: Database) -> None:
    with database.engine.connect() as connection:
        result = connection.exec_driver_sql("PRAGMA integrity_check").scalar_one()
        if result != "ok":
            raise RuntimeError(f"SQLite snapshot failed integrity_check: {result}")
        violations = connection.exec_driver_sql("PRAGMA foreign_key_check").all()
        if violations:
            raise RuntimeError(
                f"SQLite snapshot contains {len(violations)} foreign-key violation(s)"
            )


def _table_counts(connection: Connection, table_names: list[str]) -> OrderedDict[str, int]:
    counts: OrderedDict[str, int] = OrderedDict()
    for name in table_names:
        table = Base.metadata.tables[name]
        counts[name] = connection.execute(
            select(text("count(*)")).select_from(table)
        ).scalar_one()
    return counts


def _current_head() -> str:
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    return ScriptDirectory.from_config(config).get_current_head()


def _assert_migration_head(engine: Engine, database_name: str) -> None:
    with engine.connect() as connection:
        version = connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one_or_none()
    if version != _current_head():
        raise RuntimeError(f"{database_name} database must be at the current Alembic head")


def _restore_postgresql_ticket_sequence(connection: Connection) -> None:
    maximum = connection.execute(text("SELECT max(ordinal) FROM tickets")).scalar_one()
    sequence = connection.execute(
        text("SELECT pg_get_serial_sequence('tickets', 'ordinal')")
    ).scalar_one_or_none()
    if maximum is not None and sequence is not None:
        connection.execute(
            text("SELECT setval(CAST(:sequence AS regclass), :maximum, true)"),
            {"sequence": sequence, "maximum": maximum},
        )


def import_sqlite_database(source_path: str | Path, target_url: str) -> dict[str, int]:
    """Copy all supported records from SQLite to an empty migrated PostgreSQL DB."""
    try:
        target_backend = make_url(target_url).get_backend_name()
    except Exception:
        raise ValueError("The import destination must be a valid PostgreSQL URL") from None
    if target_backend != "postgresql":
        raise ValueError("The import destination must be a PostgreSQL database")
    source = Path(source_path).expanduser().resolve(strict=True)
    target = Database(target_url)

    try:
        target.create_schema()
        _assert_migration_head(target.engine, "PostgreSQL destination")
        table_names = [table.name for table in Base.metadata.sorted_tables]
        with target.engine.connect() as target_connection:
            target_counts = _table_counts(target_connection, table_names)
        occupied = [name for name, count in target_counts.items() if count]
        if occupied:
            raise RuntimeError(
                "PostgreSQL destination is not empty; refusing to merge or overwrite "
                "existing data (non-empty tables: " + ", ".join(occupied) + ")"
            )

        with tempfile.TemporaryDirectory(prefix="kezek-sqlite-import-") as directory:
            snapshot_path = Path(directory) / "source.sqlite"
            _snapshot_sqlite(source, snapshot_path)
            sqlite_url = URL.create("sqlite+pysqlite", database=str(snapshot_path))
            snapshot = Database(sqlite_url.render_as_string(hide_password=False))
            try:
                # Upgrade only the private snapshot. This also supports older
                # complete SQLite schemas without altering the user's file.
                snapshot.create_schema()
                _assert_sqlite_integrity(snapshot)
                _assert_migration_head(snapshot.engine, "SQLite snapshot")
                source_tables = set(inspect(snapshot.engine).get_table_names()) - {"alembic_version"}
                expected_tables = set(table_names)
                if source_tables != expected_tables:
                    missing = sorted(expected_tables - source_tables)
                    extra = sorted(source_tables - expected_tables)
                    raise RuntimeError(
                        "SQLite snapshot does not match the supported application schema "
                        f"(missing={missing}, extra={extra})"
                    )

                with snapshot.engine.connect() as source_connection:
                    source_counts = _table_counts(source_connection, table_names)
                    with target.engine.begin() as target_connection:
                        for table in Base.metadata.sorted_tables:
                            if table.name == "alembic_version":
                                continue
                            result = source_connection.execution_options(stream_results=True).execute(
                                select(table)
                            ).mappings()
                            while rows := result.fetchmany(500):
                                target_connection.execute(
                                    table.insert(), [dict(row) for row in rows]
                                )
                        _restore_postgresql_ticket_sequence(target_connection)
                        imported = _table_counts(target_connection, table_names)
                        if imported != source_counts:
                            raise RuntimeError(
                                "PostgreSQL import row counts do not match the SQLite snapshot"
                            )
                return imported
            finally:
                snapshot.close()
    finally:
        target.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Safely import a SQLite Kezek database into an empty PostgreSQL database."
    )
    parser.add_argument("--source", required=True, type=Path, help="SQLite database file to copy")
    parser.add_argument(
        "--target-url",
        help="PostgreSQL URL; defaults to DATABASE_URL (credentials are never printed)",
    )
    arguments = parser.parse_args()
    counts = import_sqlite_database(
        arguments.source,
        arguments.target_url or database_url_from_environment(),
    )
    print(json.dumps({"imported_rows": counts}, indent=2))


if __name__ == "__main__":
    main()
