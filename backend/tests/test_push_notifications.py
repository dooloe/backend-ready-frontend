from types import SimpleNamespace

import pytest
from pywebpush import WebPushException
from sqlalchemy import select

from app.orm import PushDeliveryRow, PushSubscriptionRow, TicketRow
from test_api import anonymous_join, daily_queue_id, proof


def subscription_payload(endpoint="https://fcm.googleapis.com/fcm/send/demo"):
    return {
        "endpoint": endpoint,
        "keys": {"p256dh": "A" * 87, "auth": "B" * 22},
    }


def configure_vapid(monkeypatch):
    monkeypatch.setenv("VAPID_PUBLIC_KEY", "B" * 87)
    monkeypatch.setenv("VAPID_PRIVATE_KEY", "test-private-key")
    monkeypatch.setenv("VAPID_CLAIMS_EMAIL", "mailto:ops@example.test")


def issue_private_ticket(client, store, *, number=70):
    queue_id = daily_queue_id(store)
    access_token = proof(number)
    response = anonymous_join(client, queue_id, key=proof(number + 1), token=access_token)
    assert response.status_code == 201, response.text
    return queue_id, access_token, response.json()["ticket"]


def call_the_private_ticket(client, queue_id, headers):
    path = f"/api/staff/queues/{queue_id}/call-next"
    request = {"headers": headers, "json": {"counterId": "cnt-1"}}
    setup_ticket = client.post(path, **request)
    assert setup_ticket.status_code == 200 and setup_ticket.json()["status"] == "called"
    ticket_id = setup_ticket.json()["id"]
    assert client.post(f"/api/tickets/{ticket_id}/start", headers=headers).status_code == 200
    assert client.post(f"/api/tickets/{ticket_id}/complete", headers=headers).status_code == 200
    return client.post(path, **request)


def test_push_config_is_disabled_without_complete_vapid_settings(client, monkeypatch):
    for name in ("VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_CLAIMS_EMAIL"):
        monkeypatch.delenv(name, raising=False)
    response = client.get("/api/push/config")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json() == {"enabled": False, "publicKey": None}


def test_push_subscription_requires_ticket_token_and_is_scoped_to_that_ticket(
    client, store, monkeypatch,
):
    configure_vapid(monkeypatch)
    _, access_token, ticket = issue_private_ticket(client, store, number=72)
    payload = subscription_payload()

    unauthorized = client.post(
        f"/api/tickets/{proof(99)}/push-subscriptions", json=payload,
    )
    assert unauthorized.status_code == 404
    assert unauthorized.headers["cache-control"] == "no-store"

    enabled = client.post(f"/api/tickets/{access_token}/push-subscriptions", json=payload)
    assert enabled.status_code == 204, enabled.text
    assert enabled.headers["cache-control"] == "no-store"
    with store.db.session() as session:
        rows = list(session.scalars(select(PushSubscriptionRow)))
        assert len(rows) == 1
        assert rows[0].ticket_id == ticket["id"]
        assert access_token not in rows[0].endpoint

    disabled_without_permission = client.request(
        "DELETE", f"/api/tickets/{proof(99)}/push-subscriptions",
        json={"endpoint": payload["endpoint"]},
    )
    assert disabled_without_permission.status_code == 404
    disabled = client.request(
        "DELETE", f"/api/tickets/{access_token}/push-subscriptions",
        json={"endpoint": payload["endpoint"]},
    )
    assert disabled.status_code == 204
    with store.db.session() as session:
        assert session.scalar(select(PushSubscriptionRow.id)) is None


@pytest.mark.parametrize("endpoint", [
    "http://fcm.googleapis.com/send/demo",
    "https://localhost/push/demo",
    "https://example.test/push/demo",
    "https://user:password@fcm.googleapis.com/fcm/send/demo",
])
def test_push_subscription_rejects_unsafe_or_unsupported_endpoints(client, store, monkeypatch, endpoint):
    configure_vapid(monkeypatch)
    _, access_token, _ = issue_private_ticket(client, store, number=74)
    response = client.post(
        f"/api/tickets/{access_token}/push-subscriptions",
        json=subscription_payload(endpoint),
    )
    assert response.status_code == 422
    with store.db.session() as session:
        assert session.scalar(select(PushSubscriptionRow.id)) is None


