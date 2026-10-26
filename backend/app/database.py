"""SQLAlchemy engine/session boundary; dialect-specific behavior stays here."""

from contextlib import contextmanager, nullcontext
from pathlib import Path
import sqlite3
from threading import RLock

from fastapi import HTTPException
from sqlalchemy import create_engine, event, select
from sqlalchemy.engine import make_url
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from .orm import StoreState
from .settings import boolean_setting, database_url_from_environment


def configured_database_url() -> str:
    return database_url_from_environment()


def configured_demo_seed() -> bool:
    return boolean_setting("SEED_DEMO_DATA", "true")


class Database:
    def __init__(self, url: str):
        parsed = make_url(url)
        self.is_sqlite = parsed.get_backend_name() == "sqlite"
        memory = self.is_sqlite and parsed.database in (None, "", ":memory:")
        options = {"pool_pre_ping": True}
        if self.is_sqlite:
            options["connect_args"] = {"check_same_thread": False, "timeout": 10}
            if memory:
                options["poolclass"] = StaticPool
            else:
                path = Path(parsed.database).expanduser().resolve()
                path.parent.mkdir(parents=True, exist_ok=True)
                parsed = parsed.set(database=str(path))
        self.engine = create_engine(parsed, **options)
        # Only in-memory SQLite shares one physical connection. File-backed
        # databases synchronize through database transactions, not Python locks.
        self._connection_guard = RLock() if memory else None
        if self.is_sqlite:
            @event.listens_for(self.engine, "connect")
            def sqlite_connect(connection, _record):
                connection.isolation_level = None
                cursor = connection.cursor()
                cursor.execute("PRAGMA foreign_keys=ON")
                cursor.execute("PRAGMA busy_timeout=10000")
                cursor.execute("PRAGMA journal_mode=WAL")
                cursor.close()

            @event.listens_for(self.engine, "begin")
            def sqlite_begin(connection):
                # Reserve the writer BEFORE any mutable reads to avoid races
                # and read-to-write upgrades across independent app processes.
                connection.exec_driver_sql(
                    "BEGIN IMMEDIATE" if connection.get_execution_options().get("kezek_write") else "BEGIN"
                )

    @contextmanager
    def session(self, *, write: bool = False):
        guard = self._connection_guard if self._connection_guard is not None else nullcontext()
        try:
            with guard:
                with self.engine.connect().execution_options(kezek_write=write) as connection:
                    with Session(bind=connection, expire_on_commit=False) as session:
                        with session.begin():
                            if write and self.is_sqlite:
                                # Session.begin() is lazy. Open its connection now
                                # so entering a write context actually reserves it.
                                session.connection()
                            elif write:
                                # Portable row-locking strategy for future PostgreSQL
                                # support. Keep the same strict operation ordering.
                                session.execute(select(StoreState).where(StoreState.id == 1).with_for_update()).scalar_one_or_none()
                            yield session
        except OperationalError as exc:
            code = getattr(exc.orig, "sqlite_errorcode", 0) or 0
            if self.is_sqlite and (code & 255) in (sqlite3.SQLITE_BUSY, sqlite3.SQLITE_LOCKED):
                raise HTTPException(503, "Database busy; retry the request", headers={"Retry-After": "1"}) from exc
            raise

    def create_schema(self):
        from alembic import command
        from alembic.config import Config

        config_path = Path(__file__).resolve().parents[1] / "alembic.ini"
        config = Config(str(config_path))
        with self.engine.connect().execution_options(kezek_write=True) as connection:
            config.attributes["connection"] = connection
            sqlite_connection = connection.connection.driver_connection if self.is_sqlite else None
            if self.is_sqlite:
                # Alembic's SQLite batch mode replaces tables. SQLite's FK pragma
                # cannot be toggled inside a transaction, so suspend enforcement
                # on this migration connection and verify all references before
                # restoring it. Request connections always keep FK enforcement on.
                sqlite_connection.execute("PRAGMA foreign_keys=OFF")
            try:
                command.upgrade(config, "head")
                if self.is_sqlite:
                    violations = sqlite_connection.execute("PRAGMA foreign_key_check").fetchall()
                    if violations:
                        raise RuntimeError(f"Migration produced foreign-key violations: {violations!r}")
            finally:
                if self.is_sqlite:
                    sqlite_connection.execute("PRAGMA foreign_keys=ON")

    def close(self):
        self.engine.dispose()
