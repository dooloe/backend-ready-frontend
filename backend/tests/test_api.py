from concurrent.futures import ThreadPoolExecutor
import base64
import hashlib

from fastapi.testclient import TestClient
import jsonschema
import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.auth import hash_password, token_hash, verify_password
from app.main import create_app
from app.models import StaffUser
from app.store import DatabaseStore
from app.orm import (ActiveTicketRow, CounterRow, CounterServiceRow, OrganizationRow, ServiceRow,
                     DailyQueueRow, SessionRow, StaffAssignmentRow, TicketEventRow, TicketRow, UserRow)


def proof(byte):
    return base64.urlsafe_b64encode(bytes([byte]) * 32).decode().rstrip("=")


def daily_queue_id(store, service_id="svc-reg"):
    from app.models import JoinQueueRequest

    store.join(JoinQueueRequest(serviceId=service_id, customerName="Queue setup"))
    with store.db.session() as session:
        return session.scalar(select(DailyQueueRow.id).where(
            DailyQueueRow.service_id == service_id,
        ))


def anonymous_join(client, queue_id, key=None, token=None):
    return client.post(
        f"/api/queues/{queue_id}/tickets",
        headers={"Idempotency-Key": key or proof(1)},
        json={"accessToken": token or proof(2)},
    )


def test_private_ticket_issue_and_matching_retry_returns_current_ticket(client, store):
    queue_id = daily_queue_id(store)
    first = anonymous_join(client, queue_id)
    assert first.status_code == 201, first.text
    assert first.headers["cache-control"] == "no-store"
    result = first.json()
    assert result["ticket"]["queueId"] == queue_id
    assert result["ticket"]["ticketNumber"] == "A-002"
    assert result["ticketUrl"] == f"/ticket/{proof(2)}"
    assert "customerName" not in result["ticket"]

    staff_token = client.post("/api/auth/login", json={
        "username": "aigerim", "password": "staff123",
    }).json()["token"]
    headers = {"Authorization": "Bearer " + staff_token}
    first_called = client.post("/api/counters/cnt-1/call-next", headers=headers)
    assert first_called.status_code == 200
    assert client.post(f"/api/tickets/{first_called.json()['id']}/complete", headers=headers).status_code == 200
    called = client.post("/api/counters/cnt-1/call-next", headers=headers)
    assert called.status_code == 200 and called.json()["id"] == result["ticket"]["id"]
    with store.db.session(write=True) as session:
        session.get(DailyQueueRow, queue_id).status = "closed"
    replay = anonymous_join(client, queue_id)
    assert replay.status_code == 200, replay.text
    assert replay.headers["cache-control"] == "no-store"
    assert replay.json()["ticket"]["id"] == result["ticket"]["id"]
    assert replay.json()["ticket"]["status"] == "called"
    with store.db.session() as session:
        events = list(session.scalars(select(TicketEventRow).where(
            TicketEventRow.ticket_id == result["ticket"]["id"],
        )))
    assert {event.event_type for event in events} == {"issued", "called"}
    assert next(event for event in events if event.event_type == "called").actor_user_id == "stf-aigerim"


def test_concurrent_same_key_issues_exactly_one_ticket(store):
    queue_id = daily_queue_id(store)
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(
            lambda _: store.issue_ticket(queue_id, proof(7), proof(8)), range(8),
        ))
    assert sum(created for _, created in results) == 1
    assert len({response.ticket.id for response, _ in results}) == 1
    with store.db.session() as session:
        ticket_id = results[0][0].ticket.id
        assert session.scalar(select(func.count()).select_from(TicketRow).where(
            TicketRow.id == ticket_id,
        )) == 1
        assert session.scalar(select(func.count()).select_from(TicketEventRow).where(
            TicketEventRow.ticket_id == ticket_id,
        )) == 1


def test_ticket_issue_rejects_key_conflict_and_token_reuse(client, store):
    queue_id = daily_queue_id(store)
    assert anonymous_join(client, queue_id).status_code == 201
    conflict = anonymous_join(client, queue_id, token=proof(3))
    assert conflict.status_code == 409 and conflict.json()["code"] == "IDEMPOTENCY_CONFLICT"
    reused = anonymous_join(client, queue_id, key=proof(4))
    assert reused.status_code == 409 and reused.json()["code"] == "TOKEN_REUSED"


def test_ticket_issue_closed_queue_and_invalid_proofs_do_not_allocate(client, store):
    queue_id = daily_queue_id(store)
    with store.db.session() as session:
        existing_numbered = session.scalar(select(func.count()).select_from(TicketRow).where(
            TicketRow.dailyQueueId == queue_id, TicketRow.dailyNumber.is_not(None),
        ))
    with store.db.session(write=True) as session:
        session.get(DailyQueueRow, queue_id).status = "closed"
    closed = anonymous_join(client, queue_id)
    assert closed.status_code == 409 and closed.json()["code"] == "QUEUE_CLOSED"
    assert anonymous_join(client, queue_id, key="not-a-proof").status_code == 422
    with store.db.session() as session:
        assert session.scalar(select(func.count()).select_from(TicketRow).where(
            TicketRow.dailyQueueId == queue_id, TicketRow.dailyNumber.is_not(None),
        )) == existing_numbered


