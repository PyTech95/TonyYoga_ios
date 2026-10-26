"""Iteration 13 backend regression: Printful connect timeout / rollback + verify."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://tony-react-api.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "tony@tonyyoga.com"
ADMIN_PASSWORD = "Welcome@123###2"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def hdr(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# Ensure not connected first
def test_disconnect_baseline(hdr):
    r = requests.post(f"{BASE_URL}/api/admin/printful/disconnect", headers=hdr, timeout=30)
    assert r.status_code in (200, 204)


def test_verify_without_token(hdr):
    r = requests.post(f"{BASE_URL}/api/admin/printful/verify", headers=hdr, timeout=30)
    assert r.status_code == 200
    j = r.json()
    assert j.get("ok") is False


def test_connect_invalid_token_returns_400_and_rolls_back(hdr):
    r = requests.post(
        f"{BASE_URL}/api/admin/printful/connect",
        headers=hdr,
        json={"token": "INVALID_FAKE_TOKEN_ITER13"},
        timeout=60,
    )
    assert r.status_code == 400, r.text
    # message should be friendly
    body = r.json()
    msg = body.get("detail") or body.get("message") or ""
    assert "Printful" in msg or "token" in msg.lower()

    # status must still be not configured
    s = requests.get(f"{BASE_URL}/api/admin/printful/status", headers=hdr, timeout=30)
    assert s.status_code == 200
    assert s.json().get("configured") is False
