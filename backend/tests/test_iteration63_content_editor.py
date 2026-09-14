"""Regression tests for testimonials/admin content + live editor sync flows."""
import os
import uuid

import pytest
import requests
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv('/app/backend/.env')


def _read_frontend_env_url() -> str | None:
    path = "/app/frontend/.env"
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip() or None
    return None


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or _read_frontend_env_url()


def _api(path: str) -> str:
    assert BASE_URL, "REACT_APP_BACKEND_URL is required"
    return f"{BASE_URL.rstrip('/')}/api{path}"


@pytest.fixture(scope="session")
def admin_session():
    # Auth + admin API fixture used across testimonials/editor/content tests
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    login = s.post(
        _api("/auth/login"),
        json={"email": os.environ['ADMIN_EMAIL'], "password": os.environ['ADMIN_PASSWORD']},
        timeout=30,
    )
    if login.status_code != 200:
        pytest.skip(f"Admin login unavailable: {login.status_code} {login.text[:180]}")
    token = login.json().get("token")
    if not token:
        pytest.skip("Admin token missing in login response")
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module", autouse=True)
def restore_global_content(admin_session):
    before = admin_session.get(_api("/admin/settings"), timeout=30)
    assert before.status_code == 200
    settings = before.json()
    snapshot = {
        "testimonials": settings.get("testimonials", []),
        "hero_testimonial": settings.get("hero_testimonial", {}),
        "site_images": settings.get("site_images", {}),
    }
    yield snapshot
    # Restore exact structured content settings and clear any key-bound live-editor overrides.
    admin_session.patch(_api("/admin/settings"), json=snapshot, timeout=30)
    admin_session.post(_api("/editor/discard"), json={"route": "/"}, timeout=30)
    # Cleanup non-content selector used in tests.
    admin_session.delete(
        _api("/editor/override"),
        json={"route": "/", "selector": '[data-testid="hero-title"]'},
        timeout=30,
    )


def test_health_and_public_settings_contract():
    h = requests.get(_api("/health"), timeout=30)
    assert h.status_code == 200
    assert isinstance(h.json().get("ok"), bool)

    pub = requests.get(_api("/settings/public"), timeout=30)
    assert pub.status_code == 200
    data = pub.json()
    assert isinstance(data.get("testimonials"), list)
    assert isinstance(data.get("hero_testimonial"), dict)


def test_admin_settings_default_testimonials_are_editable(admin_session):
    res = admin_session.get(_api("/admin/settings"), timeout=30)
    assert res.status_code == 200
    items = res.json().get("testimonials")
    assert isinstance(items, list)
    assert len(items) >= 3
    for row in items[:3]:
        assert isinstance(row.get("id"), str) and row["id"]
        assert isinstance(row.get("quote"), str) and row["quote"].strip()
        assert isinstance(row.get("author"), str) and row["author"].strip()


def test_validation_quote_and_author_required(admin_session):
    bad = [{"id": "TEST_bad_1", "quote": "", "author": "", "role": "", "photo": "", "video_url": ""}]
    res = admin_session.patch(_api("/admin/settings"), json={"testimonials": bad}, timeout=30)
    assert res.status_code == 422
    detail = str(res.json().get("detail", ""))
    assert "quote" in detail.lower() or "name" in detail.lower()


def test_can_publish_empty_testimonials_and_hide_featured(admin_session):
    payload = {
        "testimonials": [],
        "hero_testimonial": {
            "enabled": False,
            "video_url": "",
            "poster_url": "",
            "name": "",
            "role": "",
            "headline": "",
        },
    }
    res = admin_session.patch(_api("/admin/settings"), json=payload, timeout=30)
    assert res.status_code == 200

    pub = requests.get(_api("/settings/public"), timeout=30)
    assert pub.status_code == 200
    data = pub.json()
    assert data.get("testimonials") == []
    assert data.get("hero_testimonial", {}).get("enabled") is False


def test_reorder_and_stable_ids_persist(admin_session):
    base = [
        {
            "id": "TEST_id_a",
            "quote": "Quote A",
            "author": "Author A",
            "role": "Role A",
            "photo": "",
            "video_url": "",
        },
        {
            "id": "TEST_id_b",
            "quote": "Quote B",
            "author": "Author B",
            "role": "Role B",
            "photo": "",
            "video_url": "",
        },
    ]
    first = admin_session.patch(_api("/admin/settings"), json={"testimonials": base}, timeout=30)
    assert first.status_code == 200

    reordered = [base[1], base[0]]
    second = admin_session.patch(_api("/admin/settings"), json={"testimonials": reordered}, timeout=30)
    assert second.status_code == 200

    pub = requests.get(_api("/settings/public"), timeout=30)
    assert pub.status_code == 200
    ids = [row["id"] for row in pub.json().get("testimonials", [])[:2]]
    assert ids == ["TEST_id_b", "TEST_id_a"]