def test_ticket_issue_rolls_back_number_ticket_and_event_on_event_failure(client, store, monkeypatch):
    from app import store as store_module

    queue_id = daily_queue_id(store)
    real_event = store_module.TicketEventRow
    monkeypatch.setattr(store_module, "TicketEventRow", lambda **kwargs: real_event(**(kwargs | {"event_type": "invalid"})))
    with pytest.raises(IntegrityError):
        store.issue_ticket(queue_id, proof(5), proof(6))
    monkeypatch.setattr(store_module, "TicketEventRow", real_event)
    retry = store.issue_ticket(queue_id, proof(5), proof(6))[0]
    assert retry.ticket.ticketNumber == "A-002"
    with store.db.session() as session:
        assert session.scalar(select(func.count()).select_from(TicketEventRow).where(
            TicketEventRow.ticket_id == retry.ticket.id,
        )) == 1


STAFF_ENDPOINTS = [
    ("GET", "/api/counters"), ("GET", "/api/counters/cnt-1/queue"),
    ("GET", "/api/staff/queues"),
    ("POST", "/api/counters/cnt-1/call-next"),
    ("POST", "/api/tickets/missing/start"), ("POST", "/api/tickets/missing/complete"),
    ("POST", "/api/tickets/missing/no-show"),
]
ADMIN_ENDPOINTS = [
    ("POST", "/api/admin/services"), ("PATCH", "/api/admin/services/svc-reg"),
    ("DELETE", "/api/admin/services/svc-reg"), ("POST", "/api/admin/counters"),
    ("PATCH", "/api/admin/counters/cnt-1"), ("DELETE", "/api/admin/counters/cnt-1"),
    ("GET", "/api/admin/staff"), ("POST", "/api/admin/staff"), ("GET", "/api/admin/stats"),
]


def join(client, service="svc-reg", name="Customer"):
    response = client.post("/api/tickets", json={"serviceId": service, "customerName": name})
    assert response.status_code == 200, response.text
    return response.json()


def add_other_organization(store):
    with store.db.session(write=True) as session:
        session.add(OrganizationRow(
            id="org-other", name="Other Organization", slug="other-organization",
            description="Isolated tenant", timezone="Asia/Almaty",
        ))
        session.flush()
        session.add_all([
            UserRow(id="other-admin", organization_id="org-other", name="Other Admin",
                    username="other-admin", email="other-admin@example.invalid", role="admin",
                    password_hash=hash_password("other-admin-password"), is_active=True),
            UserRow(id="other-staff", organization_id="org-other", name="Other Staff",
                    username="other-staff", email="other-staff@example.invalid", role="staff",
                    password_hash=hash_password("other-staff-password"), is_active=True),
            ServiceRow(id="other-service", organization_id="org-other", name="Other service",
                       description="Private configuration", prefix="O", isOpen=True,
                       avgServiceMinutes=5, durationMinutes=5, isActive=True),
        ])
        session.flush()
        session.add(CounterRow(
            id="other-counter", organization_id="org-other", name="Other counter",
            isActive=True, staffId="other-staff",
        ))
        session.flush()
        session.add_all([
            CounterServiceRow(organization_id="org-other", counter_id="other-counter",
                              service_id="other-service"),
            StaffAssignmentRow(organization_id="org-other", user_id="other-staff",
                               counter_id="other-counter"),
        ])


def dereference(schema, document):
    """Expand this acyclic OpenAPI 3.0 schema and translate its nullable keyword."""
    if isinstance(schema, list):
        return [dereference(item, document) for item in schema]
    if not isinstance(schema, dict):
        return schema
    if "$ref" in schema:
        target = document
        for part in schema["$ref"].removeprefix("#/").split("/"):
            target = target[part]
        return dereference(target, document)
    result = {key: dereference(value, document) for key, value in schema.items() if key != "nullable"}
    return {"anyOf": [result, {"type": "null"}]} if schema.get("nullable") else result


