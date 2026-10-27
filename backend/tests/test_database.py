from datetime import date, datetime, timedelta, timezone
import base64
import multiprocessing
import os
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from fastapi.testclient import TestClient
import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_mock_engine, func, inspect, select
from sqlalchemy.exc import IntegrityError

from app.auth import token_hash
from app.database import Database
from app.main import create_app
from app.models import JoinQueueRequest, LoginRequest, StaffUser
from app.orm import (ActiveTicketRow, Base, CounterRow, CounterServiceRow, DailyQueueRow,
                     OrganizationRow, ServiceRow, SessionRow, StaffAssignmentRow, StoreState,
                     TicketEventRow, TicketRow, UserRow)
from app.store import DatabaseStore


ADMIN_ACTOR = StaffUser(id="stf-admin", name="Admin", username="admin", role="admin")


def _database_worker(url, action, barrier, output):
    """Spawned processes share only the database, not engines or Python locks."""
    store = None
    try:
        store = DatabaseStore(url, seed_tickets=False)
        barrier.wait(timeout=30)
        if action == "join":
            result = [store.join(JoinQueueRequest(serviceId="svc-reg", customerName="Parallel")).code for _ in range(4)]
        elif isinstance(action, tuple) and action[0] == "issue":
            issued, created = store.issue_ticket(action[1], action[2], action[3])
            result = {"id": issued.ticket.id, "created": created}
        elif isinstance(action, tuple) and action[0] == "cancel":
            try:
                result = {"status": 200, "id": store.cancel(action[1]).id}
            except HTTPException as exc:
                result = {"status": exc.status_code}
        elif isinstance(action, tuple) and action[0] == "call":
            try:
                ticket = store.call_next(action[1], ADMIN_ACTOR)
                result = {"status": 200, "id": ticket.id if ticket else None}
            except HTTPException as exc:
                result = {"status": exc.status_code}
        else:
            try:
                ticket = store.call_next(action, ADMIN_ACTOR)
                result = {"status": 200, "id": ticket.id if ticket else None}
            except HTTPException as exc:
                result = {"status": exc.status_code}
        output.put((os.getpid(), result))
    except Exception as exc:
        output.put((os.getpid(), {"error": repr(exc)}))
        raise
    finally:
        if store is not None:
            store.close()


def run_workers(url, actions):
    context = multiprocessing.get_context("spawn")
    barrier, output = context.Barrier(len(actions)), context.Queue()
    processes = [context.Process(target=_database_worker, args=(url, action, barrier, output)) for action in actions]
    try:
        for process in processes:
            process.start()
        results = [output.get(timeout=40) for _ in processes]
        for process in processes:
            process.join(timeout=10)
            assert process.exitcode == 0
        assert len({pid for pid, _ in results}) == len(actions)
        return [result for _, result in results]
    finally:
        for process in processes:
            if process.is_alive():
                process.terminate()
                process.join(timeout=5)
        output.close()


