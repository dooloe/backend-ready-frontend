from fastapi.testclient import TestClient

from app.main import app


def test_default_entry_point_serves_seeded_frontend_data(monkeypatch, tmp_path):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'entrypoint.db'}")
    monkeypatch.setenv("SEED_DEMO_DATA", "true")
    with TestClient(app) as client:
        response = client.get("/api/services")

    assert response.status_code == 200
    assert {service["id"] for service in response.json()} == {"svc-reg", "svc-fin", "svc-it"}
