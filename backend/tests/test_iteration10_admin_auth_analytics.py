"""Iteration 10 regression: auth routing guards + admin analytics APIs."""

import os
import uuid
from pathlib import Path

import pytest
import requests
from pymongo import MongoClient


def _read_frontend_backend_url():
    env_path = Path("/app/frontend/.env")
    if not env_path.exists():
        return None
    for line in env_path.read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return None


def _read_backend_env():
    env_path = Path("/app/backend/.env")
    values = {}
    if not env_path.exists():
        return values
    for line in env_path.read_text().splitlines():
        if not line or line.strip().startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        values[k.strip()] = v.strip().strip('"').strip("'")
    return values


BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _read_frontend_backend_url() or "").rstrip("/")
BACKEND_ENV = _read_backend_env()
ADMIN_EMAIL = "tony@tonyyoga.com"
ADMIN_PASSWORD = "TonyYoga2026!"
STUDENT_EMAIL = "student@demo.com"
STUDENT_PASSWORD = "Student2026!"


@pytest.fixture(scope="module")
def api_client():
    assert BASE_URL, "REACT_APP_BACKEND_URL is required"
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def admin_auth(api_client):
    response = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD, "remember": True},
        timeout=20,
    )
    assert response.status_code == 200
    data = response.json()
    return {"token": data["token"], "user": data["user"], "response": response}


@pytest.fixture(scope="module")
def student_auth(api_client):
    response = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": STUDENT_EMAIL, "password": STUDENT_PASSWORD, "remember": False},
        timeout=20,
    )
    if response.status_code != 200:
        pytest.skip("Seeded student login unavailable")
    data = response.json()
    return {"token": data["token"], "user": data["user"], "response": response}


@pytest.fixture(scope="module")
def analytics_cleanup_ids():
    return {"event_ids": set(), "session_ids": set()}


@pytest.fixture(scope="module", autouse=True)
def cleanup_analytics(analytics_cleanup_ids):
    yield
    mongo_url = os.environ.get("MONGO_URL") or BACKEND_ENV.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME") or BACKEND_ENV.get("DB_NAME")
    if not mongo_url or not db_name:
        return
    client = MongoClient(mongo_url)
    coll = client[db_name]["analytics_events"]
    if analytics_cleanup_ids["event_ids"]:
        coll.delete_many({"event_id": {"$in": list(analytics_cleanup_ids["event_ids"])}})
    if analytics_cleanup_ids["session_ids"]:
        coll.delete_many({"session_id": {"$in": list(analytics_cleanup_ids["session_ids"])}})
    client.close()


# Auth contracts and security checks
def test_login_returns_admin_role_and_cookie_flags(admin_auth):
    cookie = admin_auth["response"].headers.get("set-cookie", "")
    assert admin_auth["user"]["role"] == "admin"
    assert "HttpOnly" in cookie
    assert "access_token=" in cookie


def test_login_returns_student_role(student_auth):
    assert student_auth["user"]["role"] == "student"


def test_auth_me_matches_admin_identity(api_client, admin_auth):
    response = requests.get(
        f"{BASE_URL}/api/auth/me",
        headers={"Authorization": f"Bearer {admin_auth['token']}"},
        timeout=20,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == ADMIN_EMAIL
    assert data["role"] == "admin"


def test_invalid_login_rejected(api_client):
    response = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": "wrong-password-123", "remember": True},
        timeout=20,
    )
    assert response.status_code == 401
    assert "Invalid" in response.text


def test_bruteforce_lockout_after_five_fails(api_client):
    email = f"missing+{uuid.uuid4().hex[:8]}@example.com"
    for _ in range(5):
        response = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": email, "password": "bad-pass", "remember": False},
            timeout=20,
        )
        assert response.status_code == 401
    locked = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": "bad-pass", "remember": False},
        timeout=20,
    )
    assert locked.status_code == 429


