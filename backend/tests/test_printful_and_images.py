"""Backend tests for Printful admin endpoints + site_images public exposure."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://tony-stack-preview.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "tony@tonyyoga.com"
ADMIN_PASSWORD = "TonyYoga2026!"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"no token in login response: {data}"
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


# ---- Printful endpoints ---------------------------------------------------

def test_printful_status_unconfigured(admin_session):
    r = admin_session.get(f"{API}/admin/printful/status")
    assert r.status_code == 200, r.text
    j = r.json()
    assert j.get("configured") is False, f"expected configured:false, got {j}"


def test_printful_verify_no_token(admin_session):
    r = admin_session.post(f"{API}/admin/printful/verify", json={})
    assert r.status_code == 200
    j = r.json()
    assert j.get("ok") is False


def test_printful_preview_empty(admin_session):
    r = admin_session.get(f"{API}/admin/printful/preview")
    assert r.status_code == 200
    j = r.json()
    assert j.get("count") == 0
    assert j.get("products") == []


def test_printful_connect_bogus_token_400(admin_session):
    r = admin_session.post(f"{API}/admin/printful/connect", json={"token": "bogus_invalid_test_token_xyz"})
    assert r.status_code == 400, f"expected 400 for bad token, got {r.status_code} {r.text[:200]}"
    # After failure, token should be rolled back → status still not configured
    s = admin_session.get(f"{API}/admin/printful/status").json()
    assert s.get("configured") is False


def test_printful_connect_empty_token_400(admin_session):
    r = admin_session.post(f"{API}/admin/printful/connect", json={"token": ""})
    assert r.status_code == 400


# ---- Site images ----------------------------------------------------------

def test_site_images_persist_and_public(admin_session):
    url = "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800"
    r = admin_session.patch(f"{API}/admin/settings", json={"site_images": {"hero": url}})
    assert r.status_code == 200, r.text
    # public settings should include site_images
    pub = requests.get(f"{API}/settings/public").json()
    assert "site_images" in pub
    assert pub["site_images"].get("hero") == url


def test_admin_settings_returns_site_images(admin_session):
    r = admin_session.get(f"{API}/admin/settings")
    assert r.status_code == 200
    j = r.json()
    assert "site_images" in j
