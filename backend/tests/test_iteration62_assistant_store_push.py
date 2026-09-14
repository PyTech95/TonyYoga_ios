"""Iteration 62 regression: assistant, app download links, notifications and push status."""
import os
import uuid
from pathlib import Path

import pytest
import requests
from pymongo import MongoClient


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    pytest.skip("REACT_APP_BACKEND_URL is required for public endpoint testing.", allow_module_level=True)

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL") or "tony@tonyyoga.com"
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD") or "TonyYoga2026!"


@pytest.fixture(scope="session")
def http():
    s = requests.Session()
    return s


@pytest.fixture(scope="session")
def admin_headers(http):
    # Admin auth for settings and notification checks
    res = http.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=20,
    )
    assert res.status_code == 200, res.text
    token = (res.json() or {}).get("token") or (res.json() or {}).get("access_token")
    assert token, "Login succeeded but no token/access_token in response"
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def restore_settings(http, admin_headers):
    # Restore app-store links + assistant limits modified during tests
    before = http.get(f"{BASE_URL}/api/admin/settings", headers=admin_headers, timeout=20)
    assert before.status_code == 200, before.text
    data = before.json()
    original = {
        "app_store_url": data.get("app_store_url", ""),
        "google_play_url": data.get("google_play_url", ""),
        "assistant_session_limit": data.get("assistant_session_limit", 25),
    }
    yield original
    http.patch(f"{BASE_URL}/api/admin/settings", headers=admin_headers, json=original, timeout=20)


def _assistant_chat(http, message, session_id=None, timeout=120):
    payload = {"message": message}
    if session_id:
        payload["session_id"] = session_id
    return http.post(f"{BASE_URL}/api/assistant/chat", json=payload, timeout=timeout)


def test_assistant_config_and_greeting_audio_playable(http):
    # Assistant config + greeting audio must be live and playable
    cfg = http.get(f"{BASE_URL}/api/assistant/config", timeout=20)
    assert cfg.status_code == 200, cfg.text
    body = cfg.json()
    assert body.get("enabled") is True
    assert body.get("popup_delay") == 12
    assert isinstance(body.get("greeting"), str) and body["greeting"].strip()

    greeting = http.get(f"{BASE_URL}/api/assistant/greeting", timeout=90)
    assert greeting.status_code == 200, greeting.text
    g = greeting.json()
    assert isinstance(g.get("audio_url"), str) and g["audio_url"].startswith("/api/assistant/audio/")
    audio = http.get(f"{BASE_URL}{g['audio_url']}", timeout=60)
    assert audio.status_code == 200, audio.text
    assert "audio/mpeg" in (audio.headers.get("content-type") or "")
    assert len(audio.content) > 500


def test_assistant_chat_and_stream_grounded_beginner_reply(http):
    # Validate normal POST and SSE stream compatibility
    msg = "I am a beginner. Which program should I take and what is the price in EUR?"
    r = _assistant_chat(http, msg)
    assert r.status_code == 200, r.text
    data = r.json()
    reply = (data.get("reply") or "").lower()
    assert data.get("session_id")
    assert "core 26" in reply
    assert "199" in reply
    assert "links" in data and isinstance(data["links"], list)
    assert "invented" not in reply

    stream = http.post(
        f"{BASE_URL}/api/assistant/chat/stream",
        json={"message": "Repeat your beginner recommendation briefly."},
        stream=True,
        timeout=120,
    )
    assert stream.status_code == 200
    assert "text/event-stream" in (stream.headers.get("content-type") or "")

    saw_delta = False
    done = None
    for line in stream.iter_lines(decode_unicode=True):
        if not line or not line.startswith("data: "):
            continue
        payload = line[6:]
        event = __import__("json").loads(payload)
        if event.get("type") == "delta":
            saw_delta = True
        if event.get("type") == "done":
            done = event
            break
    assert saw_delta is True
    assert done and done.get("reply")