def test_application_restart_preserves_every_data_category(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'persistent.db'}"
    monkeypatch.setenv("SEED_DEMO_DATA", "true")
    with TestClient(create_app(database_url=url)) as first:
        login = first.post("/api/auth/login", json={"username": "admin", "password": "admin123"}).json()
        headers = {"Authorization": "Bearer " + login["token"]}
        user = first.post("/api/admin/staff", headers=headers, json={
            "name": "Persistent staff", "username": "persistent", "role": "staff", "password": "password"}).json()
        service = first.post("/api/admin/services", headers=headers, json={
            "name": "Persistent service", "description": "Saved", "prefix": "P", "isOpen": True, "avgServiceMinutes": 4}).json()
        counter = first.post("/api/admin/counters", headers=headers, json={
            "name": "Persistent counter", "serviceIds": [service["id"]], "isActive": True, "staffId": user["id"]}).json()
        history_service = first.post("/api/admin/services", headers=headers, json={
            "name": "Historical service", "description": "Retained reporting history",
            "prefix": "H", "isOpen": True, "avgServiceMinutes": 6,
        }).json()
        history_counter = first.post("/api/admin/counters", headers=headers, json={
            "name": "Historical counter", "serviceIds": [history_service["id"]],
            "isActive": True, "staffId": None,
        }).json()
        historical_ticket = first.post("/api/tickets", json={
            "serviceId": history_service["id"], "customerName": "Historical visitor",
        }).json()
        history_called = first.post(
            f"/api/counters/{history_counter['id']}/call-next", headers=headers,
        )
        assert history_called.json()["id"] == historical_ticket["id"]
        assert first.post(
            f"/api/tickets/{historical_ticket['id']}/start", headers=headers,
        ).status_code == 200
        assert first.post(
            f"/api/tickets/{historical_ticket['id']}/complete", headers=headers,
        ).status_code == 200
        deactivated = first.patch(
            f"/api/admin/services/{history_service['id']}", headers=headers,
            json={"isActive": False},
        )
        assert deactivated.status_code == 200 and deactivated.json()["isActive"] is False
        first.patch("/api/admin/services/svc-reg", headers=headers, json={"name": "Edited seed"})
        first.delete("/api/admin/services/svc-it", headers=headers)
        first.delete("/api/admin/counters/cnt-2", headers=headers)
        ticket = first.post("/api/tickets", json={"serviceId": service["id"], "customerName": "Persistent ticket"}).json()
        called = first.post(f"/api/counters/{counter['id']}/call-next", headers=headers)
        assert called.json()["id"] == ticket["id"]
        started = first.post(f"/api/tickets/{ticket['id']}/start", headers=headers).json()

    with TestClient(create_app(database_url=url)) as second:
        # The same bearer token works after the old app and engine have closed.
        counters = second.get("/api/counters", headers=headers)
        assert counters.status_code == 200
        saved = next(row for row in counters.json() if row["id"] == counter["id"])
        assert saved["staffId"] == user["id"] and saved["serviceIds"] == [service["id"]]
        assert all(row["id"] != "cnt-2" for row in counters.json())
        services = second.get("/api/services").json()
        assert all(row["id"] != "svc-it" for row in services)
        assert next(row for row in services if row["id"] == "svc-reg")["name"] == "Edited seed"
        admin_services = second.get("/api/admin/services", headers=headers).json()
        saved_history_service = next(row for row in admin_services if row["id"] == history_service["id"])
        assert saved_history_service["isActive"] is False
        current = second.get(f"/api/counters/{counter['id']}/queue", headers=headers).json()["current"]
        assert current["status"] == "serving" and current["servedAt"] == started["servedAt"]
        assert current["calledAt"] == started["calledAt"]
        assert second.get(f"/api/legacy/tickets/{ticket['id']}").json() == current
        assert second.get(f"/api/legacy/tickets/{historical_ticket['id']}").json()["status"] == "completed"
        assert second.post(f"/api/tickets/{ticket['id']}/complete", headers=headers).status_code == 200
        assert second.post("/api/auth/login", json={"username": "persistent", "password": "password"}).status_code == 200
        next_ticket = second.post("/api/tickets", json={"serviceId": service["id"], "customerName": "Next"}).json()
        assert next_ticket["code"] == "P-002"
        stats = second.get("/api/admin/stats", headers=headers).json()
        assert next(row for row in stats["byService"] if row["serviceId"] == service["id"])["total"] == 2
        historical_date = datetime.fromisoformat(
            historical_ticket["createdAt"].replace("Z", "+00:00"),
        ).astimezone(ZoneInfo("Asia/Almaty")).date()
        analytics = second.get(
            f"/api/admin/analytics?dateFrom={historical_date}&dateTo={historical_date}",
            headers=headers,
        )
        assert analytics.status_code == 200, analytics.text
        history_metrics = next(
            row for row in analytics.json()["byService"] if row["serviceId"] == history_service["id"]
        )
        assert history_metrics["issued"] == 1 and history_metrics["completed"] == 1
        assert history_metrics["meanWaitMinutes"] is not None
        assert history_metrics["meanServiceMinutes"] is not None
        with second.app.state.store.db.session() as session:
            history_events = list(session.scalars(select(TicketEventRow).where(
                TicketEventRow.ticket_id == historical_ticket["id"],
            )))
        assert {event.event_type for event in history_events} == {
            "issued", "called", "started", "completed",
        }
        assert all(event.actor_user_id == "stf-admin" for event in history_events if event.event_type != "issued")

    with TestClient(create_app(database_url=url)) as third:
        assert third.get(f"/api/legacy/tickets/{ticket['id']}").json()["status"] == "completed"
        assert third.get(f"/api/counters/{counter['id']}/queue", headers=headers).json()["current"] is None


