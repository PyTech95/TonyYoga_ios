"""Regression tests for the News/Blog/Events module + social settings."""
import os
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001")
ADMIN = {"email": "tony@tonyyoga.com", "password": "TonyYoga2026!"}


def _auth():
    r = requests.post(f"{BASE}/api/auth/login", json=ADMIN, timeout=10)
    return {"Authorization": f"Bearer {r.json().get('access_token') or r.json().get('token')}"}


# ---- Public endpoints ----
def test_news_list_public():
    r = requests.get(f"{BASE}/api/news", timeout=10)
    assert r.status_code == 200
    posts = r.json()
    assert isinstance(posts, list)
    assert len(posts) >= 3, "starter posts missing"
    # Only published come back
    for p in posts:
        assert p.get("is_published") is True


def test_news_detail_public():
    r = requests.get(f"{BASE}/api/news/welcome-to-tony-yoga", timeout=10)
    assert r.status_code == 200
    p = r.json()
    assert p["slug"] == "welcome-to-tony-yoga"
    assert p["title"]
    assert p["category"] == "news"


def test_news_detail_404():
    r = requests.get(f"{BASE}/api/news/does-not-exist", timeout=10)
    assert r.status_code == 404


def test_news_list_filter_by_tag():
    r = requests.get(f"{BASE}/api/news", params={"tag": "malaga"}, timeout=10)
    assert r.status_code == 200
    posts = r.json()
    assert all("malaga" in (p.get("tags") or []) for p in posts)


# ---- Social settings surfaced publicly ----
def test_social_urls_in_public_settings():
    r = requests.get(f"{BASE}/api/settings/public", timeout=10)
    body = r.json()
    for key in ("social_facebook", "social_instagram", "social_youtube", "social_linkedin"):
        assert key in body, f"missing {key} in public settings"


# ---- Admin CRUD ----
def test_admin_news_crud():
    headers = _auth()
    # Create
    r = requests.post(f"{BASE}/api/admin/news", headers=headers, json={
        "title": "TEST_NewsCRUD",
        "excerpt": "test excerpt",
        "body": "test body",
        "category": "blog",
        "tags": ["test"],
        "is_published": False,
    }, timeout=10)
    assert r.status_code == 200, r.text
    post = r.json()
    assert post["slug"].startswith("test-newscrud")
    pid = post["id"]

    # Draft should NOT appear in public list
    public = requests.get(f"{BASE}/api/news", timeout=10).json()
    assert all(p["id"] != pid for p in public), "unpublished post leaked into public list"

    # Publish via patch — updates is_published AND auto-sets published_at (2 fields)
    r = requests.patch(f"{BASE}/api/admin/news/{pid}", headers=headers,
                       json={"is_published": True}, timeout=10)
    assert r.json()["updated"] >= 1

    # Now visible publicly, published_at should be set
    r = requests.get(f"{BASE}/api/news/{post['slug']}", timeout=10)
    assert r.status_code == 200
    assert r.json()["is_published"] is True
    assert r.json().get("published_at")

    # Update body
    r = requests.patch(f"{BASE}/api/admin/news/{pid}", headers=headers,
                       json={"body": "updated body content"}, timeout=10)
    assert r.json()["updated"] == 1
    r = requests.get(f"{BASE}/api/news/{post['slug']}", timeout=10)
    assert r.json()["body"] == "updated body content"

    # Delete
    r = requests.delete(f"{BASE}/api/admin/news/{pid}", headers=headers, timeout=10)
    assert r.json()["deleted"] == 1
    r = requests.get(f"{BASE}/api/news/{post['slug']}", timeout=10)
    assert r.status_code == 404


def test_admin_news_requires_auth():
    r = requests.post(f"{BASE}/api/admin/news", json={"title": "X"}, timeout=10)
    assert r.status_code == 401
    r = requests.delete(f"{BASE}/api/admin/news/nope", timeout=10)
    assert r.status_code == 401


def test_admin_news_slug_uniqueness():
    headers = _auth()
    # Create two with the same title — slug should be auto-suffixed
    r1 = requests.post(f"{BASE}/api/admin/news", headers=headers,
                       json={"title": "TEST_slug conflict"}, timeout=10)
    r2 = requests.post(f"{BASE}/api/admin/news", headers=headers,
                       json={"title": "TEST_slug conflict"}, timeout=10)
    assert r1.status_code == r2.status_code == 200
    assert r1.json()["slug"] != r2.json()["slug"]
    # Cleanup
    requests.delete(f"{BASE}/api/admin/news/{r1.json()['id']}", headers=headers)
    requests.delete(f"{BASE}/api/admin/news/{r2.json()['id']}", headers=headers)


def test_admin_news_event_fields():
    headers = _auth()
    r = requests.post(f"{BASE}/api/admin/news", headers=headers, json={
        "title": "TEST_event",
        "category": "event",
        "event_date": "2026-08-15T09:00:00+00:00",
        "event_location": "Villa San Pedro",
        "is_published": True,
    }, timeout=10)
    assert r.status_code == 200
    p = r.json()
    assert p["category"] == "event"
    assert p["event_date"]
    assert p["event_location"] == "Villa San Pedro"
    # Cleanup
    requests.delete(f"{BASE}/api/admin/news/{p['id']}", headers=headers)
