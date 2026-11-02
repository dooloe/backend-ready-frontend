import hashlib
import sqlite3

import pytest

from app.sqlite_import import _snapshot_sqlite, import_sqlite_database


def test_snapshot_uses_read_only_source_and_preserves_source_bytes(tmp_path):
    source_path = tmp_path / "source.sqlite"
    with sqlite3.connect(source_path) as source:
        source.execute("CREATE TABLE sample (id INTEGER PRIMARY KEY, value TEXT NOT NULL)")
        source.execute("INSERT INTO sample VALUES (1, 'preserve me')")
    before = hashlib.sha256(source_path.read_bytes()).digest()

    snapshot_path = tmp_path / "snapshot.sqlite"
    _snapshot_sqlite(source_path, snapshot_path)

    assert hashlib.sha256(source_path.read_bytes()).digest() == before
    with sqlite3.connect(snapshot_path) as snapshot:
        assert snapshot.execute("SELECT * FROM sample").fetchall() == [(1, "preserve me")]


def test_import_rejects_sqlite_destination_without_touching_source(tmp_path):
    source_path = tmp_path / "source.sqlite"
    with sqlite3.connect(source_path) as source:
        source.execute("CREATE TABLE sample (id INTEGER PRIMARY KEY)")
        source.execute("INSERT INTO sample VALUES (1)")
    before = hashlib.sha256(source_path.read_bytes()).digest()

    target_path = tmp_path / "target.sqlite"
    with pytest.raises(ValueError, match="destination must be a PostgreSQL"):
        import_sqlite_database(source_path, f"sqlite:///{target_path}")
    assert hashlib.sha256(source_path.read_bytes()).digest() == before
    assert not target_path.exists()