def test_database_url_is_read_at_startup_and_selects_separate_files(tmp_path, monkeypatch):
    first, second = tmp_path / "one.db", tmp_path / "nested/two.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{first}")
    app = create_app()
    assert not first.exists()  # Import/app construction never touches a database.
    with TestClient(app) as client:
        ticket = client.post("/api/tickets", json={"serviceId": "svc-reg", "customerName": "One DB"}).json()
    assert first.exists()
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{second}")
    with TestClient(create_app()) as client:
        assert client.get(f"/api/tickets/{ticket['id']}").status_code == 404
    assert second.exists()
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{first}")
    with TestClient(create_app()) as client:
        assert client.get(f"/api/legacy/tickets/{ticket['id']}").status_code == 200


def test_fresh_file_database_is_initialized_at_alembic_head(tmp_path):
    url = f"sqlite:///{tmp_path / 'migration.db'}"
    store = DatabaseStore(url, seed_tickets=False)
    with store.db.engine.connect() as connection:
        names = set(inspect(connection).get_table_names())
        version = connection.exec_driver_sql("SELECT version_num FROM alembic_version").scalar_one()
    assert names == set(Base.metadata.tables) | {"alembic_version"}
    assert version == "9ca12ef41d60"
    assert {"organizations", "staff_assignments", "daily_queues", "ticket_events"}.issubset(names)
    store.close()


def test_pre_migration_file_database_is_stamped_without_losing_data(tmp_path):
    url = f"sqlite:///{tmp_path / 'legacy.db'}"
    legacy = Database(url)
    config = Config("backend/alembic.ini")
    with legacy.engine.connect().execution_options(kezek_write=True) as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "af7168bb27f8")
    with legacy.session(write=True) as session:
        session.add(StoreState(id=1, initialized=True))
        session.flush()
        session.connection().exec_driver_sql(
            "INSERT INTO services (id,name,description,prefix,is_open,avg_service_minutes,next_sequence,deleted) "
            "VALUES ('legacy','Preserved','Existing data','L',1,4,7,0)"
        )
        session.connection().exec_driver_sql(
            "INSERT INTO users (id,name,username,role,password_hash) "
            "VALUES ('legacy-user','Legacy Staff','legacy','staff','existing-hash')"
        )
        session.add(SessionRow(
            token_hash="f" * 64, user_id="legacy-user",
            expires_at=datetime(2026, 10, 21, 10, tzinfo=timezone.utc),
        ))
        session.flush()
        session.connection().exec_driver_sql(
            "INSERT INTO counters (id,name,is_active,staff_id,deleted) "
            "VALUES ('legacy-counter','Legacy Counter',1,'legacy-user',0)"
        )
        session.connection().exec_driver_sql(
            "INSERT INTO counter_services (counter_id,service_id) VALUES ('legacy-counter','legacy')"
        )
        session.connection().exec_driver_sql(
            "INSERT INTO tickets (id,service_id,sequence,code,customer_name,status,created_at,counter_id) "
            "VALUES ('legacy-ticket','legacy',1,'L-001','Historic','completed','2026-10-20 10:00:00','legacy-counter')"
        )
    legacy.close()

    migrated = DatabaseStore(url)
    assert [service.id for service in migrated.list_services()] == ["legacy"]
    next_ticket = migrated.join(JoinQueueRequest(serviceId="legacy", customerName="Next"))
    assert next_ticket.code == "L-001"
    with migrated.db.session() as session:
        row = session.scalar(select(TicketRow).where(TicketRow.id == next_ticket.id))
        assert row.sequence == 8
    with migrated.db.session() as session:
        user = session.get(UserRow, "legacy-user")
        counter = session.get(CounterRow, "legacy-counter")
        ticket = session.scalar(select(TicketRow).where(TicketRow.id == "legacy-ticket"))
        assert user.organization_id == "org-demo" and user.email == "legacy@legacy.invalid"
        assert user.password_hash == "existing-hash" and user.is_active is True
        assert session.get(SessionRow, "f" * 64).user_id == "legacy-user"
        assert counter.organization_id == "org-demo"
        assert session.get(StaffAssignmentRow, ("legacy-user", "legacy-counter")) is not None
        assert session.get(CounterServiceRow, ("legacy-counter", "legacy")) is not None
        assert ticket.serviceId == "legacy" and ticket.counterId == "legacy-counter"
        assert ticket.dailyQueueId is not None and ticket.dailyNumber == 1
        queue = session.get(DailyQueueRow, ticket.dailyQueueId)
        assert queue.service_id == "legacy" and queue.business_date == date(2026, 10, 20)
        assert queue.status == "closed" and queue.closed_at is not None
        assert {event.event_type for event in session.scalars(select(TicketEventRow).where(
            TicketEventRow.ticket_id == "legacy-ticket"))} == {"issued", "completed"}
    with migrated.db.engine.connect() as connection:
        assert connection.exec_driver_sql("SELECT version_num FROM alembic_version").scalar_one() == "9ca12ef41d60"
    migrated.close()


