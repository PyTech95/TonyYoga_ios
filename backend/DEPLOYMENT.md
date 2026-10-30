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
| `GEMINI_API_KEY` | Optional Google Gemini API key (Google AI Studio) |

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

### Google Gemini (optional)

Admin → Settings → AI Assistant has a **Google Gemini API key** box and an **AI provider**
choice (`assistant_provider`: `auto` | `gemini` | `openai`). On `auto` (the default), Gemini
answers as soon as a Gemini key is saved; otherwise OpenAI. The encrypted Admin
`gemini_api_key` takes precedence over `GEMINI_API_KEY`. Gemini is called over plain HTTPS
(`assistant_gemini.py`, no extra package).

- Chat and voice transcription: `assistant_gemini_model` (default `gemini-3.5-flash-lite`).
- Speech: `assistant_gemini_tts_model` (default `gemini-3.8-flash-lite-tts`), voice
  `assistant_gemini_voice` (default `Kore`); audio is served as `audio/wav`.
- Admin → Settings → **Test the assistant** (`POST /api/admin/assistant/test`, admin only)
  checks the saved key with one short answer and one spoken line.
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
## Students, access & payments (Oct 2026)

- **Admin → Students, access & payments**: search every student; open one to give or remove
  courses, memberships, live-class series and class credits (lifetime, N days or until a date),
  book them into classes, choose the course included in their plan, re-check or confirm payments,
  email/copy a sign-in link, message them, block sign-in, and see the full change history
  (`member_audit`). Bulk actions and CSV/Excel import of old-website members (`/api/admin/members/import`,
  preview first). Endpoints live in `routers/members.py`.
