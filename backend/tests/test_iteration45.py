"""Iteration 45 — Phase 2: Meditation & Breathwork module (public API + admin CRUD) + regression."""
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
BASE_URL = base_url.rstrip("/")
API = f"{BASE_URL}/api"
CORE26_ID = "7585a2ef-01a1-4854-84f5-1eba68cfea66"
KINDS = ["meditation", "breathwork", "nidra"]
FOCUS_TAXONOMY = ["Sleep", "Stress relief", "Grounding", "Energy", "Focus", "Anxiety relief", "Gratitude", "Breath control"]


@pytest.fixture(scope="session")
def creds():
    content = Path("/app/memory/test_credentials.md").read_text(encoding="utf-8")
    m = re.search(r"## Admin\s*\n- Email: (\S+)\s*\n- Password: (\S+)", content)
    if not m:
        pytest.skip("admin creds not found")
    return {"email": m.group(1), "password": m.group(2)}


@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def admin(client, creds):
    r = client.post(f"{API}/auth/login", json=creds)
    if r.status_code != 200:
        pytest.fail(f"admin login failed {r.status_code}: {r.text[:300]}")
    tok = r.json().get("access_token") or r.json().get("token")
    if not tok:
        pytest.fail(f"no token in login response: {r.text[:300]}")
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {tok}"})
    return s


# ---------------- Public list ----------------
class TestMeditationsList:
    def test_list_9_published(self, client):
        r = client.get(f"{API}/meditations")
        assert r.status_code == 200, r.text[:300]
        rows = r.json()
        assert isinstance(rows, list)
        assert len(rows) == 9, f"expected 9 seeded sessions, got {len(rows)}"
        for m in rows:
            assert "_id" not in m
            assert m["kind"] in KINDS
            assert m["is_published"] is True
            assert m["media_kind"] == "audio", f"{m['title']} media_kind={m['media_kind']}"
            assert m["audio_url"].startswith("http"), m["audio_url"]
            assert isinstance(m["duration_minutes"], int)
            assert isinstance(m["id"], str) and m["id"]

    def test_kind_distribution(self, client):
        rows = client.get(f"{API}/meditations").json()
        counts = {k: sum(1 for m in rows if m["kind"] == k) for k in KINDS}
        assert counts == {"meditation": 3, "breathwork": 3, "nidra": 3}, counts

    @pytest.mark.parametrize("kind", KINDS)
    def test_filter_kind(self, client, kind):
        r = client.get(f"{API}/meditations", params={"kind": kind})
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) == 3, f"{kind} -> {len(rows)}"
        assert all(m["kind"] == kind for m in rows)

    def test_filter_focus_sleep(self, client):
        r = client.get(f"{API}/meditations", params={"focus": "Sleep"})
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) > 0, "no sessions tagged Sleep"
        assert all("Sleep" in m["focus_areas"] for m in rows)
        assert len(rows) < 9, "focus filter did not narrow results"

    def test_filter_duration_short(self, client):
        r = client.get(f"{API}/meditations", params={"duration": "5-15"})
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) > 0
        assert all(m["duration_minutes"] <= 15 for m in rows), [m["duration_minutes"] for m in rows]

    def test_filter_duration_buckets_partition(self, client):
        total = 0
        for b in ["5-15", "20-40", "60+"]:
            total += len(client.get(f"{API}/meditations", params={"duration": b}).json())
        assert total == 9, f"duration buckets cover {total} of 9"

    def test_search_q(self, client):
        rows = client.get(f"{API}/meditations").json()
        word = rows[0]["title"].split()[0]
        r = client.get(f"{API}/meditations", params={"q": word})
        assert r.status_code == 200
        got = r.json()
        assert len(got) >= 1
        assert all(word.lower() in m["title"].lower() for m in got)
        assert client.get(f"{API}/meditations", params={"q": "zzzznotitle"}).json() == []

    def test_combined_filter(self, client):
        r = client.get(f"{API}/meditations", params={"kind": "breathwork", "duration": "5-15"})
        assert r.status_code == 200
        assert all(m["kind"] == "breathwork" and m["duration_minutes"] <= 15 for m in r.json())