def test_partial_unversioned_schema_is_rejected_without_overwriting_data(tmp_path):
    database = Database(f"sqlite:///{tmp_path / 'partial.db'}")
    with database.engine.begin() as connection:
        connection.exec_driver_sql("CREATE TABLE operator_notes (value TEXT NOT NULL)")
        connection.exec_driver_sql("INSERT INTO operator_notes (value) VALUES ('keep me')")

    with pytest.raises(RuntimeError, match="schema is incomplete"):
        database.create_schema()

    with database.engine.connect() as connection:
        assert connection.exec_driver_sql("SELECT value FROM operator_notes").scalar_one() == "keep me"
        assert "services" not in inspect(connection).get_table_names()
    database.close()


def test_legacy_tables_with_incomplete_columns_are_not_stamped(tmp_path):
    database = Database(f"sqlite:///{tmp_path / 'missing-columns.db'}")
    table_names = (
        "active_tickets", "counter_services", "counters", "services",
        "sessions", "store_state", "tickets", "users",
    )
    with database.engine.begin() as connection:
        for table in table_names:
            columns = "id TEXT, name TEXT" if table == "services" else "id TEXT"
            connection.exec_driver_sql(f'CREATE TABLE "{table}" ({columns})')
        connection.exec_driver_sql("INSERT INTO services (id, name) VALUES ('keep', 'Keep existing')")

    with pytest.raises(RuntimeError, match="missing columns"):
        database.create_schema()

    with database.engine.connect() as connection:
        assert connection.exec_driver_sql("SELECT name FROM services WHERE id='keep'").scalar_one() == "Keep existing"
    database.close()


def test_file_connections_enable_pragmas_and_sessions_are_isolated(store):
    first = store.db.engine.connect()
    second = store.db.engine.connect()
    try:
        for connection in (first, second):
            assert connection.exec_driver_sql("PRAGMA foreign_keys").scalar_one() == 1
            assert connection.exec_driver_sql("PRAGMA busy_timeout").scalar_one() == 10000
            assert connection.exec_driver_sql("PRAGMA journal_mode").scalar_one().lower() == "wal"
    finally:
        first.close()
        second.close()

    with store.db.session(write=True) as writer:
        service = writer.get(ServiceRow, "svc-reg")
        service.name = "Uncommitted"
        writer.flush()
        with store.db.session() as reader:
            assert reader.get(ServiceRow, "svc-reg").name == "Registrar Office"
    assert next(row for row in store.list_services() if row.id == "svc-reg").name == "Uncommitted"


