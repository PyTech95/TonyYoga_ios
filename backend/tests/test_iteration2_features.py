"""Iteration 2 backend delta tests: push, referrals, admin, checkout, class cancel."""
import os
import time
import uuid
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://web-app-hub-56.preview.emergentagent.com").rstrip("/")
ORIGIN = BASE


@pytest.fixture(scope="module")
def student_headers():
    r = requests.post(f"{BASE}/api/auth/login", json={"email": "student@demo.com", "password": "Student2026!"}, timeout=20)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="module")
def admin_headers():
    r = requests.post(f"{BASE}/api/auth/login", json={"email": "tony@tonyyoga.com", "password": "TonyYoga2026!"}, timeout=20)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


# ---------- Push ----------
class TestPush:
    def test_public_key(self):
        r = requests.get(f"{BASE}/api/push/public-key", timeout=15)
        assert r.status_code == 200, r.text
        key = r.json().get("public_key", "")
        assert key.startswith("B") and len(key) > 40, f"Bad VAPID key: {key!r}"

    def test_subscribe_unsubscribe(self, student_headers):
        fake_endpoint = f"https://fcm.googleapis.com/fcm/send/TEST_{uuid.uuid4().hex}"
        payload = {"endpoint": fake_endpoint, "keys": {"p256dh": "TESTdhkey", "auth": "TESTauth"}}
        r = requests.post(f"{BASE}/api/push/subscribe", json=payload, headers=student_headers, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

        r2 = requests.post(f"{BASE}/api/push/unsubscribe", json={"endpoint": fake_endpoint}, headers=student_headers, timeout=15)
        assert r2.status_code == 200, r2.text
        assert r2.json().get("ok") is True


# ---------- Referrals ----------
class TestReferrals:
    def test_mine(self, student_headers):
        r = requests.get(f"{BASE}/api/referrals/mine", headers=student_headers, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("referral_code", "share_url", "total_signups", "total_converted", "pending_credits_days"):
            assert k in d
        assert f"/register?ref={d['referral_code']}" in d["share_url"]
        TestReferrals.code = d["referral_code"]

    def test_invite(self, student_headers):
        payload = {
            "emails": ["test1@example.com", "test1@example.com", "student@demo.com"],
            "personal_note": "try it",
        }
        r = requests.post(f"{BASE}/api/referrals/invite", json=payload, headers=student_headers, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "sent" in d and "failed" in d and "skipped" in d and "share_url" in d
        # dedupe: only 2 unique emails processed. student@demo.com is already registered -> skipped
        assert any(s.get("email") == "student@demo.com" for s in d["skipped"])

    def test_register_with_ref(self):
        code = getattr(TestReferrals, "code", None)
        assert code, "referral code missing"
        email = f"TEST_ref_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{BASE}/api/auth/register", json={
            "email": email, "password": "Pass123!!", "name": "Ref Tester",
            "referral_code": code,
        }, timeout=20)
        assert r.status_code == 200, r.text
        token = r.json().get("token")
        assert token
        # verify referrals row exists by checking share stats
        # login as the referrer (student) already fixture; skip DB peek since not available.
        # Instead: call /api/auth/me on the new user and check source
        me = requests.get(f"{BASE}/api/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=15)
        assert me.status_code == 200, me.text
        assert me.json().get("source") == "referral" or me.json().get("referred_by")


# ---------- Checkout ----------
class TestCheckout:
    def test_membership_checkout_session(self, student_headers):
        plans = requests.get(f"{BASE}/api/membership-plans", timeout=15).json()
        assert isinstance(plans, list) and len(plans) >= 1
        plan_id = plans[0]["id"]
        r = requests.post(
            f"{BASE}/api/checkout/session",
            json={"item_type": "membership", "item_id": plan_id, "quantity": 1, "origin_url": ORIGIN},
            headers=student_headers, timeout=30,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert "session_id" in d
        assert "checkout.stripe.com" in d["url"], d["url"]
        TestCheckout.session_id = d["session_id"]

    def test_status(self, student_headers):
        sid = getattr(TestCheckout, "session_id", None)
        if not sid:
            pytest.skip("no session")
        r = requests.get(f"{BASE}/api/checkout/status/{sid}", headers=student_headers, timeout=20)
        assert r.status_code == 200, r.text
        assert "payment_status" in r.json()


# ---------- Admin ----------
class TestAdmin:
    def test_stats(self, admin_headers):
        r = requests.get(f"{BASE}/api/admin/stats", headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("users", "students", "instructors", "bookings", "active_subscriptions", "revenue", "transactions"):
            assert k in d, f"missing key {k}: {d}"

    def test_instructor_applications_flow(self, admin_headers):
        # Create an application via the public endpoint
        app_email = f"TEST_app_{uuid.uuid4().hex[:6]}@example.com"
        create = requests.post(f"{BASE}/api/instructor-applications", json={
            "name": "Test Instructor", "email": app_email, "years_experience": 5,
            "certifications": "RYT-200", "styles": ["Vinyasa"], "bio": "Test bio",
        }, timeout=15)
        assert create.status_code == 200, create.text
        app_id = create.json()["id"]

        lst = requests.get(f"{BASE}/api/admin/instructor-applications", headers=admin_headers, timeout=15)
        assert lst.status_code == 200
        assert any(a["id"] == app_id for a in lst.json())

        decide = requests.post(
            f"{BASE}/api/admin/instructor-applications/decision",
            json={"application_id": app_id, "action": "approve"},
            headers=admin_headers, timeout=15,
        )
        assert decide.status_code == 200, decide.text

    def test_cancel_class_instance(self, admin_headers):
        classes = requests.get(f"{BASE}/api/class-instances?upcoming=true", timeout=15).json()
        if not classes:
            pytest.skip("no upcoming classes")
        # pick a class not already cancelled
        target = next((c for c in classes if c.get("status") != "cancelled"), None)
        if not target:
            pytest.skip("no active classes to cancel")
        r = requests.patch(
            f"{BASE}/api/admin/class-instances/{target['id']}",
            json={"status": "cancelled"},
            headers=admin_headers, timeout=15,
        )
        assert r.status_code == 200, r.text
        # verify
        detail = requests.get(f"{BASE}/api/class-instances/{target['id']}", timeout=15).json()
        assert detail.get("status") == "cancelled"

    def test_push_broadcast(self, admin_headers):
        r = requests.post(
            f"{BASE}/api/admin/push/broadcast",
            json={"title": "Hi", "body": "test", "audience": "all"},
            headers=admin_headers, timeout=20,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert "sent" in d and "failed" in d


# ---------- PWA ----------
class TestPWA:
    def test_sw_has_push_listener(self):
        r = requests.get(f"{ORIGIN}/sw.js", timeout=15)
        assert r.status_code == 200
        assert "addEventListener('push'" in r.text or 'addEventListener("push"' in r.text

    def test_manifest(self):
        r = requests.get(f"{ORIGIN}/manifest.json", timeout=15)
        assert r.status_code == 200
        assert r.json().get("name")
