"""Iteration 22 — Admin Dashboard, PayPal verify, Instagram sync, staff checkout gating."""
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


# ---------- Admin Dashboard ----------
def test_admin_dashboard_shape(admin_token):
    r = requests.get(f"{BASE_URL}/api/admin/dashboard", headers=_auth(admin_token), timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    # Required keys per review request
    for k in ("today", "today_count", "signups_7d", "recent_signups",
              "month_revenue", "month_label", "recent_payments"):
        assert k in data, f"missing key {k} in dashboard response: {data.keys()}"
    assert isinstance(data["today"], list)
    assert isinstance(data["today_count"], int)
    assert isinstance(data["signups_7d"], int)
    assert isinstance(data["recent_signups"], list)
    assert isinstance(data["recent_payments"], list)
    assert isinstance(data["month_revenue"], (int, float))
    # today items have capacity/booked
    for c in data["today"]:
        assert "capacity" in c and "booked" in c


def test_admin_dashboard_requires_admin(student_token):
    r = requests.get(f"{BASE_URL}/api/admin/dashboard", headers=_auth(student_token), timeout=15)
    assert r.status_code in (401, 403)


def test_admin_dashboard_unauth():
    r = requests.get(f"{BASE_URL}/api/admin/dashboard", timeout=15)
    assert r.status_code in (401, 403)


# ---------- PayPal verify ----------
def test_paypal_verify_no_creds(admin_token):
    """With no creds saved, endpoint returns ok:false gracefully (not 500)."""
    r = requests.post(f"{BASE_URL}/api/admin/paypal/verify", headers=_auth(admin_token), timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("ok") is False
    assert "error" in data


def test_paypal_verify_requires_admin(student_token):
    r = requests.post(f"{BASE_URL}/api/admin/paypal/verify", headers=_auth(student_token), timeout=15)
    assert r.status_code in (401, 403)


# ---------- Instagram sync ----------
def test_instagram_sync_not_connected(admin_token):
    """No token configured → 400 with friendly detail, NOT 500."""
    r = requests.post(f"{BASE_URL}/api/admin/instagram/sync", headers=_auth(admin_token), timeout=15)
    assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
    data = r.json()
    detail = (data.get("detail") or "").lower()
    assert detail, f"empty detail: {data}"
    # friendly message about not connected/token
    assert "not connected" in detail or "token" in detail or "instagram" in detail


def test_instagram_sync_requires_admin(student_token):
    r = requests.post(f"{BASE_URL}/api/admin/instagram/sync", headers=_auth(student_token), timeout=15)
    assert r.status_code in (401, 403)


def test_marketing_reels_default():
    r = requests.get(f"{BASE_URL}/api/marketing/reels", timeout=10)
    assert r.status_code == 200
    reels = r.json()
    assert isinstance(reels, list) and len(reels) >= 1
    assert "shortcode" in reels[0]


# ---------- Regression: providers baseline stays clean ----------
def test_providers_baseline():
    r = requests.get(f"{BASE_URL}/api/checkout/providers", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert data.get("stripe") is True
    assert data.get("paypal") is False
    assert data.get("primary") == "stripe"


# ---------- Regression: programs list works (used by program detail) ----------
def test_programs_list():
    r = requests.get(f"{BASE_URL}/api/programs", timeout=10)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ---------- Settings defaults include instagram_auto_sync ----------
def test_settings_has_instagram_autosync_defaults(admin_token):
    r = requests.get(f"{BASE_URL}/api/admin/settings", headers=_auth(admin_token), timeout=10)
    assert r.status_code == 200, r.text
    data = r.json()
    # keys should exist (even if False/empty)
    for k in ("instagram_auto_sync", "instagram_user_id"):
        assert k in data, f"missing setting key {k}"
