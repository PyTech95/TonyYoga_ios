"""
Deployment smoke tests for Tony Yoga.
Covers: health, public content endpoints, admin login, user register/login,
booking flow, Stripe checkout session creation.
"""
import os
import time
import uuid
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE:
    # Fallback: read from frontend/.env (tests may run without env exported)
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE = line.split("=", 1)[1].strip()
                break
BASE = BASE.rstrip("/")
API = f"{BASE}/api"

ADMIN_EMAIL = "tony@tonyyoga.com"
ADMIN_PASS = "TonyYoga2026!"


@pytest.fixture(scope="session")
def s():
    return requests.Session()


# --------- Health ---------
def test_health(s):
    r = s.get(f"{API}/health", timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("ok") is True
    assert d.get("db_connected") is True
    for k in ("count_users", "count_programs", "count_workshops", "count_products", "count_class_instances"):
        v = d.get(k)
        assert isinstance(v, int) and v > 0, f"{k}={v}"


# --------- Public content ---------
@pytest.mark.parametrize("path", [
    "/programs",
    "/class-instances",
    "/products",
    "/instructors",
    "/workshops",
])
def test_public_endpoints(s, path):
    r = s.get(f"{API}{path}", timeout=30)
    assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:200]}"
    data = r.json()
    assert isinstance(data, list)
    assert len(data) >= 0  # may be 0 for some, but test data expected


def test_retreats_endpoint_note(s):
    # There is no public GET /api/retreats collection endpoint in this codebase;
    # only /retreats/mine (auth) and /retreats/{id} exist. Confirm shape.
    r = s.get(f"{API}/retreats/mine", timeout=15)
    # unauthenticated -> 401/403
    assert r.status_code in (401, 403), r.status_code


# --------- Admin auth ---------
def test_admin_login(s):
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "token" in d and isinstance(d["token"], str) and len(d["token"]) > 20
    user = d.get("user") or {}
    assert user.get("role") == "admin", user


# --------- User register + login + booking + checkout ---------
@pytest.fixture(scope="module")
def user_creds():
    uid = uuid.uuid4().hex[:8]
    return {"email": f"TEST_user_{uid}@example.com", "password": "TestPass123!", "name": "Test User"}


@pytest.fixture(scope="module")
def user_token(user_creds):
    s = requests.Session()
    r = s.post(f"{API}/auth/register", json=user_creds, timeout=30)
    assert r.status_code in (200, 201), r.text
    # login
    r = s.post(f"{API}/auth/login", json={"email": user_creds["email"], "password": user_creds["password"]}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def test_register_and_login(user_token):
    assert isinstance(user_token, str) and len(user_token) > 20


def test_auth_me(user_token, user_creds):
    r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {user_token}"}, timeout=30)
    assert r.status_code == 200, r.text
    assert r.json().get("email", "").lower() == user_creds["email"].lower()


def _pick_bookable_instance():
    r = requests.get(f"{API}/class-instances", timeout=30)
    r.raise_for_status()
    now_iso = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime())
    for c in r.json():
        if c.get("start_time", "") > now_iso and (c.get("bookings_count", 0) < c.get("capacity", 0)):
            return c
    # fallback: any future
    for c in r.json():
        if c.get("start_time", "") > now_iso:
            return c
    return r.json()[0] if r.json() else None


def test_create_booking_and_list(user_token):
    inst = _pick_bookable_instance()
    assert inst, "No class instances found"
    r = requests.post(
        f"{API}/bookings",
        json={"class_instance_id": inst["id"]},
        headers={"Authorization": f"Bearer {user_token}"},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    b = r.json()
    assert b.get("class_instance_id") == inst["id"]
    assert b.get("status") in ("confirmed", "waitlist")

    r2 = requests.get(f"{API}/bookings/mine", headers={"Authorization": f"Bearer {user_token}"}, timeout=30)
    assert r2.status_code == 200
    ids = [x["id"] for x in r2.json()]
    assert b["id"] in ids


def test_stripe_checkout_session(user_token):
    # Need a product id
    prods = requests.get(f"{API}/products", timeout=30).json()
    assert prods, "No products seeded"
    product = prods[0]
    payload = {
        "item_type": "product",
        "item_id": product["id"],
        "quantity": 1,
        "origin_url": BASE,
    }
    r = requests.post(
        f"{API}/checkout/session",
        json=payload,
        headers={"Authorization": f"Bearer {user_token}"},
        timeout=60,
    )
    assert r.status_code == 200, f"checkout failed: {r.status_code} {r.text[:400]}"
    d = r.json()
    assert d.get("url", "").startswith("http"), d
    assert d.get("session_id")
