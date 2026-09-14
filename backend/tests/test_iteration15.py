"""Iteration 15 — Instructor dashboard, account flows (reset/magic-link), admin power tools (CSV import, clear secret, stripe validation)."""
import io
import os
import re
import glob
import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE = base_url.rstrip("/") + "/api"

ADMIN = ("tony@tonyyoga.com", "TonyYoga2026!")
INSTRUCTOR = ("instructor@demo.com", "Instructor2026!")
STUDENT = ("student@demo.com", "Student2026!")


def login(email, password):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login {email} -> {r.status_code} {r.text[:300]}"
    data = r.json()
    assert "token" in data and "user" in data
    return data


@pytest.fixture(scope="session")
def admin_h():
    return {"Authorization": f"Bearer {login(*ADMIN)['token']}"}


@pytest.fixture(scope="session")
def instr():
    return login(*INSTRUCTOR)


@pytest.fixture(scope="session")
def instr_h(instr):
    return {"Authorization": f"Bearer {instr['token']}"}


@pytest.fixture(scope="session")
def student_h():
    return {"Authorization": f"Bearer {login(*STUDENT)['token']}"}


# ---------------- A. Instructor dashboard ----------------
class TestInstructorDashboard:
    def test_instructor_role_seeded(self, instr):
        assert instr["user"]["role"] == "instructor"
        assert instr["user"]["email"] == "instructor@demo.com"

    def test_instructor_class_instances_only_own(self, instr, instr_h):
        r = requests.get(f"{BASE}/instructor/class-instances", headers=instr_h, timeout=30)
        assert r.status_code == 200, r.text[:300]
        rows = r.json()
        assert isinstance(rows, list) and len(rows) > 0, "instructor has no classes seeded"
        for row in rows:
            assert row["instructor_id"] == instr["user"]["id"]
            assert "_id" not in row
        titles = {row["title"] for row in rows}
        assert titles == {"Power Yoga"}, f"unexpected titles {titles}"

    def test_instructor_earnings(self, instr_h):
        r = requests.get(f"{BASE}/instructor/earnings", headers=instr_h, timeout=30)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert "rules" in d and "total_earnings" in d
        assert isinstance(d["rules"], list) and len(d["rules"]) >= 1
        rule = d["rules"][0]
        assert rule["type"] == "program"
        assert rule["percentage"] == 50
        assert d["total_earnings"] == 0.0

    def test_student_forbidden(self, student_h):
        for path in ("/instructor/class-instances", "/instructor/earnings"):
            r = requests.get(f"{BASE}{path}", headers=student_h, timeout=30)
            assert r.status_code == 403, f"{path} -> {r.status_code}"

    def test_unauth_rejected(self):
        r = requests.get(f"{BASE}/instructor/earnings", timeout=30)
        assert r.status_code in (401, 403)

    def test_cancel_own_class(self, instr, instr_h):
        rows = requests.get(f"{BASE}/instructor/class-instances", headers=instr_h, timeout=30).json()
        target = rows[-1]
        r = requests.patch(f"{BASE}/instructor/class-instances/{target['id']}/cancel", headers=instr_h, timeout=30)
        assert r.status_code == 200, r.text[:300]
        # verify persistence
        after = requests.get(f"{BASE}/class-instances/{target['id']}", timeout=30)
        assert after.status_code == 200
        assert after.json()["status"] == "cancelled"

    def test_cancel_others_class_forbidden(self, instr_h, admin_h):
        all_rows = requests.get(f"{BASE}/class-instances?upcoming=true", timeout=30).json()
        other = next((c for c in all_rows if c.get("title") != "Power Yoga"), None)
        if not other:
            pytest.skip("no other instructor class available")
        r = requests.patch(f"{BASE}/instructor/class-instances/{other['id']}/cancel", headers=instr_h, timeout=30)
        assert r.status_code == 403, f"expected 403 got {r.status_code}"

    def test_student_cancel_forbidden(self, student_h):
        r = requests.patch(f"{BASE}/instructor/class-instances/does-not-exist/cancel", headers=student_h, timeout=30)
        assert r.status_code == 403


