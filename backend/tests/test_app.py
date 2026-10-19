from fastapi.testclient import TestClient

from app.main import app


def test_empty_application_starts_and_serves_its_schema():
    with TestClient(app) as client:
        response = client.get("/openapi.json")

    assert response.status_code == 200
    schema = response.json()
    assert schema["info"]["title"] == "Kezek API"
    assert schema["paths"] == {}