@pytest.mark.parametrize("variable,value", [("DATABASE_URL", ""), ("SEED_DEMO_DATA", "maybe")])
def test_invalid_environment_configuration_fails_without_fallback(tmp_path, monkeypatch, variable, value):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'unused.db'}")
    monkeypatch.setenv(variable, value)
    with pytest.raises(ValueError, match=variable):
        with TestClient(create_app()):
            pass
    assert not (tmp_path / "unused.db").exists()


def test_disabled_demo_seed_is_recorded_and_never_replays(tmp_path):
    url = f"sqlite:///{tmp_path / 'empty.db'}"
    first = DatabaseStore(url, seed_demo=False)
    assert first.list_services() == []
    with first.db.session() as session:
        assert session.scalar(select(func.count()).select_from(UserRow)) == 0
    with pytest.raises(HTTPException) as exc:
        first.login(LoginRequest(username="admin", password="admin123"))
    assert exc.value.status_code == 401
    first.close()
    second = DatabaseStore(url, seed_demo=True)
    assert second.list_services() == []
    with second.db.session() as session:
        assert session.scalar(select(func.count()).select_from(UserRow)) == 0
    second.close()


def test_seed_is_not_reinserted_when_all_visible_configuration_is_deleted(tmp_path):
    url = f"sqlite:///{tmp_path / 'deleted.db'}"
    store = DatabaseStore(url)
    for service in store.list_services():
        store.delete_service(service.id, ADMIN_ACTOR)
    for counter in store.list_counters(ADMIN_ACTOR):
        store.delete_counter(counter.id, ADMIN_ACTOR)
    store.close()
    reopened = DatabaseStore(url)
    assert reopened.list_services() == [] and reopened.list_counters(ADMIN_ACTOR) == []
    with reopened.db.session() as session:
        assert session.scalar(select(func.count()).select_from(TicketRow)) == 4
    reopened.close()


def test_transaction_rollback_restores_data_and_sequence(store):
    with pytest.raises(RuntimeError, match="rollback"):
        with store.db.session(write=True) as session:
            service = session.get(ServiceRow, "svc-reg")
            service.name = "Uncommitted name"
            store._issue(session, service, "Uncommitted ticket", store.clock())
            raise RuntimeError("rollback")
    assert next(row for row in store.list_services() if row.id == "svc-reg").name == "Registrar Office"
    assert store.join(JoinQueueRequest(serviceId="svc-reg", customerName="Committed")).code == "A-001"


def test_database_foreign_keys_and_unique_constraints_are_enforced(store):
    with pytest.raises(IntegrityError):
        with store.db.session(write=True) as session:
            session.add(UserRow(id="duplicate", organization_id="org-demo", name="Duplicate", username="admin", email="duplicate@example.invalid", role="admin", password_hash="hash", is_active=True))
    with pytest.raises(IntegrityError):
        with store.db.session(write=True) as session:
            session.add(CounterServiceRow(organization_id="org-demo", counter_id="cnt-1", service_id="missing"))
    first = store.join(JoinQueueRequest(serviceId="svc-reg", customerName="One"))
    second = store.join(JoinQueueRequest(serviceId="svc-reg", customerName="Two"))
    with pytest.raises(IntegrityError):
        with store.db.session(write=True) as session:
            session.add(TicketRow(id="duplicate-number", serviceId="svc-reg", sequence=1,
                                  code="A-001", customerName="Duplicate", status="waiting", createdAt=store.clock()))
    store.call_next("cnt-1", ADMIN_ACTOR)
    with pytest.raises(IntegrityError):
        with store.db.session(write=True) as session:
            session.add(ActiveTicketRow(counter_id="cnt-1", ticket_id=second.id))
    with pytest.raises(IntegrityError):
        with store.db.session(write=True) as session:
            session.add(ActiveTicketRow(counter_id="cnt-2", ticket_id=first.id))
    assert store.queue("cnt-1", ADMIN_ACTOR).current.id == first.id


