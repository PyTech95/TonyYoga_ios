"""Iteration 42 — Course page restructure: demo video, 'Core 26+' rename, locked library."""
import os
import re
import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")
API = f"{BASE_URL}/api"
CORE26 = "7585a2ef-01a1-4854-84f5-1eba68cfea66"
ADMIN = {"email": "tony@tonyyoga.com", "password": "TonyYoga2026!"}


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(client):
    r = client.post(f"{API}/auth/login", json=ADMIN)
    if r.status_code != 200:
        pytest.fail(f"Admin login failed {r.status_code}: {r.text[:300]}")
    tok = r.json().get("access_token") or r.json().get("token")
    if not tok:
        pytest.fail(f"No token in login response: {r.text[:300]}")
    return tok


# ---------- Anonymous course page payload ----------
class TestAnonProgram:
    def test_title_renamed(self, client):
        r = client.get(f"{API}/programs/{CORE26}")
        assert r.status_code == 200
        p = r.json()
        assert p["title"] == "Core 26+", f"title is {p['title']!r}"
        assert "_id" not in p

    def test_demo_video_present(self, client):
        p = client.get(f"{API}/programs/{CORE26}").json()
        demo = p.get("demo_video")
        assert demo is not None, "demo_video missing for anon"
        assert re.fullmatch(r"[\w-]{11}", demo["youtube_id"] or "")
        assert isinstance(demo.get("start_seconds"), int)

    def test_lesson_count_and_viewer_flags(self, client):
        p = client.get(f"{API}/programs/{CORE26}").json()
        assert len(p["lessons"]) == 26, len(p["lessons"])
        v = p["viewer"]
        assert v["is_authenticated"] is False
        assert v["is_staff"] is False
        assert v["owns_program"] is False

    def test_locked_lessons_have_no_video_url(self, client):
        p = client.get(f"{API}/programs/{CORE26}").json()
        for l in p["lessons"]:
            if not l.get("is_unlocked"):
                v = l.get("video") or {}
                assert "video_url" not in v and "youtube_id" not in v and "source_url" not in v, \
                    f"leak in lesson {l['id']}"

    def test_bundle_upsell_data_intact(self, client):
        p = client.get(f"{API}/programs/{CORE26}").json()
        assert isinstance(p.get("related_products"), list)
        assert p.get("bundle_discount_pct") is not None


# ---------- Staff (admin) view ----------
class TestStaffProgram:
    def test_staff_all_unlocked_and_demo(self, client, admin_token):
        r = client.get(f"{API}/programs/{CORE26}", headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        p = r.json()
        assert p["viewer"]["is_staff"] is True
        unlocked = [l for l in p["lessons"] if l.get("is_unlocked")]
        assert len(unlocked) == 26, f"{len(unlocked)}/26 unlocked for staff"
        assert p.get("demo_video") is not None


# ---------- All courses ----------
class TestAllCourses:
    def test_every_program_has_demo_video_and_lessons(self, client):
        progs = client.get(f"{API}/programs").json()
        assert len(progs) >= 2
        missing = []
        for pr in progs:
            d = client.get(f"{API}/programs/{pr['id']}").json()
            if d.get("lessons") and not d.get("demo_video"):
                missing.append(d["title"])
        assert not missing, f"programs with lessons but no demo_video: {missing}"

    def test_no_series_suffix(self, client):
        progs = client.get(f"{API}/programs").json()
        assert "Core 26+ Series" not in [p["title"] for p in progs]


# ---------- Admin demo_video_url field ----------
class TestAdminDemoField:
    def test_set_and_restore_demo_video_url(self, client, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        original = client.get(f"{API}/programs/{CORE26}", headers=h).json().get("demo_video_url")
        try:
            r = client.patch(f"{API}/admin/programs/{CORE26}", headers=h,
                             json={"demo_video_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"})
            assert r.status_code == 200, f"{r.status_code}: {r.text[:300]}"
            pub = client.get(f"{API}/programs/{CORE26}").json()
            assert pub["demo_video"]["youtube_id"] == "dQw4w9WgXcQ", pub["demo_video"]
        finally:
            client.patch(f"{API}/admin/programs/{CORE26}", headers=h,
                         json={"demo_video_url": original or ""})
        pub2 = client.get(f"{API}/programs/{CORE26}").json()
        assert pub2["demo_video"]["youtube_id"] != "dQw4w9WgXcQ", "restore to fallback failed"


# ---------- Regression: asanas ----------
class TestAsanaRegression:
    def test_asana_index(self, client):
        r = client.get(f"{API}/asanas")
        assert r.status_code == 200
        data = r.json()
        items = data if isinstance(data, list) else data.get("items", [])
        assert len(items) >= 12, len(items)
