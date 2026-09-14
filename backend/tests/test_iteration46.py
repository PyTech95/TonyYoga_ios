"""Iteration 46 — Quiz (Find Your Path), gift-card credit at checkout, Printful fulfillment admin pane.

Modules covered:
  - routers/quiz.py         : POST /api/quiz/recommend
  - routers/giftcards.py    : admin create, redeem, /me/store-credit
  - routers/payments.py     : /checkout/session with apply_credit (credit-only + partial), /checkout/credit-release
  - routers/paypal.py       : /paypal/create-order with apply_credit
  - routers/printful.py     : /admin/printful/status, /admin/orders/{id}/fulfill (draft), /admin/orders/{id}/fulfillment
  - routers/orders.py       : /orders/create + /admin/orders (test order for fulfillment)
"""
import os
import re
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL is missing")
BASE = base_url.rstrip("/") + "/api"


def _creds(section):
    content = Path("/app/memory/test_credentials.md").read_text(encoding="utf-8")
    block = content.split(f"## {section}")[1]
    email = re.search(r"Email:\s*`?([^`\s]+)", block).group(1)
    pwd = re.search(r"Password:\s*`?([^`\s]+)", block).group(1)
    return {"email": email, "password": pwd}


def _login(creds):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE}/auth/login", json=creds, timeout=60)
    if r.status_code != 200:
        pytest.fail(f"login failed for {creds['email']}: {r.status_code} {r.text[:300]}")
    tok = r.json().get("access_token") or r.json().get("token")
    if not tok:
        pytest.fail(f"no token in login response: {r.text[:300]}")
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="session")
def admin():
    return _login(_creds("Admin"))


@pytest.fixture(scope="session")
def student():
    return _login(_creds("Demo Student"))


@pytest.fixture(scope="session")
def anon():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------------------------------------------------------------- quiz
class TestQuiz:
    def test_advanced_mastery_path(self, anon):
        r = anon.post(f"{BASE}/quiz/recommend", json={
            "goal": "mastery", "level": "advanced", "days_per_week": 6,
            "focus": "strength", "minutes": 75}, timeout=60)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["program"] is not None
        assert "84" in d["program"]["title"], d["program"]["title"]
        assert d["membership"]["tier"] == "vip", d["membership"]
        assert isinstance(d["reasons"], list) and len(d["reasons"]) >= 2
        assert "_id" not in d["program"] and "_id" not in d["membership"]

    def test_beginner_foundations_path(self, anon):
        r = anon.post(f"{BASE}/quiz/recommend", json={
            "goal": "foundations", "level": "beginner", "days_per_week": 2,
            "focus": "", "minutes": 20}, timeout=60)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert "26" in d["program"]["title"], d["program"]["title"]
        assert d["membership"]["tier"] == "online_only", d["membership"]

    def test_mid_commitment_gets_inperson_plan(self, anon):
        r = anon.post(f"{BASE}/quiz/recommend", json={
            "goal": "fitness", "level": "intermediate", "days_per_week": 3,
            "focus": "flexibility", "minutes": 45}, timeout=60)
        assert r.status_code == 200
        assert r.json()["membership"]["tier"] == "online_inperson"

    def test_empty_payload_still_returns_recommendation(self, anon):
        r = anon.post(f"{BASE}/quiz/recommend", json={}, timeout=60)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["program"] is not None and d["membership"] is not None

    def test_bad_types_rejected(self, anon):
        r = anon.post(f"{BASE}/quiz/recommend", json={"days_per_week": "many"}, timeout=60)
        assert r.status_code == 422

    def test_logged_in_persists_quiz_result(self, student):
        r = student.post(f"{BASE}/quiz/recommend", json={
            "goal": "mastery", "level": "advanced", "days_per_week": 6, "minutes": 75}, timeout=60)
        assert r.status_code == 200
        me = student.get(f"{BASE}/auth/me", timeout=60)
        assert me.status_code == 200
        assert me.json().get("level") == "advanced"


# ------------------------------------------------- gift cards + credit
@pytest.fixture(scope="class")
def credit_state(admin, student):
    """Give the student enough credit for a drop-in pass and report the balance."""
    before = student.get(f"{BASE}/me/store-credit", timeout=60).json()["store_credit"]
    r = admin.post(f"{BASE}/admin/gift-cards",
                   json={"amount": 50, "currency": "usd", "note": "TEST_iter46"}, timeout=60)
    assert r.status_code == 200, r.text[:300]
    code = r.json()["code"]
    rd = student.post(f"{BASE}/gift-cards/redeem", json={"code": code}, timeout=60)
    assert rd.status_code == 200, rd.text[:300]
    assert rd.json()["redeemed"] == 50
    assert round(rd.json()["store_credit"], 2) == round(before + 50, 2)
    return {"code": code, "balance": rd.json()["store_credit"]}