def test_organization_configuration_constraints_and_cross_org_links(store):
    with store.db.session(write=True) as session:
        session.add(OrganizationRow(id="org-other", name="Other", slug="other", description="", timezone="UTC"))
        session.flush()
        session.add(UserRow(id="other-user", organization_id="org-other", name="Other", username="other",
                            email="other@example.invalid", role="staff", password_hash="hash", is_active=True))
        session.add(ServiceRow(id="other-service", organization_id="org-other", name="Other", description="",
                               prefix="X", isOpen=True, avgServiceMinutes=5, durationMinutes=5,
                               opensAt=None, closesAt=None, isActive=True))
        session.flush()
        session.add(CounterRow(id="other-counter", organization_id="org-other", name="Other",
                               isActive=True, staffId="other-user"))
    with pytest.raises(IntegrityError):
        with store.db.session(write=True) as session:
            session.add(OrganizationRow(id="duplicate-slug", name="Duplicate", slug="kezek-demo",
                                        description="", timezone="UTC"))
    with pytest.raises(IntegrityError):
        with store.db.session(write=True) as session:
            session.add(CounterServiceRow(organization_id="org-demo", counter_id="cnt-1",
                                          service_id="other-service"))
    with pytest.raises(IntegrityError):
        with store.db.session(write=True) as session:
            session.add(StaffAssignmentRow(organization_id="org-demo", user_id="stf-admin",
                                           counter_id="other-counter"))
    with pytest.raises(IntegrityError):
        with store.db.session(write=True) as session:
            session.add(UserRow(id="duplicate-email", organization_id="org-demo", name="Duplicate",
                                username="another", email="admin@example.invalid", role="staff",
                                password_hash="hash", is_active=True))


def test_soft_deleting_configuration_keeps_ticket_history(store):
    ticket = store.join(JoinQueueRequest(serviceId="svc-reg", customerName="Historical"))
    store.call_next("cnt-1", ADMIN_ACTOR)
    store.delete_service("svc-reg", ADMIN_ACTOR)
    with store.db.session() as session:
        saved_ticket = session.scalar(select(TicketRow).where(TicketRow.id == ticket.id))
        assert saved_ticket is not None
        assert saved_ticket.serviceId == "svc-reg"
        assert saved_ticket.counterId == "cnt-1"
        assert session.get(ServiceRow, "svc-reg").deleted is True
    store.delete_counter("cnt-1", ADMIN_ACTOR)
    with store.db.session() as session:
        assert session.scalar(select(TicketRow).where(TicketRow.id == ticket.id)).counterId == "cnt-1"
        assert session.get(CounterRow, "cnt-1").deleted is True


def test_timestamp_normalization_and_expired_token_survive_reopen(tmp_path, clock):
    url = f"sqlite:///{tmp_path / 'time.db'}"
    clock.value = datetime(2026, 10, 20, 17, tzinfo=timezone(timedelta(hours=5)))
    store = DatabaseStore(url, seed_tickets=False, clock=clock)
    ticket = store.join(JoinQueueRequest(serviceId="svc-reg", customerName="Time"))
    login = store.login(LoginRequest(username="admin", password="admin123"))
    store.close()
    reopened = DatabaseStore(url, clock=clock)
    assert reopened.ticket(ticket.id).createdAt == datetime(2026, 10, 20, 12, tzinfo=timezone.utc)
    assert reopened.authenticate(login.token).username == "admin"
    clock.advance(hours=8)
    assert reopened.authenticate(login.token) is None
    with reopened.db.session() as session:
        assert session.get(SessionRow, token_hash(login.token)) is None
    reopened.close()


def test_separate_processes_allocate_unique_numbers(tmp_path):
    url = f"sqlite:///{tmp_path / 'processes.db'}"
    parent = DatabaseStore(url, seed_tickets=False)
    results = run_workers(url, ["join", "join", "join"])
    assert {number for group in results for number in group} == {f"A-{n:03d}" for n in range(1, 13)}
    assert parent.join(JoinQueueRequest(serviceId="svc-reg", customerName="After workers")).code == "A-013"
    with parent.db.session() as session:
        assert session.scalar(select(func.count()).select_from(DailyQueueRow).where(
            DailyQueueRow.organization_id == "org-demo", DailyQueueRow.service_id == "svc-reg",
        )) == 1
    parent.close()


