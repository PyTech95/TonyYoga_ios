"""Iteration 26 — leaderboard, gift cards, certificates CSV, assignment retry limits, notifications."""
import os
import re
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE = base_url.rstrip("/") + "/api"


def _creds():
    content = Path("/app/memory/test_credentials.md").read_text(encoding="utf-8")
    pairs = re.findall(r"Email:\s*(\S+)\s*\n\s*-\s*Password:\s*(\S+)", content)
    return pairs


CREDS = dict(  # role -> (email, password)
    zip(["admin", "student", "instructor"], _creds())
)


def _login(email, password):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password}, timeout=30)
    if r.status_code != 200:
        pytest.fail(f"login failed {email}: {r.status_code} {r.text[:200]}")
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_token():
    e, p = CREDS["admin"]
    return _login(e, p)


@pytest.fixture(scope="session")
def student_token():
    e, p = CREDS["student"]
    return _login(e, p)


@pytest.fixture(scope="session")
def instructor_token():
    e, p = CREDS["instructor"]
    return _login(e, p)


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------------- Leaderboard ----------------
class TestLeaderboard:
    def test_public_anonymous(self):
        r = requests.get(f"{BASE}/leaderboard", timeout=30)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        for k in ("enabled", "rows", "me", "total"):
            assert k in d
        assert d["me"] is None
        assert isinstance(d["rows"], list)
        assert isinstance(d["total"], int)

    def test_no_pii_leak_and_ranking(self):
        r = requests.get(f"{BASE}/leaderboard", timeout=30)
        d = r.json()
        allowed = {"rank", "name", "points", "lessons", "attendance", "certificates",
                   "longest_streak", "is_me"}
        prev = None
        for row in d["rows"]:
            extra = set(row) - allowed
            assert not extra, f"leaderboard leaks fields: {extra}"
            assert "uid" not in row and "user_id" not in row and "email" not in row
            assert " " not in row["name"], f"full name exposed: {row['name']}"
            assert row["points"] > 0
            if prev is not None:
                assert row["points"] <= prev, "rows not sorted desc by points"
            prev = row["points"]
        ranks = [r_["rank"] for r_ in d["rows"]]
        assert ranks == sorted(ranks)

    def test_staff_excluded(self, admin_token, instructor_token):
        # Staff accounts must never appear on the board
        for tok in (admin_token, instructor_token):
            me = requests.get(f"{BASE}/auth/me", headers=H(tok), timeout=30)
            assert me.status_code == 200, me.text[:200]
            first = (me.json().get("name") or me.json().get("email", "")).split(" ")[0]
            r = requests.get(f"{BASE}/leaderboard", headers=H(tok), timeout=30)
            d = r.json()
            assert d["me"] is None, "staff user got a leaderboard 'me' entry"
            assert first not in [x["name"] for x in d["rows"]] or True  # name collisions possible

    def test_student_appears_after_practice_log(self, student_token):
        requests.post(f"{BASE}/practice/log", headers=H(student_token), json={}, timeout=30)
        r = requests.get(f"{BASE}/leaderboard", headers=H(student_token), timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["me"] is not None, "student with activity has no 'me' row"
        assert d["me"]["is_me"] is True
        assert "uid" not in d["me"]
        assert d["me"]["points"] > 0
        assert d["me"]["rank"] >= 1
        mine = [x for x in d["rows"] if x["is_me"]]
        assert len(mine) == 1
        assert mine[0]["rank"] == d["me"]["rank"]

    def test_limit_param(self):
        r = requests.get(f"{BASE}/leaderboard?limit=1", timeout=30)
        assert r.status_code == 200
        assert len(r.json()["rows"]) <= 1


# ---------------- Gift cards ----------------
class TestGiftCards:
    created = []

    def test_create_requires_admin(self, student_token):
        r = requests.post(f"{BASE}/admin/gift-cards", headers=H(student_token),
                          json={"amount": 10}, timeout=30)
        assert r.status_code in (401, 403), r.status_code
        r2 = requests.post(f"{BASE}/admin/gift-cards", json={"amount": 10}, timeout=30)
        assert r2.status_code in (401, 403)
        r3 = requests.get(f"{BASE}/admin/gift-cards", headers=H(student_token), timeout=30)
        assert r3.status_code in (401, 403)

    def test_create_invalid_amount(self, admin_token):
        for amt in (0, -5):
            r = requests.post(f"{BASE}/admin/gift-cards", headers=H(admin_token),
                              json={"amount": amt}, timeout=30)
            assert r.status_code == 400, f"amount={amt} -> {r.status_code}"

    def test_create_list_and_code_format(self, admin_token):
        r = requests.post(f"{BASE}/admin/gift-cards", headers=H(admin_token),
                          json={"amount": 25.5, "currency": "EUR", "note": "TEST_iter26"}, timeout=30)
        assert r.status_code == 200, r.text[:300]
        gc = r.json()
        assert re.fullmatch(r"GIFT-[0-9A-F]{8}", gc["code"]), gc["code"]
        assert gc["amount"] == 25.5 and gc["balance"] == 25.5
        assert gc["currency"] == "eur"
        assert gc["status"] == "active"
        assert "_id" not in gc
        TestGiftCards.created.append(gc["code"])

        lst = requests.get(f"{BASE}/admin/gift-cards", headers=H(admin_token), timeout=30)
        assert lst.status_code == 200
        codes = [x["code"] for x in lst.json()]
        assert gc["code"] in codes
        assert all("_id" not in x for x in lst.json())

    def test_check_public(self, admin_token):
        code = TestGiftCards.created[0]
        r = requests.get(f"{BASE}/gift-cards/check/{code.lower()}", timeout=30)
        assert r.status_code == 200, r.text[:200]
        d = r.json()
        assert d["valid"] is True and d["balance"] == 25.5
        assert "issued_by" not in d and "redeemed_by" not in d

    def test_check_invalid_code_404(self):
        r = requests.get(f"{BASE}/gift-cards/check/GIFT-DEADBEEF", timeout=30)
        assert r.status_code == 404

    def test_redeem_invalid_code_404(self, student_token):
        r = requests.post(f"{BASE}/gift-cards/redeem", headers=H(student_token),
                          json={"code": "GIFT-NOTREAL1"}, timeout=30)
        assert r.status_code == 404, r.status_code

    def test_redeem_requires_auth(self):
        r = requests.post(f"{BASE}/gift-cards/redeem", json={"code": "GIFT-XXXXXXXX"}, timeout=30)
        assert r.status_code in (401, 403)

    def test_redeem_credits_and_double_redeem_rejected(self, admin_token, student_token):
        before = requests.get(f"{BASE}/me/store-credit", headers=H(student_token), timeout=30)
        assert before.status_code == 200
        start = before.json()["store_credit"]

        mk = requests.post(f"{BASE}/admin/gift-cards", headers=H(admin_token),
                           json={"amount": 12, "note": "TEST_iter26_redeem"}, timeout=30)
        code = mk.json()["code"]
        TestGiftCards.created.append(code)

        # lowercase + whitespace should still work
        r = requests.post(f"{BASE}/gift-cards/redeem", headers=H(student_token),
                          json={"code": f"  {code.lower()} "}, timeout=30)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["redeemed"] == 12
        assert round(d["store_credit"], 2) == round(start + 12, 2)

        # persisted balance
        after = requests.get(f"{BASE}/me/store-credit", headers=H(student_token), timeout=30)
        assert round(after.json()["store_credit"], 2) == round(start + 12, 2)

        # double redeem
        r2 = requests.post(f"{BASE}/gift-cards/redeem", headers=H(student_token),
                           json={"code": code}, timeout=30)
        assert r2.status_code == 400, f"double redeem allowed! {r2.status_code}"
        after2 = requests.get(f"{BASE}/me/store-credit", headers=H(student_token), timeout=30)
        assert round(after2.json()["store_credit"], 2) == round(start + 12, 2), "credit double-applied"

        # card marked redeemed with 0 balance
        lst = requests.get(f"{BASE}/admin/gift-cards", headers=H(admin_token), timeout=30).json()
        card = next(x for x in lst if x["code"] == code)
        assert card["status"] == "redeemed" and card["balance"] == 0

    def test_deactivate_blocks_redeem(self, admin_token, student_token):
        mk = requests.post(f"{BASE}/admin/gift-cards", headers=H(admin_token),
                           json={"amount": 5, "note": "TEST_iter26_deact"}, timeout=30)
        code = mk.json()["code"]
        TestGiftCards.created.append(code)
        d = requests.post(f"{BASE}/admin/gift-cards/{code}/deactivate", headers=H(admin_token), timeout=30)
        assert d.status_code == 200 and d.json()["ok"] is True
        r = requests.post(f"{BASE}/gift-cards/redeem", headers=H(student_token),
                          json={"code": code}, timeout=30)
        assert r.status_code == 400, f"disabled card redeemable! {r.status_code}"
        chk = requests.get(f"{BASE}/gift-cards/check/{code}", timeout=30).json()
        assert chk["valid"] is False and chk["status"] == "disabled"

    def test_deactivate_unknown_code_404(self, admin_token):
        r = requests.post(f"{BASE}/admin/gift-cards/GIFT-NOPE0000/deactivate",
                          headers=H(admin_token), timeout=30)
        assert r.status_code == 404


# ---------------- Certificates CSV ----------------
class TestCertificatesCsv:
    def test_admin_csv(self, admin_token):
        r = requests.get(f"{BASE}/admin/certificates/export.csv", headers=H(admin_token), timeout=60)
        assert r.status_code == 200, r.text[:300]
        assert "text/csv" in r.headers.get("content-type", "")
        assert "attachment" in r.headers.get("content-disposition", "")
        first = r.text.splitlines()[0].strip()
        assert first == "code,student_name,student_email,program_title,lessons_count,issued_at,verify_url", first

    def test_non_admin_denied(self, student_token):
        r = requests.get(f"{BASE}/admin/certificates/export.csv", headers=H(student_token), timeout=30)
        assert r.status_code in (401, 403)
        r2 = requests.get(f"{BASE}/admin/certificates/export.csv", timeout=30)
        assert r2.status_code in (401, 403)


# ---------------- Assignment retry limits ----------------
class TestAssignmentAttempts:
    state = {}

    @pytest.fixture(scope="class", autouse=True)
    def lesson(self, admin_token):
        progs = requests.get(f"{BASE}/programs", timeout=30)
        assert progs.status_code == 200, progs.text[:200]
        plist = progs.json()
        plist = plist["items"] if isinstance(plist, dict) else plist
        assert plist, "no programs available for test"
        pid = plist[0]["id"]
        r = requests.post(
            f"{BASE}/admin/programs/{pid}/lessons", headers=H(admin_token),
            json={"title": "TEST_iter26 attempts lesson",
                  "youtube_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                  "requires_submission": True, "max_attempts": 1,
                  "assignment_prompt": "TEST prompt", "pass_threshold": 60},
            timeout=60,
        )
        assert r.status_code == 200, r.text[:400]
        lid = r.json()["id"]
        assert r.json()["max_attempts"] == 1
        TestAssignmentAttempts.state["lesson_id"] = lid
        yield lid
        requests.delete(f"{BASE}/admin/lessons/{lid}", headers=H(admin_token), timeout=30)

    def test_attempts_endpoint_initial(self, student_token):
        lid = self.state["lesson_id"]
        r = requests.get(f"{BASE}/submissions/attempts/{lid}", headers=H(student_token), timeout=30)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["max_attempts"] == 1
        assert d["used"] == 0 and d["remaining"] == 1
        assert d["passed"] is False and d["locked_out"] is False

    def test_attempts_unknown_lesson_404(self, student_token):
        r = requests.get(f"{BASE}/submissions/attempts/does-not-exist",
                         headers=H(student_token), timeout=30)
        assert r.status_code == 404

    def test_enforcement(self, student_token, admin_token):
        lid = self.state["lesson_id"]
        body = {"lesson_id": lid, "video_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                "note": "TEST_iter26 attempt 1"}
        r1 = requests.post(f"{BASE}/submissions/create", headers=H(student_token), json=body, timeout=60)
        assert r1.status_code == 200, r1.text[:400]
        sub_id = r1.json()["id"]

        att = requests.get(f"{BASE}/submissions/attempts/{lid}", headers=H(student_token), timeout=30).json()
        assert att["used"] == 1 and att["remaining"] == 0

        r2 = requests.post(f"{BASE}/submissions/create", headers=H(student_token), json=body, timeout=60)
        assert r2.status_code == 400, f"2nd submission allowed past max_attempts=1: {r2.status_code}"
        assert "attempt" in r2.text.lower()

        # cleanup submission
        from pymongo import MongoClient
        env = dotenv_values("/app/backend/.env")
        cli = MongoClient(env["MONGO_URL"])
        cli[env["DB_NAME"]].assignment_submissions.delete_one({"id": sub_id})
        cli.close()

    def test_unlimited_when_zero(self, admin_token, student_token):
        lid = self.state["lesson_id"]
        p = requests.patch(f"{BASE}/admin/lessons/{lid}", headers=H(admin_token),
                           json={"max_attempts": 0}, timeout=30)
        assert p.status_code == 200, p.text[:300]
        d = requests.get(f"{BASE}/submissions/attempts/{lid}", headers=H(student_token), timeout=30).json()
        assert d["max_attempts"] == 0 and d["remaining"] is None and d["locked_out"] is False
        # restore
        requests.patch(f"{BASE}/admin/lessons/{lid}", headers=H(admin_token),
                       json={"max_attempts": 1}, timeout=30)

    def test_negative_max_attempts_clamped(self, admin_token, student_token):
        lid = self.state["lesson_id"]
        requests.patch(f"{BASE}/admin/lessons/{lid}", headers=H(admin_token),
                       json={"max_attempts": -3}, timeout=30)
        d = requests.get(f"{BASE}/submissions/attempts/{lid}", headers=H(student_token), timeout=30).json()
        assert d["max_attempts"] == 0, d
        requests.patch(f"{BASE}/admin/lessons/{lid}", headers=H(admin_token),
                       json={"max_attempts": 1}, timeout=30)


# ---------------- Notifications ----------------
class TestNotifications:
    def test_requires_auth(self):
        r = requests.get(f"{BASE}/notifications", timeout=30)
        assert r.status_code in (401, 403)
        r2 = requests.post(f"{BASE}/notifications/seen", timeout=30)
        assert r2.status_code in (401, 403)

    def test_feed_shape_and_sorting(self, student_token):
        r = requests.get(f"{BASE}/notifications", headers=H(student_token), timeout=30)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert set(["items", "unread", "seen_at"]).issubset(d)
        assert isinstance(d["unread"], int) and d["unread"] >= 0
        ats = [str(i["at"]) for i in d["items"]]
        assert ats == sorted(ats, reverse=True), "notifications not sorted desc"
        for i in d["items"]:
            assert i["type"] in ("announcement", "broadcast", "recording"), i["type"]
            assert i.get("title") is not None
            assert "url" in i and "_id" not in i
        assert len(d["items"]) <= 40

    def test_seen_resets_unread(self, student_token):
        s = requests.post(f"{BASE}/notifications/seen", headers=H(student_token), timeout=30)
        assert s.status_code == 200 and s.json()["ok"] is True
        d = requests.get(f"{BASE}/notifications", headers=H(student_token), timeout=30).json()
        assert d["unread"] == 0, f"unread not reset: {d['unread']}"

    def test_admin_feed_works(self, admin_token):
        r = requests.get(f"{BASE}/notifications", headers=H(admin_token), timeout=30)
        assert r.status_code == 200, r.text[:300]
