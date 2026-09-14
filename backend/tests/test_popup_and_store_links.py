"""Tests for admin pop-up controls, App Store / Google Play URL fields, and PWA/native routing hints.
Focus: /api/health, /api/settings/public, PATCH /api/admin/settings validation (app_store_url), popup toggles.
Restores state at teardown so the app returns to defaults."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://tony-react-api.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "tony@tonyyoga.com"
ADMIN_PASSWORD = "TonyYoga2026!"


@pytest.fixture(scope="module")
def admin_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text[:300]}"
    token = r.json().get("token") or r.json().get("access_token")
    assert token, f"No token in login response: {r.json()}"
    s.headers.update({"Authorization": f"Bearer {token}"})
    yield s
    # ---- Teardown: restore defaults ----
    try:
        s.patch(f"{BASE_URL}/api/admin/settings", json={
            "app_store_url": "",
            "download_popup_enabled": True,
            "download_popup_mode": "app",
            "download_popup_delay_seconds": 30,
            "download_popup_on_exit": False,
            "download_popup_eyebrow": "",
            "download_popup_title": "",
            "download_popup_description": "",
            "download_popup_cta_label": "",
            "download_popup_cta_url": "",
            "download_popup_offer_expiry": "",
        })
    except Exception as e:
        print("Restore failed:", e)


# ---- Public smoke ----
def test_health():
    r = requests.get(f"{BASE_URL}/api/health")
    assert r.status_code == 200
    j = r.json()
    assert j.get("ok") is True
    assert j.get("db_connected") is True
    assert j.get("seed_ran") is True


def test_public_settings_has_google_play_and_popup_fields():
    r = requests.get(f"{BASE_URL}/api/settings/public")
    assert r.status_code == 200
    d = r.json()
    # Google Play default should be the user's link
    assert d.get("google_play_url", "").startswith("https://play.google.com/store/apps/details?id=com.tonyoga.app")
    # Popup + store keys present
    for k in ("app_store_url", "download_popup_enabled", "download_popup_mode",
              "download_popup_delay_seconds", "download_popup_on_exit"):
        assert k in d, f"Missing public setting: {k}"


# ---- App Store URL validation ----
def test_app_store_url_rejects_javascript_scheme(admin_client):
    r = admin_client.patch(f"{BASE_URL}/api/admin/settings", json={"app_store_url": "javascript:alert(1)"})
    assert r.status_code == 422, f"Expected 422, got {r.status_code}: {r.text[:200]}"


def test_app_store_url_rejects_wrong_host(admin_client):
    r = admin_client.patch(f"{BASE_URL}/api/admin/settings", json={"app_store_url": "https://evil.example.com/app/id123"})
    assert r.status_code == 422


def test_app_store_url_rejects_http(admin_client):
    r = admin_client.patch(f"{BASE_URL}/api/admin/settings", json={"app_store_url": "http://apps.apple.com/us/app/example/id123456789"})
    assert r.status_code == 422


def test_app_store_url_accepts_valid_and_persists(admin_client):
    good = "https://apps.apple.com/us/app/example/id123456789"
    r = admin_client.patch(f"{BASE_URL}/api/admin/settings", json={"app_store_url": good})
    assert r.status_code == 200, f"Save failed: {r.text[:300]}"
    # Verify via public read
    pub = requests.get(f"{BASE_URL}/api/settings/public").json()
    assert pub.get("app_store_url") == good
    # Verify via admin read
    got = admin_client.get(f"{BASE_URL}/api/admin/settings").json()
    assert got.get("app_store_url") == good


# ---- Popup enable/disable + mode ----
def test_popup_toggle_off_persists(admin_client):
    r = admin_client.patch(f"{BASE_URL}/api/admin/settings", json={"download_popup_enabled": False})
    assert r.status_code == 200
    pub = requests.get(f"{BASE_URL}/api/settings/public").json()
    assert pub.get("download_popup_enabled") is False
    # Turn back on
    admin_client.patch(f"{BASE_URL}/api/admin/settings", json={"download_popup_enabled": True})


def test_popup_custom_mode_persists(admin_client):
    payload = {
        "download_popup_enabled": True,
        "download_popup_mode": "custom",
        "download_popup_eyebrow": "TEST_OFFER",
        "download_popup_title": "TEST title",
        "download_popup_description": "TEST desc",
        "download_popup_cta_label": "TEST CTA",
        "download_popup_cta_url": "https://tonyyoga.com/special",
    }
    r = admin_client.patch(f"{BASE_URL}/api/admin/settings", json=payload)
    assert r.status_code == 200
    pub = requests.get(f"{BASE_URL}/api/settings/public").json()
    assert pub.get("download_popup_mode") == "custom"
    assert pub.get("download_popup_title") == "TEST title"
    assert pub.get("download_popup_cta_label") == "TEST CTA"


def test_popup_delay_presets_persist(admin_client):
    for val in (10, 30, 60, 0):
        r = admin_client.patch(f"{BASE_URL}/api/admin/settings", json={"download_popup_delay_seconds": val})
        assert r.status_code == 200
        pub = requests.get(f"{BASE_URL}/api/settings/public").json()
        assert pub.get("download_popup_delay_seconds") == val


def test_exit_intent_toggle_persists(admin_client):
    r = admin_client.patch(f"{BASE_URL}/api/admin/settings", json={"download_popup_on_exit": True})
    assert r.status_code == 200
    pub = requests.get(f"{BASE_URL}/api/settings/public").json()
    assert pub.get("download_popup_on_exit") is True


# ---- Google Play validation ----
def test_google_play_rejects_wrong_host(admin_client):
    r = admin_client.patch(f"{BASE_URL}/api/admin/settings", json={"google_play_url": "https://evil.com/store"})
    assert r.status_code == 422


# ---- PWA files ----
def test_pwa_manifest_served():
    r = requests.get(f"{BASE_URL}/manifest.json")
    assert r.status_code == 200
    j = r.json()
    assert "name" in j and "icons" in j and "start_url" in j
    assert isinstance(j["icons"], list) and len(j["icons"]) > 0


def test_service_worker_served():
    r = requests.get(f"{BASE_URL}/sw.js")
    assert r.status_code == 200
    assert len(r.text) > 100
