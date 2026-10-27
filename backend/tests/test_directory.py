import base64

from sqlalchemy import delete, select

from app.orm import (CounterRow, CounterServiceRow, DailyQueueRow, OrganizationRow, ServiceRow,
                     StaffAssignmentRow, UserRow)
from seed_directory import seed


def proof(byte):
    return base64.urlsafe_b64encode(bytes([byte]) * 32).decode().rstrip("=")


def test_directory_is_public_aggregate_only_and_estimates_follow_queue(client, store):
    ticket = client.post('/api/tickets', json={'serviceId': 'svc-reg', 'customerName': 'Private Person'}).json()
    directory = client.get('/api/organizations')
    assert directory.status_code == 200
    org = directory.json()[0]
    assert org['id'] == 'org-demo'
    service = next(s for s in org['services'] if s['id'] == 'svc-reg')
    assert service['waitingCount'] == 1
    assert service['estimatedWaitMinutes'] == 3
    summary = client.get('/api/organizations/org-demo/services').json()
    queue = next(item['queue'] for item in summary if item['id'] == 'svc-reg')
    assert queue['waiting'] == 1
    assert queue['id']
    assert 'Private Person' not in directory.text
    assert ticket['id'] not in directory.text
    assert 'customerName' not in directory.text and 'tickets' not in org
    assert client.get('/api/organizations/org-demo').json() == org
    assert client.get('/api/organizations/missing').status_code == 404
    client.post(f"/api/legacy/tickets/{ticket['id']}/cancel")
    service = next(s for s in client.get('/api/organizations').json()[0]['services'] if s['id'] == 'svc-reg')
    assert service['waitingCount'] == 0 and service['estimatedWaitMinutes'] == 0
    with store.db.session(write=True) as session:
        session.get(CounterRow, 'cnt-1').isActive = False
        session.get(CounterRow, 'cnt-2').isActive = False
    service = next(s for s in client.get('/api/organizations').json()[0]['services'] if s['id'] == 'svc-reg')
    assert service['estimatedWaitMinutes'] is None


def test_directory_organization_isolation_empty_and_deleted_services(client, store):
    with store.db.session(write=True) as session:
        session.add(OrganizationRow(id='other', name='Other', slug='other', description='Separate', timezone='Asia/Almaty'))
        session.flush()
        session.add(ServiceRow(id='other-service', organization_id='other', name='Other service', description='', prefix='O', isOpen=True, avgServiceMinutes=5, durationMinutes=5, isActive=True))
        session.add(OrganizationRow(id='empty', name='Empty', slug='empty', description='', timezone='Asia/Almaty'))
        session.get(ServiceRow, 'svc-it').deleted = True
    orgs = {o['id']: o for o in client.get('/api/organizations').json()}
    assert [s['id'] for s in orgs['other']['services']] == ['other-service']
    assert orgs['empty']['services'] == []
    assert 'other-service' not in [s['id'] for s in orgs['org-demo']['services']]
    assert 'svc-it' not in [s['id'] for s in orgs['org-demo']['services']]


def test_contract_directory_exposes_active_catalog_and_joinable_queue_ids(client, store):
    directory = client.get("/api/organizations")
    assert directory.status_code == 200
    organization = next(item for item in directory.json() if item["id"] == "org-demo")
    assert organization["slug"] == "kezek-demo"
    assert "Private Person" not in directory.text and "customerName" not in directory.text

    response = client.get("/api/organizations/org-demo/services")
    assert response.status_code == 200
    services = response.json()
    assert {item["id"] for item in services} == {"svc-reg", "svc-fin"}
    registrar = next(item for item in services if item["id"] == "svc-reg")
    assert registrar["queue"]["serviceId"] == registrar["id"]
    assert registrar["queue"]["isOpen"] is True
    assert registrar["queue"]["waiting"] == 0
    assert all(field not in response.text for field in ("customerName", "accessToken", "ticketNumber", "ticketUrl"))

    issued = client.post(
        f"/api/queues/{registrar['queue']['id']}/tickets",
        headers={"Idempotency-Key": proof(30)}, json={"accessToken": proof(31)},
    )
    assert issued.status_code == 201, issued.text
    assert issued.json()["ticket"]["queueId"] == registrar["queue"]["id"]


def test_contract_directory_handles_unknown_empty_and_closed_catalogs(client, store):
    assert client.get("/api/organizations/missing/services").status_code == 404
    with store.db.session(write=True) as session:
        session.add(OrganizationRow(
            id="empty-catalog", name="Empty catalog", slug="empty-catalog",
            description="No services", timezone="Asia/Almaty",
        ))
        session.get(ServiceRow, "svc-reg").isOpen = False
        session.get(CounterRow, "cnt-1").isActive = False
        session.get(CounterRow, "cnt-2").isActive = False
    assert client.get("/api/organizations/empty-catalog/services").json() == []
    services = client.get("/api/organizations/org-demo/services").json()
    registrar = next(item for item in services if item["id"] == "svc-reg")
    assert registrar["queue"]["isOpen"] is False
    assert registrar["queue"]["activeCounters"] == 0
    assert registrar["queue"]["estimatedWaitMinutes"] is None


