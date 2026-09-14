"""Provider migration regression coverage for assistant, uploads, and non-AI public contracts."""
import asyncio
import json
import os
import re
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
import pytest
import requests
from openai import AsyncOpenAI
from pymongo import MongoClient
from starlette.datastructures import UploadFile as StarletteUploadFile


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    pytest.skip("REACT_APP_BACKEND_URL is required for public endpoint testing.", allow_module_level=True)

if "/app/backend" not in sys.path:
    sys.path.insert(0, "/app/backend")


def _read_admin_credentials():
    text = Path("/app/memory/test_credentials.md").read_text(encoding="utf-8")
    email_match = re.search(r"- Email:\s*(.+)", text)
    password_match = re.search(r"- Password:\s*(.+)", text)
    if not email_match or not password_match:
        pytest.skip("Admin credentials missing in /app/memory/test_credentials.md", allow_module_level=True)
    return email_match.group(1).strip(), password_match.group(1).strip()


ADMIN_EMAIL, ADMIN_PASSWORD = _read_admin_credentials()


@pytest.fixture(scope="session")
def http():
    return requests.Session()


@pytest.fixture(scope="session")
def mongo_db():
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    if not mongo_url or not db_name:
        pytest.skip("MONGO_URL and DB_NAME are required for cleanup and persistence checks")
    return MongoClient(mongo_url)[db_name]


@pytest.fixture(scope="session")
def admin_headers(http):
    response = http.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=20,
    )
    assert response.status_code == 200, response.text
    token = (response.json() or {}).get("token") or (response.json() or {}).get("access_token")
    assert token, "Admin login succeeded but no token was returned"
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def restore_assistant_settings(http, admin_headers):
    before = http.get(f"{BASE_URL}/api/admin/settings", headers=admin_headers, timeout=20)
    assert before.status_code == 200, before.text
    snapshot = before.json()
    original = {
        "assistant_enabled": snapshot.get("assistant_enabled", True),
        "assistant_daily_limit": snapshot.get("assistant_daily_limit", 300),
        "assistant_session_limit": snapshot.get("assistant_session_limit", 25),
    }
    yield original
    http.patch(f"{BASE_URL}/api/admin/settings", headers=admin_headers, json=original, timeout=20)


@pytest.fixture
def cleanup_uploads(mongo_db):
    created_paths = []
    yield created_paths
    for path in created_paths:
        mongo_db.uploaded_files.delete_many({"storage_path": path})
        mongo_db.uploaded_objects.files.delete_many({"_id": path})
        mongo_db.uploaded_objects.chunks.delete_many({"files_id": path})


class FakeUpdateResult:
    def __init__(self, matched_count=1):
        self.matched_count = matched_count


class FakeCollection:
    def __init__(self, docs=None):
        self.docs = docs or {}

    async def create_index(self, *args, **kwargs):
        return "ok"

    async def find_one(self, query, projection=None):
        def _match(row, q):
            for key, value in q.items():
                if key == "$or":
                    if not any(_match(row, clause) for clause in value):
                        return False
                    continue
                if isinstance(value, dict):
                    if "$gt" in value and not (row.get(key) is not None and row.get(key) > value["$gt"]):
                        return False
                    if "$lt" in value and not (row.get(key) is not None and row.get(key) < value["$lt"]):
                        return False
                    if "$exists" in value and ((key in row) != bool(value["$exists"])):
                        return False
                    if set(value.keys()) - {"$gt", "$lt", "$exists"}:
                        return False
                    continue
                if row.get(key) != value:
                    return False
            return True

        if "id" in query:
            row = self.docs.get(query["id"])
            return dict(row) if row else None
        if "_id" in query:
            row = self.docs.get(query["_id"])
            return dict(row) if row else None
        for row in self.docs.values():
            if _match(row, query):
                return dict(row)
        return None

    async def find_one_and_update(self, query, update, upsert=False, return_document=None, projection=None):
        key = query.get("_id")
        row = self.docs.get(key)
        if row is None:
            if not upsert:
                return None
            row = {"_id": key}
            self.docs[key] = row
        for field, value in update.get("$inc", {}).items():
            row[field] = int(row.get(field, 0)) + int(value)
        for field, value in update.get("$set", {}).items():
            row[field] = value
        if projection and projection.get("_id") == 0:
            return {k: v for k, v in row.items() if k != "_id"}
        return dict(row)

    async def insert_one(self, doc):
        key = doc.get("id") or doc.get("_id") or str(uuid.uuid4())
        self.docs[key] = dict(doc)
        return {"inserted_id": key}

    async def update_one(self, query, update, upsert=False):
        key = query.get("id") or query.get("_id")
        row = self.docs.get(key)
        if row is None:
            if not upsert:
                return FakeUpdateResult(matched_count=0)
            row = {"id": key} if query.get("id") else {"_id": key}
            self.docs[key] = row

        if "$or" in query:
            lock_ok = False
            for lock_clause in query["$or"]:
                if "busy_until" in lock_clause and "$exists" in lock_clause["busy_until"]:
                    if "busy_until" not in row:
                        lock_ok = True
                elif "busy_until" in lock_clause and "$lt" in lock_clause["busy_until"]:
                    if row.get("busy_until") is None or row.get("busy_until") < lock_clause["busy_until"]["$lt"]:
                        lock_ok = True
            if not lock_ok:
                return FakeUpdateResult(matched_count=0)

        if "lease" in query and row.get("lease") != query["lease"]:
            return FakeUpdateResult(matched_count=0)

        for field, value in update.get("$setOnInsert", {}).items():
            row.setdefault(field, value)
        for field, value in update.get("$set", {}).items():
            row[field] = value
        for field, value in update.get("$inc", {}).items():
            row[field] = int(row.get(field, 0)) + int(value)

        for field, push_cfg in update.get("$push", {}).items():
            row.setdefault(field, [])
            row[field].extend(push_cfg.get("$each", []))
            slice_val = push_cfg.get("$slice")
            if isinstance(slice_val, int) and slice_val < 0:
                row[field] = row[field][slice_val:]

        for field in update.get("$unset", {}).keys():
            row.pop(field, None)

        return FakeUpdateResult(matched_count=1)


