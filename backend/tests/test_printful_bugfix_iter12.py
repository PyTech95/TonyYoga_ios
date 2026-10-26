"""Iter12 - Printful truthful connection status bug-fix tests.

Verifies:
- /api/admin/printful/verify returns friendly no-token error when nothing saved
- /api/admin/printful/connect sanitizes 'Bearer ' + whitespace and rolls back
  a rejected token so status.configured stays False
- /api/admin/printful/status reflects configured:false after the failed connect
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://tony-react-api.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "tony@tonyyoga.com"
ADMIN_PASSWORD = "Welcome@123###2"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
               timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text[:200]}"
    return s


def _clear_token(session):
    # Best-effort disconnect so tests start from a clean state.
    try:
        session.post(f"{BASE_URL}/api/admin/printful/disconnect", timeout=15)
    except Exception:
        pass


def test_verify_without_token_returns_friendly(admin_session):
    _clear_token(admin_session)
    r = admin_session.post(f"{BASE_URL}/api/admin/printful/verify", timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("ok") is False
    assert "No token configured" in (data.get("error") or "")


def test_status_configured_false_when_no_token(admin_session):
    _clear_token(admin_session)
    r = admin_session.get(f"{BASE_URL}/api/admin/printful/status", timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("configured") is False


def test_connect_invalid_bearer_prefix_is_sanitized_and_rolled_back(admin_session):
    _clear_token(admin_session)
    # Note the "Bearer " prefix + double space — backend must strip it and
    # still forward the raw token to Printful, which rejects it (401).
    r = admin_session.post(
        f"{BASE_URL}/api/admin/printful/connect",
        json={"token": "Bearer  bad_invalid_token_123"},
        timeout=45,
    )
    assert r.status_code == 400, f"expected 400 got {r.status_code}: {r.text[:300]}"
    detail = (r.json() or {}).get("detail", "")
    # Friendly rejection message
    assert "Printful rejected" in detail or "fresh token" in detail, detail

    # Token must have been rolled back — status.configured False.
    s = admin_session.get(f"{BASE_URL}/api/admin/printful/status", timeout=20).json()
    assert s.get("configured") is False, s

    # Verify endpoint again reports 'No token configured' (rollback confirmed).
    v = admin_session.post(f"{BASE_URL}/api/admin/printful/verify", timeout=20).json()
    assert v.get("ok") is False
    assert "No token configured" in (v.get("error") or "")


def test_connect_empty_token_rejected(admin_session):
    r = admin_session.post(f"{BASE_URL}/api/admin/printful/connect",
                           json={"token": "   "}, timeout=20)
    assert r.status_code == 400
    assert "required" in (r.json().get("detail", "").lower())
