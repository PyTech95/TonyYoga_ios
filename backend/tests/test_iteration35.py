"""Iteration 35 — retreat photo uploads, cancel+refund rule, waitlist 48h expiry, month+year dates."""
import base64
import os
import re
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

frontend_env = dotenv_values("/app/frontend/.env")
backend_env = dotenv_values("/app/backend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")
API = BASE_URL + "/api"

MONGO_URL = os.environ.get("MONGO_URL") or backend_env.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME") or backend_env.get("DB_NAME")

# 1x1 transparent PNG
PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=="
)


def _creds():
    content = Path("/app/memory/test_credentials.md").read_text(encoding="utf-8")
    emails = re.findall(r"(?im)^-\s*Email:\s*(\S+)", content)
    pwds = re.findall(r"(?im)^-\s*Password:\s*(\S+)", content)
    return list(zip(emails, pwds))


@pytest.fixture(scope="session")
def creds():
    c = _creds()
    if len(c) < 2:
        pytest.skip("credentials file missing entries")
    return {"admin": c[0], "student": c[1]}


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    if r.status_code != 200:
        pytest.fail(f"login failed for {email}: {r.status_code} {r.text[:300]}")
    return r.json()


@pytest.fixture(scope="session")
def admin(creds):
    d = _login(*creds["admin"])
    return d


@pytest.fixture(scope="session")
def student(creds):
    d = _login(*creds["student"])
    return d


@pytest.fixture(scope="session")
def admin_h(admin):
    return {"Authorization": f"Bearer {admin['token']}"}


@pytest.fixture(scope="session")
def student_h(student):
    return {"Authorization": f"Bearer {student['token']}"}


@pytest.fixture(scope="session")
def mongo():
    cli = MongoClient(MONGO_URL)
    yield cli[DB_NAME]
    cli.close()


@pytest.fixture(scope="session")
def retreat():
    r = requests.get(f"{API}/workshops", timeout=30)
    assert r.status_code == 200, r.text
    rows = r.json()
    assert isinstance(rows, list) and rows, "no workshops returned"
    return rows[0]


# ---------------- Module: uploads ----------------
class TestUploads:
    def test_admin_upload_and_public_serve(self, admin_h):
        files = {"file": ("TEST_retreat.png", PNG_BYTES, "image/png")}
        r = requests.post(f"{API}/admin/uploads", headers=admin_h, files=files, timeout=120)
        assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
        data = r.json()
        assert "url" in data and "path" in data
        assert data["url"] == f"/api/files/{data['path']}"
        assert data["path"].startswith("tony-yoga/retreats/")

        g = requests.get(f"{BASE_URL}{data['url']}", timeout=60)
        assert g.status_code == 200, f"serve failed {g.status_code} {g.text[:200]}"
        assert g.headers.get("content-type", "").startswith("image/"), g.headers.get("content-type")
        assert len(g.content) == len(PNG_BYTES)
        TestUploads.uploaded_path = data["path"]

    def test_non_admin_upload_rejected(self, student_h):
        files = {"file": ("TEST_x.png", PNG_BYTES, "image/png")}
        r = requests.post(f"{API}/admin/uploads", headers=student_h, files=files, timeout=60)
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text[:200]}"

    def test_anonymous_upload_rejected(self):
        files = {"file": ("TEST_x.png", PNG_BYTES, "image/png")}
        r = requests.post(f"{API}/admin/uploads", files=files, timeout=60)
        assert r.status_code == 401, f"expected 401, got {r.status_code}"

    def test_non_image_rejected(self, admin_h):
        files = {"file": ("TEST_bad.txt", b"hello", "text/plain")}
        r = requests.post(f"{API}/admin/uploads", headers=admin_h, files=files, timeout=60)
        assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text[:200]}"

    def test_unknown_file_404(self):
        r = requests.get(f"{API}/files/tony-yoga/retreats/does-not-exist.png", timeout=30)
        assert r.status_code == 404, r.status_code

    def test_admin_can_save_gallery_urls(self, admin_h, retreat):
        """Paste-URL path still works: PUT admin workshop with gallery list."""
        wid = retreat["id"]
        orig = retreat.get("gallery") or []
        new = list(orig) + ["https://example.com/TEST_photo.jpg"]
        r = requests.patch(f"{API}/admin/workshops/{wid}", headers=admin_h, json={"gallery": new}, timeout=60)
        assert r.status_code in (200, 204), f"{r.status_code} {r.text[:300]}"
        g = requests.get(f"{API}/workshops/{wid}", timeout=30)
        assert g.status_code == 200
        assert "https://example.com/TEST_photo.jpg" in (g.json().get("gallery") or [])
        # restore
        requests.patch(f"{API}/admin/workshops/{wid}", headers=admin_h, json={"gallery": orig}, timeout=60)