class FakeDB:
    def __init__(self):
        self.chatbot_sessions = FakeCollection()
        self.assistant_usage = FakeCollection()
        self.assistant_audio = FakeCollection()
        self.assistant_requests = FakeCollection()


class _AwaitableClose:
    def __init__(self):
        self.awaited = False

    def __await__(self):
        async def _inner():
            self.awaited = True
        return _inner().__await__()


@pytest.mark.anyio
async def test_audio_speech_sdk_binary_cache_hit_and_upstream_single_call(monkeypatch):
    # assistant_audio.speech: direct SDK mock transport success + cache hit contract
    import assistant_audio as audio

    fake_db = FakeDB()
    call_count = {"tts": 0}
    payload_bytes = b"ID3" + b"A" * 64

    async def handler(request: httpx.Request):
        if request.url.path.endswith("/audio/speech"):
            call_count["tts"] += 1
            body = json.loads(request.content.decode())
            assert body["model"] == "tts-1"
            assert body["voice"] == "nova"
            assert body["response_format"] == "mp3"
            assert "https://" not in body["input"]
            return httpx.Response(200, headers={"content-type": "audio/mpeg"}, content=payload_bytes)
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    created_clients = []

    class TrackingClient(httpx.AsyncClient):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self.closed_seen = False

        async def aclose(self):
            self.closed_seen = True
            await super().aclose()

    def client_factory(*args, **kwargs):
        client = TrackingClient(transport=transport)
        created_clients.append(client)
        return AsyncOpenAI(api_key="test-key", base_url="https://mock.local/v1", max_retries=0, http_client=client)

    async def fake_setting(key):
        if key == "assistant_voice":
            return "nova"
        return None

    monkeypatch.setattr(audio, "db", fake_db)
    monkeypatch.setattr(audio, "AsyncOpenAI", client_factory)
    monkeypatch.setattr(audio, "get_setting", fake_setting)
    monkeypatch.setattr(audio, "openai_key", lambda: asyncio.sleep(0, result="test-key"))

    first_url = await audio.speech("Hello https://example.com **Tony**", voice=None)
    second_url = await audio.speech("Hello https://example.com **Tony**", voice=None)

    assert first_url.startswith("/api/assistant/audio/")
    assert second_url == first_url
    assert call_count["tts"] == 1
    assert len(fake_db.assistant_audio.docs) == 1
    stored = list(fake_db.assistant_audio.docs.values())[0]
    assert stored["audio"] == payload_bytes
    assert all(c.closed_seen for c in created_clients)


@pytest.mark.anyio
async def test_audio_transcribe_multipart_contract_model_filename_and_text(monkeypatch):
    # assistant_audio.transcribe: multipart upload includes whisper model + generated filename
    import assistant_audio as audio

    observed = {"body": b"", "ctype": "", "path": ""}

    async def handler(request: httpx.Request):
        observed["body"] = request.content
        observed["ctype"] = request.headers.get("content-type", "")
        observed["path"] = request.url.path
        return httpx.Response(200, json={"text": "  spoken words  "})

    transport = httpx.MockTransport(handler)

    def client_factory(*args, **kwargs):
        return AsyncOpenAI(
            api_key="test-key",
            base_url="https://mock.local/v1",
            max_retries=0,
            http_client=httpx.AsyncClient(transport=transport),
        )

    monkeypatch.setattr(audio, "AsyncOpenAI", client_factory)
    monkeypatch.setattr(audio, "openai_key", lambda: asyncio.sleep(0, result="test-key"))

    upload = StarletteUploadFile(filename="clip.mp3", file=__import__("io").BytesIO(b"ID3" + b"1" * 32))
    result = await audio.transcribe(upload)

    assert observed["path"] in ("/audio/transcriptions", "/v1/audio/transcriptions")
    assert "multipart/form-data" in observed["ctype"]
    assert b'name="model"' in observed["body"]
    assert b"whisper-1" in observed["body"]
    assert b'name="file"; filename="voice.mp3"' in observed["body"]
    assert result == "spoken words"


