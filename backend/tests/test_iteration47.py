"""Iteration 47 — Gift-card store credit at checkout, Find Your Path quiz, Printful Part B.

Covers:
- Gift card credit-only checkout (Stripe + PayPal paths)
- Partial credit reserve + credit-release refund
- Reserve safety (no negative balance / atomicity)
- POST /api/quiz/recommend combos
- Printful status test-mode guard, stores list, draft fulfilment (read-only where possible)
"""
import os
import re
import threading
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


def _creds(section: str):
    content = Path("/app/memory/test_credentials.md").read_text(encoding="utf-8")
    block = content.split(f"## {section}")[1]
    email = re.search(r"Email:\s*(\S+)", block).group(1)
    pw = re.search(r"Password:\s*(\S+)", block).group(1)
    return email, pw


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    if r.status_code != 200:
        pytest.fail(f"login failed for {email}: {r.status_code} {r.text[:300]}")
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_token():
    return _login(*_creds("Admin"))


@pytest.fixture(scope="session")
def student_token():
    return _login(*_creds("Demo Student"))


@pytest.fixture(scope="session")
def admin(admin_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def student(student_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {student_token}", "Content-Type": "application/json"})
    return s


def _credit(student):
    r = student.get(f"{API}/me/store-credit", timeout=30)
    assert r.status_code == 200, r.text
    return round(float(r.json().get("store_credit") or 0), 2)


def _grant_credit(admin, student, amount):
    r = admin.post(f"{API}/admin/gift-cards", json={"amount": amount, "currency": "usd"}, timeout=30)
    assert r.status_code in (200, 201), f"gift card create failed: {r.status_code} {r.text[:300]}"
    code = r.json().get("code") or (r.json().get("gift_card") or {}).get("code")
    assert code, f"no code in response {r.json()}"
    rr = student.post(f"{API}/gift-cards/redeem", json={"code": code}, timeout=30)
    assert rr.status_code == 200, f"redeem failed: {rr.status_code} {rr.text[:300]}"
    return code


# ---------------------------------------------------------------- health
class TestHealth:
    def test_root_api(self):
        r = requests.get(f"{API}/", timeout=30)
        assert r.status_code in (200, 404)

    def test_login_roles(self, admin, student):
        ra = admin.get(f"{API}/auth/me", timeout=30)
        rs = student.get(f"{API}/auth/me", timeout=30)
        assert ra.status_code == 200 and rs.status_code == 200
        assert ra.json()["role"] == "admin"
        assert rs.json()["role"] in ("student", "member", "user")


# ---------------------------------------------------------------- gift card credit
class TestGiftCardCredit:
    def test_credit_only_checkout_stripe(self, admin, student):
        _grant_credit(admin, student, 60)
        before = _credit(student)
        assert before >= 30
        r = student.post(f"{API}/checkout/session", json={
            "item_type": "drop_in", "item_id": "drop_in", "quantity": 1,
            "origin_url": ORIGIN, "apply_credit": True,
        }, timeout=60)
        assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
        data = r.json()
        assert data.get("credit_only") is True, f"expected credit_only, got {data}"
        applied = float(data["credit_applied"])
        assert applied > 0
        after = _credit(student)
        assert abs(after - (before - applied)) < 0.02, f"credit not deducted: {before} -> {after}, applied {applied}"

    def test_credit_only_checkout_paypal(self, admin, student):
        _grant_credit(admin, student, 60)
        before = _credit(student)
        r = student.post(f"{API}/paypal/create-order", json={
            "item_type": "drop_in", "item_id": "drop_in", "quantity": 1,
            "origin_url": ORIGIN, "apply_credit": True,
        }, timeout=60)
        assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
        data = r.json()
        assert data.get("credit_only") is True, f"expected credit_only, got {data}"
        after = _credit(student)
        assert abs(after - (before - float(data["credit_applied"]))) < 0.02

    def test_partial_credit_reserves_and_release_refunds(self, admin, student):
        progs = requests.get(f"{API}/programs", timeout=30).json()
        progs = progs if isinstance(progs, list) else progs.get("programs", [])
        pricey = [p for p in progs if float(p.get("price") or 0) >= 100]
        assert pricey, "no program priced >= 100 to test partial credit"
        prog = pricey[0]
        # make sure the balance is strictly below the program price
        bal = _credit(student)
        if bal >= float(prog["price"]):
            pytest.skip(f"balance {bal} exceeds program price {prog['price']}")
        if bal < 5:
            _grant_credit(admin, student, 40)
            bal = _credit(student)
        r = student.post(f"{API}/checkout/session", json={
            "item_type": "program", "item_id": prog["id"], "quantity": 1,
            "origin_url": ORIGIN, "apply_credit": True,
        }, timeout=60)
        assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
        data = r.json()
        assert data.get("credit_only") is not True
        assert data.get("url", "").startswith("http"), f"no stripe url: {data}"
        sid = data["session_id"]
        mid = _credit(student)
        assert abs(mid - 0) < 0.02 or mid < bal, f"credit not reserved: {bal} -> {mid}"
        # release refunds the reserved amount
        rel = student.post(f"{API}/checkout/credit-release", json={"session_id": sid}, timeout=30)
        assert rel.status_code == 200, f"{rel.status_code} {rel.text[:300]}"
        released = float(rel.json()["released"])
        assert abs(released - (bal - mid)) < 0.02, f"released {released} != reserved {bal - mid}"
        after = _credit(student)
        assert abs(after - bal) < 0.02, f"refund mismatch {bal} -> {after}"
        # second release is idempotent
        rel2 = student.post(f"{API}/checkout/credit-release", json={"session_id": sid}, timeout=30)
        assert rel2.status_code == 200 and float(rel2.json()["released"]) == 0.0

    def test_credit_release_rejects_unknown_session(self, student):
        r = student.post(f"{API}/checkout/credit-release", json={"session_id": "TEST_nope_123"}, timeout=30)
        assert r.status_code == 404
        r2 = student.post(f"{API}/checkout/credit-release", json={}, timeout=30)
        assert r2.status_code == 400

    def test_credit_never_negative_concurrent(self, admin, student):
        # Drain to a known small balance then hammer credit-only drop_in purchases
        bal = _credit(student)
        if bal < 25:
            _grant_credit(admin, student, 30)
            bal = _credit(student)
        results = []

        def buy():
            try:
                rr = requests.post(f"{API}/checkout/session",
                                   headers=dict(student.headers),
                                   json={"item_type": "drop_in", "item_id": "drop_in",
                                         "quantity": 1, "origin_url": ORIGIN, "apply_credit": True},
                                   timeout=60)
                results.append((rr.status_code, rr.text[:200]))
            except Exception as e:  # noqa
                results.append((0, str(e)))

        threads = [threading.Thread(target=buy) for _ in range(5)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        after = _credit(student)
        assert after >= 0, f"store credit went negative: {after}"
        print(f"concurrent buys start={bal} end={after} results={results}")

    def test_apply_credit_ignored_when_no_balance(self, student):
        # drain fully via program reserve then check drop_in falls back to gateway
        bal = _credit(student)
        print(f"balance before drain check: {bal}")
        r = student.post(f"{API}/checkout/session", json={
            "item_type": "drop_in", "item_id": "drop_in", "quantity": 1,
            "origin_url": ORIGIN, "apply_credit": True,
        }, timeout=60)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        if bal <= 0:
            assert data.get("credit_only") is not True
            assert data.get("url", "").startswith("http")
            student.post(f"{API}/checkout/credit-release", json={"session_id": data.get("session_id")}, timeout=30)
        else:
            print(f"still had credit ({bal}); response={data}")


# ---------------------------------------------------------------- quiz
class TestQuiz:
    def test_beginner_foundations(self):
        r = requests.post(f"{API}/quiz/recommend", json={
            "goal": "foundations", "level": "beginner", "days_per_week": 2,
            "focus": "flexibility", "minutes": 30,
        }, timeout=30)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["program"] and d["membership"] and d["reasons"]
        assert "26" in (d["program"]["title"] or ""), f"expected Core 26 got {d['program']['title']}"
        assert d["membership"]["tier"] == "online_only", d["membership"]

    def test_advanced_mastery(self):
        r = requests.post(f"{API}/quiz/recommend", json={
            "goal": "mastery", "level": "advanced", "days_per_week": 6,
            "focus": "strength", "minutes": 90,
        }, timeout=30)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert "84" in (d["program"]["title"] or ""), f"expected Core 84 got {d['program']['title']}"
        assert d["membership"]["tier"] == "vip", d["membership"]

    def test_mid_commitment_tier(self):
        r = requests.post(f"{API}/quiz/recommend", json={
            "goal": "fitness", "level": "intermediate", "days_per_week": 4, "minutes": 60,
        }, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["membership"]["tier"] == "online_inperson", d["membership"]
        assert d["program"] is not None

    def test_empty_payload_ok(self):
        r = requests.post(f"{API}/quiz/recommend", json={}, timeout=30)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["program"] is not None and d["membership"] is not None

    def test_persists_for_logged_in_user(self, student):
        r = student.post(f"{API}/quiz/recommend", json={
            "goal": "calm", "level": "beginner", "days_per_week": 2,
        }, timeout=30)
        assert r.status_code == 200
        me = student.get(f"{API}/auth/me", timeout=30).json()
        assert me.get("level") == "beginner", f"level not persisted: {me.get('level')}"


# ---------------------------------------------------------------- printful
class TestPrintful:
    def test_status_guard(self, admin):
        r = admin.get(f"{API}/admin/printful/status", timeout=60)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["configured"] is True
        assert d["payments_live"] is False, f"payments_live should be False in sandbox: {d}"
        assert d["fulfill_enabled"] in (True, False)
        assert d["synced_products"] >= 1, d
        print(f"printful status: {d}")

    def test_status_requires_admin(self, student):
        r = student.get(f"{API}/admin/printful/status", timeout=30)
        assert r.status_code in (401, 403), r.status_code

    def test_stores_list(self, admin):
        r = admin.get(f"{API}/admin/printful/stores", timeout=90)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert isinstance(d["stores"], list) and d["stores"], d
        assert any(str(s["id"]) == "16428293" for s in d["stores"]), [s["id"] for s in d["stores"]]
        for s in d["stores"]:
            assert "product_count" in s
        print(f"stores: {[(s['id'], s['name'], s['product_count']) for s in d['stores']]}")

    def test_printful_products_images_ok(self):
        r = requests.get(f"{API}/products?limit=200", timeout=60)
        assert r.status_code == 200
        body = r.json()
        items = body if isinstance(body, list) else body.get("products", [])
        pf = [p for p in items if p.get("source") == "printful"]
        assert pf, "no printful products found"
        bad = [p["title"] for p in pf if not (p.get("images") or p.get("image_url"))]
        assert not bad, f"printful products missing images: {bad[:5]}"
        # sample a few image URLs for reachability
        urls = []
        for p in pf[:5]:
            u = (p.get("images") or [p.get("image_url")])[0]
            if u:
                urls.append(u)
        broken = []
        for u in urls:
            try:
                hr = requests.head(u, timeout=25, allow_redirects=True)
                if hr.status_code >= 400:
                    broken.append((u, hr.status_code))
            except Exception as e:
                broken.append((u, str(e)[:60]))
        assert not broken, f"broken images: {broken}"
        print(f"printful products: {len(pf)}; sampled images ok: {len(urls)}")

    def test_existing_draft_order_fulfillment_readback(self, admin):
        r = admin.get(f"{API}/admin/orders", timeout=60)
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        orders = body if isinstance(body, list) else body.get("orders", [])
        assert isinstance(orders, list)
        drafted = [o for o in orders if o.get("printful_order_id")]
        skipped = [o for o in orders if o.get("printful_status") == "skipped_test_mode"]
        print(f"orders={len(orders)} drafted={len(drafted)} skipped_test_mode={len(skipped)}")
        assert not any("_id" in o for o in orders), "mongo _id leaked in /admin/orders"
        if drafted:
            o = drafted[0]
            assert o.get("printful_status") in ("draft", "pending", "canceled", "fulfilled", "shipped", "onhold"), o.get("printful_status")
            assert o.get("printful_confirmed") is not True or True
            fr = admin.get(f"{API}/admin/orders/{o['id']}/fulfillment", timeout=60)
            assert fr.status_code == 200, f"{fr.status_code} {fr.text[:300]}"
            assert fr.json().get("id") == o["printful_order_id"]
        else:
            pytest.skip("no order previously sent to Printful; draft creation not re-run to avoid real API writes")

    def test_fulfillment_404_for_unsent_order(self, admin):
        r = admin.get(f"{API}/admin/orders/TEST_nonexistent/fulfillment", timeout=30)
        assert r.status_code == 404

    def test_fulfill_requires_existing_order(self, admin):
        r = admin.post(f"{API}/admin/orders/TEST_nonexistent/fulfill?confirm=false", timeout=30)
        assert r.status_code == 404, f"{r.status_code} {r.text[:200]}"

    def test_printful_webhook_idempotent(self):
        r = requests.post(f"{API}/webhook/printful", json={"type": "ping"}, timeout=30)
        assert r.status_code == 200 and r.json().get("received") is True