def test_every_operation_and_response_matches_contract(client, store, contract):
    seen = set()

    def check(method, actual_path, contract_path, *, expected_override=None, **kwargs):
        response = client.request(method, actual_path, **kwargs)
        operation = contract["paths"][contract_path][method.lower()]
        expected = expected_override or ("204" if method == "DELETE" else
                                         "201" if operation["operationId"] == "issueTicket" else "200")
        assert response.status_code == int(expected), response.text
        if expected == "204":
            assert response.content == b""
        else:
            schema = operation["responses"][expected]["content"]["application/json"]["schema"]
            jsonschema.validate(response.json(), dereference(schema, contract), format_checker=jsonschema.FormatChecker())
        seen.add(operation["operationId"])
        return response.json() if expected != "204" else None

    check("GET", "/api/services", "/api/services")
    check("GET", "/api/organizations", "/api/organizations")
    check("GET", "/api/organizations/org-demo", "/api/organizations/{id}")
    catalog = check("GET", "/api/organizations/org-demo/services", "/api/organizations/{orgId}/services")
    queue_id = next(item["queue"]["id"] for item in catalog if item["id"] == "svc-reg")
    check("GET", f"/api/queues/{queue_id}/status", "/api/queues/{queueId}/status")
    ticket = check("POST", "/api/tickets", "/api/tickets", json={"serviceId": "svc-reg", "customerName": "Customer"})
    check("GET", f"/api/tickets/{ticket['id']}", "/api/tickets/{id}")
    cancelled = join(client)
    check("POST", f"/api/tickets/{cancelled['id']}/cancel", "/api/tickets/{id}/cancel")
    login = check("POST", "/api/auth/login", "/api/auth/login", json={"username": "admin", "password": "admin123"})
    headers = {"Authorization": "Bearer " + login["token"]}
    check("GET", "/api/counters", "/api/counters", headers=headers)
    check("GET", "/api/staff/queues", "/api/staff/queues", headers=headers)
    check("GET", "/api/counters/cnt-1/queue", "/api/counters/{counterId}/queue", headers=headers)
    check("POST", "/api/counters/cnt-1/call-next", "/api/counters/{counterId}/call-next", headers=headers)
    check("POST", f"/api/tickets/{ticket['id']}/start", "/api/tickets/{id}/start", headers=headers)
    check("POST", f"/api/tickets/{ticket['id']}/complete", "/api/tickets/{id}/complete", headers=headers)
    missed = join(client)
    client.post("/api/counters/cnt-1/call-next", headers=headers)
    check("POST", f"/api/tickets/{missed['id']}/no-show", "/api/tickets/{id}/no-show", headers=headers)
    queue_id = daily_queue_id(store)
    issued = check("POST", f"/api/queues/{queue_id}/tickets", "/api/queues/{queueId}/tickets",
                   headers={"Idempotency-Key": proof(20)}, json={"accessToken": proof(21)})
    check("POST", f"/api/queues/{queue_id}/tickets", "/api/queues/{queueId}/tickets",
          expected_override="200", headers={"Idempotency-Key": proof(20)}, json={"accessToken": proof(21)})
    assert issued["ticket"]["id"]
    service = check("POST", "/api/admin/services", "/api/admin/services", headers=headers,
                    json={"name": "New", "description": "Service", "prefix": "N", "isOpen": True, "avgServiceMinutes": 5})
    check("PATCH", f"/api/admin/services/{service['id']}", "/api/admin/services/{serviceId}", headers=headers, json={"name": "Renamed"})
    counter = check("POST", "/api/admin/counters", "/api/admin/counters", headers=headers,
                    json={"name": "New", "serviceIds": [service["id"]], "isActive": True, "staffId": None})
    check("PATCH", f"/api/admin/counters/{counter['id']}", "/api/admin/counters/{counterId}", headers=headers, json={"staffId": "stf-aigerim"})
    check("GET", "/api/admin/staff", "/api/admin/staff", headers=headers)
    check("POST", "/api/admin/staff", "/api/admin/staff", headers=headers,
          json={"name": "New person", "username": "new", "role": "staff", "password": "new-password"})
    check("GET", "/api/admin/stats", "/api/admin/stats", headers=headers)
    check("DELETE", f"/api/admin/services/{service['id']}", "/api/admin/services/{serviceId}", headers=headers)
    check("DELETE", f"/api/admin/counters/{counter['id']}", "/api/admin/counters/{counterId}", headers=headers)
    expected = {op["operationId"] for methods in contract["paths"].values() for op in methods.values()}
    assert seen == expected


def test_generated_routes_and_security_match_contract(client, contract):
    generated = client.get("/openapi.json").json()
    assert set(generated["paths"]) == set(contract["paths"])
    for path, methods in contract["paths"].items():
        assert set(generated["paths"][path]) == set(methods)
        for method, expected in methods.items():
            actual = generated["paths"][path][method]
            assert actual["operationId"] == expected["operationId"]
            assert actual.get("security", []) == expected["security"]
            assert actual.get("x-required-roles") == expected.get("x-required-roles")


def test_error_responses_match_the_documented_envelope(client, contract):
    created = client.post("/api/tickets", json={"serviceId": "svc-reg", "customerName": "QA"})
    ticket_id = created.json()["id"]
    client.post(f"/api/tickets/{ticket_id}/cancel")
    responses = [
        (client.get("/api/tickets/missing"), "get", "/api/tickets/{id}", "404"),
        (client.post("/api/tickets", json={"serviceId": "svc-reg", "customerName": " "}),
         "post", "/api/tickets", "422"),
        (client.post(f"/api/tickets/{ticket_id}/cancel"), "post", "/api/tickets/{id}/cancel", "409"),
        (client.get("/api/counters"), "get", "/api/counters", "401"),
    ]
    for response, method, path, status in responses:
        operation = contract["paths"][path][method]
        error_response = dereference(operation["responses"][status], contract)
        error_schema = error_response["content"]["application/json"]["schema"]
        jsonschema.validate(response.json(), dereference(error_schema, contract))


