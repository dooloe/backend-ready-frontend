from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
import os
import subprocess

from fastapi.testclient import TestClient
import pytest
import yaml

from app.main import create_app
from app.store import DatabaseStore


@dataclass
class Clock:
    value: datetime = datetime(2026, 10, 20, 12, tzinfo=timezone.utc)

    def __call__(self):
        return self.value

    def advance(self, **kwargs):
        self.value += timedelta(**kwargs)


@pytest.fixture
def clock():
    return Clock()


@pytest.fixture(autouse=True)
def isolated_application_environment(monkeypatch, tmp_path):
    # Never inherit a developer/production database or unrelated CORS/seed settings.
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'default-test.db'}")
    monkeypatch.setenv("SEED_DEMO_DATA", "true")
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")


@pytest.fixture
def store(clock, tmp_path):
    store = DatabaseStore(f"sqlite:///{tmp_path / 'api.db'}", seed_tickets=False, clock=clock)
    try:
        yield store
    finally:
        store.close()


@pytest.fixture
def client(store):
    with TestClient(create_app(store)) as client:
        yield client


@pytest.fixture
def admin(client):
    result = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert result.status_code == 200
    return {"Authorization": "Bearer " + result.json()["token"]}


@pytest.fixture
def staff(client):
    result = client.post("/api/auth/login", json={"username": "aigerim", "password": "staff123"})
    assert result.status_code == 200
    return {"Authorization": "Bearer " + result.json()["token"]}


@pytest.fixture(scope="session")
def contract():
    root = Path(__file__).resolve().parents[2]
    path = Path(os.getenv("KEZEK_OPENAPI_PATH", root / "openapi.yaml"))
    if path.is_file():
        text = path.read_text()
    else:
        # Respect a locally deleted contract. Read its committed version without
        # restoring the file or performing any remote Git operation.
        text = subprocess.run(
            ["git", "show", "HEAD:openapi.yaml"], cwd=root,
            text=True, capture_output=True, check=True,
        ).stdout
    return yaml.safe_load(text)
