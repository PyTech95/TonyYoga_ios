"""Iteration 52 — verify direct provider SDKs:
Stripe official SDK (one-time checkout, subscription checkout, status, webhook)
and OpenAI-SDK-based assistant. Also basic health regression.
"""
import os
import json
import re
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")
API = f"{BASE_URL}/api"
ORIGIN = BASE_URL


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _creds():
    content = Path("/app/memory/test_credentials.md").read_text(encoding="utf-8")
    return content


@pytest.fixture(scope="module")
def student_token(client):
    r = client.post(f"{API}/auth/login", json={"email": "student@demo.com", "password": "Student2026!"})
    if r.status_code != 200:
        pytest.fail(f"student login failed {r.status_code}: {r.text[:300]}")
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"no token in login response: {r.text[:300]}"
    return tok


@pytest.fixture(scope="module")
def admin_token(client):
    r = client.post(f"{API}/auth/login", json={"email": "tony@tonyyoga.com", "password": "TonyYoga2026!"})
    if r.status_code != 200:
        pytest.fail(f"admin login failed {r.status_code}: {r.text[:300]}")
    return r.json().get("access_token") or r.json().get("token")


def auth(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------- health / no ModuleNotFoundError regression ----------
class TestHealth:
    def test_health(self, client):
        r = client.get(f"{API}/health")
        assert r.status_code == 200, r.text[:300]
        assert isinstance(r.json(), dict)

    def test_settings_public(self, client):
        r = client.get(f"{API}/settings/public")
        assert r.status_code == 200, r.text[:300]
        assert isinstance(r.json(), dict)

    def test_programs_is_array(self, client):
        r = client.get(f"{API}/programs")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list), f"expected list, got {type(data)}"
        assert len(data) > 0
        assert "id" in data[0] and "title" in data[0]


# ---------- BUG-1: Stripe one-time checkout via official SDK ----------
class TestStripeOneTime:
    def test_product_onetime_checkout_session(self, client, student_token):
        pr = client.get(f"{API}/products")
        assert pr.status_code == 200
        products = pr.json()
        products = products if isinstance(products, list) else products.get("products", [])
        assert products, "no products to test with"
        # pick a product with a positive price
        prod = next((p for p in products if (p.get("price") or 0) > 0), None)
        assert prod, "no priced product"

        r = client.post(f"{API}/checkout/session", headers=auth(student_token), json={
            "item_type": "product", "item_id": prod["id"], "quantity": 1,
            "origin_url": ORIGIN, "apply_credit": False,
        })
        assert r.status_code == 200, f"{r.status_code}: {r.text[:500]}"
        data = r.json()
        assert "url" in data and isinstance(data["url"], str)
        assert data["url"].startswith("https://checkout.stripe.com") or "stripe.com" in data["url"], data["url"]
        assert data.get("session_id"), data
        assert data["session_id"].startswith("cs_"), data["session_id"]
        pytest.session_id_onetime = data["session_id"]

    def test_checkout_status_retrieve(self, client, student_token):
        sid = getattr(pytest, "session_id_onetime", None)
        assert sid, "prerequisite session not created"
        r = client.get(f"{API}/checkout/status/{sid}", headers=auth(student_token))
        assert r.status_code == 200, f"{r.status_code}: {r.text[:500]}"
        data = r.json()
        assert "status" in data or "payment_status" in data, data
        assert data.get("payment_status") in ("unpaid", "no_payment_required", "paid", None)
        assert data.get("status") in ("open", "complete", "expired", None)

    def test_checkout_status_invalid_session(self, client, student_token):
        r = client.get(f"{API}/checkout/status/cs_test_doesnotexist123", headers=auth(student_token))
        assert r.status_code in (400, 404, 422, 502), f"{r.status_code}: {r.text[:300]}"
        assert r.status_code != 500, f"unhandled 500: {r.text[:300]}"


# ---------- BUG-1: subscription checkout ----------
class TestStripeSubscription:
    def test_membership_checkout_session(self, client, student_token):
        mr = client.get(f"{API}/membership-plans")
        if mr.status_code != 200:
            mr = client.get(f"{API}/memberships")
        assert mr.status_code == 200, f"plans endpoint {mr.status_code}: {mr.text[:200]}"
        plans = mr.json()
        plans = plans if isinstance(plans, list) else plans.get("plans", [])
        assert plans, "no membership plans"
        plan = next((p for p in plans if (p.get("price") or 0) > 0), plans[0])

        r = client.post(f"{API}/checkout/session", headers=auth(student_token), json={
            "item_type": "membership", "item_id": plan["id"], "quantity": 1,
            "origin_url": ORIGIN, "apply_credit": False,
        })
        assert r.status_code == 200, f"{r.status_code}: {r.text[:500]}"
        data = r.json()
        assert data.get("session_id", "").startswith("cs_"), data
        assert "stripe.com" in data.get("url", ""), data


# ---------- BUG-1: webhook endpoint ----------
class TestStripeWebhook:
    def test_webhook_unsigned_body(self, client):
        r = requests.post(f"{API}/webhook/stripe", data=b'{"garbage": true}',
                          headers={"Content-Type": "application/json"})
        assert r.status_code != 500, f"webhook 500: {r.text[:400]}"
        assert r.status_code in (200, 400, 401, 403), f"{r.status_code}: {r.text[:300]}"
        assert "ModuleNotFound" not in r.text and "ImportError" not in r.text

    def test_webhook_bad_signature(self, client):
        r = requests.post(f"{API}/webhook/stripe", data=b'{"type":"checkout.session.completed"}',
                          headers={"Content-Type": "application/json", "Stripe-Signature": "t=1,v1=deadbeef"})
        assert r.status_code != 500, f"webhook 500: {r.text[:400]}"
        assert r.status_code in (200, 400, 401, 403), f"{r.status_code}: {r.text[:300]}"


# ---------- BUG-1: AI assistant via official OpenAI SDK ----------
class TestAssistant:
    def test_assistant_chat(self, client):
        r = client.post(f"{API}/assistant/chat", json={"message": "hello"}, timeout=90)
        assert r.status_code == 200, f"{r.status_code}: {r.text[:500]}"
        data = r.json()
        reply = data.get("reply") or data.get("message") or data.get("text")
        assert isinstance(reply, str) and len(reply) > 0, data
        assert "ImportError" not in reply
        assert "Traceback" not in reply