@pytest.mark.parametrize("method,path", STAFF_ENDPOINTS + ADMIN_ENDPOINTS)
def test_every_protected_operation_denies_anonymous(client, method, path):
    response = client.request(method, path, json={})
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    assert isinstance(response.json()["detail"], str)


@pytest.mark.parametrize("method,path", ADMIN_ENDPOINTS)
def test_every_admin_operation_denies_staff(client, staff, method, path):
    assert client.request(method, path, headers=staff, json={}).status_code == 403


def test_staff_operations_require_an_active_counter_assignment(client, admin, staff):
    created = client.post("/api/admin/staff", headers=admin, json={
        "name": "Other staff", "username": "other-staff", "role": "staff", "password": "other-password"
    })
    assert created.status_code == 200
    other_login = client.post("/api/auth/login", json={
        "username": "other-staff", "password": "other-password"
    })
    assert other_login.status_code == 200
    other = {"Authorization": "Bearer " + other_login.json()["token"]}

    # Unassigned counters are not exposed as available work until an admin assigns them.
    assert client.get("/api/counters", headers=other).json() == []
    assert client.get("/api/counters/cnt-1/queue", headers=other).status_code == 403
    assert client.post("/api/counters/cnt-1/call-next", headers=other).status_code == 403
    assert client.get("/api/counters/cnt-2/queue", headers=other).status_code == 403
    assert client.post("/api/counters/cnt-2/call-next", headers=other).status_code == 403
    assert client.patch("/api/admin/counters/cnt-2", headers=admin,
                        json={"staffId": created.json()["id"]}).status_code == 200
    assert [counter["id"] for counter in client.get("/api/counters", headers=other).json()] == ["cnt-2"]

    ticket = join(client)
    assert client.post("/api/counters/cnt-1/call-next", headers=staff).json()["id"] == ticket["id"]
    assert client.post(f"/api/tickets/{ticket['id']}/start", headers=other).status_code == 403
    assert client.post(f"/api/tickets/{ticket['id']}/start", headers=staff).status_code == 200


def test_staff_queue_discovery_is_assigned_active_and_private(client, store, staff, admin):
    from app.orm import CounterServiceRow

    with store.db.session(write=True) as session:
        session.add(CounterServiceRow(organization_id="org-demo", counter_id="cnt-1", service_id="svc-fin"))
        session.add(StaffAssignmentRow(organization_id="org-demo", user_id="stf-aigerim", counter_id="cnt-2"))
        session.add(CounterServiceRow(organization_id="org-demo", counter_id="cnt-1", service_id="svc-it"))

    reg = join(client, "svc-reg", "Private customer name")
    fin = join(client, "svc-fin", "Another private name")
    assert client.post("/api/counters/cnt-1/call-next", headers=staff).json()["id"] == reg["id"]
    response = client.get("/api/staff/queues", headers=staff)
    assert response.status_code == 200
    counters = response.json()
    assert [row["counter"]["id"] for row in counters] == ["cnt-1", "cnt-2"]
    assert set(counters[0]["queues"][0]) == {
        "id", "serviceId", "queueDate", "isOpen", "waiting", "activeCounters", "estimatedWaitMinutes",
    }
    assert {queue["serviceId"] for queue in counters[0]["queues"]} == {"svc-reg", "svc-fin"}
    assert {queue["serviceId"] for queue in counters[1]["queues"]} == {"svc-reg", "svc-fin"}
    assert {queue["serviceId"]: queue["waiting"] for queue in counters[0]["queues"]} == {
        "svc-reg": 0, "svc-fin": 1,
    }
    current = counters[0]["current"]
    assert current["id"] == reg["id"]
    assert current["status"] == "called"
    assert current["serviceName"] == "Registrar Office"
    assert current["queueId"]
    assert "customerName" not in current
    assert counters[1]["current"] is None
    assert fin["id"] != reg["id"]

    with store.db.session(write=True) as session:
        session.get(CounterRow, "cnt-2").isActive = False
    assert [row["counter"]["id"] for row in client.get("/api/staff/queues", headers=staff).json()] == ["cnt-1"]

    add_other_organization(store)
    assert all(row["counter"]["id"] != "other-counter"
               for row in client.get("/api/staff/queues", headers=staff).json())


