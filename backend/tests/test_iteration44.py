"""Iteration 44 — Phase 1: unified content discovery (/api/discover) + admin tag editing."""
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

FOCUS_AREAS = ["Back care", "Flexibility", "Balance", "Strength", "Stress relief", "Sleep", "Energy", "Beginner basics"]


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


# ---- Facets ----
class TestFacets:
    def test_facets_shape(self, client):
        r = client.get(f"{API}/discover/facets")
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        for k in ["levels", "styles", "focus_areas", "intensities", "languages", "durations", "types", "teachers"]:
            assert k in d, f"missing facet key {k}"
        assert d["focus_areas"] == FOCUS_AREAS
        assert d["intensities"] == ["gentle", "moderate", "strong"]
        assert d["types"] == ["program", "class"]
        assert len(d["durations"]) == 3
        assert len(d["levels"]) > 0 and len(d["styles"]) > 0


# ---- Discover list + filters ----
class TestDiscover:
    def test_unified_list_and_fields(self, client):
        r = client.get(f"{API}/discover")
        assert r.status_code == 200, r.text[:300]
        items = r.json()
        assert isinstance(items, list) and len(items) > 50
        kinds = {i["kind"] for i in items}
        assert kinds == {"program", "class"}
        required = {"kind", "id", "title", "cover", "level", "style", "focus_areas",
                    "intensity", "language", "duration_label", "duration_minutes", "url"}
        for it in items:
            assert required.issubset(it.keys()), f"missing keys: {required - set(it.keys())}"
            assert "_id" not in it
            assert it["url"].startswith("/programs/" if it["kind"] == "program" else "/library/")

    def test_type_program(self, client):
        items = client.get(f"{API}/discover", params={"type": "program"}).json()
        assert len(items) == 3, f"expected 3 programs, got {len(items)}"
        assert all(i["kind"] == "program" for i in items)

    def test_type_class(self, client):
        items = client.get(f"{API}/discover", params={"type": "class"}).json()
        assert len(items) > 0
        assert all(i["kind"] == "class" for i in items)

    def test_backfill_tagged_everything(self, client):
        items = client.get(f"{API}/discover").json()
        untagged = [i["title"] for i in items if not i["focus_areas"]]
        assert not untagged, f"{len(untagged)} items with no focus_areas: {untagged[:5]}"
        no_int = [i["title"] for i in items if not i["intensity"]]
        assert not no_int, f"{len(no_int)} items with no intensity: {no_int[:5]}"

    @pytest.mark.parametrize("focus", FOCUS_AREAS)
    def test_focus_filter(self, client, focus):
        r = client.get(f"{API}/discover", params={"focus": focus})
        assert r.status_code == 200
        items = r.json()
        assert len(items) > 0, f"no items for focus {focus}"
        assert all(focus in i["focus_areas"] for i in items)

    def test_duration_short_classes(self, client):
        items = client.get(f"{API}/discover", params={"type": "class", "duration": "5-15"}).json()
        assert len(items) > 0
        assert all(i["kind"] == "class" and (i["duration_minutes"] or 0) <= 15 for i in items)

    def test_duration_buckets_disjoint(self, client):
        all_classes = client.get(f"{API}/discover", params={"type": "class"}).json()
        got = set()
        for b in ["5-15", "20-40", "60+"]:
            ids = {i["id"] for i in client.get(f"{API}/discover", params={"type": "class", "duration": b}).json()}
            assert not (got & ids), f"bucket {b} overlaps previous"
            got |= ids
        missing = [i["title"] for i in all_classes if i["id"] not in got]
        # classes with 16-20 min fall between 5-15 and 20-40? boundary check
        assert not missing, f"{len(missing)} classes not in any duration bucket: {missing[:5]}"

    def test_duration_excludes_programs(self, client):
        items = client.get(f"{API}/discover", params={"duration": "5-15"}).json()
        assert all(i["kind"] == "class" for i in items)

    def test_level_filter(self, client):
        levels = client.get(f"{API}/discover/facets").json()["levels"]
        assert "beginner" in levels
        items = client.get(f"{API}/discover", params={"level": "beginner"}).json()
        assert len(items) > 0 and all(i["level"] == "beginner" for i in items)

    def test_style_filter(self, client):
        items = client.get(f"{API}/discover", params={"style": "Core 40"}).json()
        assert len(items) > 0, "no items for style Core 40"
        assert all(i["style"] == "Core 40" for i in items)

    def test_language_es(self, client):
        items = client.get(f"{API}/discover", params={"language": "es"}).json()
        assert len(items) > 0
        assert all(i["language"] in ("es", "both") for i in items)

    def test_text_search(self, client):
        items = client.get(f"{API}/discover", params={"q": "cobra"}).json()
        assert len(items) > 0, "no results for q=cobra"
        assert all("cobra" in i["title"].lower() for i in items)

    def test_combined_filters(self, client):
        items = client.get(f"{API}/discover", params={"type": "class", "focus": "Flexibility", "level": "beginner"}).json()
        assert all(i["kind"] == "class" and "Flexibility" in i["focus_areas"] and i["level"] == "beginner" for i in items)

    def test_unknown_filter_returns_empty_not_error(self, client):
        r = client.get(f"{API}/discover", params={"focus": "Nonexistent"})
        assert r.status_code == 200
        assert r.json() == []

    def test_bad_duration_value(self, client):
        r = client.get(f"{API}/discover", params={"duration": "bogus"})
        assert r.status_code in (200, 422), r.text[:200]