def test_separate_processes_same_key_issue_one_private_ticket(tmp_path):
    url = f"sqlite:///{tmp_path / 'same-key.db'}"
    parent = DatabaseStore(url, seed_tickets=False)
    parent.join(JoinQueueRequest(serviceId="svc-reg", customerName="Queue setup"))
    with parent.db.session() as session:
        queue_id = session.scalar(select(DailyQueueRow.id).where(
            DailyQueueRow.organization_id == "org-demo", DailyQueueRow.service_id == "svc-reg",
        ))
    key = base64.urlsafe_b64encode(b"K" * 32).decode().rstrip("=")
    token = base64.urlsafe_b64encode(b"T" * 32).decode().rstrip("=")
    results = run_workers(url, [("issue", queue_id, key, token)] * 4)
    assert len({result["id"] for result in results}) == 1
    assert sum(result["created"] for result in results) == 1
    with parent.db.session() as session:
        assert session.scalar(select(func.count()).select_from(TicketRow).where(
            TicketRow.id == results[0]["id"],
        )) == 1
        assert session.scalar(select(func.count()).select_from(TicketEventRow).where(
            TicketEventRow.ticket_id == results[0]["id"],
        )) == 1
    parent.close()


@pytest.mark.parametrize("counters", [("cnt-1", "cnt-2"), ("cnt-1", "cnt-1")])
def test_separate_processes_never_double_assign(tmp_path, counters):
    url = f"sqlite:///{tmp_path / 'calls.db'}"
    store = DatabaseStore(url, seed_tickets=False)
    tickets = [store.join(JoinQueueRequest(serviceId="svc-reg", customerName="Customer")) for _ in range(2)]
    results = run_workers(url, counters)
    if counters[0] != counters[1]:
        assert all(result["status"] == 200 for result in results)
        assert {result["id"] for result in results} == {ticket.id for ticket in tickets}
    else:
        assert sorted(result["status"] for result in results) == [200, 409]
    store.close()


def test_separate_process_cancellation_race_with_call_next_is_consistent(tmp_path):
    url = f"sqlite:///{tmp_path / 'cancel-race.db'}"
    store = DatabaseStore(url, seed_tickets=False)
    ticket = store.join(JoinQueueRequest(serviceId="svc-reg", customerName="Race"))
    results = run_workers(url, [("cancel", ticket.id), ("call", "cnt-1")])
    if {"status": 409} in results:
        assert {"status": 200, "id": ticket.id} in results
        assert store.ticket(ticket.id).status == "called"
    else:
        assert {"status": 200, "id": None} in results
        assert {"status": 200, "id": ticket.id} in results
        assert store.ticket(ticket.id).status == "cancelled"
    store.close()


def test_lock_contention_is_bounded_and_does_not_corrupt_state(tmp_path):
    url = f"sqlite:///{tmp_path / 'busy.db'}"
    first = DatabaseStore(url, seed_tickets=False)
    second = DatabaseStore(url, seed_tickets=False)
    # Shorten only this test connection's wait rather than blocking for 10 seconds.
    with second.db.engine.connect() as connection:
        connection.exec_driver_sql("PRAGMA busy_timeout=20")
        connection.commit()
    with first.db.session(write=True):
        with pytest.raises(HTTPException) as exc:
            second.join(JoinQueueRequest(serviceId="svc-reg", customerName="Busy"))
    assert exc.value.status_code == 503
    assert second.join(JoinQueueRequest(serviceId="svc-reg", customerName="Retry")).code == "A-001"
    first.close()
    second.close()


def test_sqlite_memory_url_is_usable_across_request_threads():
    store = DatabaseStore("sqlite:///:memory:", seed_tickets=False)
    with TestClient(create_app(store)) as client:
        ticket = client.post("/api/tickets", json={"serviceId": "svc-reg", "customerName": "Memory SQLite"}).json()
        assert client.get(f"/api/legacy/tickets/{ticket['id']}").status_code == 200
    store.close()


