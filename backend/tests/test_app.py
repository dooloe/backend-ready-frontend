from fastapi.testclient import TestClient

from app.main import app


def test_default_entry_point_serves_seeded_frontend_data():
    with TestClient(app) as client:
        response = client.get("/api/services")

    assert response.status_code == 200
    assert {service["id"] for service in response.json()} == {"svc-reg", "svc-fin", "svc-it"}
