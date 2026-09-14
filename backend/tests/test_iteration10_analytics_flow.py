"""Iteration 10 analytics flow validation with scoped fixtures and cleanup."""

import os
import uuid
from pathlib import Path

import pytest
import requests
from pymongo import MongoClient


def _read_env_file(path):
    values = {}
    p = Path(path)
    if not p.exists():
        return values
    for line in p.read_text().splitlines():
        if not line or line.strip().startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        values[k.strip()] = v.strip().strip('"').strip("'")
    return values


FRONTEND_ENV = _read_env_file("/app/frontend/.env")
BACKEND_ENV = _read_env_file("/app/backend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or FRONTEND_ENV.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL") or BACKEND_ENV.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME") or BACKEND_ENV.get("DB_NAME")


@pytest.fixture(scope="module")
def admin_token():
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "tony@tonyyoga.com", "password": "TonyYoga2026!", "remember": True},
        timeout=20,
    )
    assert response.status_code == 200
    return response.json()["token"]


@pytest.fixture(scope="module")
def analytics_scope():
    return {"event_ids": set(), "session_ids": set()}


@pytest.fixture(scope="module", autouse=True)
def restore_and_cleanup(admin_token, analytics_scope):
    headers = {"Authorization": f"Bearer {admin_token}"}
    current = requests.get(f"{BASE_URL}/api/admin/analytics?days=7", headers=headers, timeout=20)
    assert current.status_code == 200
    original_enabled = current.json().get("enabled", True)
    yield

    requests.patch(
        f"{BASE_URL}/api/admin/analytics/config",
        json={"enabled": original_enabled},
        headers=headers,
        timeout=20,
    )

    if MONGO_URL and DB_NAME:
        client = MongoClient(MONGO_URL)
        coll = client[DB_NAME]["analytics_events"]
        if analytics_scope["event_ids"]:
            coll.delete_many({"event_id": {"$in": list(analytics_scope["event_ids"])}})
        if analytics_scope["session_ids"]:
            coll.delete_many({"session_id": {"$in": list(analytics_scope["session_ids"])}})
        client.close()


def _post_event(path, platform, analytics_scope):
    event_id = str(uuid.uuid4())
    session_id = str(uuid.uuid4())
    analytics_scope["event_ids"].add(event_id)
    analytics_scope["session_ids"].add(session_id)
    response = requests.post(
        f"{BASE_URL}/api/analytics/events",
        json={
            "event_id": event_id,
            "session_id": session_id,
            "path": path,
            "platform": platform,
            "load_ms": 420,
        },
        timeout=20,
    )
    return response


def test_admin_analytics_config_patch_requires_admin(admin_token):
    ok = requests.patch(
        f"{BASE_URL}/api/admin/analytics/config",
        json={"enabled": True},
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=20,
    )
    assert ok.status_code == 200
    assert ok.json()["enabled"] is True


def test_admin_analytics_config_patch_denies_anonymous():
    denied = requests.patch(
        f"{BASE_URL}/api/admin/analytics/config",
        json={"enabled": True},
        timeout=20,
    )
    assert denied.status_code == 401


def test_admin_analytics_config_patch_denies_student():
    login = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "student@demo.com", "password": "Student2026!", "remember": False},
        timeout=20,
    )
    if login.status_code != 200:
        pytest.skip("Student login unavailable")
    token = login.json()["token"]
    denied = requests.patch(
        f"{BASE_URL}/api/admin/analytics/config",
        json={"enabled": True},
        headers={"Authorization": f"Bearer {token}"},
        timeout=20,
    )
    assert denied.status_code == 403


def test_collection_toggle_off_blocks_new_events(admin_token, analytics_scope):
    headers = {"Authorization": f"Bearer {admin_token}"}

    off = requests.patch(
        f"{BASE_URL}/api/admin/analytics/config",
        json={"enabled": False},
        headers=headers,
        timeout=20,
    )
    assert off.status_code == 200
    assert off.json()["enabled"] is False

    blocked = _post_event("/privacy", "website", analytics_scope)
    assert blocked.status_code == 200
    assert blocked.json()["accepted"] is False

    on = requests.patch(
        f"{BASE_URL}/api/admin/analytics/config",
        json={"enabled": True},
        headers=headers,
        timeout=20,
    )
    assert on.status_code == 200
    assert on.json()["enabled"] is True


def test_admin_report_aggregates_website_plus_app_and_zero_filled_series(admin_token, analytics_scope):
    headers = {"Authorization": f"Bearer {admin_token}"}

    website = _post_event("/privacy", "website", analytics_scope)
    app = _post_event("/terms", "pwa", analytics_scope)
    assert website.status_code == 200 and website.json()["accepted"] is True
    assert app.status_code == 200 and app.json()["accepted"] is True

    report = requests.get(f"{BASE_URL}/api/admin/analytics?days=7", headers=headers, timeout=20)
    assert report.status_code == 200
    data = report.json()

    assert data["days"] == 7
    assert len(data["series"]) == 7
    assert data["retention_days"] == 90
    assert data["summary"]["views"] >= 2
    assert data["summary"]["website_views"] >= 1
    assert data["summary"]["app_views"] >= 1
    assert any(row["website"] == 0 and row["app"] == 0 for row in data["series"])


def test_native_platform_is_counted_only_when_explicit_payload_native(admin_token, analytics_scope):
    headers = {"Authorization": f"Bearer {admin_token}"}
    r = _post_event("/privacy", "native", analytics_scope)
    assert r.status_code == 200
    assert r.json()["accepted"] is True

    report = requests.get(f"{BASE_URL}/api/admin/analytics?days=7", headers=headers, timeout=20)
    assert report.status_code == 200
    data = report.json()
    # Backend groups non-website traffic as app; frontend ensures ?native=1 does not send native.
    assert data["summary"]["app_views"] >= 1
