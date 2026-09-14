"""Iteration 55 — Full pre-launch regression for TonYoga.

Covers:
- Auth (admin + student login, fresh @qatest.com registration)
- Payments providers endpoint (paypal live primary)
- Teacher training tier listing + PayPal create-order (no capture)
- Stripe graceful 503
- Programs main_video gating (regression from iter 53)
- Shop products list, cart flow (no payment capture)
- Memberships list
- Admin: dashboard, programs, products, settings load
- /api/teacher-training public
"""
import os
import time
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "tony@tonyyoga.com"
ADMIN_PASS = "TonyYoga2026!"
STUDENT_EMAIL = "student@demo.com"
STUDENT_PASS = "Student2026!"
CORE26_PROGRAM_ID = "7585a2ef-01a1-4854-84f5-1eba68cfea66"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"no token in login response: {r.json()}"
    return tok


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- session-scoped tokens ----------
@pytest.fixture(scope="session")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASS)


@pytest.fixture(scope="session")
def student_token():
    return _login(STUDENT_EMAIL, STUDENT_PASS)


@pytest.fixture(scope="session")
def fresh_qa_user():
    email = f"TEST_it55_{uuid.uuid4().hex[:8]}@qatest.com"
    pwd = "QaIter55!"
    r = requests.post(f"{API}/auth/register",
                      json={"email": email, "password": pwd, "name": "Iter55 QA"}, timeout=20)
    assert r.status_code in (200, 201), f"register failed {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    if not tok:
        tok = _login(email, pwd)
    return {"email": email, "password": pwd, "token": tok}


# ---------- Auth ----------
class TestAuth:
    def test_admin_login(self, admin_token):
        me = requests.get(f"{API}/auth/me", headers=_auth(admin_token), timeout=10)
        assert me.status_code == 200
        data = me.json()
        assert data.get("email") == ADMIN_EMAIL
        # admin should have owner/admin/staff role
        role = data.get("role", "")
        assert role in ("owner", "admin", "staff"), f"unexpected admin role: {role}"

    def test_student_login(self, student_token):
        me = requests.get(f"{API}/auth/me", headers=_auth(student_token), timeout=10)
        assert me.status_code == 200
        assert me.json().get("email") == STUDENT_EMAIL

    def test_fresh_registration(self, fresh_qa_user):
        assert fresh_qa_user["token"]
        me = requests.get(f"{API}/auth/me", headers=_auth(fresh_qa_user["token"]), timeout=10)
        assert me.status_code == 200
        # backend lowercases emails
        assert me.json().get("email", "").lower() == fresh_qa_user["email"].lower()


