"""Iteration 38 — lesson description + cover_image, program related products."""
import io
import os

import pytest
import requests
from dotenv import dotenv_values

fe = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or fe.get("REACT_APP_BACKEND_URL")).rstrip("/")
API = f"{BASE_URL}/api"
ADMIN = {"email": "tony@tonyyoga.com", "password": "TonyYoga2026!"}

PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
    "890000000d4944415478da63f8ffff3f0005fe02fea735c1300000000049454e44ae426082"
)


@pytest.fixture(scope="module")
def admin():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=ADMIN, timeout=30)
    if r.status_code != 200:
        pytest.fail(f"admin login failed {r.status_code}: {r.text[:300]}")
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, r.text[:300]
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def program(admin):
    r = admin.get(f"{API}/programs", timeout=30)
    assert r.status_code == 200
    progs = r.json()
    assert progs, "no programs seeded"
    return progs[0]


# --- Auth / playbook basics ---
def test_login_sets_cookie_and_bcrypt():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=ADMIN, timeout=30)
    assert r.status_code == 200
    print("cookies:", s.cookies.get_dict().keys())


# --- Uploads ---
def test_admin_upload_image(admin):
    r = admin.post(f"{API}/admin/uploads", files={"file": ("t.png", io.BytesIO(PNG), "image/png")}, timeout=60)
    assert r.status_code == 200, r.text[:300]
    d = r.json()
    assert "path" in d and "url" in d
    g = requests.get(f"{API}/files/{d['path']}", timeout=60)
    assert g.status_code == 200, g.status_code
    assert g.content[:4] == PNG[:4]


# --- Lesson description + cover persistence ---
def test_lesson_description_and_cover_persist(admin, program):
    pid = program["id"]
    lessons = admin.get(f"{API}/admin/programs/{pid}/lessons", timeout=30).json()
    assert lessons, f"no lessons in program {pid}"
    lesson = lessons[0]
    up = admin.post(f"{API}/admin/uploads", files={"file": ("c.png", io.BytesIO(PNG), "image/png")}, timeout=60).json()
    cover = f"{API}/files/{up['path']}"
    desc = "TEST_ Pranamasana — palms at the heart, grounding the breath."
    orig_desc = lesson["video"].get("description") or ""
    orig_cover = lesson["video"].get("cover_image")
    body = {
        "title": lesson["video"]["title"],
        "description": desc,
        "cover_image": cover,
        "youtube_url": lesson["video"].get("source_url") or lesson["video"].get("video_url"),
        "start_seconds": lesson["video"].get("start_seconds") or 0,
        "end_seconds": lesson["video"].get("end_seconds"),
    }
    r = admin.patch(f"{API}/admin/lessons/{lesson['id']}", json=body, timeout=30)
    assert r.status_code == 200, r.text[:300]

    again = admin.get(f"{API}/admin/programs/{pid}/lessons", timeout=30).json()
    got = [x for x in again if x["id"] == lesson["id"]][0]
    assert got["video"]["description"] == desc
    assert got["video"]["cover_image"] == cover

    # public program view exposes it too
    pub = admin.get(f"{API}/programs/{pid}", timeout=30).json()
    pl = [x for x in pub["lessons"] if x["id"] == lesson["id"]][0]
    assert pl["video"]["description"] == desc

    # restore
    body.update({"description": orig_desc, "cover_image": orig_cover})
    admin.patch(f"{API}/admin/lessons/{lesson['id']}", json=body, timeout=30)


def test_lesson_save_without_description_keeps_other_fields(admin, program):
    pid = program["id"]
    lessons = admin.get(f"{API}/admin/programs/{pid}/lessons", timeout=30).json()
    lesson = lessons[0]
    body = {
        "title": lesson["video"]["title"],
        "youtube_url": lesson["video"].get("source_url") or lesson["video"].get("video_url"),
        "start_seconds": lesson["video"].get("start_seconds") or 0,
    }
    r = admin.patch(f"{API}/admin/lessons/{lesson['id']}", json=body, timeout=30)
    assert r.status_code == 200, r.text[:300]
    got = [x for x in admin.get(f"{API}/admin/programs/{pid}/lessons", timeout=30).json() if x["id"] == lesson["id"]][0]
    assert got["video"]["title"] == lesson["video"]["title"]


# --- related products on program ---
def test_program_related_products_persist_and_expose(admin, program):
    pid = program["id"]
    prods = admin.get(f"{API}/products", timeout=30).json()
    assert len(prods) >= 2, "need >=2 products"
    ids = [prods[0]["id"], prods[1]["id"]]
    orig = program.get("related_product_ids") or []

    r = admin.patch(f"{API}/admin/programs/{pid}", json={"related_product_ids": ids}, timeout=30)
    assert r.status_code == 200, r.text[:300]

    detail = admin.get(f"{API}/programs/{pid}", timeout=30).json()
    assert detail.get("related_product_ids") == ids
    rp = detail.get("related_products")
    assert isinstance(rp, list) and len(rp) == 2
    assert {x["id"] for x in rp} == set(ids)
    assert all("title" in x and "price" in x for x in rp)
    assert all("_id" not in x for x in rp)

    # list endpoint also carries the ids (admin editor relies on it)
    lst = admin.get(f"{API}/programs", timeout=30).json()
    row = [x for x in lst if x["id"] == pid][0]
    assert row.get("related_product_ids") == ids

    # empty case
    admin.patch(f"{API}/admin/programs/{pid}", json={"related_product_ids": []}, timeout=30)
    d2 = admin.get(f"{API}/programs/{pid}", timeout=30).json()
    assert d2.get("related_products") == []

    # restore
    admin.patch(f"{API}/admin/programs/{pid}", json={"related_product_ids": orig}, timeout=30)


def test_related_products_ignores_bad_ids(admin, program):
    pid = program["id"]
    orig = program.get("related_product_ids") or []
    r = admin.patch(f"{API}/admin/programs/{pid}", json={"related_product_ids": ["nope-123"]}, timeout=30)
    assert r.status_code == 200
    d = admin.get(f"{API}/programs/{pid}", timeout=30).json()
    assert d.get("related_products") == []
    admin.patch(f"{API}/admin/programs/{pid}", json={"related_product_ids": orig}, timeout=30)


def test_lessons_reorder_regression(admin, program):
    pid = program["id"]
    lessons = admin.get(f"{API}/admin/programs/{pid}/lessons", timeout=30).json()
    if len(lessons) < 2:
        pytest.skip("need 2+ lessons")
    ids = [l["id"] for l in lessons]
    swapped = [ids[1], ids[0]] + ids[2:]
    r = admin.post(f"{API}/admin/programs/{pid}/lessons/reorder", json={"lesson_ids": swapped}, timeout=30)
    assert r.status_code == 200, r.text[:300]
    now = [l["id"] for l in admin.get(f"{API}/admin/programs/{pid}/lessons", timeout=30).json()]
    assert now == swapped
    admin.post(f"{API}/admin/programs/{pid}/lessons/reorder", json={"lesson_ids": ids}, timeout=30)