# ---------------- Facets / daily / detail ----------------
class TestFacetsDailyDetail:
    def test_facets(self, client):
        r = client.get(f"{API}/meditations/facets")
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["kinds"] == KINDS
        assert d["durations"] == ["5-15", "20-40", "60+"]
        assert len(d["focus_areas"]) > 0
        # data-driven: every returned focus must actually exist on a published session
        present = set()
        for m in client.get(f"{API}/meditations").json():
            present.update(m["focus_areas"])
        assert set(d["focus_areas"]) == present, (d["focus_areas"], sorted(present))
        # ordering follows taxonomy for known values
        known = [f for f in d["focus_areas"] if f in FOCUS_TAXONOMY]
        assert known == [f for f in FOCUS_TAXONOMY if f in d["focus_areas"]]

    def test_daily_deterministic(self, client):
        r1 = client.get(f"{API}/meditations/daily")
        assert r1.status_code == 200, r1.text[:300]
        d1 = r1.json()
        assert d1 and "_id" not in d1
        assert d1["is_published"] is True
        d2 = client.get(f"{API}/meditations/daily").json()
        assert d1["id"] == d2["id"], "daily not deterministic within same day"
        ids = {m["id"] for m in client.get(f"{API}/meditations").json()}
        assert d1["id"] in ids

    def test_get_by_id(self, client):
        m0 = client.get(f"{API}/meditations").json()[0]
        r = client.get(f"{API}/meditations/{m0['id']}")
        assert r.status_code == 200
        assert r.json()["title"] == m0["title"]

    def test_get_unknown_404(self, client):
        r = client.get(f"{API}/meditations/does-not-exist-123")
        assert r.status_code == 404, f"{r.status_code}: {r.text[:200]}"