def test_cors_credentials_header_present_for_explicit_origin(api_client):
    response = api_client.options(
        f"{BASE_URL}/api/auth/login",
        headers={
            "Origin": BASE_URL,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
        timeout=20,
    )
    # Browser auth flows with cookies require this to be true.
    assert response.headers.get("access-control-allow-credentials") == "true"
    assert response.headers.get("access-control-allow-origin") not in (None, "*")


# Role-based access controls
def test_admin_analytics_denied_for_anonymous(api_client):
    response = requests.get(f"{BASE_URL}/api/admin/analytics?days=7", timeout=20)
    assert response.status_code == 401


def test_admin_analytics_denied_for_student(api_client, student_auth):
    response = requests.get(
        f"{BASE_URL}/api/admin/analytics?days=7",
        headers={"Authorization": f"Bearer {student_auth['token']}"},
        timeout=20,
    )
    assert response.status_code == 403


def test_admin_analytics_available_for_admin_days_filters(api_client, admin_auth):
    for days in (7, 30, 90):
        response = requests.get(
            f"{BASE_URL}/api/admin/analytics?days={days}",
            headers={"Authorization": f"Bearer {admin_auth['token']}"},
            timeout=20,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["days"] == days
        assert len(data["series"]) == days
        assert isinstance(data["summary"]["views"], int)


# Analytics ingestion correctness and validation
def test_analytics_config_public(api_client):
    response = api_client.get(f"{BASE_URL}/api/analytics/config", timeout=20)
    assert response.status_code == 200
    assert isinstance(response.json()["enabled"], bool)


def test_analytics_event_accepts_public_path_and_dedupes_event_id(api_client, analytics_cleanup_ids):
    event_id = str(uuid.uuid4())
    session_id = str(uuid.uuid4())
    payload = {
        "event_id": event_id,
        "session_id": session_id,
        "path": "/privacy",
        "platform": "website",
        "load_ms": 512,
    }
    analytics_cleanup_ids["event_ids"].add(event_id)
    analytics_cleanup_ids["session_ids"].add(session_id)
    first = api_client.post(f"{BASE_URL}/api/analytics/events", json=payload, timeout=20)
    assert first.status_code == 200
    assert first.json()["accepted"] is True

    second = api_client.post(f"{BASE_URL}/api/analytics/events", json=payload, timeout=20)
    assert second.status_code == 200
    assert second.json()["accepted"] is False

    analytics_cleanup_ids["event_ids"].add(event_id)
    analytics_cleanup_ids["session_ids"].add(session_id)


def test_analytics_event_rejects_sensitive_or_invalid_fields(api_client):
    bad_payloads = [
        {
            "event_id": str(uuid.uuid4()),
            "session_id": str(uuid.uuid4()),
            "path": "/admin",
            "platform": "website",
            "load_ms": 10,
        },
        {
            "event_id": str(uuid.uuid4()),
            "session_id": str(uuid.uuid4()),
            "path": "/privacy?email=test@example.com",
            "platform": "website",
            "load_ms": 10,
        },
        {
            "event_id": str(uuid.uuid4()),
            "session_id": str(uuid.uuid4()),
            "path": "/privacy",
            "platform": "tablet",
            "load_ms": 10,
        },
        {
            "event_id": str(uuid.uuid4()),
            "session_id": str(uuid.uuid4()),
            "path": "/privacy",
            "platform": "website",
            "load_ms": 130000,
        },
    ]
    for payload in bad_payloads:
        response = api_client.post(f"{BASE_URL}/api/analytics/events", json=payload, timeout=20)
        assert response.status_code == 422


def test_analytics_event_from_admin_identity_is_ignored(api_client, admin_auth):
    response = requests.post(
        f"{BASE_URL}/api/analytics/events",
        json={
            "event_id": str(uuid.uuid4()),
            "session_id": str(uuid.uuid4()),
            "path": "/privacy",
            "platform": "website",
            "load_ms": 300,
        },
        headers={"Authorization": f"Bearer {admin_auth['token']}"},
        timeout=20,
    )
    assert response.status_code == 200
    assert response.json()["accepted"] is False


def test_analytics_ttl_index_exists_90_days():
    mongo_url = os.environ.get("MONGO_URL") or BACKEND_ENV.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME") or BACKEND_ENV.get("DB_NAME")
    if not mongo_url or not db_name:
        pytest.skip("MONGO_URL/DB_NAME unavailable for index inspection")
    client = MongoClient(mongo_url)
    indexes = list(client[db_name]["analytics_events"].list_indexes())
    client.close()
    ttl_indexes = [idx for idx in indexes if idx.get("expireAfterSeconds") == 90 * 86400]
    assert len(ttl_indexes) >= 1


def test_seeded_admin_password_hash_uses_bcrypt_2b_prefix():
    mongo_url = os.environ.get("MONGO_URL") or BACKEND_ENV.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME") or BACKEND_ENV.get("DB_NAME")
    if not mongo_url or not db_name:
        pytest.skip("MONGO_URL/DB_NAME unavailable for bcrypt hash inspection")
    client = MongoClient(mongo_url)
    admin = client[db_name]["users"].find_one({"email": ADMIN_EMAIL}, {"password_hash": 1})
    client.close()
    assert admin is not None
    assert isinstance(admin.get("password_hash"), str)
    assert admin["password_hash"].startswith("$2b$")
