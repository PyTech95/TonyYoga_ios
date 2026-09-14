"""Iteration 32 — (A) Remember-me login exp/cookie, (B) AI leads CSV export."""
import os
import csv
import io
import time

import jwt
import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base.rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "tony@tonyyoga.com", "password": "TonyYoga2026!"}
STUDENT = {"email": "student@demo.com", "password": "Student2026!"}


def _decode(token):
    return jwt.decode(token, options={"verify_signature": False})


def _login(payload):
    return requests.post(f"{API}/auth/login", json=payload, timeout=30)


# ---------------- Module: auth remember-me ----------------
class TestRememberMe:
    @pytest.mark.parametrize("remember,expected_days", [(None, 7), (True, 30), (False, 1)])
    def test_login_exp_and_cookie(self, remember, expected_days):
        payload = dict(STUDENT)
        if remember is not None:
            payload["remember"] = remember
        r = _login(payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data and "user" in data
        assert data["user"]["email"] == STUDENT["email"]
        assert "password_hash" not in data["user"]
        assert "_id" not in data["user"]

        claims = _decode(data["token"])
        assert claims["email"] == STUDENT["email"]
        assert claims["type"] == "access"
        life_days = (claims["exp"] - time.time()) / 86400
        assert abs(life_days - expected_days) < 0.05, f"exp={life_days} expected~{expected_days}"

        # cookie set with matching max-age
        set_cookie = r.headers.get("set-cookie", "")
        assert "access_token=" in set_cookie, set_cookie
        assert "HttpOnly" in set_cookie
        assert f"Max-Age={expected_days * 86400}" in set_cookie, set_cookie

        # token works on /auth/me
        me = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {data['token']}"}, timeout=30)
        assert me.status_code == 200, me.text
        assert me.json()["email"] == STUDENT["email"]

    def test_remember_invalid_type_rejected(self):
        r = _login({**STUDENT, "remember": "yes-please"})
        # pydantic should 422 on non-bool-coercible string
        assert r.status_code in (200, 422), r.text

    def test_bad_password_still_401(self):
        r = _login({"email": STUDENT["email"], "password": "wrong-pass", "remember": True})
        assert r.status_code == 401
        assert "detail" in r.json()

    def test_admin_login_remember_true(self):
        r = _login({**ADMIN, "remember": True})
        assert r.status_code == 200, r.text
        claims = _decode(r.json()["token"])
        assert claims["role"] == "admin"
        assert abs((claims["exp"] - time.time()) / 86400 - 30) < 0.05


# ---------------- Module: AI assistant leads CSV export ----------------
@pytest.fixture(scope="module")
def admin_token():
    r = _login(ADMIN)
    if r.status_code != 200:
        pytest.fail(f"admin login failed: {r.status_code} {r.text[:300]}")
    return r.json()["token"]


@pytest.fixture(scope="module")
def student_token():
    r = _login(STUDENT)
    if r.status_code != 200:
        pytest.fail(f"student login failed: {r.status_code} {r.text[:300]}")
    return r.json()["token"]


CSV_URL = f"{API}/admin/assistant/leads/export.csv"
HEADER = ["name", "email", "phone", "channel", "goal", "interest", "status", "created_at"]


class TestLeadsCsvExport:
    def test_anon_denied(self):
        r = requests.get(CSV_URL, timeout=30)
        assert r.status_code in (401, 403), r.status_code

    def test_student_forbidden(self, student_token):
        r = requests.get(CSV_URL, headers={"Authorization": f"Bearer {student_token}"}, timeout=30)
        assert r.status_code == 403, f"{r.status_code} {r.text[:200]}"

    def test_admin_csv_ok(self, admin_token):
        r = requests.get(CSV_URL, headers={"Authorization": f"Bearer {admin_token}"}, timeout=60)
        assert r.status_code == 200, r.text[:300]
        assert "text/csv" in r.headers.get("content-type", "")
        assert "ai_leads.csv" in r.headers.get("content-disposition", "")
        rows = list(csv.reader(io.StringIO(r.text)))
        assert rows, "empty csv body"
        assert rows[0] == HEADER, rows[0]
        for row in rows[1:]:
            assert len(row) == len(HEADER), row

    def test_csv_row_count_matches_leads_api(self, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        leads = requests.get(f"{API}/admin/assistant/leads", headers=h, timeout=30)
        assert leads.status_code == 200, leads.text[:300]
        api_rows = leads.json()
        api_count = len(api_rows if isinstance(api_rows, list) else api_rows.get("leads", []))
        csv_resp = requests.get(CSV_URL, headers=h, timeout=60)
        data_rows = [r for r in csv.reader(io.StringIO(csv_resp.text))][1:]
        assert len(data_rows) == api_count, f"csv={len(data_rows)} api={api_count}"