@pytest.mark.anyio
async def test_assistant_voice_contract_transcript_audio_error_end_and_speak_false(monkeypatch):
    # assistant /voice route: transcript + end_conversation + audio_url/audio_error handling via ASGI transport
    import server
    from fastapi import HTTPException
    import routers.assistant as assistant_router

    async def allow_guard():
        return None

    async def allow_limits(_sid):
        return None

    async def fake_answer(payload, _user):
        return {"session_id": str(payload.session_id) if payload.session_id else "sid-voice", "reply": "assistant reply", "links": []}

    app = server.app
    app.dependency_overrides[assistant_router.request_guard] = allow_guard
    app.dependency_overrides[assistant_router.get_optional_user] = lambda: None
    monkeypatch.setattr(assistant_router, "check_limits", allow_limits)

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        monkeypatch.setattr(assistant_router, "transcribe", lambda _audio: asyncio.sleep(0, result="bye"))
        monkeypatch.setattr(assistant_router, "answer", fake_answer)
        monkeypatch.setattr(assistant_router, "speech", lambda text: asyncio.sleep(0, result="/api/assistant/audio/speech-ok"))

        r_speak = await client.post(
            "/api/assistant/voice",
            files={"audio": ("clip.mp3", b"ID3" + b"2" * 16, "audio/mpeg")},
            data={"speak": "true"},
        )
        assert r_speak.status_code == 200
        speak_data = r_speak.json()
        assert speak_data["transcript"] == "bye"
        assert speak_data["audio_url"] == "/api/assistant/audio/speech-ok"
        assert speak_data["end_conversation"] is True

        monkeypatch.setattr(assistant_router, "speech", lambda text: (_ for _ in ()).throw(HTTPException(502, "Voice playback is unavailable.")))
        r_tts_fail = await client.post(
            "/api/assistant/voice",
            files={"audio": ("clip.mp3", b"ID3" + b"3" * 16, "audio/mpeg")},
            data={"speak": "true"},
        )
        assert r_tts_fail.status_code == 200
        tts_fail_data = r_tts_fail.json()
        assert tts_fail_data["audio_error"] == "Voice playback is unavailable."
        assert tts_fail_data.get("audio_url") is None

        monkeypatch.setattr(assistant_router, "transcribe", lambda _audio: asyncio.sleep(0, result="Need schedule details"))
        r_no_speak = await client.post(
            "/api/assistant/voice",
            files={"audio": ("clip.mp3", b"ID3" + b"4" * 16, "audio/mpeg")},
            data={"speak": "false"},
        )
        assert r_no_speak.status_code == 200
        no_speak_data = r_no_speak.json()
        assert no_speak_data["transcript"] == "Need schedule details"
        assert no_speak_data["end_conversation"] is False
        assert no_speak_data.get("audio_url") is None
        assert no_speak_data.get("audio_error") is None

    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_reply_stream_two_turns_same_session_plus_isolated_session_no_bleed(monkeypatch):
    # assistant_engine: two sequential turns retain same-session history; separate session receives no bleed
    import assistant_engine as engine

    fake_db = FakeDB()
    created_clients = []
    opened_streams = []

    class TrackStream(httpx.AsyncByteStream):
        def __init__(self, chunks):
            self.chunks = chunks
            self.closed = False

        async def __aiter__(self):
            for chunk in self.chunks:
                yield chunk

        async def aclose(self):
            self.closed = True

    class TrackingClient(httpx.AsyncClient):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self.closed_seen = False

        async def aclose(self):
            self.closed_seen = True
            await super().aclose()

    captures = []

    async def handler(request: httpx.Request):
        payload = json.loads(request.content.decode())
        captures.append(payload)
        text = "A1" if len(captures) == 1 else ("A2" if len(captures) == 2 else "B1")
        body = (
            f'data: {{"id":"cmpl","object":"chat.completion.chunk","created":1,"model":"gpt","choices":[{{"index":0,"delta":{{"content":"{text}"}},"finish_reason":null}}]}}\n\n'
            "data: {\"id\":\"cmpl\",\"object\":\"chat.completion.chunk\",\"created\":1,\"model\":\"gpt\",\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"stop\"}]}\n\n"
            "data: [DONE]\\n\\n"
        ).encode()
        stream = TrackStream([body])
        opened_streams.append(stream)
        return httpx.Response(200, headers={"content-type": "text/event-stream"}, stream=stream)

    transport = httpx.MockTransport(handler)

    def client_factory(*args, **kwargs):
        client = TrackingClient(transport=transport)
        created_clients.append(client)
        return AsyncOpenAI(api_key="test-key", base_url="https://mock.local/v1", max_retries=0, http_client=client)

    monkeypatch.setattr(engine, "db", fake_db)
    monkeypatch.setattr(engine, "AsyncOpenAI", client_factory)
    monkeypatch.setattr(engine, "get_setting", lambda key: asyncio.sleep(0, result="gpt-5.4-mini" if key == "assistant_openai_model" else None))
    monkeypatch.setattr(engine, "check_limits", lambda _sid: asyncio.sleep(0))
    monkeypatch.setattr(engine, "openai_key", lambda: asyncio.sleep(0, result="test-key"))
    monkeypatch.setattr(engine, "catalog", lambda: asyncio.sleep(0, result={}))
    monkeypatch.setattr(engine, "context_text", lambda _: "system")
    monkeypatch.setattr(engine, "reply_links", lambda *_: [])

    sid1 = "s-1"
    sid2 = "s-2"
    async for _ in engine.reply_stream(sid1, "first question"):
        pass
    async for _ in engine.reply_stream(sid1, "follow up"):
        pass
    async for _ in engine.reply_stream(sid2, "independent"):
        pass

    assert len(captures) == 3
    second_messages = captures[1]["messages"]
    assert any(m == {"role": "user", "content": "first question"} for m in second_messages)
    assert any(m == {"role": "assistant", "content": "A1"} for m in second_messages)
    assert second_messages[-1] == {"role": "user", "content": "follow up"}

    third_messages = captures[2]["messages"]
    combined = "\n".join(m.get("content", "") for m in third_messages)
    assert "first question" not in combined
    assert "follow up" not in combined
    assert "A1" not in combined
    assert third_messages[-1] == {"role": "user", "content": "independent"}

    assert all(stream.closed for stream in opened_streams)
    assert all(client.closed_seen for client in created_clients)


