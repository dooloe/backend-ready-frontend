import logging

from sqlalchemy import func, select
from fastapi.testclient import TestClient

from app.main import create_app
from app.orm import SessionRow, TicketRow
from app.security import SensitiveAccessLogFilter, SlidingWindowRateLimiter


def test_login_and_join_limits_reject_without_creating_records(store):
    now = [100.0]
    limiter = SlidingWindowRateLimiter(
        {
            ("POST", "/api/auth/login"): (2, 10),
            ("POST", "/api/tickets"): (2, 10),
        },
        clock=lambda: now[0],
    )
    with TestClient(create_app(store, rate_limiter=limiter)) as client:
        successful_login = client.post(
            "/api/auth/login", json={"username": "admin", "password": "admin123"},
        )
        rejected_login = client.post(
            "/api/auth/login", json={"username": "admin", "password": "wrong"},
        )
        limited_login = client.post(
            "/api/auth/login", json={"username": "admin", "password": "admin123"},
        )

        join_body = {"serviceId": "svc-reg", "customerName": "Visitor"}
        first_ticket = client.post("/api/tickets", json=join_body)
        second_ticket = client.post("/api/tickets", json=join_body)
        limited_join = client.post("/api/tickets", json=join_body)

        assert successful_login.status_code == 200
        assert rejected_login.status_code == 401
        assert limited_login.status_code == 429
        assert limited_login.headers["retry-after"] == "10"
        assert limited_login.json() == {
            "code": "RATE_LIMITED",
            "message": "Too many requests. Please try again later.",
            "details": None,
            "detail": "Too many requests. Please try again later.",
        }
        assert first_ticket.status_code == second_ticket.status_code == 200
        assert limited_join.status_code == 429
        assert limited_join.json()["code"] == "RATE_LIMITED"
        assert limited_join.headers["retry-after"] == "10"

        with store.db.session() as session:
            assert session.scalar(select(func.count()).select_from(SessionRow)) == 1
            assert session.scalar(select(func.count()).select_from(TicketRow)) == 2

        now[0] += 11
        allowed_again = client.post(
            "/api/auth/login", json={"username": "admin", "password": "admin123"},
        )
        assert allowed_again.status_code == 200


def test_referrer_policy_is_applied_to_success_and_error_responses(client):
    success = client.get("/api/organizations")
    failure = client.get("/api/tickets/unknown-private-ticket")

    assert success.status_code == 200
    assert failure.status_code == 404
    assert success.headers["referrer-policy"] == "no-referrer"
    assert failure.headers["referrer-policy"] == "no-referrer"


def test_access_log_filter_redacts_ticket_paths_and_all_query_strings():
    access_filter = SensitiveAccessLogFilter()
    samples = [
        "/api/tickets/private-ticket-id",
        "/api/tickets/private-ticket-id/cancel?access_token=private-token",
        "/ticket/private-ticket-id?password=private-password",
        "/api/auth/login?password=private-password",
    ]

    for path in samples:
        record = logging.LogRecord(
            "uvicorn.access", logging.INFO, "uvicorn", 1,
            '%s - "%s %s HTTP/%s" %d',
            ("127.0.0.1", "GET", path, "1.1", 200), None,
        )
        access_filter.filter(record)
        rendered = record.getMessage()
        assert "private-ticket-id" not in rendered
        assert "private-token" not in rendered
        assert "private-password" not in rendered
        assert "?" not in rendered
        if "tickets/" in path or "/ticket/" in path:
            assert "[redacted]" in rendered


def test_installed_uvicorn_access_logger_does_not_emit_ticket_or_query_secrets(caplog):
    logger = logging.getLogger("uvicorn.access")
    caplog.set_level(logging.INFO, logger="uvicorn.access")
    logger.info(
        '%s - "%s %s HTTP/%s" %d',
        "127.0.0.1", "GET",
        "/api/tickets/secret-ticket-id?access_token=secret-session-token&password=secret-password",
        "1.1", 200,
    )

    assert "[redacted]" in caplog.text
    assert "secret-ticket-id" not in caplog.text
    assert "secret-session-token" not in caplog.text
    assert "secret-password" not in caplog.text