# ---------------- B. Account flows ----------------
def _tail_backend_log(pattern):
    for path in sorted(glob.glob("/var/log/supervisor/backend.*.log")):
        try:
            with open(path, "r", errors="ignore") as fh:
                content = fh.read()[-400000:]
        except OSError:
            continue
        matches = re.findall(pattern, content)
        if matches:
            return matches[-1]
    return None


def _seed_reset_token(email):
    """Fallback: insert a known password-reset token directly (plain token is never returned by the API)."""
    import hashlib
    import secrets
    import uuid
    from pymongo import MongoClient
    env = dotenv_values("/app/backend/.env")
    client = MongoClient(env["MONGO_URL"])
    dbh = client[env["DB_NAME"]]
    user = dbh.users.find_one({"email": email})
    assert user, f"user {email} not found"
    plain = secrets.token_urlsafe(32)
    from datetime import datetime, timedelta, timezone
    dbh.password_reset_tokens.insert_one({
        "id": str(uuid.uuid4()), "user_id": user["id"],
        "token_sha": hashlib.sha256(plain.encode()).hexdigest(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
        "used": False,
    })
    client.close()
    return plain


class TestAccountFlows:
    def test_forgot_password_unknown_email_ok(self):
        r = requests.post(f"{BASE}/auth/forgot-password", json={"email": "nobody_tst_@example.com"}, timeout=30)
        assert r.status_code == 200
        assert r.json() == {"ok": True}

    def test_password_reset_full_loop(self):
        """Uses a dedicated temp account so the shared demo student password is never mutated."""
        email = "TEST_reset_iter15@example.com"
        old_pw = "OldReset2026!"
        reg = requests.post(f"{BASE}/auth/register", json={"email": email, "name": "TEST Reset", "password": old_pw}, timeout=30)
        assert reg.status_code in (200, 201, 400), reg.text[:300]
        r = requests.post(f"{BASE}/auth/forgot-password", json={"email": email}, timeout=30)
        assert r.status_code == 200 and r.json()["ok"] is True
        token = _tail_backend_log(r"PASSWORD RESET for " + email.lower() + r"\].*reset-password\?token=([A-Za-z0-9_\-]+)")
        if not token:
            # Logs may have rotated; seed a deterministic reset token straight into Mongo.
            token = _seed_reset_token(email.lower())
        new_pw = "NewReset2026!"
        rr = requests.post(f"{BASE}/auth/reset-password", json={"token": token, "new_password": new_pw}, timeout=30)
        assert rr.status_code == 200, rr.text[:300]
        # login works with the new password, fails with the old one
        login(email, new_pw)
        old = requests.post(f"{BASE}/auth/login", json={"email": email, "password": old_pw}, timeout=30)
        assert old.status_code == 401
        # token cannot be reused
        again = requests.post(f"{BASE}/auth/reset-password", json={"token": token, "new_password": "Other2026!"}, timeout=30)
        assert again.status_code == 400

    def test_student_password_unchanged(self):
        login(*STUDENT)

    def test_reset_password_invalid_token(self):
        r = requests.post(f"{BASE}/auth/reset-password", json={"token": "bogus-token", "new_password": "Whatever2026!"}, timeout=30)
        assert r.status_code == 400

    def test_magic_link_end_to_end(self):
        r = requests.post(f"{BASE}/auth/magic-link/request", json={"email": STUDENT[0], "type": "login"}, timeout=30)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["ok"] is True
        assert d.get("email_sent") in (False, None)
        assert d.get("magic_url"), "magic_url not returned while email disabled"
        assert d["magic_url"].startswith("http"), f"magic_url not absolute: {d['magic_url']}"
        token = d["magic_url"].split("token=")[1]
        c = requests.post(f"{BASE}/auth/magic-link/consume", json={"token": token}, timeout=30)
        assert c.status_code == 200, c.text[:300]
        cd = c.json()
        assert cd["user"]["email"] == STUDENT[0]
        assert cd["token"]
        assert "_id" not in cd["user"] and "password_hash" not in cd["user"]
        # token single-use
        again = requests.post(f"{BASE}/auth/magic-link/consume", json={"token": token}, timeout=30)
        assert again.status_code == 400
        # returned token is usable
        me = requests.get(f"{BASE}/auth/me", headers={"Authorization": f"Bearer {cd['token']}"}, timeout=30)
        assert me.status_code == 200 and me.json()["email"] == STUDENT[0]

    def test_magic_link_invalid_token(self):
        r = requests.post(f"{BASE}/auth/magic-link/consume", json={"token": "nope"}, timeout=30)
        assert r.status_code == 400


# ---------------- C. Admin power tools ----------------
class TestCsvImport:
    created_titles = ["TEST_CSV_Class_A", "TEST_CSV_Class_B"]

    def test_members_csv_import(self, admin_h):
        csv_data = "email,name\nTEST_csv1@example.com,TEST Csv One\nTEST_csv2@example.com,TEST Csv Two\nbademail,No At\n"
        files = {"file": ("members.csv", io.BytesIO(csv_data.encode()), "text/csv")}
        r = requests.post(f"{BASE}/admin/legacy/import-csv", headers=admin_h,
                          data={"batch_name": "TEST_batch_iter15"}, files=files, timeout=60)
        assert r.status_code == 200, r.text[:400]
        d = r.json()
        assert "batch" in d and "invites" in d
        assert d["batch"]["name"] == "TEST_batch_iter15"
        assert d["batch"]["valid_records"] == 2, f"expected 2 valid rows: {d['batch']}"
        assert d["batch"]["total_records"] == 2
        assert len(d["invites"]) == 2

    def test_members_csv_malformed_email_should_not_500(self, admin_h):
        """A CSV row with a syntactically-ok but unroutable email must be reported, not crash the import."""
        csv_data = "email,name\nTEST_csv_bad@example.test,TEST Bad Domain\n"
        files = {"file": ("members.csv", io.BytesIO(csv_data.encode()), "text/csv")}
        r = requests.post(f"{BASE}/admin/legacy/import-csv", headers=admin_h,
                          data={"batch_name": "TEST_batch_iter15_bad"}, files=files, timeout=60)
        assert r.status_code != 500, "Pydantic EmailStr ValidationError leaks as 500 (uncaught) in import_csv"

    def test_members_csv_requires_admin(self, student_h):
        files = {"file": ("m.csv", io.BytesIO(b"email,name\na@b.com,A\n"), "text/csv")}
        r = requests.post(f"{BASE}/admin/legacy/import-csv", headers=student_h,
                          data={"batch_name": "TEST_nope"}, files=files, timeout=30)
        assert r.status_code == 403

    def test_classes_csv_import_and_cleanup(self, admin_h):
        csv_data = (
            "title,start_time,duration_minutes,capacity,location_type,location_detail,style,level\n"
            "TEST_CSV_Class_A,2026-09-01T08:00:00,60,20,online,Zoom,Vinyasa,all\n"
            "TEST_CSV_Class_B,2026-09-02T10:30:00,75,15,in-person,Studio A,Power,intermediate\n"
            "TEST_CSV_Bad,not-a-date,60,10,online,Zoom,Vinyasa,all\n"
            ",2026-09-03T08:00:00,60,10,online,Zoom,Vinyasa,all\n"
        )
        files = {"file": ("classes.csv", io.BytesIO(csv_data.encode()), "text/csv")}
        r = requests.post(f"{BASE}/admin/class-instances/import-csv", headers=admin_h, files=files, timeout=60)
        assert r.status_code == 200, r.text[:400]
        d = r.json()
        assert d["created"] == 2, d
        assert len(d["errors"]) == 2, d["errors"]
        assert any("bad start_time" in e for e in d["errors"])
        assert any("missing title" in e for e in d["errors"])

        # verify persistence via admin class-instance listing
        rows = requests.get(f"{BASE}/class-instances?upcoming=true&limit=500", timeout=30).json()
        found = {c["title"]: c for c in rows if c["title"] in self.created_titles}
        assert set(found) == set(self.created_titles), f"created classes not listed: {list(found)}"
        assert found["TEST_CSV_Class_B"]["duration_minutes"] == 75
        assert found["TEST_CSV_Class_B"]["capacity"] == 15
        assert found["TEST_CSV_Class_B"]["location_type"] == "in-person"

        # cleanup
        for c in found.values():
            dr = requests.delete(f"{BASE}/admin/class-instances/{c['id']}", headers=admin_h, timeout=30)
            assert dr.status_code in (200, 204), f"cleanup delete failed {dr.status_code} {dr.text[:200]}"


class TestSettingsSecrets:
    def test_reject_bad_prefixes(self, admin_h):
        for field, bad in [("stripe_secret_key", "wrong_key_123"),
                           ("stripe_publishable_key", "sk_test_x"),
                           ("stripe_webhook_secret", "nope_123")]:
            r = requests.patch(f"{BASE}/admin/settings", headers=admin_h, json={field: bad}, timeout=30)
            assert r.status_code == 400, f"{field} accepted bad value -> {r.status_code} {r.text[:200]}"

    def test_set_and_clear_secret(self, admin_h):
        r = requests.patch(f"{BASE}/admin/settings", headers=admin_h,
                           json={"stripe_webhook_secret": "whsec_TEST_iter15"}, timeout=30)
        assert r.status_code == 200, r.text[:300]
        g = requests.get(f"{BASE}/admin/settings", headers=admin_h, timeout=30)
        assert g.status_code == 200
        s = g.json()
        val = s.get("stripe_webhook_secret") or ""
        assert val, "secret not stored"
        assert "TEST_iter15" not in val or "*" in val, f"secret returned unmasked: {val}"

        c = requests.patch(f"{BASE}/admin/settings", headers=admin_h,
                           json={"stripe_webhook_secret": "__clear__"}, timeout=30)
        assert c.status_code == 200, c.text[:300]
        g2 = requests.get(f"{BASE}/admin/settings", headers=admin_h, timeout=30).json()
        assert not g2.get("stripe_webhook_secret"), f"secret not cleared: {g2.get('stripe_webhook_secret')}"

    def test_live_mode_warning_and_reset(self, admin_h):
        r = requests.patch(f"{BASE}/admin/settings", headers=admin_h, json={"stripe_mode": "live"}, timeout=30)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert isinstance(d.get("warnings"), list)
        assert len(d["warnings"]) >= 1, f"expected live-mode warning, got {d}"
        assert "LIVE" in d["warnings"][0]
        # reset
        back = requests.patch(f"{BASE}/admin/settings", headers=admin_h, json={"stripe_mode": "test"}, timeout=30)
        assert back.status_code == 200
        assert back.json().get("warnings") == []
        assert requests.get(f"{BASE}/admin/settings", headers=admin_h, timeout=30).json().get("stripe_mode") == "test"

    def test_settings_requires_admin(self, student_h):
        r = requests.patch(f"{BASE}/admin/settings", headers=student_h, json={"stripe_mode": "live"}, timeout=30)
        assert r.status_code == 403


# ---------------- Regression ----------------
class TestRegression:
    def test_class_list_public(self):
        r = requests.get(f"{BASE}/class-instances?upcoming=true", timeout=30)
        assert r.status_code == 200 and isinstance(r.json(), list)

    def test_revenue_chart(self, admin_h):
        r = requests.get(f"{BASE}/admin/stats/trend", headers=admin_h, timeout=30)
        assert r.status_code == 200, r.text[:200]

    def test_booking_flow(self, student_h):
        rows = requests.get(f"{BASE}/class-instances?upcoming=true", timeout=30).json()
        target = next((c for c in rows if c.get("status") == "scheduled"), None)
        assert target, "no scheduled class to book"
        r = requests.post(f"{BASE}/bookings", headers=student_h, json={"class_instance_id": target["id"]}, timeout=30)
        assert r.status_code in (200, 201, 400, 409), r.text[:300]
        if r.status_code in (200, 201):
            bid = r.json().get("id") or r.json().get("booking", {}).get("id")
            if bid:
                requests.patch(f"{BASE}/bookings/{bid}/cancel", headers=student_h, timeout=30)
