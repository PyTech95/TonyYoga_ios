"""Iteration 13 — reminder timing, settings audit log, waitlist promotion notify, payment receipts."""
import os
import time
from datetime import datetime, timedelta, timezone

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE = base_url.rstrip("/") + "/api"

ADMIN = {"email": "tony@tonyyoga.com", "password": "TonyYoga2026!"}
STUDENT = {"email": "student@demo.com", "password": "Student2026!"}
STUDENT2 = {"email": "test_wl_student@example.com", "password": "TestWl2026!", "name": "TEST_ WL Student"}


def _login(creds):
    r = requests.post(f"{BASE}/auth/login", json={"email": creds["email"], "password": creds["password"]}, timeout=30)
    assert r.status_code == 200, f"login failed {creds['email']}: {r.status_code} {r.text[:300]}"
    data = r.json()
    assert "token" in data and "user" in data
    return data["token"]


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def admin_token():
    return _login(ADMIN)


@pytest.fixture(scope="session")
def student_token():
    return _login(STUDENT)


@pytest.fixture(scope="session")
def student2_token():
    r = requests.post(f"{BASE}/auth/register", json=STUDENT2, timeout=30)
    if r.status_code not in (200, 201):
        # already registered
        return _login(STUDENT2)
    return r.json()["token"]


# ---------------- Feature: reminder timing (settings) ----------------
class TestReminderTiming:
    def test_settings_has_reminder_lead(self, admin_token):
        r = requests.get(f"{BASE}/admin/settings", headers=_hdr(admin_token), timeout=30)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert "reminder_lead_minutes" in d
        assert isinstance(d["reminder_lead_minutes"], int)

    def test_patch_reminder_lead_persists(self, admin_token):
        r = requests.patch(f"{BASE}/admin/settings", headers=_hdr(admin_token),
                           json={"reminder_lead_minutes": 45}, timeout=30)
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        assert body.get("updated", 0) >= 1
        assert "reminder_lead_minutes" in body.get("keys", [])

        g = requests.get(f"{BASE}/admin/settings", headers=_hdr(admin_token), timeout=30)
        assert g.json()["reminder_lead_minutes"] == 45

        # string coercion path (frontend sends string from number input)
        r2 = requests.patch(f"{BASE}/admin/settings", headers=_hdr(admin_token),
                            json={"reminder_lead_minutes": "30"}, timeout=30)
        assert r2.status_code == 200
        g2 = requests.get(f"{BASE}/admin/settings", headers=_hdr(admin_token), timeout=30)
        assert g2.json()["reminder_lead_minutes"] == 30

    def test_secrets_still_masked(self, admin_token):
        d = requests.get(f"{BASE}/admin/settings", headers=_hdr(admin_token), timeout=30).json()
        for k in ("stripe_secret_key", "smtp_password", "vapid_private_key"):
            v = d.get(k, "")
            assert v == "" or v.startswith("•"), f"{k} not masked: {v!r}"

    def test_student_cannot_patch_settings(self, student_token):
        r = requests.patch(f"{BASE}/admin/settings", headers=_hdr(student_token),
                           json={"reminder_lead_minutes": 99}, timeout=30)
        assert r.status_code == 403, r.status_code