def test_public_queue_status_tracks_ticket_changes_without_private_data(client, store):
    catalog = client.get("/api/organizations/org-demo/services").json()
    queue_id = next(item["queue"]["id"] for item in catalog if item["id"] == "svc-reg")
    unknown = client.get("/api/queues/missing/status")
    assert unknown.status_code == 404 and unknown.json()["code"] == "NOT_FOUND"

    empty = client.get(f"/api/queues/{queue_id}/status")
    assert empty.status_code == 200
    assert empty.json()["waiting"] == 0
    first = client.post("/api/tickets", json={"serviceId": "svc-reg", "customerName": "Private visitor"}).json()
    after_join = client.get(f"/api/queues/{queue_id}/status").json()
    assert after_join["waiting"] == 1 and after_join["estimatedWaitMinutes"] == 3
    assert all(field not in str(after_join) for field in (
        "customerName", "accessToken", "ticketNumber", "staffId", "counterName",
    ))

    cancelled = client.post(f"/api/legacy/tickets/{first['id']}/cancel")
    assert cancelled.status_code == 200
    after_cancel = client.get(f"/api/queues/{queue_id}/status").json()
    assert after_cancel["waiting"] == 0

    second = client.post("/api/tickets", json={"serviceId": "svc-reg", "customerName": "Another visitor"}).json()
    staff_token = client.post("/api/auth/login", json={
        "username": "aigerim", "password": "staff123",
    }).json()["token"]
    headers = {"Authorization": "Bearer " + staff_token}
    called = client.post("/api/counters/cnt-1/call-next", headers=headers)
    assert called.status_code == 200 and called.json()["id"] == second["id"]
    assert client.post(f"/api/tickets/{second['id']}/start", headers=headers).status_code == 200
    completed = client.post(f"/api/tickets/{second['id']}/complete", headers=headers)
    assert completed.status_code == 200
    after_complete = client.get(f"/api/queues/{queue_id}/status").json()
    assert after_complete["waiting"] == 0 and after_complete["isOpen"] is True
    with store.db.session(write=True) as session:
        session.get(DailyQueueRow, queue_id).status = "closed"
    assert client.get(f"/api/queues/{queue_id}/status").json()["isOpen"] is False


def test_demo_directory_seed_is_idempotent_and_can_be_served(client, store):
    with store.db.session(write=True) as session:
        session.execute(delete(UserRow).where(UserRow.username == 'admin'))
    seed(store)
    seed(store)
    orgs = client.get('/api/organizations').json()
    demos = [o for o in orgs if o['id'].startswith('demo-')]
    assert len(demos) == 4
    assert all('Demo' in o['name'] for o in demos)
    assert len({o['category'] for o in demos}) == 4
    with store.db.session() as session:
        seeded_staff = list(session.scalars(select(UserRow).where(UserRow.username.like("demo-staff-%"))))
        assert len(seeded_staff) == 4
        assert all(user.password_hash.startswith("$argon2id$") for user in seeded_staff)
        assert session.get(UserRow, "stf-admin").password_hash.startswith("$argon2id$")
        assert all(session.get(OrganizationRow, user.organization_id).timezone == "Asia/Almaty"
                   for user in seeded_staff)
        assert len(list(session.scalars(select(ServiceRow).where(ServiceRow.organization_id.like("demo-%"))))) == 4
        assert len(list(session.scalars(select(CounterRow).where(CounterRow.organization_id.like("demo-%"))))) == 4
        assert len(list(session.scalars(select(CounterServiceRow).where(
            CounterServiceRow.organization_id.like("demo-%"))))) == 4
        assert len(list(session.scalars(select(StaffAssignmentRow).where(
            StaffAssignmentRow.organization_id.like("demo-%"))))) == 4
    ticket = client.post('/api/tickets', json={'serviceId': 'demo-svc-university', 'customerName': 'Visitor'}).json()
    seed(store)
    assert client.get(f"/api/legacy/tickets/{ticket['id']}").json()["id"] == ticket["id"]
    login = client.post('/api/auth/login', json={'username': 'demo-staff-university', 'password': 'staff123'}).json()
    headers = {'Authorization': 'Bearer ' + login['token']}
    counters = client.get('/api/counters', headers=headers).json()
    assert len(counters) == 1
    called = client.post(f"/api/counters/{counters[0]['id']}/call-next", headers=headers).json()
    assert called['id'] == ticket['id']

    admin_login = client.post('/api/auth/login', json={'username': 'admin', 'password': 'admin123'})
    assert admin_login.status_code == 200
    assert admin_login.json()['user']['role'] == 'admin'
    assert len(client.get('/api/organizations').json()) == 5
