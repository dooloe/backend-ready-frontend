"""Live PostgreSQL checks. Run with KEZEK_POSTGRES_TEST_URL to an isolated DB."""

from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
import base64
import os
from pathlib import Path
from uuid import uuid4

from alembic import command
from alembic.config import Config
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import URL, make_url
from sqlalchemy.exc import IntegrityError

from app.main import create_app
from app.models import LoginRequest
from app.orm import DailyQueueRow, ServiceRow, TicketEventRow, TicketRow, UserRow
from app.sqlite_import import import_sqlite_database
from app.store import DatabaseStore
from provision_production import provision


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


def _proof(value: int) -> str:
    return base64.urlsafe_b64encode(bytes([value]) * 32).decode().rstrip("=")


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
        assert source_ticket.status_code == 200, source_ticket.text
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
        with store.db.session() as session:
            imported_ticket = session.scalar(
                select(TicketRow).where(TicketRow.id == imported_ticket_token)
            )
            assert imported_ticket is not None
            assert imported_ticket.customerName == "Imported SQLite ticket"

        queue = first.get("/api/organizations/org-demo/services").json()[0]["queue"]
        private_ticket_token = _proof(21)
        issued = first.post(
            f"/api/queues/{queue['id']}/tickets",
            headers={"Idempotency-Key": _proof(22)},
            json={"accessToken": private_ticket_token},
        )
        assert issued.status_code == 201, issued.text
        ticket = issued.json()["ticket"]
        assert first.get(f"/api/tickets/{private_ticket_token}").json()["id"] == ticket["id"]

        login = first.post(
            "/api/auth/login", json={"username": "admin", "password": "admin123"}
        )
        assert login.status_code == 200, login.text
        session_token = login.json()["token"]
        admin_services = first.get(
            "/api/admin/services", headers={"Authorization": f"Bearer {session_token}"}
        )
        assert admin_services.status_code == 200
        staff_login = first.post(
            "/api/auth/login", json={"username": "aigerim", "password": "staff123"}
        )
        assert staff_login.status_code == 200
        staff_headers = {"Authorization": f"Bearer {staff_login.json()['token']}"}
        with ThreadPoolExecutor(max_workers=2) as pool:
            calls = list(
                pool.map(
                    lambda _: first.post("/api/counters/cnt-1/call-next", headers=staff_headers),
                    (1, 2),
                )
            )
        assert sorted(response.status_code for response in calls) == [200, 409]

    # A new FastAPI application and SQLAlchemy engine must observe the writes.
    with TestClient(create_app(database_url=postgres_test_url)) as second:
        store = second.app.state.store
        assert store.db.engine.dialect.name == "postgresql"
        with store.db.engine.connect() as connection:
            assert connection.execute(text("SELECT current_database()")).scalar_one() == database_name
        with store.db.session() as session:
            imported_ticket = session.scalar(
                select(TicketRow).where(TicketRow.id == imported_ticket_token)
            )
            assert imported_ticket is not None
            assert imported_ticket.customerName == "Imported SQLite ticket"

        restored = second.get(f"/api/tickets/{private_ticket_token}")
        assert restored.status_code == 200, restored.text
        assert restored.json()["status"] == "waiting"
        admin_services = second.get(
            "/api/admin/services", headers={"Authorization": f"Bearer {session_token}"}
        )
        assert admin_services.status_code == 200
        assert any(row["id"] == "svc-reg" for row in admin_services.json())


