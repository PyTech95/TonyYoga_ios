"""Regression tests for the Admin Settings endpoints (payment + video)."""
import os
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001")
ADMIN = {"email": "tony@tonyyoga.com", "password": "TonyYoga2026!"}


def _login(creds):
    r = requests.post(f"{BASE}/api/auth/login", json=creds, timeout=10)
    r.raise_for_status()
    data = r.json()
    return data.get("access_token") or data.get("token")


def _auth():
    return {"Authorization": f"Bearer {_login(ADMIN)}"}


def test_public_settings_no_auth():
    r = requests.get(f"{BASE}/api/settings/public", timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert "default_currency" in body
    assert "default_video_provider" in body
    # No secret keys leaking
    assert "stripe_secret_key" not in body
    assert "vimeo_access_token" not in body


def test_admin_settings_requires_auth():
    r = requests.get(f"{BASE}/api/admin/settings", timeout=10)
    assert r.status_code == 401


def test_admin_settings_full_read():
    r = requests.get(f"{BASE}/api/admin/settings", headers=_auth(), timeout=10)
    assert r.status_code == 200
    body = r.json()
    # Required fields present
    for k in [
        "default_currency", "stripe_enabled", "stripe_mode",
        "default_video_provider", "video_default_quality",
    ]:
        assert k in body, f"missing {k}"
    # Stripe secret is masked + env fallback flagged
    assert body["stripe_secret_key"].startswith("•") or body["stripe_secret_key"] == ""
    assert body["stripe_secret_key_set"] is True  # comes from env


def test_settings_patch_updates_and_masked_secret_preserved():
    headers = _auth()
    # Snapshot
    before = requests.get(f"{BASE}/api/admin/settings", headers=headers).json()
    masked = before["stripe_secret_key"]

    # Patch non-secret + send masked secret (should be ignored)
    payload = {
        "default_currency": "eur",
        "tax_rate_percent": 7.5,
        "video_watermark_text": "Tony Yoga • test",
        "stripe_secret_key": masked,
    }
    r = requests.patch(f"{BASE}/api/admin/settings", headers=headers, json=payload, timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert body["updated"] == 3
    assert "stripe_secret_key" not in body["keys"]

    # Read back
    after = requests.get(f"{BASE}/api/admin/settings", headers=headers).json()
    assert after["default_currency"] == "eur"
    assert after["tax_rate_percent"] == 7.5
    assert after["video_watermark_text"] == "Tony Yoga • test"
    # Stripe secret still set (mask unchanged in shape)
    assert after["stripe_secret_key_set"] is True

    # Reset
    requests.patch(
        f"{BASE}/api/admin/settings",
        headers=headers,
        json={"default_currency": "usd", "tax_rate_percent": 0, "video_watermark_text": ""},
    )


def test_settings_patch_rejects_unknown_fields():
    headers = _auth()
    r = requests.patch(
        f"{BASE}/api/admin/settings",
        headers=headers,
        json={"definitely_not_a_setting": "boom"},
        timeout=10,
    )
    assert r.status_code == 200
    assert r.json()["updated"] == 0


def test_settings_type_coercion():
    headers = _auth()
    r = requests.patch(
        f"{BASE}/api/admin/settings",
        headers=headers,
        json={"video_autoplay": "true", "tax_rate_percent": "12.3"},
        timeout=10,
    )
    assert r.status_code == 200
    after = requests.get(f"{BASE}/api/admin/settings", headers=headers).json()
    assert after["video_autoplay"] is True
    assert abs(after["tax_rate_percent"] - 12.3) < 0.01
    # Reset
    requests.patch(
        f"{BASE}/api/admin/settings", headers=headers,
        json={"video_autoplay": False, "tax_rate_percent": 0},
    )