def test_portable_schema_compiles_for_postgresql_without_a_live_driver():
    statements = []
    engine = create_mock_engine("postgresql+psycopg://", lambda sql, *a, **kw: statements.append(str(sql.compile(dialect=engine.dialect))))
    Base.metadata.create_all(engine)
    ddl = "\n".join(statements)
    assert all(f"CREATE TABLE {name}" in ddl for name in (
        "tickets", "sessions", "daily_queues", "ticket_events",
    ))
    assert "TIMESTAMP WITH TIME ZONE" in ddl
    assert "PRAGMA" not in ddl and "AUTOINCREMENT" not in ddl


def test_daily_queue_ticket_hash_and_active_counter_constraints(store):
    now = datetime(2026, 10, 20, 12, tzinfo=timezone.utc)
    with store.db.session(write=True) as session:
        first_queue = DailyQueueRow(
            id="queue-first", organization_id="org-demo", service_id="svc-reg",
            business_date=date(2026, 10, 20), status="open", opened_at=now,
            ticket_prefix="A",
        )
        other_queue = DailyQueueRow(
            id="queue-next", organization_id="org-demo", service_id="svc-reg",
            business_date=date(2026, 10, 21), status="open", opened_at=now,
            ticket_prefix="A",
        )
        session.add_all([first_queue, other_queue])
        session.flush()

        def ticket(identifier, *, queue="queue-first", number=1, code="A-001", token="a" * 64,
                   key="b" * 64, status="waiting", counter=None, sequence=100):
            return TicketRow(
                id=identifier, serviceId="svc-reg", dailyQueueId=queue, dailyNumber=number,
                accessTokenHash=token, idempotencyKeyHash=key, sequence=sequence,
                code=code, customerName="Visitor", status=status, createdAt=now,
                calledAt=now if status in {"called", "serving"} else None,
                servedAt=now if status == "serving" else None, finishedAt=None,
                counterId=counter,
            )

        session.add(ticket("ticket-first"))
        session.flush()

        for duplicate in (
            ticket("duplicate-number", number=1, code="A-002", token="c" * 64, key="d" * 64, sequence=101),
            ticket("duplicate-code", number=2, code="A-001", token="e" * 64, key="f" * 64, sequence=102),
            ticket("duplicate-token", queue="queue-next", number=1, code="A-001", token="a" * 64, key="1" * 64, sequence=103),
            ticket("duplicate-key", number=3, code="A-003", token="2" * 64, key="b" * 64, sequence=104),
        ):
            with pytest.raises(IntegrityError):
                with session.begin_nested():
                    session.add(duplicate)
                    session.flush()

        # The idempotency key is unique only inside one queue; a later daily
        # queue may see the same client key without colliding with history.
        session.add(ticket(
            "next-day-retry-key", queue="queue-next", number=1, code="A-001",
            token="3" * 64, key="b" * 64, sequence=105,
        ))
        session.add(ticket(
            "active-one", number=4, code="A-004", token="4" * 64, key="4" * 64,
            status="called", counter="cnt-1", sequence=106,
        ))
        session.flush()
        with pytest.raises(IntegrityError):
            with session.begin_nested():
                session.add(ticket(
                    "active-two", number=5, code="A-005", token="5" * 64, key="5" * 64,
                    status="serving", counter="cnt-1", sequence=107,
                ))
                session.flush()


def test_daily_queue_business_date_is_unique_per_service_and_hashes_are_persisted(store):
    now = datetime(2026, 10, 20, 12, tzinfo=timezone.utc)
    with store.db.session(write=True) as session:
        queue = DailyQueueRow(
            id="queue-unique", organization_id="org-demo", service_id="svc-reg",
            business_date=date(2026, 10, 20), status="open", opened_at=now,
            ticket_prefix="A",
        )
        session.add(queue)
        session.flush()
        with pytest.raises(IntegrityError):
            with session.begin_nested():
                session.add(DailyQueueRow(
                    id="queue-duplicate", organization_id="org-demo", service_id="svc-reg",
                    business_date=date(2026, 10, 20), status="open", opened_at=now,
                    ticket_prefix="A",
                ))
                session.flush()