def test_upload_image_and_relative_file_url_is_served(admin_session):
    tiny_png = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDAT\x08\xd7c\xf8\xff\xff?\x00\x05\xfe\x02\xfeA\x89\x18\x8b"
        b"\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    files = {"file": ("TEST_tiny.png", tiny_png, "image/png")}
    up = requests.post(
        _api("/admin/uploads"),
        files=files,
        headers={"Authorization": admin_session.headers.get("Authorization", "")},
        timeout=30,
    )
    assert up.status_code == 200
    url = up.json().get("url", "")
    assert isinstance(url, str) and url.startswith("/api/files/")

    # Verify bytes are publicly retrievable from returned relative URL.
    full = f"{BASE_URL.rstrip('/')}{url}"
    got = requests.get(full, timeout=30)
    assert got.status_code == 200
    assert got.content == tiny_png
    with MongoClient(os.environ['MONGO_URL']) as client:
        db = client[os.environ['DB_NAME']]
        path = up.json()['path']
        db.uploaded_files.delete_many({'storage_path': path})
        db.uploaded_objects.files.delete_many({'_id': path})
        db.uploaded_objects.chunks.delete_many({'files_id': path})


def test_editor_draft_not_public_until_publish(admin_session):
    selector = '[data-testid="hero-title"]'
    value = f"TEST_DRAFT_{uuid.uuid4().hex[:8]}"
    put = admin_session.put(
        _api("/editor/override"),
        json={"route": "/", "selector": selector, "kind": "text", "props": {"text": value}},
        timeout=30,
    )
    assert put.status_code == 200

    draft = admin_session.get(_api("/editor/overrides"), params={"route": "/", "mode": "draft"}, timeout=30)
    assert draft.status_code == 200
    drow = next((o for o in draft.json().get("overrides", []) if o.get("selector") == selector), None)
    assert drow and drow["props"].get("text") == value

    public_before = requests.get(_api("/editor/overrides"), params={"route": "/", "mode": "published"}, timeout=30)
    prow_before = next((o for o in public_before.json().get("overrides", []) if o.get("selector") == selector), None)
    assert prow_before is None or prow_before.get("props", {}).get("text") != value

    pub = admin_session.post(_api("/editor/publish"), json={"route": "/"}, timeout=30)
    assert pub.status_code == 200
    assert isinstance(pub.json().get("published"), int)

    public_after = requests.get(_api("/editor/overrides"), params={"route": "/", "mode": "published"}, timeout=30)
    prow_after = next((o for o in public_after.json().get("overrides", []) if o.get("selector") == selector), None)
    assert prow_after and prow_after.get("props", {}).get("text") == value


def test_editor_publish_syncs_structured_settings_for_hero_name(admin_session):
    current = requests.get(_api("/settings/public"), timeout=30).json().get("hero_testimonial", {})
    original_name = current.get("name", "")
    new_name = f"TEST Hero {uuid.uuid4().hex[:6]}"
    selector = '[data-cms="hero_testimonial:name"]'

    put = admin_session.put(
        _api("/editor/override"),
        json={"route": "/", "selector": selector, "kind": "text", "props": {"text": new_name}},
        timeout=30,
    )
    assert put.status_code == 200

    pub = admin_session.post(_api("/editor/publish"), json={"route": "/"}, timeout=30)
    assert pub.status_code == 200

    after = requests.get(_api("/settings/public"), timeout=30)
    assert after.status_code == 200
    assert after.json().get("hero_testimonial", {}).get("name") == new_name

    # Put back original value immediately to avoid leaving state changed.
    restore = admin_session.patch(
        _api("/admin/settings"),
        json={"hero_testimonial": {**current, "name": original_name}},
        timeout=30,
    )
    assert restore.status_code == 200


def test_editor_permissions_anonymous_cannot_access_drafts_or_write():
    anon_draft = requests.get(_api("/editor/overrides"), params={"route": "/", "mode": "draft"}, timeout=30)
    assert anon_draft.status_code in (401, 403)

    anon_put = requests.put(
        _api("/editor/override"),
        json={"route": "/", "selector": "#x", "kind": "text", "props": {"text": "blocked"}},
        timeout=30,
    )
    assert anon_put.status_code in (401, 403)
