"""Live PostgreSQL checks. Run with KEZEK_POSTGRES_TEST_URL to an isolated DB."""

from collections.abc import Iterator
import os
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL, make_url

from app.main import create_app
from app.sqlite_import import import_sqlite_database


@pytest.fixture
def postgres_test_url() -> Iterator[str]:
    raw_url = os.getenv("KEZEK_POSTGRES_TEST_URL")
    if not raw_url:
        pytest.skip("KEZEK_POSTGRES_TEST_URL is not configured")

    url = make_url(raw_url)
    if url.get_backend_name() != "postgresql" or "test" not in (url.database or "").casefold():
        pytest.fail("KEZEK_POSTGRES_TEST_URL must target a disposable PostgreSQL database")

    schema = f"kezek_test_{uuid4().hex}"
    admin_engine = create_engine(url, pool_pre_ping=True)
    try:
        with admin_engine.begin() as connection:
            connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        isolated_query = dict(url.query)
        isolated_query["options"] = f"-csearch_path={schema}"
        yield url.set(query=isolated_query).render_as_string(hide_password=False)
    finally:
        with admin_engine.begin() as connection:
            connection.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
        admin_engine.dispose()


def test_postgresql_import_and_application_persistence_across_restart(
    postgres_test_url, monkeypatch, tmp_path
):
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("SEED_DEMO_DATA", "true")
    source_path = tmp_path / "legacy.sqlite"
    with TestClient(create_app(database_url=f"sqlite:///{source_path}")) as legacy:
        source_ticket = legacy.post(
            "/api/tickets",
            json={"serviceId": "svc-reg", "customerName": "Imported SQLite ticket"},
        )
        assert source_ticket.status_code == 201, source_ticket.text
        imported_ticket_token = source_ticket.json()["id"]

    imported_counts = import_sqlite_database(source_path, postgres_test_url)
    assert imported_counts["tickets"] > 0

    private_ticket_token = None
    session_token = None
    database_name = None

    with TestClient(create_app(database_url=postgres_test_url)) as first:
        store = first.app.state.store
        assert store.db.engine.dialect.name == "postgresql"
        with store.db.engine.connect() as connection:
            database_name = connection.execute(text("SELECT current_database()")).scalar_one()
            assert connection.execute(text("SELECT 1")).scalar_one() == 1

        services = first.get("/api/services")
        assert services.status_code == 200
        assert any(row["id"] == "svc-reg" for row in services.json())
        imported_ticket = first.get(f"/api/tickets/{imported_ticket_token}")
        assert imported_ticket.status_code == 200, imported_ticket.text
        assert imported_ticket.json()["customerName"] == "Imported SQLite ticket"

        issued = first.post(
            "/api/tickets",
            json={"serviceId": "svc-reg", "customerName": "PostgreSQL integration"},
        )
        assert issued.status_code == 201, issued.text
        ticket = issued.json()
        private_ticket_token = ticket["id"]
        assert first.get(f"/api/tickets/{private_ticket_token}").json()["id"] == private_ticket_token

        login = first.post(
            "/api/auth/login", json={"username": "admin", "password": "admin123"}
        )
        assert login.status_code == 200, login.text
        session_token = login.json()["token"]
        admin_services = first.get(
            "/api/admin/services", headers={"Authorization": f"Bearer {session_token}"}
        )
        assert admin_services.status_code == 200

    # A new FastAPI application and SQLAlchemy engine must observe the writes.
    with TestClient(create_app(database_url=postgres_test_url)) as second:
        store = second.app.state.store
        assert store.db.engine.dialect.name == "postgresql"
        with store.db.engine.connect() as connection:
            assert connection.execute(text("SELECT current_database()")).scalar_one() == database_name

        restored = second.get(f"/api/tickets/{private_ticket_token}")
        assert restored.status_code == 200, restored.text
        assert restored.json()["status"] == "waiting"
        admin_services = second.get(
            "/api/admin/services", headers={"Authorization": f"Bearer {session_token}"}
        )
        assert admin_services.status_code == 200
        assert any(row["id"] == "svc-reg" for row in admin_services.json())
