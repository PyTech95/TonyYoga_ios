"""Iteration 2 delta tests: Stripe checkout, workshops, news, private sessions, admin, instructor earnings."""
import os
import pytest
import requests

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if os.environ.get("EXPO_PUBLIC_BACKEND_URL") else "https://app-deploy-184.preview.emergentagent.com"
ORIGIN = "https://app-deploy-184.preview.emergentagent.com"


@pytest.fixture(scope="module")
def student_headers():
    r = requests.post(f"{BASE}/api/auth/login", json={"email": "student@demo.com", "password": "Student2026!"}, timeout=15)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="module")
def admin_headers():
    r = requests.post(f"{BASE}/api/auth/login", json={"email": "tony@tonyyoga.com", "password": "TonyYoga2026!"}, timeout=15)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


# --- Stripe checkout ---
class TestCheckout:
    def test_checkout_membership(self, student_headers):
        plans = requests.get(f"{BASE}/api/membership-plans", timeout=15).json()
        assert isinstance(plans, list) and len(plans) >= 1, plans
        plan_id = plans[0]["id"]
        r = requests.post(
            f"{BASE}/api/checkout/session",
            json={"item_type": "membership", "item_id": plan_id, "quantity": 1, "origin_url": ORIGIN},
            headers=student_headers, timeout=20,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["url"].startswith("https://checkout.stripe.com"), data["url"]
        assert "session_id" in data
        TestCheckout.session_id = data["session_id"]

    def test_checkout_program(self, student_headers):
        progs = requests.get(f"{BASE}/api/programs", timeout=15).json()
        assert len(progs) >= 1
        r = requests.post(
            f"{BASE}/api/checkout/session",
            json={"item_type": "program", "item_id": progs[0]["id"], "quantity": 1, "origin_url": ORIGIN},
            headers=student_headers, timeout=20,
        )
        assert r.status_code == 200, r.text
        assert r.json()["url"].startswith("https://checkout.stripe.com")

    def test_checkout_product(self, student_headers):
        prods = requests.get(f"{BASE}/api/products", timeout=15).json()
        if not prods:
            pytest.skip("no products seeded")
        r = requests.post(
            f"{BASE}/api/checkout/session",
            json={"item_type": "product", "item_id": prods[0]["id"], "quantity": 1, "origin_url": ORIGIN},
            headers=student_headers, timeout=20,
        )
        assert r.status_code == 200, r.text
        assert r.json()["url"].startswith("https://checkout.stripe.com")

    def test_checkout_status(self, student_headers):
        sid = getattr(TestCheckout, "session_id", None)
        if not sid:
            pytest.skip("no session created")
        r = requests.get(f"{BASE}/api/checkout/status/{sid}", headers=student_headers, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "status" in d and "payment_status" in d


# --- Workshops ---
class TestWorkshops:
    def test_list(self):
        r = requests.get(f"{BASE}/api/workshops", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) >= 4, f"expected >=4 workshops, got {len(data)}"


# --- News ---
class TestNews:
    def test_list(self):
        r = requests.get(f"{BASE}/api/news", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) >= 3

    def test_detail_by_slug(self):
        r = requests.get(f"{BASE}/api/news/welcome-to-tony-yoga", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("slug") == "welcome-to-tony-yoga"
        assert "title" in d and "body" in d


# --- Private sessions ---
class TestPrivateSessions:
    def test_request(self, student_headers):
        payload = {
            "instructor_id": "tony",
            "session_type": "online",
            "duration_minutes": 60,
            "focus_area": "lower back",
            "notes": "none",
            "preferred_time": "2026-05-01T18:00:00Z",
        }
        r = requests.post(f"{BASE}/api/private-sessions/request", json=payload, headers=student_headers, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("focus_area") == "lower back"
        assert "id" in d


# --- Admin ---
class TestAdmin:
    def test_stats(self, admin_headers):
        r = requests.get(f"{BASE}/api/admin/stats", headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("users", "students", "instructors", "bookings", "active_subscriptions", "revenue", "transactions"):
            assert k in d, f"missing key {k}"
        assert d["users"] >= 2

    def test_instructor_applications(self, admin_headers):
        r = requests.get(f"{BASE}/api/admin/instructor-applications", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_announcement(self, admin_headers):
        r = requests.post(
            f"{BASE}/api/admin/announcements",
            json={"title": "TEST_announcement", "body": "TEST_body", "audience": "all"},
            headers=admin_headers, timeout=15,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert "id" in d and d.get("title") == "TEST_announcement"

    def test_instructor_earnings_as_admin(self, admin_headers):
        r = requests.get(f"{BASE}/api/instructor/earnings", headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "rules" in d and "total_earnings" in d and "breakdown" in d


# --- PWA assets ---
class TestPWA:
    def test_manifest(self):
        r = requests.get(f"{ORIGIN}/manifest.json", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["name"] == "Tony Yoga"
        assert d["theme_color"] == "#B25A45"

    def test_sw(self):
        r = requests.get(f"{ORIGIN}/sw.js", timeout=15)
        assert r.status_code == 200
        assert "tony-yoga-v1" in r.text

    def test_html_meta(self):
        # NOTE: +html.tsx only applies to static exports. Dev server serves default HTML.
        # We assert manifest.json + sw.js are reachable instead (see test_manifest, test_sw).
        r = requests.get(f"{ORIGIN}/", timeout=20)
        assert r.status_code == 200
        # If static export is deployed, both should be present; skip otherwise.
        html = r.text
        if 'rel="manifest"' not in html:
            pytest.skip("Dev server does not render +html.tsx; PWA meta only appears in static export")
        assert '#B25A45' in html