# ---------------- Admin CRUD ----------------
class TestAdminMeditationsCRUD:
    created = []

    def test_admin_list_requires_auth(self):
        r = requests.get(f"{API}/admin/meditations")
        assert r.status_code in (401, 403), r.status_code

    def test_admin_list(self, admin):
        r = admin.get(f"{API}/admin/meditations")
        assert r.status_code == 200, r.text[:300]
        assert len(r.json()) == 9

    def test_create_update_delete(self, admin, client):
        payload = {
            "title": "TEST_ Box Breathing QA",
            "kind": "breathwork",
            "media_kind": "audio",
            "duration_minutes": 8,
            "focus_areas": ["Breath control", "Focus"],
            "audio_url": "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
            "description": "QA created session",
            "is_published": True,
        }
        r = admin.post(f"{API}/admin/meditations", json=payload)
        assert r.status_code == 200, r.text[:400]
        doc = r.json()
        mid = doc["id"]
        TestAdminMeditationsCRUD.created.append(mid)
        assert "_id" not in doc
        assert doc["kind"] == "breathwork"
        assert doc["media_kind"] == "audio"
        assert doc["duration_minutes"] == 8
        assert doc["focus_areas"] == ["Breath control", "Focus"]
        assert doc["is_published"] is True

        # visible publicly
        g = client.get(f"{API}/meditations/{mid}")
        assert g.status_code == 200
        assert g.json()["title"] == payload["title"]
        assert len(client.get(f"{API}/meditations", params={"kind": "breathwork"}).json()) == 4

        # UPDATE
        u = admin.patch(f"{API}/admin/meditations/{mid}", json={"title": "TEST_ Renamed QA", "duration_minutes": 25})
        assert u.status_code == 200, u.text[:300]
        assert u.json()["title"] == "TEST_ Renamed QA"
        again = client.get(f"{API}/meditations/{mid}").json()
        assert again["title"] == "TEST_ Renamed QA"
        assert again["duration_minutes"] == 25

        # unpublish hides from public
        admin.patch(f"{API}/admin/meditations/{mid}", json={"is_published": False})
        assert client.get(f"{API}/meditations/{mid}").status_code == 404
        assert len(client.get(f"{API}/meditations").json()) == 9

        # DELETE
        d = admin.delete(f"{API}/admin/meditations/{mid}")
        assert d.status_code == 200, d.text[:300]
        TestAdminMeditationsCRUD.created.remove(mid)
        assert admin.get(f"{API}/admin/meditations").status_code == 200
        assert len(admin.get(f"{API}/admin/meditations").json()) == 9

    def test_create_invalid_kind_422(self, admin):
        r = admin.post(f"{API}/admin/meditations", json={"title": "TEST_ bad kind", "kind": "sleeping"})
        assert r.status_code == 422, f"{r.status_code}: {r.text[:300]}"
        if r.status_code == 200:
            TestAdminMeditationsCRUD.created.append(r.json()["id"])

    def test_create_invalid_media_kind_422(self, admin):
        r = admin.post(f"{API}/admin/meditations", json={"title": "TEST_ bad media", "media_kind": "gif"})
        assert r.status_code == 422, f"{r.status_code}: {r.text[:300]}"
        if r.status_code == 200:
            TestAdminMeditationsCRUD.created.append(r.json()["id"])

    def test_youtube_video_derives_id(self, admin):
        r = admin.post(f"{API}/admin/meditations", json={
            "title": "TEST_ video session", "kind": "nidra", "media_kind": "video",
            "youtube_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "duration_minutes": 30,
        })
        assert r.status_code == 200, r.text[:300]
        doc = r.json()
        TestAdminMeditationsCRUD.created.append(doc["id"])
        assert doc["youtube_id"] == "dQw4w9WgXcQ"
        assert doc["cover_image"].endswith("dQw4w9WgXcQ/hqdefault.jpg")

    def test_update_unknown_404(self, admin):
        r = admin.patch(f"{API}/admin/meditations/nope-000", json={"title": "x"})
        assert r.status_code == 404, r.status_code


@pytest.fixture(scope="session", autouse=True)
def cleanup(admin):
    yield
    for mid in list(TestAdminMeditationsCRUD.created):
        admin.delete(f"{API}/admin/meditations/{mid}")
    rows = admin.get(f"{API}/admin/meditations").json()
    leftovers = [m["title"] for m in rows if str(m.get("title", "")).startswith("TEST_")]
    assert not leftovers, f"TEST_ leftovers in DB: {leftovers}"
    assert len(rows) == 9, f"DB not back to 9 seeded meditations: {len(rows)}"


# ---------------- Regression ----------------
class TestRegression:
    def test_discover_72(self, client):
        r = client.get(f"{API}/discover")
        assert r.status_code == 200
        d = r.json()
        items = d.get("items", d) if isinstance(d, dict) else d
        total = d.get("total") if isinstance(d, dict) else len(items)
        assert (total or len(items)) == 72, f"discover total={total} items={len(items)}"

    def test_discover_filter(self, client):
        r = client.get(f"{API}/discover", params={"type": "program"})
        assert r.status_code == 200
        d = r.json()
        items = d.get("items", d) if isinstance(d, dict) else d
        assert len(items) > 0
        assert all(i.get("kind") == "program" for i in items)

    def test_asanas(self, client):
        r = client.get(f"{API}/asanas")
        assert r.status_code == 200
        rows = r.json()
        rows = rows.get("items", rows) if isinstance(rows, dict) else rows
        assert len(rows) > 0

    def test_course_page(self, client):
        r = client.get(f"{API}/programs/{CORE26_ID}")
        assert r.status_code == 200, r.text[:200]
        c = r.json()
        assert c["id"] == CORE26_ID
        assert "_id" not in c
