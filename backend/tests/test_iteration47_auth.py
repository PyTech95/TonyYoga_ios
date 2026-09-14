"""Iteration 47e — auth playbook compliance checks."""
import os
import re
import time
from pathlib import Path

import requests
from dotenv import dotenv_values
from pymongo import MongoClient

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"]).rstrip("/")
API = f"{BASE_URL}/api"
benv = dotenv_values("/app/backend/.env")


def test_bcrypt_hash_format():
    cli = MongoClient(benv["MONGO_URL"])
    db = cli[benv["DB_NAME"]]
    u = db.users.find_one({"email": "tony@tonyyoga.com"})
    assert u, "admin user missing"
    h = u.get("password_hash") or ""
    assert h.startswith("$2b$"), f"unexpected hash prefix: {h[:6]}"
    assert not any(k in benv for k in ("ADMIN_PASSWORD_HASH",)), "hash stored in .env"


def test_login_sets_httponly_cookie_and_token():
    c = Path("/app/memory/test_credentials.md").read_text()
    b = c.split("## Admin")[1]
    r = requests.post(f"{API}/auth/login", json={
        "email": re.search(r"Email:\s*(\S+)", b).group(1),
        "password": re.search(r"Password:\s*(\S+)", b).group(1)}, timeout=30)
    assert r.status_code == 200, r.text[:200]
    assert r.json().get("token")
    raw = r.headers.get("set-cookie", "")
    print("set-cookie:", raw[:200])
    assert raw, "no cookie set on login"
    assert "httponly" in raw.lower(), f"cookie not HttpOnly: {raw[:200]}"


def test_cors_allows_credentials_with_explicit_origin():
    r = requests.options(f"{API}/auth/login", headers={
        "Origin": BASE_URL,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
    }, timeout=30)
    h = {k.lower(): v for k, v in r.headers.items()}
    print("CORS headers:", {k: v for k, v in h.items() if k.startswith("access-control")})
    assert h.get("access-control-allow-credentials") == "true", h
    assert h.get("access-control-allow-origin") == BASE_URL, h.get("access-control-allow-origin")


def test_brute_force_lockout():
    email = f"locktest_{int(time.time())}@example.com"
    codes = []
    for _ in range(7):
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": "wrong-pass-1"}, timeout=30)
        codes.append(r.status_code)
        if r.status_code == 429:
            break
    print("lockout status sequence:", codes)
    assert 429 in codes, f"no lockout after repeated failures: {codes}"