@pytest.mark.anyio
@pytest.mark.parametrize("mode", ["provider_401", "provider_429", "timeout", "empty_stream"])
async def test_reply_stream_upstream_failures_sanitized_without_usage_increment(monkeypatch, mode):
    # assistant_engine: 401/429/timeout/empty stream sanitized; no successful-turn usage increment
    import assistant_engine as engine
    from fastapi import HTTPException

    fake_db = FakeDB()
    sid = f"sid-{mode}"
    fake_db.chatbot_sessions.docs[sid] = {"id": sid, "messages": [], "turns": 0}

    async def handler(_request: httpx.Request):
        if mode == "provider_401":
            return httpx.Response(401, json={"error": {"message": "invalid api key raw"}})
        if mode == "provider_429":
            return httpx.Response(429, json={"error": {"message": "rate limit raw"}})
        if mode == "empty_stream":
            payload = "data: [DONE]\\n\\n"
            return httpx.Response(200, headers={"content-type": "text/event-stream"}, text=payload)
        raise httpx.ReadTimeout("upstream timeout", request=_request)

    transport = httpx.MockTransport(handler)

    def client_factory(*args, **kwargs):
        return AsyncOpenAI(api_key="test-key", base_url="https://mock.local/v1", max_retries=0, http_client=httpx.AsyncClient(transport=transport))

    monkeypatch.setattr(engine, "db", fake_db)
    monkeypatch.setattr(engine, "AsyncOpenAI", client_factory)
    monkeypatch.setattr(engine, "get_setting", lambda key: asyncio.sleep(0, result="gpt-5.4-mini" if key == "assistant_openai_model" else None))
    monkeypatch.setattr(engine, "check_limits", lambda _sid: asyncio.sleep(0))
    monkeypatch.setattr(engine, "openai_key", lambda: asyncio.sleep(0, result="test-key"))
    monkeypatch.setattr(engine, "catalog", lambda: asyncio.sleep(0, result={}))
    monkeypatch.setattr(engine, "context_text", lambda _: "system")
    monkeypatch.setattr(engine, "reply_links", lambda *_: [])

    with pytest.raises(HTTPException) as exc:
        async for _ in engine.reply_stream(sid, "hello"):
            pass

    assert exc.value.status_code == 502
    assert "raw" not in exc.value.detail.lower()
    session = fake_db.chatbot_sessions.docs[sid]
    assert session["turns"] == 0
    assert "lease" not in session
    assert "busy_until" not in session
    assert fake_db.assistant_usage.docs == {}


@pytest.mark.anyio
async def test_request_guard_41st_request_hits_429_with_isolated_fake_data(monkeypatch):
    # assistant_engine.request_guard: local fake counter should reject 41st minute-bucket call
    import assistant_engine as engine
    from fastapi import HTTPException
    from starlette.requests import Request

    fake_db = FakeDB()
    monkeypatch.setattr(engine, "db", fake_db)
    monkeypatch.setattr(engine, "get_setting", lambda key: asyncio.sleep(0, result=True))
    monkeypatch.setattr(engine, "ensure_indexes", lambda: asyncio.sleep(0))
    monkeypatch.setattr(engine, "now_utc", lambda: datetime(2026, 2, 10, 12, 0, tzinfo=timezone.utc))

    req = Request({"type": "http", "headers": [], "client": ("1.2.3.4", 12345)})
    for _ in range(40):
        await engine.request_guard(req)

    with pytest.raises(HTTPException) as exc:
        await engine.request_guard(req)
    assert exc.value.status_code == 429