def test_multi_turn_memory_isolation_and_db_persistence(http):
    # Same session should remember, different session should not share context
    sid1 = str(uuid.uuid4())
    first = _assistant_chat(http, "My name is Rahul and I am a beginner.", session_id=sid1)
    assert first.status_code == 200, first.text

    follow = _assistant_chat(http, "What is my name and which beginner course with price should I take?", session_id=sid1)
    assert follow.status_code == 200, follow.text
    text = (follow.json().get("reply") or "").lower()
    assert "rahul" in text
    assert "core 26" in text

    sid2 = str(uuid.uuid4())
    isolated = _assistant_chat(http, "What is my name?", session_id=sid2)
    assert isolated.status_code == 200, isolated.text
    isolated_text = (isolated.json().get("reply") or "").lower()
    assert "rahul" not in isolated_text

    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    if not mongo_url or not db_name:
        pytest.skip("Mongo env missing; cannot verify chatbot_sessions persistence")
    db = MongoClient(mongo_url)[db_name]
    doc = db.chatbot_sessions.find_one({"id": sid1})
    assert doc is not None
    assert isinstance(doc.get("messages"), list) and len(doc["messages"]) >= 2
    assert doc.get("turns", 0) >= 1


def test_assistant_validation_and_audio_errors(http):
    # Empty/oversize/invalid UUID and unknown audio id should be handled
    empty = http.post(f"{BASE_URL}/api/assistant/chat", json={"message": ""}, timeout=20)
    assert empty.status_code == 422

    oversized = http.post(
        f"{BASE_URL}/api/assistant/chat",
        json={"message": "x" * 2001},
        timeout=20,
    )
    assert oversized.status_code == 422

    bad_uuid = http.post(
        f"{BASE_URL}/api/assistant/chat",
        json={"message": "hello", "session_id": "not-a-uuid"},
        timeout=20,
    )
    assert bad_uuid.status_code == 422

    unknown_audio = http.get(f"{BASE_URL}/api/assistant/audio/{uuid.uuid4()}", timeout=20)
    assert unknown_audio.status_code == 404


def test_assistant_voice_upload_validation(http, tmp_path):
    # Unsupported and empty uploads must return graceful errors
    bad_file = tmp_path / "bad.txt"
    bad_file.write_text("not audio", encoding="utf-8")
    with bad_file.open("rb") as f:
        unsupported = http.post(
            f"{BASE_URL}/api/assistant/voice",
            files={"audio": ("bad.txt", f, "text/plain")},
            data={"speak": "false"},
            timeout=60,
        )
    assert unsupported.status_code == 415

    empty_mp3 = tmp_path / "empty.mp3"
    empty_mp3.write_bytes(b"")
    with empty_mp3.open("rb") as f:
        empty = http.post(
            f"{BASE_URL}/api/assistant/voice",
            files={"audio": ("empty.mp3", f, "audio/mpeg")},
            data={"speak": "false"},
            timeout=60,
        )
    assert empty.status_code == 400


def test_assistant_voice_chain_real_tts_input_two_turns(http, tmp_path):
    # Synthetic MP3 input generated from live TTS; voice endpoint must reply with transcript + links + audio
    sid = str(uuid.uuid4())

    tts1 = http.post(
        f"{BASE_URL}/api/assistant/tts",
        json={"text": "I am a beginner looking for a course"},
        timeout=90,
    )
    assert tts1.status_code == 200, tts1.text
    url1 = tts1.json().get("audio_url")
    assert url1 and url1.startswith("/api/assistant/audio/")
    b1 = http.get(f"{BASE_URL}{url1}", timeout=60)
    assert b1.status_code == 200 and len(b1.content) > 500

    f1 = tmp_path / "voice_turn1.mp3"
    f1.write_bytes(b1.content)
    with f1.open("rb") as audio1:
        voice1 = http.post(
            f"{BASE_URL}/api/assistant/voice",
            files={"audio": ("voice_turn1.mp3", audio1, "audio/mpeg")},
            data={"session_id": sid, "speak": "true"},
            timeout=180,
        )
    assert voice1.status_code == 200, voice1.text
    v1 = voice1.json()
    assert v1.get("session_id") == sid
    assert "beginner" in (v1.get("transcript") or "").lower()
    assert v1.get("reply")
    assert isinstance(v1.get("links"), list)
    assert isinstance(v1.get("audio_url"), str) and v1["audio_url"].startswith("/api/assistant/audio/")

    tts2 = http.post(
        f"{BASE_URL}/api/assistant/tts",
        json={"text": "What is the price?"},
        timeout=90,
    )
    assert tts2.status_code == 200, tts2.text
    b2 = http.get(f"{BASE_URL}{tts2.json()['audio_url']}", timeout=60)
    f2 = tmp_path / "voice_turn2.mp3"
    f2.write_bytes(b2.content)
    with f2.open("rb") as audio2:
        voice2 = http.post(
            f"{BASE_URL}/api/assistant/voice",
            files={"audio": ("voice_turn2.mp3", audio2, "audio/mpeg")},
            data={"session_id": sid, "speak": "true"},
            timeout=180,
        )
    assert voice2.status_code == 200, voice2.text
    v2 = voice2.json()
    assert v2.get("session_id") == sid
    assert "price" in (v2.get("transcript") or "").lower()
    assert v2.get("reply")
    assert isinstance(v2.get("audio_url"), str) and v2["audio_url"].startswith("/api/assistant/audio/")


