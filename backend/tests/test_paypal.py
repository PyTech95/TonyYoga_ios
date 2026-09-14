"""Regression tests for the PayPal Orders v2 integration."""
import os
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001")
STUDENT = {"email": "student@demo.com", "password": "Student2026!"}
ADMIN = {"email": "tony@tonyyoga.com", "password": "TonyYoga2026!"}


def _login(creds):
    r = requests.post(f"{BASE}/api/auth/login", json=creds, timeout=10)
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json().get('access_token') or r.json().get('token')}"}


def _plan_id():
    return requests.get(f"{BASE}/api/membership-plans").json()[0]["id"]


def _program_id():
    return requests.get(f"{BASE}/api/programs").json()[0]["id"]


def test_paypal_create_order_membership():
    r = requests.post(
        f"{BASE}/api/paypal/create-order",
        headers=_login(STUDENT),
        json={"item_type": "membership", "item_id": _plan_id(), "origin_url": "https://x"},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["url"].startswith("https://www.sandbox.paypal.com/")
    assert len(body["order_id"]) > 10


def test_paypal_create_order_program():
    r = requests.post(
        f"{BASE}/api/paypal/create-order",
        headers=_login(STUDENT),
        json={"item_type": "program", "item_id": _program_id(), "origin_url": "https://x"},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    assert "sandbox.paypal.com" in r.json()["url"]


def test_paypal_create_order_private_session():
    r = requests.post(
        f"{BASE}/api/paypal/create-order",
        headers=_login(STUDENT),
        json={"item_type": "private_session", "item_id": "any", "origin_url": "https://x"},
        timeout=20,
    )
    assert r.status_code == 200, r.text


def test_paypal_create_order_requires_auth():
    r = requests.post(
        f"{BASE}/api/paypal/create-order",
        json={"item_type": "membership", "item_id": _plan_id(), "origin_url": "https://x"},
        timeout=15,
    )
    assert r.status_code == 401


def test_paypal_capture_missing_returns_404():
    r = requests.post(f"{BASE}/api/paypal/capture/DOES_NOT_EXIST", timeout=10)
    assert r.status_code == 404


def test_paypal_webhook_accepts_json():
    # Webhook endpoint accepts events even without signature verification when webhook_id is unset.
    r = requests.post(
        f"{BASE}/api/webhook/paypal",
        json={"event_type": "PING.TEST", "resource": {}},
        timeout=10,
    )
    assert r.status_code == 200
    assert r.json() == {"received": True}


def test_paypal_public_settings_expose_mode():
    r = requests.get(f"{BASE}/api/settings/public")
    body = r.json()
    assert body["paypal_enabled"] is True
    assert body["paypal_mode"] in ("sandbox", "live")
    assert "paypal_client_secret" not in body  # never leak secret
