from datetime import datetime, timedelta, timezone
import multiprocessing
import os

from fastapi import HTTPException
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_mock_engine, func, select
from sqlalchemy.exc import IntegrityError

from app.auth import token_hash
from app.main import create_app
from app.models import JoinQueueRequest, LoginRequest
from app.orm import ActiveTicketRow, Base, CounterServiceRow, ServiceRow, SessionRow, TicketRow, UserRow
from app.store import DatabaseStore


def _database_worker(url, action, barrier, output):
    """Spawned processes share only the database, not engines or Python locks."""
    store = None
    try:
        store = DatabaseStore(url, seed_tickets=False)
        barrier.wait(timeout=30)
        if action == "join":
            result = [store.join(JoinQueueRequest(serviceId="svc-reg", customerName="Parallel")).code for _ in range(4)]
        else:
            try:
                ticket = store.call_next(action)
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
        current = second.get(f"/api/counters/{counter['id']}/queue", headers=headers).json()["current"]
        assert current["status"] == "serving" and current["servedAt"] == started["servedAt"]
        assert current["calledAt"] == started["calledAt"]
        assert second.get(f"/api/tickets/{ticket['id']}").json() == current
        assert second.post(f"/api/tickets/{ticket['id']}/complete", headers=headers).status_code == 200
        assert second.post("/api/auth/login", json={"username": "persistent", "password": "password"}).status_code == 200
        next_ticket = second.post("/api/tickets", json={"serviceId": service["id"], "customerName": "Next"}).json()
        assert next_ticket["code"] == "P-002"
        stats = second.get("/api/admin/stats", headers=headers).json()
        assert next(row for row in stats["byService"] if row["serviceId"] == service["id"])["total"] == 2

    with TestClient(create_app(database_url=url)) as third:
        assert third.get(f"/api/tickets/{ticket['id']}").json()["status"] == "completed"
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
        assert client.get(f"/api/tickets/{ticket['id']}").status_code == 200


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
    assert first.list_services() == [] and first.list_staff() == []
    with pytest.raises(HTTPException) as exc:
        first.login(LoginRequest(username="admin", password="admin123"))
    assert exc.value.status_code == 401
    first.close()
    second = DatabaseStore(url, seed_demo=True)
    assert second.list_services() == [] and second.list_staff() == []
    second.close()


def test_seed_is_not_reinserted_when_all_visible_configuration_is_deleted(tmp_path):
    url = f"sqlite:///{tmp_path / 'deleted.db'}"
    store = DatabaseStore(url)
    for service in store.list_services():
        store.delete_service(service.id)
    for counter in store.list_counters():
        store.delete_counter(counter.id)
    store.close()
    reopened = DatabaseStore(url)
    assert reopened.list_services() == [] and reopened.list_counters() == []
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
            session.add(UserRow(id="duplicate", name="Duplicate", username="admin", role="admin", password_hash="hash"))
    with pytest.raises(IntegrityError):
        with store.db.session(write=True) as session:
            session.add(CounterServiceRow(counter_id="cnt-1", service_id="missing"))
    first = store.join(JoinQueueRequest(serviceId="svc-reg", customerName="One"))
    second = store.join(JoinQueueRequest(serviceId="svc-reg", customerName="Two"))
    with pytest.raises(IntegrityError):
        with store.db.session(write=True) as session:
            session.add(TicketRow(id="duplicate-number", serviceId="svc-reg", sequence=1,
                                  code="A-001", customerName="Duplicate", status="waiting", createdAt=store.clock()))
    store.call_next("cnt-1")
    with pytest.raises(IntegrityError):
        with store.db.session(write=True) as session:
            session.add(ActiveTicketRow(counter_id="cnt-1", ticket_id=second.id))
    with pytest.raises(IntegrityError):
        with store.db.session(write=True) as session:
            session.add(ActiveTicketRow(counter_id="cnt-2", ticket_id=first.id))
    assert store.queue("cnt-1").current.id == first.id


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
        assert client.get(f"/api/tickets/{ticket['id']}").status_code == 200
    store.close()


def test_portable_schema_compiles_for_postgresql_without_a_live_driver():
    statements = []
    engine = create_mock_engine("postgresql+psycopg://", lambda sql, *a, **kw: statements.append(str(sql.compile(dialect=engine.dialect))))
    Base.metadata.create_all(engine)
    ddl = "\n".join(statements)
    assert "CREATE TABLE tickets" in ddl and "CREATE TABLE sessions" in ddl
    assert "TIMESTAMP WITH TIME ZONE" in ddl
    assert "PRAGMA" not in ddl and "AUTOINCREMENT" not in ddl