def test_assistant_per_session_cap(http, admin_headers, restore_settings):
    # Set cap=1, second turn in same session must be blocked
    patch = http.patch(
        f"{BASE_URL}/api/admin/settings",
        headers=admin_headers,
        json={"assistant_session_limit": 1},
        timeout=20,
    )
    assert patch.status_code == 200, patch.text

    sid = str(uuid.uuid4())
    one = _assistant_chat(http, "I am a beginner. Suggest a program.", session_id=sid)
    assert one.status_code == 200, one.text
    two = _assistant_chat(http, "And what is the price?", session_id=sid)
    assert two.status_code == 429


def test_admin_app_store_links_validation_and_public_reflection(http, admin_headers, restore_settings):
    # Admin can save only valid Apple/Google store URLs; public endpoint reflects values
    valid = {
        "app_store_url": "https://apps.apple.com/us/app/example/id123456789",
        "google_play_url": "https://play.google.com/store/apps/details?id=com.example.app",
    }
    saved = http.patch(f"{BASE_URL}/api/admin/settings", headers=admin_headers, json=valid, timeout=20)
    assert saved.status_code == 200, saved.text
    pub = http.get(f"{BASE_URL}/api/settings/public", timeout=20)
    assert pub.status_code == 200
    out = pub.json()
    assert out.get("app_store_url") == valid["app_store_url"]
    assert out.get("google_play_url") == valid["google_play_url"]

    invalid_payloads = [
        {"app_store_url": "javascript:alert(1)"},
        {"google_play_url": "http://play.google.com/store/apps/details?id=com.bad"},
        {"google_play_url": "https://google.com/store/apps/details?id=com.bad"},
        {"app_store_url": {"x": 1}},
        {"app_store_url": "https://apps.apple.com:444/us/app/example/id123"},
    ]
    for payload in invalid_payloads:
        res = http.patch(f"{BASE_URL}/api/admin/settings", headers=admin_headers, json=payload, timeout=20)
        assert res.status_code == 422

    cleared = http.patch(
        f"{BASE_URL}/api/admin/settings",
        headers=admin_headers,
        json={"app_store_url": "", "google_play_url": ""},
        timeout=20,
    )
    assert cleared.status_code == 200
    cleared_pub = http.get(f"{BASE_URL}/api/settings/public", timeout=20).json()
    assert cleared_pub.get("app_store_url", "") == ""
    assert cleared_pub.get("google_play_url", "") == ""


def test_admin_notification_status_and_broadcast_unconfigured(http, admin_headers):
    # Honest channel status + 503 for broadcast when web push is unconfigured
    status = http.get(f"{BASE_URL}/api/admin/notifications/status", headers=admin_headers, timeout=20)
    assert status.status_code == 200, status.text
    data = status.json()
    assert data.get("in_app", {}).get("status") == "available"
    assert data.get("native_push", {}).get("android") == "not_integrated"
    assert data.get("native_push", {}).get("ios") == "not_integrated"

    if not data.get("web_push", {}).get("ready"):
        push = http.post(
            f"{BASE_URL}/api/admin/push/broadcast",
            headers=admin_headers,
            json={"title": "Iteration62 test", "body": "status test", "audience": "all"},
            timeout=20,
        )
        assert push.status_code == 503


def test_in_app_notifications_and_mark_seen(http, admin_headers):
    # In-app notifications API should work and seen watermark should update
    feed = http.get(f"{BASE_URL}/api/notifications", headers=admin_headers, timeout=20)
    assert feed.status_code == 200, feed.text
    before = feed.json()
    assert isinstance(before.get("items"), list)
    assert isinstance(before.get("unread"), int)

    seen = http.post(f"{BASE_URL}/api/notifications/seen", headers=admin_headers, timeout=20)
    assert seen.status_code == 200, seen.text
    seen_data = seen.json()
    assert seen_data.get("ok") is True
    assert isinstance(seen_data.get("seen_at"), str) and seen_data["seen_at"]

    after = http.get(f"{BASE_URL}/api/notifications", headers=admin_headers, timeout=20)
    assert after.status_code == 200
    assert after.json().get("unread", 0) <= before.get("unread", 0)