class TestGiftCardCredit:
    def test_store_credit_endpoint_requires_auth(self, anon):
        assert anon.get(f"{BASE}/me/store-credit", timeout=60).status_code in (401, 403)

    def test_double_redeem_blocked(self, student, credit_state):
        r = student.post(f"{BASE}/gift-cards/redeem", json={"code": credit_state["code"]}, timeout=60)
        assert r.status_code == 400

    def test_invalid_code(self, student):
        r = student.post(f"{BASE}/gift-cards/redeem", json={"code": "GIFT-DEADBEEF"}, timeout=60)
        assert r.status_code == 404

    def test_credit_only_checkout_dropin(self, student, credit_state):
        """Drop-in pass fully covered by credit → no gateway, credit deducted."""
        passes = requests.get(f"{BASE}/passes/catalog", timeout=60).json()
        dropin = next(p for p in passes if p["id"] == "drop_in")
        price = float(dropin["price"])
        before = student.get(f"{BASE}/me/store-credit", timeout=60).json()["store_credit"]
        assert before >= price, f"need credit >= {price}, has {before}"
        r = student.post(f"{BASE}/checkout/session", json={
            "item_type": "drop_in", "item_id": dropin["id"],
            "origin_url": base_url, "apply_credit": True}, timeout=90)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d.get("credit_only") is True, d
        assert round(d["credit_applied"], 2) == round(price, 2)
        after = student.get(f"{BASE}/me/store-credit", timeout=60).json()["store_credit"]
        assert round(after, 2) == round(before - price, 2), (before, after)
        # pass credits were granted
        mine = student.get(f"{BASE}/passes/mine", timeout=60)
        assert mine.status_code == 200

    def test_partial_credit_creates_gateway_session(self, student, credit_state):
        """Expensive item partially covered → Stripe session for the remainder."""
        plans = requests.get(f"{BASE}/programs", timeout=60).json()
        prog = max(plans, key=lambda p: float(p.get("price") or 0))
        before = student.get(f"{BASE}/me/store-credit", timeout=60).json()["store_credit"]
        if before <= 0:
            pytest.skip("no credit left to test partial")
        r = student.post(f"{BASE}/checkout/session", json={
            "item_type": "program", "item_id": prog["id"],
            "origin_url": base_url, "apply_credit": True}, timeout=90)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert not d.get("credit_only"), d
        assert d.get("url", "").startswith("http"), d
        mid = d.get("session_id")
        after = student.get(f"{BASE}/me/store-credit", timeout=60).json()["store_credit"]
        assert after < before, "credit should be reserved for partial payment"
        # release it back
        rel = student.post(f"{BASE}/checkout/credit-release", json={"session_id": mid}, timeout=60)
        assert rel.status_code == 200, rel.text[:300]
        assert round(rel.json()["store_credit"], 2) == round(before, 2)
        # double release is a no-op
        rel2 = student.post(f"{BASE}/checkout/credit-release", json={"session_id": mid}, timeout=60)
        assert rel2.status_code == 200
        assert round(student.get(f"{BASE}/me/store-credit", timeout=60).json()["store_credit"], 2) == round(before, 2)

    def test_no_credit_flag_starts_normal_session(self, student):
        progs = requests.get(f"{BASE}/programs", timeout=60).json()
        r = student.post(f"{BASE}/checkout/session", json={
            "item_type": "program", "item_id": progs[0]["id"],
            "origin_url": base_url, "apply_credit": False}, timeout=90)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d.get("url", "").startswith("http") and not d.get("credit_only")
        assert float(d.get("credit_applied") or 0) == 0.0

    def test_membership_credit_applies_when_subscriptions_disabled(self, student):
        """User choice: credit applies EVERYWHERE. With Stripe subs off, a membership
        is a one-time charge so credit can fully cover it."""
        plans = requests.get(f"{BASE}/membership-plans", timeout=60).json()
        plan = min(plans, key=lambda p: float(p.get("price") or 0))
        before = student.get(f"{BASE}/me/store-credit", timeout=60).json()["store_credit"]
        r = student.post(f"{BASE}/checkout/session", json={
            "item_type": "membership", "item_id": plan["id"],
            "origin_url": base_url, "apply_credit": True}, timeout=90)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        after = student.get(f"{BASE}/me/store-credit", timeout=60).json()["store_credit"]
        if d.get("credit_only"):
            assert round(d["credit_applied"], 2) == round(float(plan["price"]), 2)
            assert round(after, 2) == round(before - float(plan["price"]), 2)
        else:
            assert d.get("url", "").startswith("http")
            assert after <= before

    def test_paypal_create_order_accepts_apply_credit(self, student):
        progs = requests.get(f"{BASE}/programs", timeout=60).json()
        r = student.post(f"{BASE}/paypal/create-order", json={
            "item_type": "program", "item_id": progs[0]["id"],
            "origin_url": base_url, "apply_credit": False}, timeout=90)
        assert r.status_code in (200, 400, 503), r.text[:300]
        if r.status_code == 200:
            assert r.json().get("url", "").startswith("http") or r.json().get("credit_only")