@pytest.mark.anyio
async def test_reply_stream_busy_session_returns_409_with_fake_data(monkeypatch):
    # assistant_engine.reply_stream: lock contention should return 409 using isolated fake storage
    import assistant_engine as engine
    from fastapi import HTTPException

    fake_db = FakeDB()
    sid = "busy-sid"
    now = datetime(2026, 2, 10, 12, 0, tzinfo=timezone.utc)
    fake_db.chatbot_sessions.docs[sid] = {"id": sid, "messages": [], "turns": 0, "busy_until": now + timedelta(seconds=60)}

    monkeypatch.setattr(engine, "db", fake_db)
    monkeypatch.setattr(engine, "now_utc", lambda: now)
    monkeypatch.setattr(engine, "check_limits", lambda _sid: asyncio.sleep(0))
    monkeypatch.setattr(engine, "openai_key", lambda: asyncio.sleep(0, result="test-key"))

    with pytest.raises(HTTPException) as exc:
        async for _ in engine.reply_stream(sid, "hello"):
            pass
    assert exc.value.status_code == 409


@pytest.mark.anyio
async def test_upload_get_object_close_non_coroutine_awaitable_is_awaited(monkeypatch):
    # uploads._get_object must await generic awaitables, not only coroutine objects.
    import routers.uploads as uploads

    close_handle = _AwaitableClose()

    class FakeStream:
        metadata = {"content_type": "application/pdf"}

        async def read(self):
            return b"PDF"

        def close(self):
            return close_handle

    class FakeStorage:
        async def open_download_stream(self, _path):
            return FakeStream()

    monkeypatch.setattr(uploads, "storage", FakeStorage())
    data, content_type = await uploads._get_object("x")
    assert data == b"PDF"
    assert content_type == "application/pdf"
    assert close_handle.awaited is True


@pytest.mark.anyio
async def test_sdk_stream_request_contract_and_memory(monkeypatch):
    # assistant_engine: verify official SDK stream contract, model/token params, session memory write + usage increment
    import assistant_engine as engine

    fake_db = FakeDB()
    sid = "sess-1"
    fake_db.chatbot_sessions.docs[sid] = {
        "id": sid,
        "messages": [{"role": "visitor", "text": f"q{i}"} for i in range(20)] + [{"role": "assistant", "text": f"a{i}"} for i in range(20)],
        "turns": 3,
    }

    captured = {"json": None, "path": None}

    async def handler(request: httpx.Request):
        captured["path"] = request.url.path
        captured["json"] = json.loads(request.content.decode())
        payload = (
            'data: {"id":"cmpl-1","object":"chat.completion.chunk","created":1,'
            '"model":"gpt-5.4-mini","choices":[{"index":0,"delta":{"content":"Hi"},"finish_reason":null}]}'
            "\n\n"
            'data: {"id":"cmpl-1","object":"chat.completion.chunk","created":1,'
            '"model":"gpt-5.4-mini","choices":[{"index":0,"delta":{"content":" there"},"finish_reason":null}]}'
            "\n\n"
            'data: {"id":"cmpl-1","object":"chat.completion.chunk","created":1,'
            '"model":"gpt-5.4-mini","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}'
            "\n\n"
            "data: [DONE]\\n\\n"
        )
        return httpx.Response(200, headers={"content-type": "text/event-stream"}, text=payload)

    transport = httpx.MockTransport(handler)

    def client_factory(*args, **kwargs):
        return AsyncOpenAI(
            api_key="test-key",
            base_url="https://mock.local/v1",
            max_retries=0,
            http_client=httpx.AsyncClient(transport=transport),
        )

    async def fake_setting(key):
        if key == "assistant_openai_model":
            return "gpt-5.4-mini"
        return None

    async def noop_limits(_sid):
        return None

    async def fake_catalog():
        return {"programs": [{"title": "Core 26"}]}

    monkeypatch.setattr(engine, "db", fake_db)
    monkeypatch.setattr(engine, "AsyncOpenAI", client_factory)
    monkeypatch.setattr(engine, "get_setting", fake_setting)
    monkeypatch.setattr(engine, "check_limits", noop_limits)
    monkeypatch.setattr(engine, "openai_key", lambda: asyncio.sleep(0, result="test-key"))
    monkeypatch.setattr(engine, "catalog", fake_catalog)
    monkeypatch.setattr(engine, "context_text", lambda _: "system")
    monkeypatch.setattr(engine, "reply_links", lambda *_: [{"label": "Programs", "href": "/programs"}])

    events = []
    async for ev in engine.reply_stream(sid, "new user message"):
        events.append(ev)

    assert captured["path"] in ("/chat/completions", "/v1/chat/completions")
    assert captured["json"]["model"] == "gpt-5.4-mini"
    assert captured["json"]["max_completion_tokens"] == 450

    outbound_messages = captured["json"]["messages"]
    assert outbound_messages[-1] == {"role": "user", "content": "new user message"}
    assert sum(1 for m in outbound_messages if m.get("content") == "new user message") == 1
    assert len(outbound_messages) == 18  # system + last 16 history + new user

    assert [e["type"] for e in events[:-1]] == ["delta", "delta"]
    assert events[-1]["type"] == "done"
    assert events[-1]["reply"] == "Hi there"

    saved = fake_db.chatbot_sessions.docs[sid]
    assert len(saved["messages"]) == 40
    assert saved["messages"][-2]["role"] == "visitor"
    assert saved["messages"][-2]["text"] == "new user message"
    assert saved["messages"][-1]["role"] == "assistant"
    assert saved["messages"][-1]["text"] == "Hi there"
    assert saved["turns"] == 4

    usage_doc = fake_db.assistant_usage.docs[list(fake_db.assistant_usage.docs.keys())[0]]
    assert usage_doc["count"] == 1