- **Membership plans now open courses**: each plan has `includes_all_courses`, `included_program_ids`,
  `choose_courses` (+ `choosable_program_ids`), `includes_library`, `includes_live_classes`,
  `live_classes_per_week`. On first start, existing plans get these from their feature list
  (Essential = 1 course of the member's choice + 2 live classes/week; Unlimited/Annual = every course).
- **Teacher-training packages** open their online course(s) after payment (`program_ids`,
  `access_days`, set in Packages & prices; until set, core26 → "Core 26+" etc.).
- **Payment re-check**: every 5 minutes, card (Stripe) and PayPal payments started in the last 3 days
  that never got confirmed are checked with the provider and delivered if paid (an approved PayPal order
  is captured). Admin → Settings → Member care can switch this off.
- **My Yoga** (`/my-yoga`, `GET /api/me/library`): the student's membership, courses, classes,
  trainings and orders. After paying, buyers land on what they bought.
- **Notifications** (`notify.py`): purchases, admin changes, order shipping and membership-ending
  reminders go to the bell, browser push, phone push (when configured) and email.
- **Phone push** (`native_push.py`): Admin → Settings → Phone app notifications takes a Firebase
  service-account JSON (Android) and an Apple .p8 key + key ID + team ID (iPhone). Needs `h2`
  (in requirements.txt). The app registers with `POST /api/push/device`.
- **Orders**: statuses paid → processing → shipped → delivered (+ cancelled/refunded) with tracking and a
  timeline; Printful status is synced every 2 hours and by webhook (Admin → Orders → Connect Printful
  shipping updates).
- New Python packages: `h2`, `hpack`, `hyperframe` (Apple push over HTTP/2) and `openpyxl`, `et_xmlfile`
  (Excel import). `deploy/server-deploy.sh` installs them because requirements.txt changed.

## Platform 2.0 (Nov 2026): self-service, class manager, LMS, hotels, teachers

New Python package: `qrcode==8.2` (in requirements.txt; pure Python). No new environment
variables are required. Optional: `PUBLIC_API_URL` (e.g. `https://tonyoga.com`) if the API is
served from a different host than `FRONTEND_URL`; it is used for the students' calendar-feed links.

New collections are created automatically (indexes at startup): practice_plans, membership_gifts,
withdrawals, stay_offers, hotel_partners, hotel_packages, hotel_addons, hotel_stays, hotel_guests,
hotel_blackouts, teachers, teacher_offerings, teacher_enrollments, teacher_students,
teacher_credits, teacher_messages, teacher_ce_log, teacher_fee_payments, lesson_completions,
quiz_attempts, lesson_notes, lesson_questions, class_messages.

Everything new is switched off or safe by default and is configured in Admin:
- Settings → Member care: pause (on, max 3 months), stay offer (0% = off), failed-card grace
  (7 days), gift memberships (on), monthly theme.
- Hotels & resorts: programme switched OFF until enabled; the two proposal programmes are
  seeded as inactive drafts with draft prices for Tony to confirm.
- Teacher Hub: switched OFF until enabled; tiers Basic €39 / Pro €89 / Studio €149 are editable.
- Class manager, Learning (LMS), the student pages (My plan, My classes, My learning,
  Payments & receipts) and the admin inbox work immediately.

Stripe (only if card payments are used):
- Webhook events to send: checkout.session.completed, checkout.session.async_payment_succeeded,
  customer.subscription.created/updated/deleted, invoice.paid, invoice.payment_succeeded,
  invoice.payment_failed.
- Customer portal (card updates): enable it once in the Stripe dashboard → Settings → Billing →
  Customer portal.
- Teacher payouts use Stripe Connect Express: enable Connect in the Stripe dashboard before
  switching the Teacher Hub on.

Security notes: a password change (by the member or the admin) signs out that account's other
sessions; refunds are processed once even on double clicks; refunded payments are never
delivered again by the automatic payment re-check.

## Assistant 2.0 (30 Oct 2026): faster, knows the student, writes to the team

**Faster.** Every chat answer starts with an instant `start` event (the chat shows "One moment,
let me check…" at once) and then streams. Voice turns use `POST /api/assistant/voice/stream`
(SSE: `start` → `transcript` → `delta`… → `audio` pieces → `done` → `end`): the first sentence is
spoken as soon as it is written, and a short cached phrase ("Okay, one moment.") from
`GET /api/assistant/fillers?lang=` plays the moment the visitor stops talking. Gemini Flash /
Flash-Lite are asked for the shortest thinking level (`minimal`, then `low`, then none if a model
refuses); OpenAI reasoning models get `reasoning_effort` `none` → `minimal` → `low`. One HTTPS
connection to the provider is kept open between answers. The catalogue is cached for 60 s.
The old `/api/assistant/chat`, `/chat/stream` and `/voice` keep working for app builds already
in the stores.

**Knows more.** The prompt now holds the catalogue (courses, memberships with what they include,
class passes, live classes for the next 14 days, retreats, shop, meditations), a site guide (how
My Yoga, course choice, bookings, pause/cancel, receipts, withdrawal… work), Admin → Settings →
**What the assistant should also know** (`assistant_knowledge`, up to 6,000 characters), and — for
a signed-in student — their own account: memberships and what they include, the course still to
choose, courses and progress, class credits, booked classes, orders, last payments, open help
requests. Text answers can be up to 5 short sentences or a short list; spoken answers 1–3 sentences.

**Writes to the team.** When a student has a problem it can't solve, the assistant says it is
writing to Tony's team and creates a **help request** (`help_requests` collection; reference
`H-XXXXX`): admins get a bell notification + email, the WhatsApp number in
`help_alert_whatsapp` (falls back to the lead alert number) gets a message when WhatsApp is set up,
and `help_alert_emails` get a copy. Admin → **Help requests** shows the conversation, a link to the
student, private notes, status, and a reply box (email + app notification; shown in My Yoga →
"Messages with Tony's team"). Guests must give an email first. Limits: one open request per
conversation (later messages are added to it), 5 per student/email per day, 10 per IP per day.
Settings: `help_requests_enabled`, `help_alerts_enabled`.

**WhatsApp (Meta Cloud API).** Admin → Settings → WhatsApp → service **Meta — WhatsApp Cloud
API**: access token (secret; `META_WHATSAPP_TOKEN` also works), phone number ID, API version
(default `v23.0`). WhatsApp only delivers free text to people who wrote to the business number in
the last 24 hours, so for alerts to Tony's phone create a message template in WhatsApp Manager
(category Utility, body e.g. `{{1}}`) and enter its name and language; the alert text fills `{{1}}`.
Twilio stays available.

**nginx — please check.** The rate limits now use the visitor's IP from `X-Real-IP` /
`X-Forwarded-For` when the request comes from the local proxy. Make sure the `/api` location has:

```
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_read_timeout 120s;
```

Without these headers every visitor looks like 127.0.0.1; the assistant then falls back to a
site-wide limit (400 requests/minute) instead of 40 per visitor, and the per-IP help-request
limit is skipped. Streaming answers send `X-Accel-Buffering: no`, so no extra buffering setting is needed.