def test_cancelling_a_ticket_removes_its_push_subscription(client, store, monkeypatch):
    configure_vapid(monkeypatch)
    _, access_token, ticket = issue_private_ticket(client, store, number=75)
    assert client.post(
        f"/api/tickets/{access_token}/push-subscriptions", json=subscription_payload(),
    ).status_code == 204
    cancelled = client.post(f"/api/tickets/{access_token}/cancel")
    assert cancelled.status_code == 200 and cancelled.json()["status"] == "cancelled"
    with store.db.session() as session:
        assert session.scalar(select(PushSubscriptionRow.id).where(
            PushSubscriptionRow.ticket_id == ticket["id"],
        )) is None


def test_call_next_sends_generic_push_once_and_duplicate_dispatch_is_idempotent(
    client, store, monkeypatch,
):
    configure_vapid(monkeypatch)
    queue_id, access_token, ticket = issue_private_ticket(client, store, number=76)
    payload = subscription_payload()
    assert client.post(f"/api/tickets/{access_token}/push-subscriptions", json=payload).status_code == 204
    calls = []

    def send(**request):
        calls.append(request)
        return SimpleNamespace(status_code=201)

    monkeypatch.setattr("pywebpush.webpush", send)
    login = client.post("/api/auth/login", json={"username": "aigerim", "password": "staff123"})
    headers = {"Authorization": "Bearer " + login.json()["token"]}
    result = call_the_private_ticket(client, queue_id, headers)
    assert result.status_code == 200
    assert result.json()["status"] == "called"
    assert len(calls) == 1
    sent = calls[0]["data"]
    assert access_token not in sent
    assert ticket["ticketNumber"] not in sent
    assert "Your turn is approaching" in sent

    store.dispatch_called_notification(ticket["id"])
    assert len(calls) == 1
    with store.db.session() as session:
        assert session.scalar(select(PushDeliveryRow.id)) is not None
        assert session.scalar(select(TicketRow.status).where(TicketRow.id == ticket["id"])) == "called"


def test_delivery_failure_does_not_fail_call_next_and_stale_subscription_is_disabled(
    client, store, monkeypatch,
):
    configure_vapid(monkeypatch)
    queue_id, access_token, ticket = issue_private_ticket(client, store, number=78)
    payload = subscription_payload()
    assert client.post(f"/api/tickets/{access_token}/push-subscriptions", json=payload).status_code == 204

    def expired(**_request):
        raise WebPushException("gone", response=SimpleNamespace(status_code=410))

    monkeypatch.setattr("pywebpush.webpush", expired)
    login = client.post("/api/auth/login", json={"username": "aigerim", "password": "staff123"})
    headers = {"Authorization": "Bearer " + login.json()["token"]}
    result = call_the_private_ticket(client, queue_id, headers)
    assert result.status_code == 200
    assert result.json()["id"] == ticket["id"]
    with store.db.session() as session:
        subscription = session.scalar(select(PushSubscriptionRow))
        assert subscription is not None and subscription.disabled_at is not None
        assert session.scalar(select(TicketRow.status).where(TicketRow.id == ticket["id"])) == "called"


def test_network_exception_does_not_undo_queue_transition(client, store, monkeypatch):
    configure_vapid(monkeypatch)
    queue_id, access_token, ticket = issue_private_ticket(client, store, number=80)
    assert client.post(
        f"/api/tickets/{access_token}/push-subscriptions", json=subscription_payload(),
    ).status_code == 204

    def failed_send(**_request):
        raise OSError("notification service unavailable")

    monkeypatch.setattr("pywebpush.webpush", failed_send)
    login = client.post("/api/auth/login", json={"username": "aigerim", "password": "staff123"})
    headers = {"Authorization": "Bearer " + login.json()["token"]}
    result = call_the_private_ticket(client, queue_id, headers)
    assert result.status_code == 200
    assert result.json()["id"] == ticket["id"]
