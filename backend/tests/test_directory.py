from sqlalchemy import delete, select

from app.orm import (CounterRow, CounterServiceRow, OrganizationRow, ServiceRow,
                     StaffAssignmentRow, UserRow)
from seed_directory import seed


def test_directory_is_public_aggregate_only_and_estimates_follow_queue(client, store):
    ticket = client.post('/api/tickets', json={'serviceId': 'svc-reg', 'customerName': 'Private Person'}).json()
    directory = client.get('/api/organizations')
    assert directory.status_code == 200
    org = directory.json()[0]
    assert org['id'] == 'org-demo'
    service = next(s for s in org['services'] if s['id'] == 'svc-reg')
    assert service['waitingCount'] == 1
    assert service['estimatedWaitMinutes'] == 3
    assert 'Private Person' not in directory.text
    assert ticket['id'] not in directory.text
    assert 'customerName' not in directory.text and 'tickets' not in org
    assert client.get('/api/organizations/org-demo').json() == org
    assert client.get('/api/organizations/missing').status_code == 404
    client.post(f"/api/tickets/{ticket['id']}/cancel")
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
    assert client.get(f"/api/tickets/{ticket['id']}").json()["id"] == ticket["id"]
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