@pytest.mark.anyio
async def test_stream_error_sanitized_and_lease_released(monkeypatch):
    # assistant_engine: upstream failure should return sanitized HTTPException and release conversation lease
    import assistant_engine as engine
    from fastapi import HTTPException

    fake_db = FakeDB()
    sid = "sess-err"
    fake_db.chatbot_sessions.docs[sid] = {"id": sid, "messages": [], "turns": 0}

    async def handler(_request: httpx.Request):
        return httpx.Response(500, json={"error": {"message": "upstream raw failure with secret-like text"}})

    transport = httpx.MockTransport(handler)

    def client_factory(*args, **kwargs):
        return AsyncOpenAI(api_key="test-key", base_url="https://mock.local/v1", max_retries=0, http_client=httpx.AsyncClient(transport=transport))

    monkeypatch.setattr(engine, "db", fake_db)
    monkeypatch.setattr(engine, "AsyncOpenAI", client_factory)
    monkeypatch.setattr(engine, "get_setting", lambda key: asyncio.sleep(0, result="gpt-5.4-mini" if key == "assistant_openai_model" else None))
    monkeypatch.setattr(engine, "check_limits", lambda _sid: asyncio.sleep(0))
    monkeypatch.setattr(engine, "openai_key", lambda: asyncio.sleep(0, result="test-key"))
    monkeypatch.setattr(engine, "catalog", lambda: asyncio.sleep(0, result={}))
    monkeypatch.setattr(engine, "context_text", lambda _: "system")
    monkeypatch.setattr(engine, "reply_links", lambda *_: [])

    with pytest.raises(HTTPException) as exc:
        async for _ in engine.reply_stream(sid, "hello"):
            pass

    assert exc.value.status_code == 502
    assert "trouble answering" in exc.value.detail
    assert "secret" not in exc.value.detail.lower()
    assert "lease" not in fake_db.chatbot_sessions.docs[sid]
    assert "busy_until" not in fake_db.chatbot_sessions.docs[sid]
    assert fake_db.chatbot_sessions.docs[sid]["turns"] == 0


@pytest.mark.anyio
async def test_partial_stream_then_cancel_does_not_store_reply(monkeypatch):
    # assistant_engine: partial delta followed by cancellation should not persist assistant turn
    import assistant_engine as engine

    fake_db = FakeDB()
    sid = "sess-cancel"
    fake_db.chatbot_sessions.docs[sid] = {"id": sid, "messages": [], "turns": 0}

    async def handler(_request: httpx.Request):
        payload = (
            'data: {"id":"cmpl-1","object":"chat.completion.chunk","created":1,'
            '"model":"gpt-5.4-mini","choices":[{"index":0,"delta":{"content":"partial"},"finish_reason":null}]}'
            "\n\n"
        )
        return httpx.Response(200, headers={"content-type": "text/event-stream"}, text=payload)

    transport = httpx.MockTransport(handler)

    def client_factory(*args, **kwargs):
        return AsyncOpenAI(api_key="test-key", base_url="https://mock.local/v1", max_retries=0, http_client=httpx.AsyncClient(transport=transport))

    monkeypatch.setattr(engine, "db", fake_db)
    monkeypatch.setattr(engine, "AsyncOpenAI", client_factory)
    monkeypatch.setattr(engine, "get_setting", lambda key: asyncio.sleep(0, result="gpt-5.4-mini" if key == "assistant_openai_model" else None))
    monkeypatch.setattr(engine, "check_limits", lambda _sid: asyncio.sleep(0))
    monkeypatch.setattr(engine, "openai_key", lambda: asyncio.sleep(0, result="test-key"))
    monkeypatch.setattr(engine, "catalog", lambda: asyncio.sleep(0, result={}))
    monkeypatch.setattr(engine, "context_text", lambda _: "system")
    monkeypatch.setattr(engine, "reply_links", lambda *_: [])

    stream = engine.reply_stream(sid, "hello")
    first = await anext(stream)
    assert first["type"] == "delta"
    await stream.aclose()

    saved = fake_db.chatbot_sessions.docs[sid]
    assert saved["messages"] == []
    assert saved["turns"] == 0
    assert "lease" not in saved
    assert "busy_until" not in saved


