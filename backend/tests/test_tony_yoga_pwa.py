"""Backend API tests for Tony Yoga PWA - iteration 1."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://web-app-hub-56.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "tony@tonyyoga.com", "password": "TonyYoga2026!"}
STUDENT = {"email": "student@demo.com", "password": "Student2026!"}


@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def student_token(client):
    r = client.post(f"{API}/auth/login", json=STUDENT)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_token(client):
    r = client.post(f"{API}/auth/login", json=ADMIN)
    assert r.status_code == 200, r.text
    return r.json()["token"]


# ---------- Health ----------
def test_health(client):
    r = client.get(f"{API}/health")
    assert r.status_code == 200
    d = r.json()
    assert d["ok"] is True
    assert d["seed_ran"] is True
    assert d["count_programs"] >= 3
    assert d["count_membership_plans"] >= 3
    assert d["count_workshops"] >= 4
    assert d["count_class_templates"] >= 1
    assert d["count_class_instances"] >= 1
    assert d["count_products"] >= 4


# ---------- Auth ----------
def test_register_new_user(client):
    email = f"TEST_{uuid.uuid4().hex[:10]}@example.com"
    r = client.post(f"{API}/auth/register", json={"email": email, "password": "Passw0rd!", "name": "Test User"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert "token" in d and "user" in d
    assert d["user"]["email"].lower() == email.lower()
    # Use token
    me = client.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {d['token']}"})
    assert me.status_code == 200
    assert me.json()["email"].lower() == email.lower()


def test_login_student(client, student_token):
    assert student_token


def test_login_admin(client):
    r = client.post(f"{API}/auth/login", json=ADMIN)
    assert r.status_code == 200
    d = r.json()
    assert d["user"].get("role") == "admin"


def test_auth_me(client):
    r0 = client.post(f"{API}/auth/login", json=STUDENT)
    tok = r0.json()["token"]
    r = client.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 200
    assert r.json()["email"] == STUDENT["email"]


def test_auth_logout(client, student_token):
    r = client.post(f"{API}/auth/logout", headers={"Authorization": f"Bearer {student_token}"})
    assert r.status_code == 200
    assert r.json().get("ok") is True


# ---------- Programs ----------
def test_programs_list(client):
    r = client.get(f"{API}/programs")
    assert r.status_code == 200
    programs = r.json()
    assert len(programs) >= 3
    titles = " ".join(p.get("title", "") for p in programs)
    assert "Core" in titles
    for p in programs:
        assert "cover_image" in p or "coverImage" in p
        assert "price" in p or "price_eur" in p


def test_program_detail(client):
    r = client.get(f"{API}/programs")
    pid = r.json()[0]["id"]
    r2 = client.get(f"{API}/programs/{pid}")
    assert r2.status_code == 200
    d = r2.json()
    assert "lessons" in d
    assert len(d["lessons"]) > 0
    # First lesson should be unlocked (free preview)
    assert d["lessons"][0].get("is_unlocked") is True


# ---------- Class instances / bookings ----------
def test_class_instances_upcoming(client):
    r = client.get(f"{API}/class-instances", params={"upcoming": "true"})
    assert r.status_code == 200
    items = r.json()
    assert len(items) >= 1
    assert "instructor_name" in items[0] or "instructor" in items[0]


def test_class_instance_detail(client):
    items = client.get(f"{API}/class-instances", params={"upcoming": "true"}).json()
    cid = items[0]["id"]
    r = client.get(f"{API}/class-instances/{cid}")
    assert r.status_code == 200


def test_booking_flow(client, student_token):
    h = {"Authorization": f"Bearer {student_token}"}
    items = client.get(f"{API}/class-instances", params={"upcoming": "true"}).json()
    cid = items[0]["id"]
    # Try to cancel any existing booking first
    mine = client.get(f"{API}/bookings/mine", headers=h)
    if mine.status_code == 200:
        for b in mine.json():
            if b.get("class_instance_id") == cid:
                client.delete(f"{API}/bookings/{b['id']}", headers=h)
    r = client.post(f"{API}/bookings", json={"class_instance_id": cid}, headers=h)
    assert r.status_code in (200, 201), r.text
    booking = r.json()
    assert booking.get("status") == "confirmed"
    booking_id = booking["id"]

    # Duplicate booking -> 400
    r2 = client.post(f"{API}/bookings", json={"class_instance_id": cid}, headers=h)
    assert r2.status_code == 400

    # Appears in mine
    r3 = client.get(f"{API}/bookings/mine", headers=h)
    assert r3.status_code == 200
    assert any(b["id"] == booking_id for b in r3.json())

    # Cancel
    r4 = client.delete(f"{API}/bookings/{booking_id}", headers=h)
    assert r4.status_code in (200, 204)


# ---------- Videos ----------
def test_videos_list(client):
    r = client.get(f"{API}/videos")
    assert r.status_code == 200
    videos = r.json()
    assert len(videos) >= 1


def test_video_detail_free_and_locked(client):
    videos = client.get(f"{API}/videos").json()
    free = next((v for v in videos if v.get("visibility") == "free"), None)
    locked = next((v for v in videos if v.get("visibility") in ("program", "members")), None)
    if free:
        r = client.get(f"{API}/videos/{free['id']}")
        assert r.status_code == 200
        d = r.json()
        assert d.get("is_unlocked") is True
        assert d.get("video_url")
    if locked:
        r = client.get(f"{API}/videos/{locked['id']}")
        assert r.status_code == 200
        d = r.json()
        assert d.get("is_unlocked") is False
        assert not d.get("video_url")


# ---------- Membership plans ----------
def test_membership_plans(client):
    r = client.get(f"{API}/membership-plans")
    assert r.status_code == 200
    plans = r.json()
    assert len(plans) >= 3


# ---------- Products ----------
def test_products_list_and_detail(client):
    r = client.get(f"{API}/products")
    assert r.status_code == 200
    products = r.json()
    assert len(products) >= 4
    pid = products[0]["id"]
    r2 = client.get(f"{API}/products/{pid}")
    assert r2.status_code == 200


# ---------- Workshops ----------
def test_workshops(client):
    r = client.get(f"{API}/workshops")
    assert r.status_code == 200
    ws = r.json()
    assert len(ws) >= 4
    for w in ws:
        assert w.get("cover_image") or w.get("coverImage")
        assert w.get("price_eur") is not None or w.get("price") is not None
        assert w.get("location") is not None


# ---------- News ----------
def test_news(client):
    r = client.get(f"{API}/news")
    assert r.status_code == 200
    posts = r.json()
    assert len(posts) >= 1
    for p in posts:
        assert p.get("is_published") is True


# ---------- PWA assets ----------
def test_pwa_manifest():
    r = requests.get(f"{BASE_URL}/manifest.json")
    assert r.status_code == 200
    d = r.json()
    assert "Tony Yoga" in d.get("name", "")
    assert d.get("theme_color", "").lower() == "#b25a45"
    assert d.get("display") == "standalone"


def test_pwa_sw_and_offline():
    r = requests.get(f"{BASE_URL}/sw.js")
    assert r.status_code == 200
    r2 = requests.get(f"{BASE_URL}/offline.html")
    assert r2.status_code == 200
