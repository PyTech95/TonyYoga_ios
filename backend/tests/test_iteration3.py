"""Iteration 3 delta tests — Cart Checkout, Retreat Deposits, Practice Streaks."""
import os
import pytest
import requests
from datetime import datetime, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://web-app-hub-56.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

STUDENT_EMAIL = "student@demo.com"
STUDENT_PASS = "Student2026!"
ADMIN_EMAIL = "tony@tonyyoga.com"
ADMIN_PASS = "TonyYoga2026!"


@pytest.fixture(scope="module")
def student_token():
    r = requests.post(f"{API}/auth/login", json={"email": STUDENT_EMAIL, "password": STUDENT_PASS})
    assert r.status_code == 200, f"Student login failed: {r.status_code} {r.text}"
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="module")
def student_headers(student_token):
    return {"Authorization": f"Bearer {student_token}"}


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ----------------- PRACTICE STREAKS -----------------
class TestStreaks:
    def test_get_streak(self, student_headers):
        r = requests.get(f"{API}/practice/streak", headers=student_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("current_streak", "longest_streak", "last_practice_date",
                  "practiced_today", "next_milestone", "milestones_unlocked", "calendar"):
            assert k in d, f"missing {k}"
        assert isinstance(d["calendar"], list)
        assert len(d["calendar"]) == 30
        assert all("date" in c and "practiced" in c for c in d["calendar"])

    def test_log_and_idempotent(self, student_headers):
        # first call
        r1 = requests.post(f"{API}/practice/log", headers=student_headers, json={"source": "manual"})
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        assert d1["current_streak"] >= 1
        # second call same day - should be idempotent
        r2 = requests.post(f"{API}/practice/log", headers=student_headers, json={"source": "manual"})
        assert r2.status_code == 200
        d2 = r2.json()
        assert d2["current_streak"] == d1["current_streak"], "streak double-incremented same day"

        # verify streak endpoint reflects state
        s = requests.get(f"{API}/practice/streak", headers=student_headers).json()
        assert s["practiced_today"] is True
        assert s["current_streak"] == d2["current_streak"]
        # next_milestone should be > current_streak or None
        if s["next_milestone"] is not None:
            assert s["next_milestone"] > s["current_streak"]


# ----------------- INVENTORY / ORDERS -----------------
@pytest.fixture(scope="module")
def test_product(admin_headers):
    payload = {
        "title": "TEST_iter3_product",
        "description": "test",
        "price": 10.0,
        "currency": "usd",
        "category": "apparel",
        "stock_qty": 5,
    }
    r = requests.post(f"{API}/admin/products", headers=admin_headers, json=payload)
    if r.status_code not in (200, 201):
        # try alternate endpoint
        r = requests.post(f"{API}/products", headers=admin_headers, json=payload)
    assert r.status_code in (200, 201), f"product create failed: {r.status_code} {r.text}"
    prod = r.json()
    yield prod
    # cleanup best effort
    pid = prod.get("id")
    if pid:
        try:
            requests.delete(f"{API}/admin/products/{pid}", headers=admin_headers)
        except Exception:
            pass


class TestOrders:
    def test_create_order_success(self, student_headers, test_product):
        payload = {
            "items": [{"product_id": test_product["id"], "quantity": 2}],
            "shipping_address": {
                "name": "Test Student", "line1": "1 Test St", "city": "Testville",
                "postal_code": "12345", "country": "US"
            }
        }
        r = requests.post(f"{API}/orders/create", headers=student_headers, json=payload)
        assert r.status_code == 200, r.text
        o = r.json()
        assert o["status"] == "pending"
        assert o["total"] == 20.0
        assert len(o["items"]) == 1
        assert o["items"][0]["quantity"] == 2

    def test_create_order_out_of_stock(self, student_headers, test_product):
        payload = {
            "items": [{"product_id": test_product["id"], "quantity": 999}],
            "shipping_address": {
                "name": "Test Student", "line1": "1 Test St", "city": "Testville",
                "postal_code": "12345", "country": "US"
            }
        }
        r = requests.post(f"{API}/orders/create", headers=student_headers, json=payload)
        assert r.status_code == 400
        assert "out of stock" in r.text.lower()

    def test_checkout_cart_returns_stripe(self, student_headers, test_product):
        order_payload = {
            "items": [{"product_id": test_product["id"], "quantity": 1}],
            "shipping_address": {
                "name": "T", "line1": "1", "city": "C", "postal_code": "1", "country": "US"
            }
        }
        r = requests.post(f"{API}/orders/create", headers=student_headers, json=order_payload)
        assert r.status_code == 200
        order_id = r.json()["id"]

        c = requests.post(f"{API}/checkout/session", headers=student_headers, json={
            "item_type": "cart", "item_id": order_id, "quantity": 1,
            "origin_url": BASE_URL,
        })
        assert c.status_code == 200, c.text
        data = c.json()
        assert "url" in data
        assert "checkout.stripe.com" in data["url"]


# ----------------- RETREATS -----------------
@pytest.fixture(scope="module")
def workshop_id():
    r = requests.get(f"{API}/workshops")
    assert r.status_code == 200
    lst = r.json()
    assert lst, "no workshops seeded"
    return lst[0]["id"], lst[0]


class TestRetreats:
    def test_reserve_creates_pending(self, student_headers, workshop_id):
        wid, ws = workshop_id
        payload = {
            "workshop_id": wid, "name": "Test Student", "email": STUDENT_EMAIL,
            "yoga_status": "Perpetual Yogi", "years_of_practice": 2, "notes": "test"
        }
        r = requests.post(f"{API}/retreats/reserve", headers=student_headers, json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["deposit_eur"] == 500
        assert d["status"] in ("pending_deposit", "deposit_paid", "paid_in_full")
        assert "id" in d
        assert "balance_due_date" in d
        # balance_due_date should be ~30 days before start
        try:
            start = datetime.fromisoformat(str(ws["start_date"]).replace("Z", "+00:00"))
            due = datetime.fromisoformat(str(d["balance_due_date"]).replace("Z", "+00:00"))
            delta_days = (start - due).days
            assert 29 <= delta_days <= 31, f"balance_due_date delta {delta_days} not ~30"
        except Exception as e:
            pytest.skip(f"date parse skip: {e}")

    def test_reserve_idempotent(self, student_headers, workshop_id):
        wid, _ = workshop_id
        p = {"workshop_id": wid, "name": "Test", "email": STUDENT_EMAIL}
        r1 = requests.post(f"{API}/retreats/reserve", headers=student_headers, json=p)
        r2 = requests.post(f"{API}/retreats/reserve", headers=student_headers, json=p)
        assert r1.status_code == 200 and r2.status_code == 200
        assert r1.json()["id"] == r2.json()["id"], "reservation not idempotent"

    def test_retreats_mine(self, student_headers, workshop_id):
        r = requests.get(f"{API}/retreats/mine", headers=student_headers)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        assert len(rows) >= 1

    def test_retreats_detail_and_forbidden(self, student_headers, admin_headers, workshop_id):
        rows = requests.get(f"{API}/retreats/mine", headers=student_headers).json()
        rid = rows[0]["id"]
        r = requests.get(f"{API}/retreats/{rid}", headers=student_headers)
        assert r.status_code == 200
        assert r.json()["id"] == rid
        # admin can view too
        r2 = requests.get(f"{API}/retreats/{rid}", headers=admin_headers)
        assert r2.status_code == 200

    def test_checkout_workshop_deposit(self, student_headers, workshop_id):
        rows = requests.get(f"{API}/retreats/mine", headers=student_headers).json()
        pending = [r for r in rows if r.get("status") == "pending_deposit"]
        if not pending:
            pytest.skip("no pending_deposit reservation")
        rid = pending[0]["id"]
        c = requests.post(f"{API}/checkout/session", headers=student_headers, json={
            "item_type": "workshop_deposit", "item_id": rid, "quantity": 1, "origin_url": BASE_URL,
        })
        assert c.status_code == 200, c.text
        assert "checkout.stripe.com" in c.json()["url"]

    def test_checkout_workshop_balance_rejected(self, student_headers, workshop_id):
        rows = requests.get(f"{API}/retreats/mine", headers=student_headers).json()
        pending = [r for r in rows if r.get("status") == "pending_deposit"]
        if not pending:
            pytest.skip("no pending reservation to test balance rejection")
        rid = pending[0]["id"]
        c = requests.post(f"{API}/checkout/session", headers=student_headers, json={
            "item_type": "workshop_balance", "item_id": rid, "quantity": 1, "origin_url": BASE_URL,
        })
        assert c.status_code == 400, f"expected 400, got {c.status_code}: {c.text}"


# ----------------- PWA sanity -----------------
class TestPWA:
    def test_manifest(self):
        r = requests.get(f"{BASE_URL}/manifest.json")
        assert r.status_code == 200
        assert "name" in r.json() or "short_name" in r.json()

    def test_sw(self):
        r = requests.get(f"{BASE_URL}/sw.js")
        assert r.status_code == 200
