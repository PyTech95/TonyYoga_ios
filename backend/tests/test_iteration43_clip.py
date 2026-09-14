"""Iteration 43 — asana youtube clip field roundtrip (admin patch, then revert)."""
import os

import pytest
import requests
from dotenv import dotenv_values

env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or env["REACT_APP_BACKEND_URL"]).rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def admin():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": "tony@tonyyoga.com", "password": "TonyYoga2026!"})
    if r.status_code != 200:
        pytest.fail(f"admin login failed {r.status_code}: {r.text[:300]}")
    body = r.json()
    tok = body.get("access_token") or body.get("token")
    assert tok, list(body.keys())
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return s


def test_asana_clip_roundtrip(admin):
    items = admin.get(f"{API}/asanas").json()
    assert isinstance(items, list) and items, "no asanas seeded"
    a = items[0]
    assert not a.get("youtube_id"), "seeded asana already has a clip (test expects none)"
    orig_url = a.get("youtube_url") or ""
    orig_cover = a.get("cover_image") or ""
    try:
        r = admin.patch(f"{API}/admin/asanas/{a['id']}",
                        json={"youtube_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                              "start_seconds": 5, "end_seconds": 20})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["youtube_id"] == "dQw4w9WgXcQ", d
        assert d["start_seconds"] == 5 and d["end_seconds"] == 20
        assert "_id" not in d
        # public list must expose youtube_id so the play badge can render
        lst = admin.get(f"{API}/asanas").json()
        match = [x for x in lst if x["id"] == a["id"]]
        assert match and match[0].get("youtube_id") == "dQw4w9WgXcQ", "public list hides youtube_id -> badge cannot render"
        # public detail
        g = admin.get(f"{API}/asanas/{a['id']}").json()
        assert g["youtube_id"] == "dQw4w9WgXcQ"
    finally:
        admin.patch(f"{API}/admin/asanas/{a['id']}",
                    json={"youtube_url": orig_url, "cover_image": orig_cover,
                          "start_seconds": 0, "end_seconds": None})
        after = admin.get(f"{API}/asanas/{a['id']}").json()
        assert not after.get("youtube_id"), f"cleanup failed: {after.get('youtube_id')}"
        assert after.get("cover_image") == orig_cover
