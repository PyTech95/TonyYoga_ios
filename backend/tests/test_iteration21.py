"""Iteration 21 — PayPal-primary, Instagram reels admin control, role-aware nav."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN = {"email": "tony@tonyyoga.com", "password": "TonyYoga2026!"}
STUDENT = {"email": "student@demo.com", "password": "Student2026!"}


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def student_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=STUDENT, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _auth(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------- Roles ----------
def test_admin_me_role(admin_token):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=_auth(admin_token), timeout=10)
    assert r.status_code == 200
    assert r.json().get("role") == "admin"


def test_student_me_role(student_token):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=_auth(student_token), timeout=10)
    assert r.status_code == 200
    assert r.json().get("role") == "student"


# ---------- Providers baseline ----------
def test_providers_baseline():
    r = requests.get(f"{BASE_URL}/api/checkout/providers", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert "stripe" in data and "paypal" in data and "primary" in data


# ---------- PayPal enable → primary ----------
def test_paypal_enable_and_primary(admin_token):
    # Enable PayPal with fake but non-empty creds
    payload = {
        "paypal_enabled": True,
        "paypal_mode": "sandbox",
        "paypal_client_id": "TEST_FAKE_CLIENT_ID_ITER21",
        "paypal_client_secret": "TEST_FAKE_SECRET_ITER21",
    }
    r = requests.patch(f"{BASE_URL}/api/admin/settings", json=payload, headers=_auth(admin_token), timeout=15)
    assert r.status_code == 200, r.text

    r2 = requests.get(f"{BASE_URL}/api/checkout/providers", timeout=10)
    assert r2.status_code == 200
    data = r2.json()
    assert data.get("paypal") is True, data
    assert data.get("primary") == "paypal", data
    assert data.get("paypal_mode") == "sandbox"


# ---------- Instagram reels ----------
def test_instagram_reels_admin_control(admin_token):
    payload = {
        "reels_enabled": True,
        "social_instagram": "https://www.instagram.com/tonyoga_school/",
        "instagram_reels": [
            {"shortcode": "https://www.instagram.com/reel/TESTABC123/", "caption": "iter21 test reel"}
        ],
    }
    r = requests.patch(f"{BASE_URL}/api/admin/settings", json=payload, headers=_auth(admin_token), timeout=15)
    assert r.status_code == 200, r.text

    reels = requests.get(f"{BASE_URL}/api/marketing/reels", timeout=10).json()
    assert isinstance(reels, list) and len(reels) >= 1
    assert any("TESTABC123" in (item.get("shortcode") or "") for item in reels), reels

    pub = requests.get(f"{BASE_URL}/api/settings/public", timeout=10).json()
    assert pub.get("reels_enabled") is True
    assert "tonyoga_school" in (pub.get("social_instagram") or "")


# ---------- Programs listing (used by /programs page) ----------
def test_programs_list_public():
    r = requests.get(f"{BASE_URL}/api/programs", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)


# ---------- Cleanup ----------
def test_cleanup_reset(admin_token):
    payload = {
        "paypal_enabled": False,
        "paypal_client_id": "",
        "paypal_client_secret": "__clear__",
        "instagram_reels": [],
    }
    r = requests.patch(f"{BASE_URL}/api/admin/settings", json=payload, headers=_auth(admin_token), timeout=15)
    assert r.status_code == 200, r.text

    prov = requests.get(f"{BASE_URL}/api/checkout/providers", timeout=10).json()
    assert prov.get("paypal") is False
    assert prov.get("primary") == "stripe"

    reels = requests.get(f"{BASE_URL}/api/marketing/reels", timeout=10).json()
    # Should now return curated defaults (non-empty) since instagram_reels is []
    assert isinstance(reels, list) and len(reels) >= 1
    # Not our test shortcode anymore
    assert not any("TESTABC123" in (item.get("shortcode") or "") for item in reels)
