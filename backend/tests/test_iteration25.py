"""Iteration 25 — Broadcasts (podcast episodes) + Zoom live classes / recordings."""
import os
import time
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE = base_url.rstrip("/") + "/api"

ADMIN = {"email": "tony@tonyyoga.com", "password": "TonyYoga2026!"}
STUDENT = {"email": "student@demo.com", "password": "Student2026!"}


def login(creds):
    r = requests.post(f"{BASE}/auth/login", json=creds, timeout=30)
    if r.status_code != 200:
        pytest.fail(f"login failed {r.status_code}: {r.text[:300]}")
    tok = r.json().get("token")
    assert tok, f"no token in login response: {r.json()}"
    return tok


def H(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def admin_token():
    return login(ADMIN)


@pytest.fixture(scope="session")
def student_token():
    return login(STUDENT)


@pytest.fixture(scope="session")
def new_student_token():
    email = f"TEST_qa_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{BASE}/auth/register", json={
        "email": email, "password": "QaTest2026!", "name": "TEST QA Student"}, timeout=30)
    if r.status_code not in (200, 201):
        pytest.fail(f"register failed {r.status_code}: {r.text[:300]}")
    tok = r.json().get("token") or login({"email": email, "password": "QaTest2026!"})
    return tok


# ---------------- Broadcasts ----------------
class TestBroadcasts:
    created = []

    def test_public_list_has_seeded_episodes(self):
        r = requests.get(f"{BASE}/broadcasts", timeout=30)
        assert r.status_code == 200, r.text[:300]
        eps = r.json()
        assert isinstance(eps, list)
        titles = [e["title"] for e in eps]
        assert "The breath is the practice" in titles, titles
        assert "Inside the Ghosh lineage" in titles, titles
        for e in eps:
            assert "_id" not in e
            assert e["is_published"] is True

    def test_public_media_type_filter(self):
        for mt in ("audio", "video"):
            r = requests.get(f"{BASE}/broadcasts", params={"media_type": mt}, timeout=30)
            assert r.status_code == 200
            assert all(e["media_type"] == mt for e in r.json()), mt

    def test_create_audio_immediate_publish(self, admin_token):
        payload = {"title": "TEST_ audio immediate", "media_type": "audio",
                   "media_url": "https://example.com/a.mp3", "description": "qa",
                   "notify_push": False}
        r = requests.post(f"{BASE}/admin/broadcasts", json=payload, headers=H(admin_token), timeout=30)
        assert r.status_code == 200, r.text[:400]
        ep = r.json()
        TestBroadcasts.created.append(ep["id"])
        assert ep["is_published"] is True
        assert ep["media_type"] == "audio"
        assert ep["media_url"] == payload["media_url"]
        assert "_id" not in ep
        # appears in admin list
        al = requests.get(f"{BASE}/admin/broadcasts", headers=H(admin_token), timeout=30)
        assert al.status_code == 200
        assert ep["id"] in [e["id"] for e in al.json()]
        # appears publicly
        pl = requests.get(f"{BASE}/broadcasts", timeout=30)
        assert ep["id"] in [e["id"] for e in pl.json()]

    def test_scheduled_video_hidden_then_publish_now(self, admin_token):
        future = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
        payload = {"title": "TEST_ scheduled video", "media_type": "video",
                   "media_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                   "publish_at": future, "notify_push": False}
        r = requests.post(f"{BASE}/admin/broadcasts", json=payload, headers=H(admin_token), timeout=30)
        assert r.status_code == 200, r.text[:400]
        ep = r.json()
        TestBroadcasts.created.append(ep["id"])
        assert ep["is_published"] is False, "future publish_at must be scheduled"
        # not public
        pub = requests.get(f"{BASE}/broadcasts", timeout=30).json()
        assert ep["id"] not in [e["id"] for e in pub], "scheduled episode leaked to public list"
        # public detail 404 for anon
        d = requests.get(f"{BASE}/broadcasts/{ep['id']}", timeout=30)
        assert d.status_code == 404, d.status_code
        # staff can read it
        ds = requests.get(f"{BASE}/broadcasts/{ep['id']}", headers=H(admin_token), timeout=30)
        assert ds.status_code == 200, ds.text[:200]
        # publish now
        p = requests.post(f"{BASE}/admin/broadcasts/{ep['id']}/publish", headers=H(admin_token), timeout=30)
        assert p.status_code == 200, p.text[:300]
        pub2 = requests.get(f"{BASE}/broadcasts", timeout=30).json()
        assert ep["id"] in [e["id"] for e in pub2], "episode not public after publish-now"

    def test_patch_episode(self, admin_token):
        ep_id = TestBroadcasts.created[0]
        r = requests.patch(f"{BASE}/admin/broadcasts/{ep_id}",
                           json={"title": "TEST_ audio renamed"}, headers=H(admin_token), timeout=30)
        assert r.status_code == 200, r.text[:300]
        assert r.json()["title"] == "TEST_ audio renamed"
        g = requests.get(f"{BASE}/broadcasts/{ep_id}", timeout=30)
        assert g.status_code == 200
        assert g.json()["title"] == "TEST_ audio renamed"

    def test_validation_and_authz(self, admin_token, student_token):
        r = requests.post(f"{BASE}/admin/broadcasts", json={"title": "x", "media_type": "podcast",
                          "media_url": "https://e.com/a.mp3"}, headers=H(admin_token), timeout=30)
        assert r.status_code == 400, r.status_code
        r = requests.post(f"{BASE}/admin/broadcasts", json={"title": "x", "media_type": "audio",
                          "media_url": "   "}, headers=H(admin_token), timeout=30)
        assert r.status_code == 400, r.status_code
        r = requests.post(f"{BASE}/admin/broadcasts", json={"title": "x", "media_type": "audio",
                          "media_url": "https://e.com/a.mp3"}, headers=H(student_token), timeout=30)
        assert r.status_code == 403, r.status_code
        r = requests.get(f"{BASE}/admin/broadcasts", timeout=30)
        assert r.status_code in (401, 403), r.status_code

    def test_zz_cleanup_created_episodes(self, admin_token):
        for ep_id in TestBroadcasts.created:
            d = requests.delete(f"{BASE}/admin/broadcasts/{ep_id}", headers=H(admin_token), timeout=30)
            assert d.status_code in (200, 404), d.text[:200]
        pub = requests.get(f"{BASE}/broadcasts", timeout=30).json()
        for ep_id in TestBroadcasts.created:
            assert ep_id not in [e["id"] for e in pub]
        al = requests.get(f"{BASE}/admin/broadcasts", headers=H(admin_token), timeout=30).json()
        assert len(al) == 2, f"expected only 2 seeded episodes, got {len(al)}"


# ---------------- Zoom ----------------
class TestZoom:
    state = {}

    def test_zoom_status_mock_mode(self, admin_token):
        r = requests.get(f"{BASE}/admin/zoom/status", headers=H(admin_token), timeout=30)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["configured"] is False and d["mode"] == "mock", d

    def test_zoom_status_requires_admin(self, student_token):
        r = requests.get(f"{BASE}/admin/zoom/status", headers=H(student_token), timeout=30)
        assert r.status_code == 403, r.status_code

    def test_create_online_class_auto_zoom(self, admin_token):
        tmpl = requests.get(f"{BASE}/class-templates", timeout=30).json()
        online = [t for t in tmpl if t.get("location_type") == "online"]
        assert online, "no online class template seeded"
        start = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
        r = requests.post(f"{BASE}/admin/class-instances",
                          json={"template_id": online[0]["id"], "start_time": start, "is_recorded": True},
                          headers=H(admin_token), timeout=30)
        assert r.status_code == 200, r.text[:400]
        inst = r.json()
        TestZoom.state["instance_id"] = inst["id"]
        assert inst.get("zoom_join_url"), f"online class missing auto zoom meeting: {inst}"
        assert inst.get("zoom_mock") is True

    def test_manual_create_meeting(self, admin_token):
        iid = TestZoom.state["instance_id"]
        r = requests.post(f"{BASE}/admin/class-instances/{iid}/zoom-meeting",
                          headers=H(admin_token), timeout=30)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["ok"] is True and d["zoom_join_url"].startswith("https://zoom.us/j/mock-")

    def test_attach_recording_clamps_days(self, admin_token):
        iid = TestZoom.state["instance_id"]
        r = requests.post(f"{BASE}/admin/class-instances/{iid}/recording",
                          json={"recording_url": "https://example.com/rec.mp4", "replay_days": 999},
                          headers=H(admin_token), timeout=30)
        assert r.status_code == 200, r.text[:300]
        assert r.json()["recording_replay_days"] == 60
        r = requests.post(f"{BASE}/admin/class-instances/{iid}/recording",
                          json={"recording_url": "https://example.com/rec.mp4", "replay_days": 2},
                          headers=H(admin_token), timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["recording_replay_days"] == 2 and d["is_recorded"] is True
        exp = datetime.fromisoformat(d["recording_expires_at"])
        assert 1.9 < (exp - datetime.now(timezone.utc)).total_seconds() / 86400 < 2.1

    def test_attach_recording_requires_url_when_mock(self, admin_token):
        iid = TestZoom.state["instance_id"]
        # temporary second class without a URL supplied
        tmpl = requests.get(f"{BASE}/class-templates", timeout=30).json()
        online = [t for t in tmpl if t.get("location_type") == "online"][0]
        start = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
        inst = requests.post(f"{BASE}/admin/class-instances",
                            json={"template_id": online["id"], "start_time": start},
                            headers=H(admin_token), timeout=30).json()
        TestZoom.state["extra_instance_id"] = inst["id"]
        r = requests.post(f"{BASE}/admin/class-instances/{inst['id']}/recording",
                          json={"replay_days": 3}, headers=H(admin_token), timeout=30)
        assert r.status_code == 400, r.status_code
        assert iid  # sanity

    def test_public_instance_hides_secrets(self):
        iid = TestZoom.state["instance_id"]
        r = requests.get(f"{BASE}/class-instances/{iid}", timeout=30)
        assert r.status_code == 200, r.text[:200]
        d = r.json()
        assert "zoom_start_url" not in d, "host start_url leaked"
        assert "recording_url" not in d, "recording_url leaked publicly"
        assert d.get("zoom_join_url"), "join url missing"

    def test_recording_403_for_unbooked_new_student(self, new_student_token):
        iid = TestZoom.state["instance_id"]
        r = requests.get(f"{BASE}/class-instances/{iid}/recording",
                         headers=H(new_student_token), timeout=30)
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text[:200]}"

    def test_recording_requires_auth(self):
        iid = TestZoom.state["instance_id"]
        r = requests.get(f"{BASE}/class-instances/{iid}/recording", timeout=30)
        assert r.status_code in (401, 403), r.status_code

    def test_booked_student_gets_recording(self, student_token):
        iid = TestZoom.state["instance_id"]
        b = requests.post(f"{BASE}/bookings", json={"class_instance_id": iid},
                          headers=H(student_token), timeout=30)
        assert b.status_code in (200, 201, 400), b.text[:300]
        TestZoom.state["booking_id"] = b.json().get("id") if b.status_code in (200, 201) else None
        r = requests.get(f"{BASE}/class-instances/{iid}/recording",
                         headers=H(student_token), timeout=30)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["available"] is True, d
        assert d["url"] == "https://example.com/rec.mp4"
        assert d["replay_days"] == 2
        assert d["expires_at"]

    def test_expired_recording_reported(self, admin_token, student_token):
        iid = TestZoom.state["instance_id"]
        # force expiry via direct admin attach then patch expiry in the past is not exposed;
        # instead validate the expired branch using DB-independent path: skip if unavailable.
        past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        # No admin API to set expiry in the past -> use mongo directly.
        try:
            from pymongo import MongoClient
            mongo_url = dotenv_values("/app/backend/.env").get("MONGO_URL")
            db_name = dotenv_values("/app/backend/.env").get("DB_NAME")
            client = MongoClient(mongo_url)
            client[db_name].class_instances.update_one(
                {"id": iid}, {"$set": {"recording_expires_at": past}})
        except Exception as e:
            pytest.skip(f"mongo direct access unavailable: {e}")
        r = requests.get(f"{BASE}/class-instances/{iid}/recording",
                         headers=H(student_token), timeout=30)
        assert r.status_code == 200, r.text[:200]
        d = r.json()
        assert d["available"] is False and d["reason"] == "expired", d
        # staff still sees it
        rs = requests.get(f"{BASE}/class-instances/{iid}/recording",
                          headers=H(admin_token), timeout=30)
        assert rs.json()["available"] is True

    def test_remove_recording(self, admin_token, student_token):
        iid = TestZoom.state["instance_id"]
        r = requests.delete(f"{BASE}/admin/class-instances/{iid}/recording",
                            headers=H(admin_token), timeout=30)
        assert r.status_code == 200, r.text[:200]
        g = requests.get(f"{BASE}/class-instances/{iid}/recording",
                         headers=H(student_token), timeout=30)
        assert g.status_code == 200
        assert g.json()["available"] is False and g.json()["reason"] == "not_ready"

    def test_zz_cleanup(self, admin_token, student_token):
        bid = TestZoom.state.get("booking_id")
        if bid:
            requests.delete(f"{BASE}/bookings/{bid}", headers=H(student_token), timeout=30)
        for key in ("instance_id", "extra_instance_id"):
            iid = TestZoom.state.get(key)
            if iid:
                d = requests.delete(f"{BASE}/admin/class-instances/{iid}",
                                    headers=H(admin_token), timeout=30)
                assert d.status_code in (200, 204, 404), d.text[:200]