def test_missing_key_ai_routes_and_non_ai_routes(http, mongo_db):
    # assistant routes without configured key should fail safely; non-AI routes remain available
    chat = http.post(f"{BASE_URL}/api/assistant/chat", json={"message": "hello"}, timeout=30)
    assert chat.status_code == 503
    assert "not configured" in (chat.json() or {}).get("detail", "").lower()

    stream = http.post(
        f"{BASE_URL}/api/assistant/chat/stream",
        json={"message": "hello"},
        stream=True,
        timeout=30,
    )
    assert stream.status_code == 200
    assert "text/event-stream" in (stream.headers.get("content-type") or "")
    stream_event = None
    for line in stream.iter_lines(decode_unicode=True):
        if line and line.startswith("data: "):
            stream_event = json.loads(line[6:])
            break
    assert stream_event and stream_event.get("type") == "error"
    assert "not configured" in stream_event.get("message", "").lower()

    tts = http.post(f"{BASE_URL}/api/assistant/tts", json={"text": "hello"}, timeout=30)
    assert tts.status_code == 503
    greeting = http.get(f"{BASE_URL}/api/assistant/greeting", timeout=30)
    assert greeting.status_code == 503

    cfg = http.get(f"{BASE_URL}/api/assistant/config", timeout=20)
    assert cfg.status_code == 200
    lead_email = f"provider-migration-{uuid.uuid4()}@example.com"
    lead = http.post(f"{BASE_URL}/api/assistant/lead", json={"name": "Test", "email": lead_email}, timeout=20)
    assert lead.status_code == 200
    lead_id = (lead.json() or {}).get("lead_id")
    if lead_id:
        mongo_db.ai_leads.delete_many({"id": lead_id})


def test_assistant_controls_disabled_and_caps(http, admin_headers, restore_assistant_settings):
    # assistant router controls: disable=403, daily cap and per-session cap return 429
    from datetime import datetime, timezone
    today = datetime.now(timezone.utc).date().isoformat()
    mongo = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    prior_usage = mongo.assistant_usage.find_one({"_id": today})
    sid_uuid = str(uuid.uuid4())

    try:
        disable = http.patch(
            f"{BASE_URL}/api/admin/settings",
            headers=admin_headers,
            json={"assistant_enabled": False},
            timeout=20,
        )
        assert disable.status_code == 200, disable.text

        blocked = http.post(f"{BASE_URL}/api/assistant/chat", json={"message": "hello"}, timeout=20)
        assert blocked.status_code == 403

        enable_and_limit = http.patch(
            f"{BASE_URL}/api/admin/settings",
            headers=admin_headers,
            json={"assistant_enabled": True, "assistant_daily_limit": 0, "assistant_session_limit": 0},
            timeout=20,
        )
        assert enable_and_limit.status_code == 200, enable_and_limit.text

        mongo.assistant_usage.update_one({"_id": today}, {"$set": {"count": 1, "date": today}}, upsert=True)
        set_daily = http.patch(
            f"{BASE_URL}/api/admin/settings",
            headers=admin_headers,
            json={"assistant_daily_limit": 1},
            timeout=20,
        )
        assert set_daily.status_code == 200, set_daily.text

        daily_block = http.post(f"{BASE_URL}/api/assistant/chat", json={"message": "hi"}, timeout=20)
        assert daily_block.status_code == 429

        mongo.chatbot_sessions.update_one({"id": sid_uuid}, {"$set": {"id": sid_uuid, "turns": 1}}, upsert=True)
        set_session = http.patch(
            f"{BASE_URL}/api/admin/settings",
            headers=admin_headers,
            json={"assistant_daily_limit": 0, "assistant_session_limit": 1},
            timeout=20,
        )
        assert set_session.status_code == 200, set_session.text
        session_block_valid = http.post(
            f"{BASE_URL}/api/assistant/chat",
            json={"message": "hello", "session_id": sid_uuid},
            timeout=20,
        )
        assert session_block_valid.status_code == 429
    finally:
        mongo.chatbot_sessions.delete_many({"id": sid_uuid})
        if prior_usage is None:
            mongo.assistant_usage.delete_many({"_id": today})
        else:
            mongo.assistant_usage.replace_one({"_id": today}, prior_usage, upsert=True)