# ---------------- Module: retreat cancel + refund ----------------
class TestCancelRefund:
    def _make_reg(self, mongo, user_id, retreat, status, days_out):
        start = datetime.now(timezone.utc) + timedelta(days=days_out)
        doc = {
            "id": f"TEST_reg_{status}_{days_out}_{int(time.time()*1000)}",
            "user_id": user_id,
            "workshop_id": retreat["id"],
            "workshop_title": retreat.get("title"),
            "workshop_start_date": start.isoformat(),
            "name": "TEST Student",
            "email": "student@demo.com",
            "status": status,
            "total_eur": 1600.0,
            "deposit_eur": 500.0,
            "balance_eur": 1100.0,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        mongo.workshop_registrations.insert_one(doc)
        return doc["id"]

    def test_cancel_paid_more_than_60_days_out_is_refund_pending(self, mongo, student, student_h, retreat):
        rid = self._make_reg(mongo, student["user"]["id"], retreat, "deposit_paid", 120)
        r = requests.post(f"{API}/retreats/{rid}/cancel", headers=student_h, timeout=60)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["refund_status"] == "refund_pending", d
        assert d["refund_eligible"] is True
        assert d["refund_cutoff_days"] == 60
        # persistence
        g = requests.get(f"{API}/retreats/{rid}", headers=student_h, timeout=30)
        assert g.status_code == 200
        assert g.json()["status"] == "cancelled"
        assert g.json()["refund_status"] == "refund_pending"
        mongo.workshop_registrations.delete_one({"id": rid})

    def test_cancel_paid_within_60_days_is_non_refundable(self, mongo, student, student_h, retreat):
        rid = self._make_reg(mongo, student["user"]["id"], retreat, "deposit_paid", 30)
        r = requests.post(f"{API}/retreats/{rid}/cancel", headers=student_h, timeout=60)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["refund_status"] == "non_refundable", d
        assert d["refund_eligible"] is False
        mongo.workshop_registrations.delete_one({"id": rid})

    def test_cancel_unpaid_is_not_applicable_and_repeat_is_400(self, mongo, student, student_h, retreat):
        rid = self._make_reg(mongo, student["user"]["id"], retreat, "pending_deposit", 120)
        r = requests.post(f"{API}/retreats/{rid}/cancel", headers=student_h, timeout=60)
        assert r.status_code == 200, r.text[:300]
        assert r.json()["refund_status"] == "not_applicable", r.json()
        r2 = requests.post(f"{API}/retreats/{rid}/cancel", headers=student_h, timeout=60)
        assert r2.status_code == 400, f"expected 400 on repeat cancel, got {r2.status_code}"
        mongo.workshop_registrations.delete_one({"id": rid})

    def test_cancel_other_users_reservation_forbidden(self, mongo, student_h, retreat):
        rid = self._make_reg(mongo, "TEST_other_user", retreat, "deposit_paid", 120)
        r = requests.post(f"{API}/retreats/{rid}/cancel", headers=student_h, timeout=60)
        assert r.status_code == 403, f"expected 403, got {r.status_code}"
        mongo.workshop_registrations.delete_one({"id": rid})

    def test_cancel_unknown_reservation_404(self, student_h):
        r = requests.post(f"{API}/retreats/TEST_nope/cancel", headers=student_h, timeout=60)
        assert r.status_code == 404, r.status_code

    def test_cancel_requires_auth(self):
        r = requests.post(f"{API}/retreats/TEST_nope/cancel", timeout=30)
        assert r.status_code == 401


# ---------------- Module: reserve -> pay deposit regression ----------------
class TestReserveFlow:
    def test_reserve_and_mine_and_cancel(self, mongo, student, student_h, retreat):
        payload = {
            "workshop_id": retreat["id"], "name": "TEST Student",
            "email": "student@demo.com", "yoga_status": "Perpetual Yogi",
            "years_of_practice": 3, "wants_teacher_training": False,
        }
        # clear prior regs for a clean run
        mongo.workshop_registrations.delete_many(
            {"user_id": student["user"]["id"], "workshop_id": retreat["id"]}
        )
        r = requests.post(f"{API}/retreats/reserve", headers=student_h, json=payload, timeout=60)
        assert r.status_code == 200, r.text[:400]
        reg = r.json()
        assert reg["status"] == "pending_deposit"
        assert "_id" not in reg
        assert reg["deposit_eur"] > 0
        rid = reg["id"]

        mine = requests.get(f"{API}/retreats/mine", headers=student_h, timeout=30)
        assert mine.status_code == 200
        assert any(x["id"] == rid for x in mine.json())

        avail = requests.get(f"{API}/retreats/{retreat['id']}/availability", timeout=30)
        assert avail.status_code == 200
        a = avail.json()
        assert set(["capacity", "taken", "seats_left", "is_full", "waitlist_count"]).issubset(a)

        c = requests.post(f"{API}/retreats/{rid}/cancel", headers=student_h, timeout=60)
        assert c.status_code == 200, c.text[:300]
        mongo.workshop_registrations.delete_many({"id": rid})


# ---------------- Module: waitlist 48h expiry ----------------
class TestWaitlistExpiry:
    def test_expire_tick_promotes_next_waitlister(self, mongo, retreat):
        """Insert an expired seat_offered row + a waitlisted row; background loop
        (60s) must flip A -> offer_expired and B -> seat_offered with fresh 48h."""
        wid = retreat["id"]
        cap = retreat.get("capacity", 14)
        now = datetime.now(timezone.utc)
        a_id = f"TEST_offerA_{int(time.time()*1000)}"
        b_id = f"TEST_waitB_{int(time.time()*1000)}"
        mongo.workshop_registrations.insert_many([
            {"id": a_id, "user_id": "TEST_userA", "workshop_id": wid,
             "workshop_title": retreat.get("title"), "workshop_start_date": retreat.get("start_date"),
             "email": "TEST_a@demo.com", "status": "seat_offered",
             "seat_offered_at": (now - timedelta(hours=49)).isoformat(),
             "seat_offer_expires_at": (now - timedelta(hours=1)).isoformat(),
             "created_at": (now - timedelta(days=3)).isoformat()},
            {"id": b_id, "user_id": "TEST_userB", "workshop_id": wid,
             "workshop_title": retreat.get("title"), "workshop_start_date": retreat.get("start_date"),
             "email": "TEST_b@demo.com", "status": "waitlisted", "waitlist_position": 1,
             "created_at": (now - timedelta(days=2)).isoformat()},
        ])
        try:
            deadline = time.time() + 150
            a = b = None
            while time.time() < deadline:
                a = mongo.workshop_registrations.find_one({"id": a_id})
                b = mongo.workshop_registrations.find_one({"id": b_id})
                if a["status"] == "offer_expired" and b["status"] == "seat_offered":
                    break
                time.sleep(5)
            assert a["status"] == "offer_expired", f"A status={a['status']} (loop may not run tick)"
            assert a.get("offer_expired_at")
            assert b["status"] == "seat_offered", f"B status={b['status']}"
            exp = datetime.fromisoformat(b["seat_offer_expires_at"].replace("Z", "+00:00"))
            hours_left = (exp - datetime.now(timezone.utc)).total_seconds() / 3600
            assert 46 < hours_left <= 48.1, f"expected ~48h offer window, got {hours_left:.1f}h"
            assert cap  # sanity
        finally:
            mongo.workshop_registrations.delete_many({"id": {"$in": [a_id, b_id]}})

    def test_cancel_promotes_waitlister_with_48h_window(self, mongo, student, student_h, retreat):
        wid = retreat["id"]
        now = datetime.now(timezone.utc)
        w_id = f"TEST_wl_{int(time.time()*1000)}"
        mongo.workshop_registrations.delete_many({"user_id": student["user"]["id"], "workshop_id": wid})
        # fill so a cancel frees exactly one seat -> promotion happens
        rid = f"TEST_paid_{int(time.time()*1000)}"
        mongo.workshop_registrations.insert_many([
            {"id": rid, "user_id": student["user"]["id"], "workshop_id": wid,
             "workshop_title": retreat.get("title"), "workshop_start_date": retreat.get("start_date"),
             "email": "student@demo.com", "status": "deposit_paid",
             "created_at": now.isoformat()},
            {"id": w_id, "user_id": "TEST_userW", "workshop_id": wid,
             "workshop_title": retreat.get("title"), "workshop_start_date": retreat.get("start_date"),
             "email": "TEST_w@demo.com", "status": "waitlisted", "waitlist_position": 1,
             "created_at": now.isoformat()},
        ])
        try:
            r = requests.post(f"{API}/retreats/{rid}/cancel", headers=student_h, timeout=60)
            assert r.status_code == 200, r.text[:300]
            w = mongo.workshop_registrations.find_one({"id": w_id})
            assert w["status"] == "seat_offered", f"waitlister not promoted: {w['status']}"
            exp = datetime.fromisoformat(w["seat_offer_expires_at"].replace("Z", "+00:00"))
            hours = (exp - datetime.now(timezone.utc)).total_seconds() / 3600
            assert 47 < hours <= 48.1, f"expected 48h window, got {hours:.1f}h"
        finally:
            mongo.workshop_registrations.delete_many({"id": {"$in": [rid, w_id]}})

    def test_waitlist_join_rejected_when_seats_available(self, mongo, student_h, retreat):
        avail = requests.get(f"{API}/retreats/{retreat['id']}/availability", timeout=30).json()
        if avail["is_full"]:
            pytest.skip("retreat is full; cannot assert seats-available rejection")
        r = requests.post(f"{API}/retreats/waitlist", headers=student_h,
                          json={"workshop_id": retreat["id"]}, timeout=60)
        assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text[:200]}"


