"""Tony Yoga - Iteration 5: Web Push (VAPID) + Orders endpoints.

Tests:
- GET /api/push/public-key
- POST /api/push/subscribe (auth)
- POST /api/push/unsubscribe (auth)
- POST /api/orders/create (auth, validates total)
- GET /api/orders/mine (auth)
- GET /api/orders/{id} (auth, forbids cross-user)
- GET /api/admin/orders (admin-only)
- POST /api/admin/orders/status
"""
import os
import uuid
import requests
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://yoga-live-classes.preview.emergentagent.com").rstrip("/")

ADMIN = {"email": "tony@tonyyoga.com", "password": "TonyYoga2026!"}
STUDENT = {"email": "student@demo.com", "password": "Student2026!"}


def _login(email, password):
    r = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN["email"], ADMIN["password"])


@pytest.fixture(scope="module")
def student_token():
    return _login(STUDENT["email"], STUDENT["password"])


@pytest.fixture()
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture()
def student_headers(student_token):
    return {"Authorization": f"Bearer {student_token}"}


# ---------- Web Push (VAPID) ----------
def test_push_public_key_no_auth():
    r = requests.get(f"{BASE}/api/push/public-key", timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "public_key" in body
    # Dev keys must be non-empty
    assert isinstance(body["public_key"], str)
    assert len(body["public_key"]) > 20, f"VAPID key looks too short: {body['public_key']!r}"


def test_push_subscribe_requires_auth():
    r = requests.post(f"{BASE}/api/push/subscribe", json={
        "endpoint": "https://example.com/dummy",
        "keys": {"p256dh": "x", "auth": "y"},
    }, timeout=15)
    assert r.status_code in (401, 403)


def test_push_subscribe_and_unsubscribe(student_headers):
    endpoint = f"https://fcm.example.com/dummy-{uuid.uuid4().hex}"
    payload = {
        "endpoint": endpoint,
        "keys": {"p256dh": "BNb-fakekey", "auth": "fake-auth"},
        "user_agent": "pytest",
    }
    r = requests.post(f"{BASE}/api/push/subscribe", json=payload, headers=student_headers, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json().get("ok") is True

    # Re-subscribing same endpoint (upsert) must remain 200
    r2 = requests.post(f"{BASE}/api/push/subscribe", json=payload, headers=student_headers, timeout=15)
    assert r2.status_code == 200

    # Unsubscribe
    u = requests.post(f"{BASE}/api/push/unsubscribe", json={"endpoint": endpoint},
                      headers=student_headers, timeout=15)
    assert u.status_code == 200
    assert u.json().get("ok") is True


# ---------- Orders ----------
def _shipping_addr():
    return {
        "name": "Test Buyer",
        "line1": "123 Main St",
        "line2": "Apt 4",
        "city": "Springfield",
        "state": "IL",
        "postal_code": "62701",
        "country": "US",
        "phone": "+15555550100",
    }


def test_orders_create_requires_auth():
    r = requests.post(f"{BASE}/api/orders/create", json={
        "items": [{"product_id": "x", "quantity": 1}],
        "shipping_address": _shipping_addr(),
    }, timeout=15)
    assert r.status_code in (401, 403)


def test_orders_create_empty_cart_returns_400(student_headers):
    r = requests.post(f"{BASE}/api/orders/create", json={
        "items": [],
        "shipping_address": _shipping_addr(),
    }, headers=student_headers, timeout=15)
    assert r.status_code == 400


def test_orders_create_invalid_product_returns_404(student_headers):
    r = requests.post(f"{BASE}/api/orders/create", json={
        "items": [{"product_id": "does-not-exist", "quantity": 1}],
        "shipping_address": _shipping_addr(),
    }, headers=student_headers, timeout=15)
    assert r.status_code == 404


def test_orders_create_happy_path_and_total(student_headers):
    # Pick a real product
    products = requests.get(f"{BASE}/api/products", timeout=15).json()
    assert products, "Need at least 1 product seeded"
    p = products[0]
    qty = 2
    payload = {
        "items": [{"product_id": p["id"], "quantity": qty}],
        "shipping_address": _shipping_addr(),
        "notes": "TEST_iter5",
    }
    r = requests.post(f"{BASE}/api/orders/create", json=payload, headers=student_headers, timeout=20)
    assert r.status_code == 200, r.text
    order = r.json()
    # Contract
    assert order["status"] == "pending"
    assert order["currency"]
    assert isinstance(order["id"], str)
    expected = round(p["price"] * qty, 2)
    assert order["total"] == expected, f"expected total {expected}, got {order['total']}"
    assert len(order["items"]) == 1
    assert order["items"][0]["quantity"] == qty
    assert order["items"][0]["unit_price"] == p["price"]
    assert order["items"][0]["line_total"] == expected
    # Shipping address persisted
    assert order["shipping_address"]["city"] == "Springfield"
    # MongoDB _id never leaks
    assert "_id" not in order
    return order["id"]


def test_orders_mine_returns_user_orders(student_headers):
    # Ensure at least one order exists for this user
    products = requests.get(f"{BASE}/api/products", timeout=15).json()
    payload = {
        "items": [{"product_id": products[0]["id"], "quantity": 1}],
        "shipping_address": _shipping_addr(),
    }
    requests.post(f"{BASE}/api/orders/create", json=payload, headers=student_headers, timeout=20)

    r = requests.get(f"{BASE}/api/orders/mine", headers=student_headers, timeout=15)
    assert r.status_code == 200
    orders = r.json()
    assert isinstance(orders, list)
    assert len(orders) >= 1
    # All orders must belong to current user
    for o in orders:
        assert o["user_email"] == STUDENT["email"]
        assert "_id" not in o


def test_orders_get_by_id_and_cross_user_forbidden(student_headers, admin_headers):
    # student creates an order
    products = requests.get(f"{BASE}/api/products", timeout=15).json()
    payload = {
        "items": [{"product_id": products[0]["id"], "quantity": 1}],
        "shipping_address": _shipping_addr(),
    }
    c = requests.post(f"{BASE}/api/orders/create", json=payload, headers=student_headers, timeout=20)
    assert c.status_code == 200
    oid = c.json()["id"]

    # student fetches their own
    g = requests.get(f"{BASE}/api/orders/{oid}", headers=student_headers, timeout=15)
    assert g.status_code == 200
    assert g.json()["id"] == oid

    # admin is allowed (role bypass)
    ga = requests.get(f"{BASE}/api/orders/{oid}", headers=admin_headers, timeout=15)
    assert ga.status_code == 200

    # unknown id => 404
    nf = requests.get(f"{BASE}/api/orders/does-not-exist-xyz", headers=student_headers, timeout=15)
    assert nf.status_code == 404


def test_admin_orders_requires_admin(student_headers):
    r = requests.get(f"{BASE}/api/admin/orders", headers=student_headers, timeout=15)
    assert r.status_code == 403


def test_admin_orders_list(admin_headers):
    r = requests.get(f"{BASE}/api/admin/orders", headers=admin_headers, timeout=15)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_admin_orders_status_update_flow(student_headers, admin_headers):
    # Student creates order
    products = requests.get(f"{BASE}/api/products", timeout=15).json()
    c = requests.post(f"{BASE}/api/orders/create", json={
        "items": [{"product_id": products[0]["id"], "quantity": 1}],
        "shipping_address": _shipping_addr(),
    }, headers=student_headers, timeout=20)
    assert c.status_code == 200
    oid = c.json()["id"]

    # invalid status => 400
    bad = requests.post(f"{BASE}/api/admin/orders/status", json={
        "order_id": oid, "status": "not-a-real-status",
    }, headers=admin_headers, timeout=15)
    assert bad.status_code == 400

    # valid update
    upd = requests.post(f"{BASE}/api/admin/orders/status", json={
        "order_id": oid, "status": "shipped", "tracking_number": "1Z-TEST-iter5",
        "notes": "TEST tracking note",
    }, headers=admin_headers, timeout=15)
    assert upd.status_code == 200
    assert upd.json().get("ok") is True

    # verify persisted
    g = requests.get(f"{BASE}/api/orders/{oid}", headers=admin_headers, timeout=15)
    assert g.status_code == 200
    body = g.json()
    assert body["status"] == "shipped"
    assert body["tracking_number"] == "1Z-TEST-iter5"

    # unknown order id => 404
    miss = requests.post(f"{BASE}/api/admin/orders/status", json={
        "order_id": "no-such-order", "status": "shipped",
    }, headers=admin_headers, timeout=15)
    assert miss.status_code == 404