# ---------------- Feature: settings audit log ----------------
class TestSettingsAudit:
    def test_audit_entry_created_on_patch(self, admin_token):
        before = requests.get(f"{BASE}/admin/settings/audit", headers=_hdr(admin_token), timeout=30)
        assert before.status_code == 200, before.text[:300]
        n_before = len(before.json())

        requests.patch(f"{BASE}/admin/settings", headers=_hdr(admin_token),
                       json={"reminder_lead_minutes": 35}, timeout=30)
        time.sleep(0.5)
        after = requests.get(f"{BASE}/admin/settings/audit", headers=_hdr(admin_token), timeout=30)
        assert after.status_code == 200
        rows = after.json()
        assert len(rows) == n_before + 1
        top = rows[0]
        assert top["admin_email"] == ADMIN["email"]
        assert "reminder_lead_minutes" in top["keys"]
        assert "at" in top and top["at"]
        assert "_id" not in top
        # timestamp parseable
        datetime.fromisoformat(top["at"])
        # secret values never present
        blob = str(rows)
        assert "sk_test" not in blob and "sk_live" not in blob
        for row in rows:
            assert isinstance(row.get("secret_changed", []), list)
            assert set(row.get("secret_changed", [])).issubset(set(row["keys"]))
        # restore
        requests.patch(f"{BASE}/admin/settings", headers=_hdr(admin_token),
                       json={"reminder_lead_minutes": 30}, timeout=30)

    def test_audit_sorted_desc(self, admin_token):
        rows = requests.get(f"{BASE}/admin/settings/audit", headers=_hdr(admin_token), timeout=30).json()
        ats = [r["at"] for r in rows]
        assert ats == sorted(ats, reverse=True)

    def test_student_forbidden_on_audit(self, student_token):
        r = requests.get(f"{BASE}/admin/settings/audit", headers=_hdr(student_token), timeout=30)
        assert r.status_code == 403, f"expected 403 got {r.status_code}"

    def test_unauthenticated_forbidden_on_audit(self):
        r = requests.get(f"{BASE}/admin/settings/audit", timeout=30)
        assert r.status_code in (401, 403), r.status_code


# ---------------- Feature: waitlist promotion + notify ----------------
class TestWaitlistPromotion:
    created = {}

    def test_setup_class_capacity_one(self, admin_token):
        tpls = requests.get(f"{BASE}/class-templates", timeout=30).json()
        assert tpls, "no class templates seeded"
        instructor_id = tpls[0]["instructor_id"]
        tpl = requests.post(f"{BASE}/admin/class-templates", headers=_hdr(admin_token), json={
            "title": "TEST_ Waitlist Flow", "description": "TEST_ iteration13",
            "instructor_id": instructor_id, "location_type": "online",
            "style": "hatha", "level": "all", "duration_minutes": 60, "capacity": 1,
        }, timeout=30)
        assert tpl.status_code == 200, tpl.text[:300]
        TestWaitlistPromotion.created["template_id"] = tpl.json()["id"]

        start = (datetime.now(timezone.utc) + timedelta(days=5)).replace(microsecond=0)
        inst = requests.post(f"{BASE}/admin/class-instances", headers=_hdr(admin_token), json={
            "template_id": tpl.json()["id"], "start_time": start.isoformat(), "capacity": 1,
        }, timeout=30)
        assert inst.status_code == 200, inst.text[:300]
        d = inst.json()
        assert d["capacity"] == 1 and d["bookings_count"] == 0
        TestWaitlistPromotion.created["instance_id"] = d["id"]

    def test_first_booking_confirmed(self, student_token):
        iid = TestWaitlistPromotion.created["instance_id"]
        r = requests.post(f"{BASE}/bookings", headers=_hdr(student_token),
                          json={"class_instance_id": iid}, timeout=30)
        assert r.status_code == 200, r.text[:300]
        b = r.json()
        assert b["status"] == "confirmed"
        TestWaitlistPromotion.created["booking1"] = b["id"]
        inst = requests.get(f"{BASE}/class-instances/{iid}", timeout=30).json()
        assert inst["bookings_count"] == 1

    def test_second_booking_waitlisted(self, student2_token):
        iid = TestWaitlistPromotion.created["instance_id"]
        r = requests.post(f"{BASE}/bookings", headers=_hdr(student2_token),
                          json={"class_instance_id": iid}, timeout=30)
        assert r.status_code == 200, r.text[:300]
        b = r.json()
        assert b["status"] == "waitlist"
        TestWaitlistPromotion.created["booking2"] = b["id"]
        inst = requests.get(f"{BASE}/class-instances/{iid}", timeout=30).json()
        assert inst["bookings_count"] == 1

    def test_cancel_promotes_waitlister(self, student_token, student2_token):
        iid = TestWaitlistPromotion.created["instance_id"]
        r = requests.delete(f"{BASE}/bookings/{TestWaitlistPromotion.created['booking1']}",
                            headers=_hdr(student_token), timeout=30)
        assert r.status_code == 200, r.text[:300]
        assert r.json().get("ok") is True
        time.sleep(2)  # allow fire-and-forget notify task to run
        mine = requests.get(f"{BASE}/bookings/mine", headers=_hdr(student2_token), timeout=30).json()
        promoted = [b for b in mine if b["id"] == TestWaitlistPromotion.created["booking2"]]
        assert promoted, "booking2 missing"
        assert promoted[0]["status"] == "confirmed", f"not promoted: {promoted[0]['status']}"
        inst = requests.get(f"{BASE}/class-instances/{iid}", timeout=30).json()
        assert inst["bookings_count"] == 1, f"bookings_count drifted: {inst['bookings_count']}"

    def test_cancelling_waitlist_only_booking_no_count_change(self, student2_token):
        """Cancel the promoted booking: count should drop to 0 and no crash with empty waitlist."""
        iid = TestWaitlistPromotion.created["instance_id"]
        r = requests.delete(f"{BASE}/bookings/{TestWaitlistPromotion.created['booking2']}",
                            headers=_hdr(student2_token), timeout=30)
        assert r.status_code == 200
        inst = requests.get(f"{BASE}/class-instances/{iid}", timeout=30).json()
        assert inst["bookings_count"] == 0, inst["bookings_count"]

    def test_cleanup(self, admin_token):
        iid = TestWaitlistPromotion.created.get("instance_id")
        tid = TestWaitlistPromotion.created.get("template_id")
        if iid:
            assert requests.delete(f"{BASE}/admin/class-instances/{iid}", headers=_hdr(admin_token),
                                   timeout=30).status_code == 200
        if tid:
            assert requests.delete(f"{BASE}/admin/class-templates/{tid}", headers=_hdr(admin_token),
                                   timeout=30).status_code == 200