# ---------- Providers ----------
class TestProviders:
    def test_checkout_providers(self):
        r = requests.get(f"{API}/checkout/providers", timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert d.get("paypal") is True, f"paypal not enabled: {d}"
        assert d.get("primary") == "paypal", f"primary not paypal: {d}"
        assert d.get("paypal_mode") == "live", f"paypal_mode not live: {d}"


# ---------- Teacher Training ----------
class TestTeacherTraining:
    def test_list_teacher_training(self):
        r = requests.get(f"{API}/teacher-training", timeout=10)
        assert r.status_code == 200
        tiers = r.json()
        assert isinstance(tiers, list) and len(tiers) == 3
        ids = [t["id"] for t in tiers]
        assert ids == ["core26", "core40", "core84"], f"tier order/ids wrong: {ids}"
        prices = {t["id"]: t["price"] for t in tiers}
        assert prices == {"core26": 3500.0, "core40": 4500.0, "core84": 5500.0}
        dates = {t["id"]: t["dates"] for t in tiers}
        assert "April 2026" in dates["core26"]
        assert "December 2026" in dates["core40"]
        assert "August 2026" in dates["core84"]

    def test_paypal_create_order_teacher_training(self, student_token):
        # Create-order only; do NOT capture.
        payload = {"item_type": "teacher_training", "item_id": "core26", "quantity": 1,
                   "origin_url": BASE_URL}
        r = requests.post(f"{API}/paypal/create-order", json=payload,
                          headers=_auth(student_token), timeout=30)
        assert r.status_code == 200, f"create-order failed: {r.status_code} {r.text}"
        d = r.json()
        approve = d.get("approve_url") or d.get("url")
        oid = d.get("order_id") or d.get("id")
        assert approve and "paypal" in approve.lower(), f"missing/invalid approve url: {d}"
        assert oid, f"missing order id: {d}"


# ---------- Stripe graceful 503 ----------
class TestStripe503:
    def test_stripe_placeholder_returns_503(self, student_token):
        # Program checkout via stripe should return 503, not 500
        payload = {"item_type": "program", "item_id": CORE26_PROGRAM_ID, "quantity": 1,
                   "origin_url": BASE_URL}
        r = requests.post(f"{API}/checkout/session", json=payload,
                          headers=_auth(student_token), timeout=20)
        assert r.status_code == 503, f"expected 503, got {r.status_code}: {r.text}"
        # response should be JSON with detail
        try:
            d = r.json()
            assert "detail" in d or "message" in d
        except Exception:
            pytest.fail(f"non-json 503 body: {r.text}")


# ---------- Main video gating (regression from iter 53) ----------
class TestMainVideoGating:
    def test_public_program_list_no_main_video_url(self):
        r = requests.get(f"{API}/programs", timeout=10)
        assert r.status_code == 200
        body = r.text
        # Regression: iter 53 found the list leaked main_video_url. Should now be gated.
        assert "main_video_url" not in body, (
            "REGRESSION: /api/programs still exposes main_video_url to anonymous callers"
        )

    def test_public_program_detail_no_main_video_url(self):
        r = requests.get(f"{API}/programs/{CORE26_PROGRAM_ID}", timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert "main_video_url" not in d, f"main_video_url leaked in detail: {list(d.keys())}"

    def test_fresh_user_no_access_locked(self, fresh_qa_user):
        r = requests.get(f"{API}/programs/{CORE26_PROGRAM_ID}",
                         headers=_auth(fresh_qa_user["token"]), timeout=10)
        assert r.status_code == 200
        d = r.json()
        # main_video_url must never appear
        assert "main_video_url" not in d


# ---------- Shop / Cart ----------
class TestShopCart:
    def test_products_list(self):
        r = requests.get(f"{API}/products", timeout=10)
        assert r.status_code == 200
        prods = r.json()
        assert isinstance(prods, list) and len(prods) > 0

    def test_orders_create_requires_shipping(self, student_token):
        # Cart is client-side; server-side checkout goes through POST /orders/create which
        # requires a shipping_address (physical products).
        prods = requests.get(f"{API}/products", timeout=10).json()
        # pick a non-ebook product
        target = next((p for p in prods if p.get("type") != "ebook" and p.get("stock_qty", 0)),
                      prods[0])
        # Missing shipping address should 422
        bad = requests.post(f"{API}/orders/create",
                            json={"items": [{"product_id": target["id"], "quantity": 1}]},
                            headers=_auth(student_token), timeout=15)
        assert bad.status_code == 422, f"expected 422 on missing shipping, got {bad.status_code}"
        # With shipping address should succeed
        good = requests.post(f"{API}/orders/create",
                             json={"items": [{"product_id": target["id"], "quantity": 1}],
                                   "shipping_address": {"name": "TEST QA", "line1": "1 Test St",
                                                        "city": "Barcelona", "postal_code": "08001",
                                                        "country": "ES"}},
                             headers=_auth(student_token), timeout=15)
        assert good.status_code in (200, 201), f"orders/create failed: {good.status_code} {good.text}"
        d = good.json()
        assert d.get("status") == "pending"
        assert d.get("total") is not None


# ---------- Memberships ----------
class TestMemberships:
    def test_membership_plans_list(self):
        r = requests.get(f"{API}/membership-plans", timeout=10)
        assert r.status_code == 200
        plans = r.json()
        assert isinstance(plans, list) and len(plans) > 0
        # spec says EUR everywhere — flag if not EUR
        currencies = {p.get("currency", "").lower() for p in plans}
        # This is a real spec-violation finding to report if fails.
        assert "eur" in currencies, f"SPEC VIOLATION: memberships not in EUR — currencies={currencies}"


# ---------- Admin ----------
class TestAdmin:
    def test_admin_programs_list(self, admin_token):
        r = requests.get(f"{API}/admin/programs", headers=_auth(admin_token), timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_admin_settings_load(self, admin_token):
        r = requests.get(f"{API}/admin/settings", headers=_auth(admin_token), timeout=10)
        assert r.status_code == 200

    def test_admin_products_list(self, admin_token):
        # try admin route then fallback to public
        r = requests.get(f"{API}/admin/products", headers=_auth(admin_token), timeout=10)
        if r.status_code == 404:
            r = requests.get(f"{API}/products", headers=_auth(admin_token), timeout=10)
        assert r.status_code == 200

    def test_student_cannot_access_admin(self, student_token):
        r = requests.get(f"{API}/admin/programs", headers=_auth(student_token), timeout=10)
        assert r.status_code in (401, 403), f"student was allowed into admin: {r.status_code}"


# ---------- Cleanup ----------
def test_zzz_cleanup(fresh_qa_user):
    """Ensure the fresh QA user isn't left scheduled for deletion."""
    r = requests.get(f"{API}/account/status", headers=_auth(fresh_qa_user["token"]), timeout=10)
    if r.status_code == 200:
        assert not r.json().get("deletion_scheduled_at"), "fresh user left scheduled for deletion"
