"""Local officer sessions: bcrypt password, opaque token, auth gate."""
import asyncio

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from backend.auth.passwords import hash_password, verify_password
from backend.auth.sessions import ensure_bootstrap_officer
from backend.config import settings
from backend.db import init_db
from backend.main import app


@pytest.fixture()
def auth_client(tmp_path, monkeypatch):
    db_path = tmp_path / "auth-test.db"
    monkeypatch.setattr(settings, "DATABASE_PATH", str(db_path))
    monkeypatch.setattr("backend.db.DB_PATH", str(db_path))
    monkeypatch.setattr("backend.auth.sessions.DB_PATH", str(db_path))
    monkeypatch.setattr(settings, "AUTH_REQUIRED", True)
    monkeypatch.setattr(settings, "BOOTSTRAP_OFFICER_USERNAME", "watch.officer")
    monkeypatch.setattr(settings, "BOOTSTRAP_OFFICER_PASSWORD", SecretStr("correct-horse"))
    monkeypatch.setattr(settings, "BOOTSTRAP_OFFICER_DISPLAY_NAME", "Watch Officer")

    asyncio.run(init_db())
    asyncio.run(ensure_bootstrap_officer())
    with TestClient(app) as client:
        yield client


def test_password_hash_is_not_plaintext():
    digest = hash_password("correct-horse")
    assert digest != "correct-horse"
    assert verify_password("correct-horse", digest)
    assert not verify_password("wrong", digest)


def test_protected_route_requires_session(auth_client):
    denied = auth_client.get("/api/units")
    assert denied.status_code == 401
    healthy = auth_client.get("/api/health")
    assert healthy.status_code == 200


def test_login_logout_round_trip(auth_client):
    bad = auth_client.post("/api/auth/login", json={"username": "watch.officer", "password": "nope"})
    assert bad.status_code == 401

    ok = auth_client.post("/api/auth/login", json={"username": "watch.officer", "password": "correct-horse"})
    assert ok.status_code == 200
    body = ok.json()
    assert body["officer"]["username"] == "watch.officer"
    assert "token" in body
    assert "vanta_session" in ok.cookies

    me = auth_client.get("/api/auth/me", headers={"Authorization": f"Bearer {body['token']}"})
    assert me.status_code == 200
    assert me.json()["officer_id"] == "Watch Officer"

    units = auth_client.get("/api/units", headers={"Authorization": f"Bearer {body['token']}"})
    assert units.status_code == 200

    out = auth_client.post("/api/auth/logout", headers={"Authorization": f"Bearer {body['token']}"})
    assert out.status_code == 200
    denied = auth_client.get("/api/units", headers={"Authorization": f"Bearer {body['token']}"})
    assert denied.status_code == 401