# ---------------- Feature: payments / receipts (no regression) ----------------
class TestPaymentsRegression:
    def test_membership_plans(self):
        r = requests.get(f"{BASE}/membership-plans", timeout=30)
        assert r.status_code == 200, r.text[:300]
        plans = r.json()
        assert isinstance(plans, list) and plans
        assert "id" in plans[0] and "price" in plans[0]

    def test_checkout_session_returns_url(self, student_token):
        plans = requests.get(f"{BASE}/membership-plans", timeout=30).json()
        r = requests.post(f"{BASE}/checkout/session", headers=_hdr(student_token), json={
            "item_type": "membership", "item_id": plans[0]["id"],
            "origin_url": base_url.rstrip("/"),
        }, timeout=60)
        assert r.status_code == 200, r.text[:400]
        d = r.json()
        assert d.get("url", "").startswith("http")
        assert d.get("session_id")

    def test_receipt_description_and_send_never_raise(self):
        """Directly exercise _receipt_description/_send_receipt with email disabled."""
        import asyncio, sys
        sys.path.insert(0, "/app/backend")
        from routers.payments import _receipt_description, _send_receipt

        async def run():
            for it in ["membership", "program", "product", "cart", "workshop_deposit",
                       "workshop_balance", "drop_in", "class_pack", "weird"]:
                desc = await _receipt_description({"item_type": it, "item_id": "nonexistent"})
                assert isinstance(desc, str) and desc
            # send with a real user -> must return without raising (email disabled -> skipped)
            u = await __import__("core").db.users.find_one({"email": STUDENT["email"]})
            await _send_receipt({"user_id": u["id"], "item_type": "drop_in", "item_id": "x",
                                 "amount": 25.0, "currency": "usd", "session_id": "TEST_sess"})
            # missing user -> silent
            await _send_receipt({"user_id": "nope", "item_type": "drop_in", "item_id": "x"})

        asyncio.run(run())