def test_voice_validation_and_keyless_behavior(http, tmp_path):
    # voice route should enforce validation and return controlled keyless failure for valid file path
    bad = tmp_path / "bad.txt"
    bad.write_text("not audio", encoding="utf-8")
    with bad.open("rb") as fh:
        unsupported = http.post(
            f"{BASE_URL}/api/assistant/voice",
            files={"audio": ("bad.txt", fh, "text/plain")},
            data={"speak": "false"},
            timeout=30,
        )
    assert unsupported.status_code == 415

    empty = tmp_path / "empty.mp3"
    empty.write_bytes(b"")
    with empty.open("rb") as fh:
        empty_res = http.post(
            f"{BASE_URL}/api/assistant/voice",
            files={"audio": ("empty.mp3", fh, "audio/mpeg")},
            data={"speak": "false"},
            timeout=30,
        )
    assert empty_res.status_code == 400

    small_mp3 = tmp_path / "tiny.mp3"
    small_mp3.write_bytes(b"ID3" + b"0" * 128)
    with small_mp3.open("rb") as fh:
        keyless = http.post(
            f"{BASE_URL}/api/assistant/voice",
            files={"audio": ("tiny.mp3", fh, "audio/mpeg")},
            data={"speak": "false"},
            timeout=30,
        )
    assert keyless.status_code == 503


def test_uploads_gridfs_and_public_fetch(http, admin_headers, cleanup_uploads, tmp_path):
    # uploads router: admin image/pdf upload -> same path/url and public byte-for-byte retrieval
    png_bytes = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
    pdf_bytes = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"

    image = http.post(
        f"{BASE_URL}/api/admin/uploads",
        headers=admin_headers,
        files={"file": ("test.png", png_bytes, "image/png")},
        timeout=30,
    )
    assert image.status_code == 200, image.text
    image_data = image.json()
    assert image_data["url"] == f"/api/files/{image_data['path']}"
    cleanup_uploads.append(image_data["path"])

    public_image = http.get(f"{BASE_URL}{image_data['url']}", timeout=30)
    assert public_image.status_code == 200
    assert public_image.content == png_bytes
    assert "image/png" in (public_image.headers.get("content-type") or "")

    doc = http.post(
        f"{BASE_URL}/api/admin/uploads",
        headers=admin_headers,
        files={"file": ("book.pdf", pdf_bytes, "application/pdf")},
        timeout=30,
    )
    assert doc.status_code == 200, doc.text
    doc_data = doc.json()
    cleanup_uploads.append(doc_data["path"])
    public_doc = http.get(f"{BASE_URL}{doc_data['url']}", timeout=30)
    assert public_doc.status_code == 200
    assert public_doc.content == pdf_bytes
    assert "application/pdf" in (public_doc.headers.get("content-type") or "")

    anon_http = requests.Session()
    anon = anon_http.post(
        f"{BASE_URL}/api/admin/uploads",
        files={"file": ("test.png", png_bytes, "image/png")},
        timeout=30,
    )
    assert anon.status_code in (401, 403)

    missing = http.get(f"{BASE_URL}/api/files/tony-yoga/retreats/{uuid.uuid4()}.png", timeout=30)
    assert missing.status_code == 404


def test_upload_size_limit_and_non_ai_regression(http, admin_headers):
    # uploads + non-AI regressions: size cap 413 and health/settings/programs/products/login contracts remain stable
    big = b"\x89PNG\r\n\x1a\n" + b"x" * (10 * 1024 * 1024 + 2)
    over = http.post(
        f"{BASE_URL}/api/admin/uploads",
        headers=admin_headers,
        files={"file": ("big.png", big, "image/png")},
        timeout=60,
    )
    assert over.status_code == 413

    for endpoint in ("/api/health", "/api/settings/public", "/api/programs", "/api/products"):
        r = http.get(f"{BASE_URL}{endpoint}", timeout=20)
        assert r.status_code == 200, f"{endpoint}: {r.status_code} {r.text}"

    settings_before = json.loads(Path("/app/test_reports/provider_migration/tony-settings-before.json").read_text(encoding="utf-8"))
    programs_before = json.loads(Path("/app/test_reports/provider_migration/tony-programs-before.json").read_text(encoding="utf-8"))
    products_before = json.loads(Path("/app/test_reports/provider_migration/tony-products-before.json").read_text(encoding="utf-8"))

    settings_now = http.get(f"{BASE_URL}/api/settings/public", timeout=20).json()
    programs_now = http.get(f"{BASE_URL}/api/programs", timeout=20).json()
    products_now = http.get(f"{BASE_URL}/api/products", timeout=20).json()

    for key in ("assistant_enabled", "assistant_popup_delay", "assistant_greeting", "default_currency"):
        assert settings_now.get(key) == settings_before.get(key)

    before_program_titles = sorted(item.get("title") for item in programs_before)
    now_program_titles = sorted(item.get("title") for item in programs_now)
    assert now_program_titles == before_program_titles

    before_product_titles = sorted(item.get("title") for item in products_before)
    now_product_titles = sorted(item.get("title") for item in products_now)
    for title in before_product_titles:
        assert title in now_product_titles
