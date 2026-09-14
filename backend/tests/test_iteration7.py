"""Iteration 7: Backend tests for checkout/status 404, orders endpoints."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://yoga-live-classes.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "tony@tonyyoga.com", "password": "TonyYoga2026!"}
STUDENT = {"email": "student@demo.com", "password": "Student2026!"}


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login(**ADMIN)


@pytest.fixture(scope="module")
def student_token():
    return _login(**STUDENT)


@pytest.fixture(scope="module")
def second_student_token():
    # Register a brand new second student
    email = "TEST_iter7_other@demo.com"
    password = "OtherStudent2026!"
    requests.post(f"{API}/auth/register", json={"email": email, "password": password, "name": "Other"}, timeout=20)
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _h(tok): return {"Authorization": f"Bearer {tok}"}


# --- /checkout/status 404 behavior ---
def test_checkout_status_unknown_session_returns_404(student_token):
    r = requests.get(f"{API}/checkout/status/cs_test_unknown_session_xyz_404", headers=_h(student_token), timeout=20)
    assert r.status_code == 404, f"Expected 404, got {r.status_code}: {r.text}"


# --- Order create + cart checkout regression + GET /orders/{id} ACLs ---
@pytest.fixture(scope="module")
def seeded_order(student_token):
    # Find a real product to use
    prods = requests.get(f"{API}/products", timeout=20).json()
    assert isinstance(prods, list) and len(prods) > 0, "Need at least 1 product"
    pid = prods[0]["id"]
    payload = {
        "items": [{"product_id": pid, "quantity": 1}],
        "shipping_address": {
            "name": "TEST Iter7", "line1": "123 Test Lane", "city": "Austin",
            "postal_code": "78701", "country": "US",
        },
    }
    r = requests.post(f"{API}/orders/create", headers=_h(student_token), json=payload, timeout=20)
    assert r.status_code == 200, r.text
    o = r.json()
    assert o["status"] == "pending"
    assert "id" in o and o["total"] > 0
    return o


def test_checkout_session_cart_uses_order_total(student_token, seeded_order):
    payload = {
        "item_type": "cart",
        "item_id": seeded_order["id"],
        "quantity": 1,
        "origin_url": "https://example.com",
    }
    r = requests.post(f"{API}/checkout/session", headers=_h(student_token), json=payload, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "url" in body and "session_id" in body


def test_get_order_owner_ok(student_token, seeded_order):
    r = requests.get(f"{API}/orders/{seeded_order['id']}", headers=_h(student_token), timeout=20)
    assert r.status_code == 200, r.text
    o = r.json()
    assert o["id"] == seeded_order["id"]
    assert o["user_email"] == STUDENT["email"]
    assert "items" in o and len(o["items"]) >= 1
    assert "shipping_address" in o


def test_get_order_admin_ok(admin_token, seeded_order):
    r = requests.get(f"{API}/orders/{seeded_order['id']}", headers=_h(admin_token), timeout=20)
    assert r.status_code == 200, r.text
    assert r.json()["id"] == seeded_order["id"]


def test_get_order_other_student_forbidden(second_student_token, seeded_order):
    r = requests.get(f"{API}/orders/{seeded_order['id']}", headers=_h(second_student_token), timeout=20)
    assert r.status_code == 403, f"expected 403 got {r.status_code} {r.text}"


def test_get_order_unknown_404(student_token):
    r = requests.get(f"{API}/orders/does-not-exist-xyz", headers=_h(student_token), timeout=20)
    assert r.status_code == 404


def test_get_order_requires_auth():
    r = requests.get(f"{API}/orders/anything", timeout=20)
    assert r.status_code in (401, 403)