def test_staff_queue_discovery_returns_empty_for_unassigned_user(client, admin):
    client.post("/api/admin/staff", headers=admin, json={
        "name": "Unassigned", "username": "unassigned", "role": "staff", "password": "password",
    }).json()
    token = client.post("/api/auth/login", json={
        "username": "unassigned", "password": "password",
    }).json()["token"]
    response = client.get("/api/staff/queues", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.parametrize("authorization", ["Bearer invalid", "Basic abc", "Bearer", ""])
def test_invalid_bearer_credentials(client, authorization):
    assert client.get("/api/counters", headers={"Authorization": authorization}).status_code == 401


def test_login_hashes_tokens_passwords_and_expires_sessions(client, store, clock):
    assert client.post("/api/auth/login", json={"username": "admin", "password": "wrong"}).status_code == 401
    assert client.post("/api/auth/login", json={"username": "missing", "password": "admin123"}).status_code == 401
    result = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"}).json()
    assert set(result) == {"token", "user"}
    assert set(result["user"]) == {"id", "name", "username", "role"}
    assert len(result["token"]) >= 40
    with store.db.session() as session:
        assert session.get(SessionRow, result["token"]) is None
        assert session.get(SessionRow, token_hash(result["token"])) is not None
        record = session.get(UserRow, "stf-admin")
    assert record.password_hash.startswith("$argon2id$")
    assert verify_password("admin123", record.password_hash)
    assert not verify_password("wrong", record.password_hash)
    headers = {"Authorization": "Bearer " + result["token"]}
    assert client.get("/api/counters", headers=headers).status_code == 200
    clock.advance(hours=8)
    assert client.get("/api/counters", headers=headers).status_code == 401
    with store.db.session() as session:
        assert session.get(SessionRow, token_hash(result["token"])) is None


def test_password_hashes_are_salted():
    first, second = hash_password("same-password"), hash_password("same-password")
    assert first != second
    assert first.startswith("$argon2id$")
    assert verify_password("same-password", first)
    assert not verify_password("same-password", "not-a-password-hash")


def test_existing_scrypt_password_hashes_remain_verifiable():
    salt = bytes(range(16))
    digest = hashlib.scrypt(
        b"legacy-password", salt=salt, n=32768, r=8, p=1,
        dklen=32, maxmem=67108864,
    )
    encoded = f"scrypt$32768$8$1${salt.hex()}${digest.hex()}"
    assert verify_password("legacy-password", encoded)
    assert not verify_password("wrong-password", encoded)


def test_seeded_demo_is_useful_and_stores_are_isolated(clock, tmp_path):
    store = DatabaseStore(f"sqlite:///{tmp_path / 'seed.db'}", clock=clock)
    with TestClient(create_app(store)) as client:
        services = client.get("/api/services").json()
        assert len(services) == 3
        assert any(not s["isOpen"] for s in services)
        login = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"}).json()
        headers = {"Authorization": "Bearer " + login["token"]}
        stats = client.get("/api/admin/stats", headers=headers).json()
        assert stats["totalToday"] == 4
        assert stats["waitingNow"] == 2
        assert stats["completedToday"] == 1
        assert stats["avgWaitMinutes"] == 4
    another = DatabaseStore(f"sqlite:///{tmp_path / 'separate.db'}", seed_tickets=False, clock=clock)
    with TestClient(create_app(another)) as client:
        assert client.get("/api/counters", headers=headers).status_code == 401
    with another.db.session() as session:
        assert session.scalar(select(func.count()).select_from(TicketRow)) == 0
    store.close()
    another.close()


def test_ticket_positions_estimates_and_full_lifecycle(client, store, staff, clock):
    first, second = join(client, name="  First  "), join(client, name="Second")
    assert first["customerName"] == "First"
    assert first["code"] == "A-001" and second["code"] == "A-002"
    assert second["position"] == 2 and second["estimatedWaitMinutes"] == 3
    called = client.post("/api/counters/cnt-1/call-next", headers=staff).json()
    assert called["id"] == first["id"] and called["status"] == "called"
    assert called["counterName"] == "Counter 1" and called["position"] is None
    assert called["calledAt"] is not None
    assert client.post("/api/counters/cnt-1/call-next", headers=staff).status_code == 409
    assert client.post(f"/api/tickets/{first['id']}/cancel").status_code == 409
    assert client.get(f"/api/tickets/{second['id']}").json()["position"] == 1
    clock.advance(minutes=1)
    started = client.post(f"/api/tickets/{first['id']}/start", headers=staff).json()
    assert started["status"] == "serving" and started["servedAt"] is not None
    clock.advance(minutes=5)
    done = client.post(f"/api/tickets/{first['id']}/complete", headers=staff).json()
    assert done["status"] == "completed" and done["finishedAt"] is not None
    assert client.get("/api/counters/cnt-1/queue", headers=staff).json()["current"] is None
    assert client.post(f"/api/tickets/{first['id']}/start", headers=staff).status_code == 409
    client.post("/api/counters/cnt-1/call-next", headers=staff)
    missed = client.post(f"/api/tickets/{second['id']}/no-show", headers=staff).json()
    assert missed["status"] == "no_show" and missed["finishedAt"] is not None
    assert client.post("/api/counters/cnt-1/call-next", headers=staff).json() is None
    with store.db.session() as session:
        first_events = list(session.scalars(select(TicketEventRow).where(
            TicketEventRow.ticket_id == first["id"],
        )))
        second_events = list(session.scalars(select(TicketEventRow).where(
            TicketEventRow.ticket_id == second["id"],
        )))
    assert {event.event_type: (event.actor_user_id, event.counter_id) for event in first_events} == {
        "issued": (None, None), "called": ("stf-aigerim", "cnt-1"),
        "started": ("stf-aigerim", "cnt-1"), "completed": ("stf-aigerim", "cnt-1"),
    }
    assert {event.event_type: (event.actor_user_id, event.counter_id) for event in second_events} == {
        "issued": (None, None), "called": ("stf-aigerim", "cnt-1"),
        "no_show": ("stf-aigerim", "cnt-1"),
    }


def test_staff_lifecycle_rolls_back_when_audit_event_cannot_be_written(client, store, monkeypatch):
    import app.store as store_module

    ticket = join(client)
    actor = StaffUser(id="stf-aigerim", name="Aigerim S.", username="aigerim", role="staff")
    real_event = store_module.TicketEventRow
    monkeypatch.setattr(
        store_module, "TicketEventRow",
        lambda **kwargs: real_event(**(kwargs | {"event_type": "invalid"})),
    )
    with pytest.raises(IntegrityError):
        store.call_next("cnt-1", actor)
    monkeypatch.setattr(store_module, "TicketEventRow", real_event)
    assert client.get(f"/api/tickets/{ticket['id']}").json()["status"] == "waiting"
    with store.db.session() as session:
        assert session.get(ActiveTicketRow, "cnt-1") is None

    store.call_next("cnt-1", actor)
    monkeypatch.setattr(
        store_module, "TicketEventRow",
        lambda **kwargs: real_event(**(kwargs | {"event_type": "invalid"})),
    )
    with pytest.raises(IntegrityError):
        store.transition(ticket["id"], "start", actor)
    monkeypatch.setattr(store_module, "TicketEventRow", real_event)
    assert client.get(f"/api/tickets/{ticket['id']}").json()["status"] == "called"
    with store.db.session() as session:
        event_types = set(session.scalars(select(TicketEventRow.event_type).where(
            TicketEventRow.ticket_id == ticket["id"],
        )))
    assert event_types == {"issued", "called"}


def test_cancelled_ticket_is_skipped_and_called_can_complete(client, staff):
    first, second = join(client), join(client)
    cancelled = client.post(f"/api/tickets/{first['id']}/cancel")
    assert cancelled.json()["finishedAt"] is not None
    assert client.post(f"/api/tickets/{first['id']}/cancel").status_code == 409
    called = client.post("/api/counters/cnt-1/call-next", headers=staff).json()
    assert called["id"] == second["id"]
    done = client.post(f"/api/tickets/{second['id']}/complete", headers=staff)
    assert done.status_code == 200 and done.json()["status"] == "completed"


@pytest.mark.parametrize("action", ["start", "complete", "no-show"])
def test_waiting_ticket_cannot_receive_staff_transition(client, staff, action):
    ticket = join(client)
    assert client.post(f"/api/tickets/{ticket['id']}/{action}", headers=staff).status_code == 409


def test_no_counter_estimate_and_closed_service_rules(client, admin, staff):
    assert client.post("/api/tickets", json={"serviceId": "svc-it", "customerName": "Test"}).status_code == 409
    ticket = join(client)
    client.patch("/api/admin/services/svc-reg", headers=admin, json={"isOpen": False})
    # Existing work remains callable even if new joins are closed.
    assert client.post("/api/counters/cnt-1/call-next", headers=staff).json()["id"] == ticket["id"]
    for counter in ("cnt-1", "cnt-2"):
        client.patch(f"/api/admin/counters/{counter}", headers=admin, json={"isActive": False})
    finance = join(client, service="svc-fin")
    assert finance["estimatedWaitMinutes"] is None
    assert client.post("/api/counters/cnt-2/call-next", headers=staff).status_code == 403


def test_unassigned_and_inactive_staff_counters_are_denied(client, store, staff):
    join(client)
    assert client.get("/api/counters/cnt-2/queue", headers=staff).status_code == 403
    assert client.post("/api/counters/cnt-2/call-next", headers=staff).status_code == 403
    with store.db.session(write=True) as session:
        session.get(CounterRow, "cnt-1").isActive = False
    assert client.get("/api/counters/cnt-1/queue", headers=staff).status_code == 409
    assert client.post("/api/counters/cnt-1/call-next", headers=staff).status_code == 409


def test_protected_operations_are_organization_scoped(client, store, admin, staff):
    add_other_organization(store)
    other_admin_login = client.post("/api/auth/login", json={
        "username": "other-admin", "password": "other-admin-password",
    }).json()
    other_admin = {"Authorization": "Bearer " + other_admin_login["token"]}
    other_staff_login = client.post("/api/auth/login", json={
        "username": "other-staff", "password": "other-staff-password",
    }).json()
    other_staff = {"Authorization": "Bearer " + other_staff_login["token"]}

    assert client.get("/api/counters", headers=staff).json() == [
        {"id": "cnt-1", "name": "Counter 1", "serviceIds": ["svc-reg"],
         "isActive": True, "staffId": "stf-aigerim"},
    ]
    assert client.get("/api/counters", headers=other_staff).json()[0]["id"] == "other-counter"
    assert client.get("/api/organizations/org-other").status_code == 200
    assert client.get("/api/counters/other-counter/queue", headers=staff).status_code == 404
    assert client.post("/api/counters/other-counter/call-next", headers=staff).status_code == 404
    assert client.patch("/api/admin/services/other-service", headers=admin,
                        json={"name": "Stolen"}).status_code == 404
    assert client.patch("/api/admin/counters/other-counter", headers=admin,
                        json={"name": "Stolen"}).status_code == 404
    assert client.post("/api/admin/counters", headers=admin, json={
        "name": "Forged link", "serviceIds": ["other-service"],
        "isActive": True, "staffId": None,
    }).status_code == 422
    own_staff = client.get("/api/admin/staff", headers=admin).json()
    assert all(user["id"] not in {"other-admin", "other-staff"} for user in own_staff)
    assert client.patch("/api/admin/services/other-service", headers=other_admin,
                        json={"name": "Scoped update"}).status_code == 200

    ticket = client.post("/api/tickets", json={
        "serviceId": "other-service", "customerName": "Other visitor",
    }).json()
    called = client.post("/api/counters/other-counter/call-next", headers=other_staff).json()
    assert called["id"] == ticket["id"]
    assert client.post(f"/api/tickets/{ticket['id']}/complete", headers=staff).status_code == 404
    assert client.get(f"/api/tickets/{ticket['id']}").json()["status"] == "called"
    assert client.post(f"/api/tickets/{ticket['id']}/complete", headers=other_staff).status_code == 200
    assert client.get("/api/admin/stats", headers=admin).json()["byService"]
    assert [row["serviceId"] for row in client.get("/api/admin/stats", headers=other_admin).json()["byService"]] == ["other-service"]


def test_deactivating_a_user_revokes_their_existing_session(client, store, staff):
    bearer_token = staff["Authorization"].removeprefix("Bearer ")
    with store.db.session(write=True) as session:
        session.get(UserRow, "stf-aigerim").is_active = False
    assert client.get("/api/counters", headers=staff).status_code == 401
    with store.db.session() as session:
        assert session.get(SessionRow, token_hash(bearer_token)) is None


def test_admin_crud_patch_semantics_and_duplicate_username(client, admin):
    service = client.post("/api/admin/services", headers=admin, json={
        "name": "New", "description": "Test", "prefix": "N", "isOpen": True, "avgServiceMinutes": 5}).json()
    path = f"/api/admin/services/{service['id']}"
    assert client.patch(path, headers=admin, json={}).json() == service
    assert client.patch(path, headers=admin, json={"name": None}).status_code == 422
    assert client.patch(path, headers=admin, json={"avgServiceMinutes": 0}).status_code == 422
    updated = client.patch(path, headers=admin, json={"name": "Changed"}).json()
    assert updated["name"] == "Changed" and updated["prefix"] == "N"
    user_request = {"name": "New Staff", "username": "new", "role": "staff", "password": "secret"}
    user = client.post("/api/admin/staff", headers=admin, json=user_request).json()
    assert "password" not in user and "password_hash" not in user
    assert client.post("/api/admin/staff", headers=admin, json=user_request).status_code == 409
    assert client.post("/api/auth/login", json={"username": "new", "password": "secret"}).status_code == 200
    counter_request = {"name": "New", "serviceIds": [service["id"]], "isActive": True, "staffId": user["id"]}
    counter = client.post("/api/admin/counters", headers=admin, json=counter_request).json()
    counter_path = f"/api/admin/counters/{counter['id']}"
    assert client.patch(counter_path, headers=admin, json={}).json() == counter
    assert client.patch(counter_path, headers=admin, json={"name": None}).status_code == 422
    assert client.patch(counter_path, headers=admin, json={"staffId": None}).json()["staffId"] is None
    assert client.patch(counter_path, headers=admin, json={"staffId": "missing"}).status_code == 422
    assert client.patch(counter_path, headers=admin, json={"serviceIds": ["missing"]}).status_code == 422
    assert client.delete(path, headers=admin).status_code == 204
    assert next(c for c in client.get("/api/counters", headers=admin).json() if c["id"] == counter["id"])["serviceIds"] == []
    assert client.delete(path, headers=admin).content == b""
    assert client.delete(counter_path, headers=admin).status_code == 204
    assert client.delete(counter_path, headers=admin).content == b""
    assert all("password" not in u and "password_hash" not in u for u in client.get("/api/admin/staff", headers=admin).json())


def test_admin_can_create_another_admin(client, admin):
    response = client.post("/api/admin/staff", headers=admin, json={
        "name": "Another admin", "username": "other-admin", "role": "admin", "password": "password"})
    assert response.status_code == 200
    token = client.post("/api/auth/login", json={"username": "other-admin", "password": "password"}).json()["token"]
    assert client.get("/api/admin/stats", headers={"Authorization": "Bearer " + token}).status_code == 200


@pytest.mark.parametrize("method,path", [
    ("GET", "/api/tickets/missing"), ("POST", "/api/tickets/missing/cancel"),
    ("GET", "/api/counters/missing/queue"), ("POST", "/api/counters/missing/call-next"),
    ("POST", "/api/tickets/missing/start"), ("POST", "/api/tickets/missing/complete"),
    ("POST", "/api/tickets/missing/no-show"),
    ("PATCH", "/api/admin/services/missing"), ("PATCH", "/api/admin/counters/missing"),
])
def test_missing_resources(client, admin, method, path):
    response = client.request(method, path, headers=admin, **({"json": {}} if method == "PATCH" else {}))
    assert response.status_code == 404
    assert isinstance(response.json()["detail"], str)


def test_validation_has_string_detail_and_does_not_issue_ticket(client, store, admin):
    for body in [{}, {"serviceId": "svc-reg", "customerName": "  "},
                 {"serviceId": "svc-reg", "customerName": None}]:
        response = client.post("/api/tickets", json=body)
        assert response.status_code == 422 and isinstance(response.json()["detail"], str)
    with store.db.session() as session:
        assert session.scalar(select(func.count()).select_from(TicketRow)) == 0
        assert all(value == 0 for value in session.scalars(select(ServiceRow.next_sequence)))
    assert client.post("/api/tickets", json={"serviceId": "missing", "customerName": "A"}).status_code == 404
    assert client.post("/api/admin/counters", headers=admin, json={"name": "N", "serviceIds": [], "isActive": True}).status_code == 422
    response = client.post("/api/auth/login", content="{", headers={"Content-Type": "application/json"})
    assert response.status_code == 422 and isinstance(response.json()["detail"], str)


def test_statistics_use_real_timestamps_and_utc_days(client, admin, staff, clock):
    first = join(client)
    second = join(client, service="svc-fin")
    clock.advance(minutes=6)
    client.post("/api/counters/cnt-1/call-next", headers=staff)
    client.post(f"/api/tickets/{first['id']}/complete", headers=staff)
    client.post(f"/api/tickets/{second['id']}/cancel")
    join(client)
    stats = client.get("/api/admin/stats", headers=admin).json()
    assert (stats["totalToday"], stats["waitingNow"], stats["completedToday"], stats["avgWaitMinutes"]) == (3, 1, 1, 6)
    assert len(stats["byHour"]) == 24 and sum(h["count"] for h in stats["byHour"]) == 3
    registrar = next(s for s in stats["byService"] if s["serviceId"] == "svc-reg")
    assert registrar["total"] == 2 and registrar["waiting"] == 1 and registrar["avgWaitMinutes"] == 6
    clock.advance(days=1)
    # The original eight-hour bearer session has expired across this boundary.
    token = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"}).json()["token"]
    admin = {"Authorization": "Bearer " + token}
    stats = client.get("/api/admin/stats", headers=admin).json()
    assert stats["totalToday"] == 0 and stats["avgWaitMinutes"] is None
    assert stats["waitingNow"] == 1
    assert all(s["total"] == 0 for s in stats["byService"])


def test_parallel_joins_and_competing_counters_are_atomic(client, admin):
    with ThreadPoolExecutor(max_workers=8) as pool:
        tickets = list(pool.map(lambda i: join(client, name=f"Person {i}"), range(20)))
    assert len({t["id"] for t in tickets}) == 20
    assert {t["code"] for t in tickets} == {f"A-{n:03d}" for n in range(1, 21)}
    assert {t["position"] for t in tickets} == set(range(1, 21))
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda c: client.post(f"/api/counters/{c}/call-next", headers=admin), ["cnt-1", "cnt-2"]))
    assert all(r.status_code == 200 for r in responses)
    assert len({r.json()["id"] for r in responses}) == 2
    assert {r.json()["code"] for r in responses} == {"A-001", "A-002"}


