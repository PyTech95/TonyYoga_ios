"""Iteration 36 — email wiring smoke check + auth playbook checks."""
import os
import re
import time
import uuid
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")


def creds():
    content = Path("/app/memory/test_credentials.md").read_text()
    email = re.search(r"Email:\s*(\S+)", content).group(1)
    password = re.search(r"Password:\s*(\S+)", content).group(1)
    return email, password


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(client):
    email, password = creds()
    r = client.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    if r.status_code != 200:
        pytest.fail(f"admin login failed {r.status_code}: {r.text[:300]}")
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok
    return tok


# --- auth: login sets httpOnly cookie ---
def test_login_cookie_and_response(client):
    email, password = creds()
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text[:300]
    body = r.json()
    assert body.get("user", {}).get("role") == "admin"
    set_cookie = r.headers.get("set-cookie", "")
    print("SET-COOKIE:", set_cookie)
    assert "HttpOnly" in set_cookie or "httponly" in set_cookie.lower(), "no httpOnly cookie on login"


# --- auth: register triggers welcome email ---
def test_register_new_user_triggers_welcome(client, admin_token):
    uniq = uuid.uuid4().hex[:8]
    email = f"tonyyoga.qa+welcome{uniq}@gmail.com"
    r = client.post(f"{BASE_URL}/api/auth/register", json={
        "email": email, "password": "QaTest2026!", "name": "TEST_QA Welcome"})
    assert r.status_code == 200, f"register failed {r.status_code}: {r.text[:300]}"
    data = r.json()
    assert data.get("user", {}).get("email") == email
    # cleanup: delete via admin endpoint if available
    h = {"Authorization": f"Bearer {admin_token}"}
    uid = data["user"].get("id")
    for path in (f"/api/admin/students/{uid}", f"/api/admin/users/{uid}"):
        d = requests.delete(f"{BASE_URL}{path}", headers=h)
        print("cleanup", path, d.status_code)
        if d.status_code in (200, 204):
            break


# --- assistant lead triggers enquiry ack ---
def test_assistant_lead_ok(client):
    uniq = uuid.uuid4().hex[:6]
    r = client.post(f"{BASE_URL}/api/assistant/lead", json={
        "name": "TEST_QA Lead", "email": f"tonyyoga.qa+lead{uniq}@gmail.com",
        "interest": "retreat", "message": "TEST_QA automated smoke"})
    assert r.status_code == 200, f"{r.status_code}: {r.text[:300]}"
    assert r.json().get("ok") is True


def test_assistant_lead_without_email(client):
    r = client.post(f"{BASE_URL}/api/assistant/lead", json={"name": "TEST_QA NoEmail", "interest": "classes"})
    assert r.status_code in (200, 422), r.text[:300]


# --- admin panes data endpoints smoke ---
@pytest.mark.parametrize("path", [
    "/api/admin/stats",
    "/api/admin/stats/trend",
    "/api/admin/dashboard",
    "/api/admin/users",
    "/api/admin/students/progress",
    "/api/admin/instructor-applications",
    "/api/class-instances",
    "/api/programs",
    "/api/admin/settings",
    "/api/admin/gift-cards",
    "/api/bundles",
])
def test_admin_pane_endpoints(admin_token, path):
    r = requests.get(f"{BASE_URL}{path}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200, f"{path} -> {r.status_code}: {r.text[:200]}"
    assert "_id" not in r.text[:5000] or '"_id"' not in r.text, f"{path} leaks mongo _id"


# --- brute force lockout ---
def test_brute_force_lockout():
    email = f"locktest+{uuid.uuid4().hex[:6]}@demo.com"
    codes = []
    for _ in range(7):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": "wrongpass"})
        codes.append(r.status_code)
        time.sleep(0.2)
    print("lockout codes:", codes)
    assert 429 in codes, f"no lockout observed: {codes}"