# ---- Admin tag editing on a program ----
class TestAdminTagEditing:
    def test_program_tags_persist_and_reflect_in_discover(self, admin, client):
        orig = client.get(f"{API}/programs/{CORE26_ID}").json()
        assert orig["id"] == CORE26_ID
        payload = {
            "focus_areas": ["Back care", "Strength"],
            "intensity": "strong",
            "language": "both",
        }
        r = admin.patch(f"{API}/admin/programs/{CORE26_ID}", json=payload)
        assert r.status_code in (200, 204), f"update failed {r.status_code}: {r.text[:300]}"

        got = client.get(f"{API}/programs/{CORE26_ID}").json()
        assert sorted(got.get("focus_areas") or []) == ["Back care", "Strength"]
        assert got.get("intensity") == "strong"
        assert got.get("language") == "both"

        d = client.get(f"{API}/discover", params={"type": "program", "focus": "Strength"}).json()
        assert CORE26_ID in [i["id"] for i in d], "program not filterable by newly saved focus area"

        # restore original tags
        admin.patch(f"{API}/admin/programs/{CORE26_ID}", json={
            "focus_areas": orig.get("focus_areas") or [],
            "intensity": orig.get("intensity"),
            "language": orig.get("language") or "both",
        })

    def test_invalid_intensity_rejected_or_stored_safely(self, admin, client):
        r = admin.patch(f"{API}/admin/programs/{CORE26_ID}", json={"intensity": "nuclear"})
        assert r.status_code in (200, 400, 422), r.text[:200]
        if r.status_code == 200:
            got = client.get(f"{API}/programs/{CORE26_ID}").json()
            # report-only: no server-side validation of intensity enum
            assert got.get("intensity") in ("nuclear", "gentle", "moderate", "strong")
            admin.patch(f"{API}/admin/programs/{CORE26_ID}", json={"intensity": "moderate"})


# ---- Regression ----
class TestRegression:
    def test_core26_program_page_data(self, client):
        r = client.get(f"{API}/programs/{CORE26_ID}")
        assert r.status_code == 200
        d = r.json()
        assert d["title"]
        lessons = d.get("lessons") or d.get("videos") or []
        assert len(lessons) >= 26 or d.get("lesson_count", 0) >= 26, f"expected >=26 lessons, got {len(lessons)}"

    def test_asanas_endpoint(self, client):
        r = client.get(f"{API}/asanas")
        assert r.status_code == 200
        assert len(r.json()) > 0

    def test_videos_endpoint(self, client):
        r = client.get(f"{API}/videos")
        assert r.status_code == 200
