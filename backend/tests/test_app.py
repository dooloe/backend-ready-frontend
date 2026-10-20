from fastapi.testclient import TestClient
import pytest

from app.main import app


def test_default_entry_point_serves_seeded_frontend_data(monkeypatch, tmp_path):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'entrypoint.db'}")
    monkeypatch.setenv("SEED_DEMO_DATA", "true")
    with TestClient(app) as client:
        response = client.get("/api/services")

    assert response.status_code == 200
    assert {service["id"] for service in response.json()} == {"svc-reg", "svc-fin", "svc-it"}


@pytest.mark.parametrize("variable,value", [
    ("APP_ENV", "staging"), ("SEED_DEMO_DATA", "yes"),
    ("CORS_ORIGINS", "https://example.test/path"),
    ("CORS_ORIGINS", "https://user:password@example.test"),
    ("CORS_ORIGINS", "https://example.test?token=not-safe"),
    ("DATABASE_URL", ""), ("DATABASE_URL", "not a url with secret=value"),
    ("DATABASE_URL", "sqlite:///"),
])
def test_invalid_settings_fail_startup_without_echoing_raw_values(monkeypatch, tmp_path, variable, value):
    db = tmp_path / "must-not-be-created.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db}")
    monkeypatch.setenv(variable, value)
    with pytest.raises(ValueError) as exc:
        with TestClient(__import__("app.main", fromlist=["create_app"]).create_app()):
            pass
    assert variable in str(exc.value)
    assert "secret=value" not in str(exc.value)
    assert "password@example.test" not in str(exc.value)
    assert not db.exists()


def test_production_rejects_demo_seed_and_database_url_is_hidden(monkeypatch):
    from app.settings import Settings

    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("SEED_DEMO_DATA", "true")
    with pytest.raises(ValueError, match="SEED_DEMO_DATA"):
        Settings.from_environment("sqlite:///:memory:")
    monkeypatch.setenv("SEED_DEMO_DATA", "false")
    settings = Settings.from_environment("postgresql://demo:secret@localhost/kezek")
    assert "secret" not in repr(settings)
    assert settings.seed_demo is False


def test_http_errors_preserve_legacy_detail_and_add_safe_structured_fields(monkeypatch, tmp_path):
    from app.main import create_app

    app = create_app(database_url=f"sqlite:///{tmp_path / 'error.db'}")
    with TestClient(app) as client:
        missing = client.get("/api/tickets/not-there")
        assert missing.status_code == 404
        assert missing.json() == {"code": "NOT_FOUND", "message": "Ticket not found",
                                  "details": None, "detail": "Ticket not found"}
        invalid = client.post("/api/tickets", json={"serviceId": "svc-reg", "customerName": "  "})
        assert invalid.status_code == 422
        assert invalid.json()["code"] == "VALIDATION_ERROR"
        assert invalid.json()["detail"] == invalid.json()["message"]
        assert "  " not in invalid.text
        ticket = client.post("/api/tickets", json={
            "serviceId": "svc-reg", "customerName": "Conflict test"
        }).json()
        assert client.post(f"/api/tickets/{ticket['id']}/cancel").status_code == 200
        conflict = client.post(f"/api/tickets/{ticket['id']}/cancel")
        assert conflict.status_code == 409
        assert conflict.json() == {
            "code": "INVALID_STATE", "message": "Only waiting tickets can be cancelled",
            "details": None, "detail": "Only waiting tickets can be cancelled",
        }


def test_unexpected_errors_return_safe_envelope_without_secret_in_logs(client, staff, caplog):
    @client.app.get("/__audit/error")
    def crash():
        raise RuntimeError("postgresql://audit:must-not-leak@database.test/db")

    with TestClient(client.app, raise_server_exceptions=False) as non_raising_client:
        response = non_raising_client.get("/__audit/error", headers=staff)
    assert response.status_code == 500
    assert response.json() == {"code": "INTERNAL_ERROR", "message": "Internal server error",
                               "details": None, "detail": "Internal server error"}
    assert "must-not-leak" not in response.text
    assert "must-not-leak" not in caplog.text


def test_legacy_cors_and_structured_error_aliases_remain_compatible(client):
    response = client.get("/api/tickets/no-such-ticket", headers={"Origin": "http://localhost:5173"})
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert response.json()["detail"] == response.json()["message"]
