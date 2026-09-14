"""Regression tests for deployment diagnostics (Hostinger VPS scenario).

Covers the "programs not showing" issue by verifying:
  - /api/health reports DB connection + collection counts
  - /api/admin/reseed re-runs the idempotent seed and doesn't create duplicates
  - /api/programs actually returns data after seed
"""
import os
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001")


def test_health_endpoint_public():
    r = requests.get(f"{BASE}/api/health", timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["db_connected"] is True
    assert body["db_name"]  # not empty
    assert "mongo_host" in body
    # No credentials leaking in mongo_host
    assert "@" not in body["mongo_host"]
    assert "password" not in body["mongo_host"].lower()
    # No CORS_ORIGINS leak in the public payload (dropped per code review)
    assert "cors_origins" not in body
    # seed_ran field surfaces whether the fresh-deploy content sync happened
    assert body["seed_ran"] is True
    # Critical collections present
    for coll in ("users", "programs", "membership_plans", "workshops"):
        key = f"count_{coll}"
        assert key in body, f"missing {key}"
        assert isinstance(body[key], int), f"{key} not int"
        assert body[key] > 0, f"{coll} is empty — fresh deploy would show no content"


def _admin_headers():
    r = requests.post(f"{BASE}/api/auth/login",
                      json={"email": "tony@tonyyoga.com", "password": "TonyYoga2026!"}, timeout=10)
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json().get('access_token') or r.json().get('token')}"}


def test_reseed_endpoint_requires_admin_auth():
    r = requests.post(f"{BASE}/api/admin/reseed", timeout=15)
    assert r.status_code == 401


def test_reseed_endpoint_idempotent():
    headers = _admin_headers()
    # First run
    r1 = requests.post(f"{BASE}/api/admin/reseed", headers=headers, timeout=30)
    assert r1.status_code == 200
    b1 = r1.json()
    assert b1["ok"] is True
    # Second run — should create 0 new items
    r2 = requests.post(f"{BASE}/api/admin/reseed", headers=headers, timeout=30)
    assert r2.status_code == 200
    b2 = r2.json()
    for coll in ("programs", "membership_plans", "workshops"):
        assert b2["created"][coll] == 0, f"reseed created duplicates for {coll}"
        assert b1["after"][coll] == b2["after"][coll]


def test_programs_endpoint_returns_content():
    """The exact symptom the user reported — programs not coming through."""
    r = requests.get(f"{BASE}/api/programs", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) > 0, "Programs endpoint returned empty list"
    prog = data[0]
    for k in ("id", "title", "description", "cover_image"):
        assert k in prog, f"program missing field {k}"


def test_health_masks_mongo_credentials():
    """Ensure /health never leaks the mongo user/password."""
    r = requests.get(f"{BASE}/api/health", timeout=10)
    body = r.json()
    host = body.get("mongo_host", "")
    # Even if MONGO_URL contained user:pass@host, health should show only host
    assert ":" not in host or host.count(":") == 1  # host:port at most
    assert "://" not in host