# ------------------------------------------ printful / orders fulfillment
@pytest.fixture(scope="class")
def test_order(student):
    prods = requests.get(f"{BASE}/products", timeout=60).json()
    items = prods.get("items") if isinstance(prods, dict) else prods
    pf = next((p for p in items if p.get("source") == "printful" and int(p.get("stock_qty") or 0) > 0), None)
    if not pf:
        pytest.skip("no in-stock printful product available")
    payload = {
        "items": [{"product_id": pf["id"], "quantity": 1,
                   "variant": (pf.get("variants") or [{}])[0].get("name")}],
        "shipping_address": {"name": "TEST_ Iter46", "line1": "1 Test St", "city": "Austin",
                             "state": "TX", "postal_code": "78701", "country": "United States",
                             "phone": "+15125551234"},
        "notes": "TEST_iter46",
    }
    r = student.post(f"{BASE}/orders/create", json=payload, timeout=60)
    assert r.status_code == 200, r.text[:400]
    o = r.json()
    assert o["status"] == "pending" and "_id" not in o
    return o


class TestPrintfulFulfillment:
    def test_status_flags(self, admin):
        r = admin.get(f"{BASE}/admin/printful/status", timeout=60)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["configured"] is True
        for k in ("fulfill_enabled", "payments_live", "synced_products", "store_id"):
            assert k in d, d
        assert d["payments_live"] is False, "payments should be in test mode for safe testing"

    def test_status_requires_admin(self, student):
        assert student.get(f"{BASE}/admin/printful/status", timeout=60).status_code in (401, 403)

    def test_admin_orders_list_contains_order(self, admin, test_order):
        r = admin.get(f"{BASE}/admin/orders", timeout=60)
        assert r.status_code == 200
        ids = [o["id"] for o in r.json()]
        assert test_order["id"] in ids

    def test_send_draft_then_read_fulfillment(self, admin, test_order):
        r = admin.post(f"{BASE}/admin/orders/{test_order['id']}/fulfill?confirm=false", timeout=120)
        assert r.status_code == 200, r.text[:500]
        d = r.json()
        pf_id = d.get("printful_order_id") or (d.get("result") or {}).get("id") or d.get("id")
        assert pf_id, f"no printful order id returned: {d}"
        # order doc updated
        od = admin.get(f"{BASE}/admin/orders", timeout=60).json()
        mine = next(o for o in od if o["id"] == test_order["id"])
        assert mine.get("printful_status") in ("draft", "pending", "created", "onhold"), mine.get("printful_status")
        # readback
        f = admin.get(f"{BASE}/admin/orders/{test_order['id']}/fulfillment", timeout=120)
        assert f.status_code == 200, f.text[:500]
        assert "_id" not in f.json()

    def test_fulfill_unknown_order_404(self, admin):
        r = admin.post(f"{BASE}/admin/orders/does-not-exist/fulfill?confirm=false", timeout=60)
        assert r.status_code == 404, r.text[:300]

    def test_fulfill_requires_admin(self, student, test_order):
        r = student.post(f"{BASE}/admin/orders/{test_order['id']}/fulfill?confirm=false", timeout=60)
        assert r.status_code in (401, 403)

    def test_printful_stores_sync_regression(self, admin):
        r = admin.get(f"{BASE}/admin/printful/stores", timeout=120)
        assert r.status_code == 200, r.text[:400]
        body = r.json()
        stores = body["stores"] if isinstance(body, dict) else body
        assert isinstance(stores, list) and len(stores) >= 1
        assert all("id" in s for s in stores)
        assert any(int(s.get("product_count") or 0) > 0 for s in stores)


@pytest.fixture(scope="session", autouse=True)
def cleanup(request):
    yield
    try:
        adm = _login(_creds("Admin"))
        from pymongo import MongoClient
        env = dotenv_values("/app/backend/.env")
        cli = MongoClient(env["MONGO_URL"])
        d = cli[env["DB_NAME"]]
        d.gift_cards.delete_many({"note": "TEST_iter46"})
        d.orders.delete_many({"notes": "TEST_iter46"})
        cli.close()
        assert adm is not None
    except Exception as e:  # noqa
        print(f"cleanup skipped: {e}")
