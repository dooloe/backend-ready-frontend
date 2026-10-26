from datetime import date, datetime, time, timezone

import pytest
from fastapi import HTTPException

from app.orm import DailyQueueRow, ServiceRow
from app.scheduling import resolve_queue_schedule


def test_regular_schedule_uses_organization_local_date_and_half_open_boundaries():
    opens = time(9)
    closes = time(17)

    before = resolve_queue_schedule(
        "Asia/Almaty", opens, closes, datetime(2026, 10, 20, 3, 59, tzinfo=timezone.utc),
    )
    opening = resolve_queue_schedule(
        "Asia/Almaty", opens, closes, datetime(2026, 10, 20, 4, 0, tzinfo=timezone.utc),
    )
    closing = resolve_queue_schedule(
        "Asia/Almaty", opens, closes, datetime(2026, 10, 20, 12, 0, tzinfo=timezone.utc),
    )

    assert before.business_date == date(2026, 10, 20) and not before.within_hours
    assert opening.business_date == date(2026, 10, 20) and opening.within_hours
    assert closing.business_date == date(2026, 10, 20) and not closing.within_hours


def test_overnight_schedule_keeps_after_midnight_visitors_on_opening_date():
    opening = resolve_queue_schedule(
        "Asia/Almaty", time(22), time(2), datetime(2026, 10, 20, 17, tzinfo=timezone.utc),
    )
    after_midnight = resolve_queue_schedule(
        "Asia/Almaty", time(22), time(2), datetime(2026, 10, 20, 20, tzinfo=timezone.utc),
    )
    at_midnight = resolve_queue_schedule(
        "Asia/Almaty", time(22), time(2), datetime(2026, 10, 20, 19, tzinfo=timezone.utc),
    )
    closing = resolve_queue_schedule(
        "Asia/Almaty", time(22), time(2), datetime(2026, 10, 20, 21, tzinfo=timezone.utc),
    )

    assert opening.business_date == date(2026, 10, 20) and opening.within_hours
    assert at_midnight.business_date == date(2026, 10, 20) and at_midnight.within_hours
    assert after_midnight.business_date == date(2026, 10, 20) and after_midnight.within_hours
    assert closing.business_date == date(2026, 10, 21) and not closing.within_hours


@pytest.mark.parametrize("opens_at,closes_at", [(None, None), (time(9), time(9))])
def test_unspecified_or_equal_hours_mean_full_day(opens_at, closes_at):
    result = resolve_queue_schedule(
        "Asia/Almaty", opens_at, closes_at,
        datetime(2026, 10, 20, 23, 59, tzinfo=timezone.utc),
    )
    assert result.business_date == date(2026, 10, 21)
    assert result.within_hours


def test_partial_schedule_or_naive_instant_is_rejected():
    instant = datetime(2026, 10, 20, 12, tzinfo=timezone.utc)
    with pytest.raises(ValueError, match="Both opening and closing"):
        resolve_queue_schedule("Asia/Almaty", time(9), None, instant)
    with pytest.raises(ValueError, match="timezone-aware"):
        resolve_queue_schedule("Asia/Almaty", None, None, datetime(2026, 10, 20, 12))


def test_daily_queue_created_on_join_and_manual_closure_overrides_hours(client, store, clock):
    with store.db.session(write=True) as session:
        service = session.get(ServiceRow, "svc-reg")
        service.opensAt = time(9)
        service.closesAt = time(17)

    clock.value = datetime(2026, 10, 20, 4, tzinfo=timezone.utc)
    organization = client.get("/api/organizations/org-demo").json()
    service = next(item for item in organization["services"] if item["id"] == "svc-reg")
    assert service["isOpen"] is True

    ticket = client.post("/api/tickets", json={
        "serviceId": "svc-reg", "customerName": "Scheduled visitor",
    }).json()
    with store.db.session(write=True) as session:
        queue = session.query(DailyQueueRow).filter_by(service_id="svc-reg").one()
        assert queue.business_date == date(2026, 10, 20)
        queue.status = "closed"
        queue.closed_at = clock.value

    organization = client.get("/api/organizations/org-demo").json()
    service = next(item for item in organization["services"] if item["id"] == "svc-reg")
    assert service["isOpen"] is False
    rejected = client.post("/api/tickets", json={
        "serviceId": "svc-reg", "customerName": "Should not join",
    })
    assert rejected.status_code == 409
    assert client.get(f"/api/tickets/{ticket['id']}").status_code == 200


def test_join_rejects_outside_hours_without_creating_daily_queue(client, store, clock):
    with store.db.session(write=True) as session:
        service = session.get(ServiceRow, "svc-reg")
        service.opensAt = time(9)
        service.closesAt = time(17)
    clock.value = datetime(2026, 10, 20, 3, 59, tzinfo=timezone.utc)

    response = client.post("/api/tickets", json={
        "serviceId": "svc-reg", "customerName": "Too early",
    })
    assert response.status_code == 409
    with store.db.session() as session:
        assert session.query(DailyQueueRow).filter_by(service_id="svc-reg").count() == 0


def test_inactive_service_is_unavailable_and_does_not_create_queue(client, store):
    with store.db.session(write=True) as session:
        session.get(ServiceRow, "svc-reg").isActive = False

    organization = client.get("/api/organizations/org-demo").json()
    service = next(item for item in organization["services"] if item["id"] == "svc-reg")
    assert service["isOpen"] is False
    response = client.post("/api/tickets", json={
        "serviceId": "svc-reg", "customerName": "Inactive service",
    })
    assert response.status_code == 409
    with store.db.session() as session:
        assert session.query(DailyQueueRow).filter_by(service_id="svc-reg").count() == 0


def test_join_selects_previous_local_date_during_overnight_tail(client, store, clock):
    with store.db.session(write=True) as session:
        service = session.get(ServiceRow, "svc-reg")
        service.opensAt = time(22)
        service.closesAt = time(2)
    clock.value = datetime(2026, 10, 20, 20, tzinfo=timezone.utc)

    response = client.post("/api/tickets", json={
        "serviceId": "svc-reg", "customerName": "After midnight",
    })
    assert response.status_code == 200
    with store.db.session() as session:
        queue = session.query(DailyQueueRow).filter_by(service_id="svc-reg").one()
        assert queue.business_date == date(2026, 10, 20)


def test_invalid_organization_timezone_fails_closed(client, store):
    from app.orm import OrganizationRow

    with store.db.session(write=True) as session:
        session.get(OrganizationRow, "org-demo").timezone = "Not/A-Timezone"

    directory = client.get("/api/organizations/org-demo")
    assert directory.status_code == 200
    service = next(item for item in directory.json()["services"] if item["id"] == "svc-reg")
    assert service["isOpen"] is False
    join = client.post("/api/tickets", json={"serviceId": "svc-reg", "customerName": "Visitor"})
    assert join.status_code == 422
    with store.db.session() as session:
        assert session.query(DailyQueueRow).filter_by(service_id="svc-reg").count() == 0