def test_postgresql_constraints_rollback_idempotency_races_timezone_and_analytics(
    postgres_test_url, monkeypatch
):
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("SEED_DEMO_DATA", "true")

    with TestClient(create_app(database_url=postgres_test_url)) as client:
        store = client.app.state.store
        admin_login = client.post(
            "/api/auth/login", json={"username": "admin", "password": "admin123"}
        )
        assert admin_login.status_code == 200
        admin_headers = {"Authorization": f"Bearer {admin_login.json()['token']}"}

        with pytest.raises(IntegrityError):
            with store.db.session(write=True) as session:
                session.add(
                    UserRow(
                        id="duplicate-admin",
                        organization_id="org-demo",
                        name="Duplicate",
                        username="admin",
                        email="duplicate@example.invalid",
                        role="admin",
                        password_hash="unused",
                        is_active=True,
                    )
                )

        with pytest.raises(RuntimeError, match="rollback"):
            with store.db.session(write=True) as session:
                service = session.get(ServiceRow, "svc-reg")
                service.name = "Uncommitted PostgreSQL change"
                session.flush()
                raise RuntimeError("rollback")
        assert next(row for row in store.list_services() if row.id == "svc-reg").name == "Registrar Office"

        with store.db.session() as session:
            queue_id = session.scalar(
                select(DailyQueueRow.id)
                .where(DailyQueueRow.service_id == "svc-reg")
                .order_by(DailyQueueRow.business_date.desc())
                .limit(1)
            )
        assert queue_id is not None

        key, access = _proof(101), _proof(102)
        headers = {"Idempotency-Key": key}
        payload = {"accessToken": access}
        first = client.post(f"/api/queues/{queue_id}/tickets", headers=headers, json=payload)
        replay = client.post(f"/api/queues/{queue_id}/tickets", headers=headers, json=payload)
        assert first.status_code == 201, first.text
        assert replay.status_code == 200, replay.text
        assert replay.json()["ticket"]["id"] == first.json()["ticket"]["id"]

        def issue_pair(value: int):
            return client.post(
                f"/api/queues/{queue_id}/tickets",
                headers={"Idempotency-Key": _proof(value)},
                json={"accessToken": _proof(value + 1)},
            )

        with ThreadPoolExecutor(max_workers=2) as pool:
            concurrent = list(pool.map(issue_pair, (103, 105)))
        assert all(response.status_code == 201 for response in concurrent)
        assert len({response.json()["ticket"]["id"] for response in concurrent}) == 2

        created_ids = [first.json()["ticket"]["id"]] + [
            response.json()["ticket"]["id"] for response in concurrent
        ]
        with store.db.session() as session:
            rows = list(session.scalars(select(TicketRow).where(TicketRow.id.in_(created_ids))))
            events = list(
                session.scalars(select(TicketEventRow).where(TicketEventRow.ticket_id.in_(created_ids)))
            )
        assert len(rows) == len(created_ids)
        assert len(events) >= len(created_ids)
        assert all(row.createdAt.tzinfo is not None for row in rows)
        assert all(event.ticket_id in created_ids and event.occurred_at.tzinfo is not None for event in events)

        analytics = client.get("/api/admin/analytics", headers=admin_headers)
        assert analytics.status_code == 200, analytics.text
        assert analytics.json()["issued"] >= len(created_ids)

        migration_config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
        with store.db.engine.connect() as connection:
            migration_config.attributes["connection"] = connection
            command.check(migration_config)


def test_production_bootstrap_creates_two_real_organizations_and_initial_users(
    postgres_test_url, monkeypatch
):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("SEED_DEMO_DATA", "false")
    store = DatabaseStore(postgres_test_url, seed_demo=False)
    try:
        assert store.db.engine.dialect.name == "postgresql"
        provision(store, {
            "admin": "private-admin-test-password",
            "uni_staff": "private-uni-test-password",
            "health_staff": "private-health-test-password",
        })
        admin = store.login(LoginRequest(
            username="admin", password="private-admin-test-password",
        )).user
        organizations = store.list_organizations()
        assert {(row.name, row.location) for row in organizations} == {
            ("Almaty University", "Almaty, Kazakhstan"),
            ("City Health Clinic", "Astana, Kazakhstan"),
        }
        assert {service.name for service in store.list_admin_services(admin)} == {
            "Dormitory Support", "Tuition Payment", "Primary Care Consultation",
        }
        assert {user.username for user in store.list_staff(admin)} == {
            "admin", "uni_staff", "health_staff",
        }
        assert {counter.organizationId for counter in store.list_counters(admin)} == {
            "org-university", "org-health-clinic",
        }
        health_staff = next(
            user for user in store.list_staff(admin) if user.username == "health_staff"
        )
        assert [counter.id for counter in store.list_counters(health_staff)] == ["counter-clinic"]
        with pytest.raises(HTTPException) as denied:
            store.queue("counter-uni", health_staff)
        assert denied.value.status_code == 404

        clinic_service = next(
            service for service in store.list_admin_services(admin)
            if service.name == "Primary Care Consultation"
        )
        store.update_service(clinic_service.id, {"description": "Configured in test"}, admin)
        provision(store, {
            "admin": "must-not-reset",
            "uni_staff": "must-not-reset",
            "health_staff": "must-not-reset",
        })
        refreshed = next(
            service for service in store.list_admin_services(admin)
            if service.id == clinic_service.id
        )
        assert refreshed.description == "Configured in test"
        assert store.login(LoginRequest(
            username="admin", password="private-admin-test-password",
        )).user.isPlatformAdmin
    finally:
        store.close()