# ---------------- Module: seeded retreat date ----------------
class TestRetreatData:
    def test_active_retreat_starts_december_2026(self, retreat):
        assert "Core 40" in retreat.get("title", ""), retreat.get("title")
        assert str(retreat["start_date"]).startswith("2026-12-01"), retreat["start_date"]

    def test_workshops_list_has_no_mongo_id(self):
        rows = requests.get(f"{API}/workshops", timeout=30).json()
        for w in rows:
            assert "_id" not in w


# ---------------- Module: auth playbook checks ----------------
class TestAuthPlaybook:
    def test_bcrypt_hash_format(self, mongo, creds):
        u = mongo.users.find_one({"email": creds["admin"][0]})
        assert u, "admin user missing"
        assert u["password_hash"].startswith("$2b$"), u["password_hash"][:10]

    def test_login_sets_httponly_cookie(self, creds):
        r = requests.post(f"{API}/auth/login", json={"email": creds["student"][0], "password": creds["student"][1]}, timeout=30)
        assert r.status_code == 200
        sc = r.headers.get("set-cookie", "")
        assert "access_token" in sc and "HttpOnly" in sc, sc

    def test_brute_force_lockout(self):
        email = f"locktest_iter35_{int(time.time())}@demo.com"
        codes = []
        for _ in range(7):
            rr = requests.post(f"{API}/auth/login", json={"email": email, "password": "wrong-pass"}, timeout=30)
            codes.append(rr.status_code)
        assert 429 in codes, f"no lockout observed: {codes}"
        assert codes[:5] == [401] * 5, codes

    def test_me_endpoint(self, student_h):
        r = requests.get(f"{API}/auth/me", headers=student_h, timeout=30)
        assert r.status_code == 200
        assert "password_hash" not in r.json()
        assert "_id" not in r.json()
