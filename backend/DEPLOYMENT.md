# Backend setup and direct-provider configuration

## Requirements

- Python 3.11+ (the assistant uses `asyncio.timeout`). Verified on Python 3.11.
- A reachable MongoDB deployment and the existing server environment settings.
- Install only from the standard package index; no private index is required:

```sh
cd backend
python3.11 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
python -m pip check
python -c "import server"
```

Use your existing Uvicorn service manager to run `server:app`; retain the existing
port/routing configuration. `GET /api/health` checks MongoDB and seeded content.
This change does not provision a server, database or containers.

## Environment

Keep secrets in environment variables or a non-committed `backend/.env`:

| Variable | Requirement |
| --- | --- |
| `MONGO_URL` | Existing MongoDB connection URI |
| `DB_NAME` | Existing database name; do not rename |
| `JWT_SECRET` | Existing JWT signing secret |
| `CREDENTIALS_MASTER_KEY` | Existing Fernet key for encrypted Admin secrets; preserve it |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Existing idempotent seed credentials |
| `CORS_ORIGINS` | Comma-separated allowed frontend origins |
| `OPENAI_API_KEY` | Optional direct OpenAI project API key |

The frontend still uses `REACT_APP_BACKEND_URL`. Never put provider secrets in
frontend variables. Existing payment/Zoom/email variables are unchanged.

## AI behavior

The official `openai` Python SDK calls OpenAI directly. A saved encrypted Admin
`openai_api_key` takes precedence over `OPENAI_API_KEY`. A missing or whitespace-only
key never prevents application import/startup. A valid key can be configured in
Admin → Settings or supplied as `OPENAI_API_KEY` to the backend process.

- Existing model setting: `assistant_openai_model`, currently `gpt-5.4-mini`.
- Transcription: `whisper-1`; speech: `tts-1`, selected Admin voice.
- Keyless chat/voice/TTS/greeting: HTTP 503 with a clear `detail` message.
- Keyless streaming chat: HTTP 200 SSE with `type: error` and `message`, matching
  the existing frontend's streaming error contract.
- Disabled/rate-limited requests still return their existing 403/429 first.
- `/api/assistant/config`, leads, cached-audio retrieval, health and non-AI routes
  do not need an OpenAI key. Normal provider errors are sanitized; no secret or
  raw upstream response is returned to the browser.
- SSE remains `data: {"type":"delta",...}\n\n`, followed by `done` or `error`.
  Keep reverse-proxy buffering disabled for `/api/assistant/chat/stream`.
- Conversation memory, limits and 24-hour Mongo MP3 cache remain unchanged.

No live provider key was available for this migration. Automated provider
responses are test doubles only, not runtime fallbacks or fabricated AI output.

## Verified migration checks

- Clean public-PyPI requirements installation and `pip check`: passed.
- `python -c "import server"` from `backend/`, both runtime and clean venv: passed.
- Managed Uvicorn startup and public `/api/health`: passed.
- Frontend production build and targeted desktop/mobile browser checks: passed.
- Regression suite: 19 tests passed, including direct SDK audio/stream request
  shapes against **MOCKED** upstream responses, limits, sessions, keyless behavior,
  upload bytes and existing public API responses. No live AI key was available.
- References to the removed SDK/build package/proxy are absent from the current
  working-tree application, docs, tests and lockfiles. Historical Git objects are
  not rewritten by this migration.

## Upload storage

Images/PDFs/EPUBs now use GridFS in the existing MongoDB database. No extra storage
provider, credentials or startup network call is needed. Preserve these collections
in backups: `uploaded_files`, `uploaded_objects.files`, `uploaded_objects.chunks`.
Upload limits and `/api/admin/uploads` → `{url,path}` / `/api/files/{path}` stay the
same. No local filesystem volume is required for uploads.

The current database had zero uploaded-file records when migrated. If applying
this code to a different database with files in an old external store, copy those
bytes into GridFS first, using each existing `storage_path` as the GridFS string
ID and filename and retaining the content type metadata. Do not delete original
files before validating the copy. Legacy external files are not silently proxied.