def test_parallel_calls_at_one_counter_do_not_double_assign(client, staff):
    join(client)
    join(client)
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda _: client.post("/api/counters/cnt-1/call-next", headers=staff), range(4)))
    assert sorted(r.status_code for r in results) == [200, 409, 409, 409]
    assert len(client.get("/api/counters/cnt-1/queue", headers=staff).json()["waiting"]) == 1


def test_cancellation_racing_call_next_is_consistent(client, staff):
    ticket = join(client)
    with ThreadPoolExecutor(max_workers=2) as pool:
        cancel = pool.submit(client.post, f"/api/tickets/{ticket['id']}/cancel")
        call = pool.submit(client.post, "/api/counters/cnt-1/call-next", headers=staff)
        cancelled, called = cancel.result(), call.result()
    if cancelled.status_code == 200:
        assert called.json() is None
        assert client.get(f"/api/tickets/{ticket['id']}").json()["status"] == "cancelled"
    else:
        assert cancelled.status_code == 409 and called.json()["id"] == ticket["id"]


def test_local_frontend_cors_and_disallowed_origins(client):
    response = client.options("/api/admin/services", headers={
        "Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type"})
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    denied = client.options("/api/services", headers={
        "Origin": "https://untrusted.example", "Access-Control-Request-Method": "GET"})
    assert denied.status_code == 400 and "access-control-allow-origin" not in denied.headers
    protected = client.get("/api/counters", headers={"Origin": "http://127.0.0.1:5173"})
    assert protected.status_code == 401
    assert protected.headers["access-control-allow-origin"] == "http://127.0.0.1:5173"
