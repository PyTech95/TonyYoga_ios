# Tony Yoga — PRD / Handoff

## Product and original deployment request
Deploy the supplied `tony2027` React + FastAPI + MongoDB yoga/wellness app using
six gated phases. Complete Phase 1 (Inspect & Fix) and Phase 2 (Local Verify)
first; containerization and cloud work require explicit further approval.

The existing product includes live classes, on-demand programs, retreats,
memberships, shop/Printful, gift cards, referrals, streaks/leaderboard, quiz,
AI chat/voice, admin console, inline live editor, push, Zoom, email and WhatsApp.

## Previous request — direct-provider migration (2026-09-12, complete)
Remove proprietary SDKs, packages, wrappers, imports, helpers and integrations
from the application. Replace the AI assistant with direct official OpenAI APIs.
Preserve routes, request/response schemas, SSE, limits, sessions and frontend
compatibility. Missing AI credentials must affect AI calls only, never startup.
Verify import, Uvicorn, non-AI APIs, clean PyPI installation and source cleanup.
Do not redesign or refactor unrelated features; do not begin cloud deployment.

## Previous request — editable testimonials and website content (2026-09-12)
User: "A stu-a student testimonial and everything should be editable from admin
panel. Image and all editable from live-- with the live editor as well"

Clarification proposed testimonial add/edit/delete/reorder, student details,
quotes/photos/video links and content scope. User replied "ok". Proceeded with
testimonials plus homepage content via Admin, retaining general text/image editing
across public pages in the existing live editor. Existing visual design preserved.

### Implemented
- Admin → Testimonials (`/admin?tab=testimonials`): stable IDs, add/edit/remove/
  reorder student stories; quote, student name, role/location, photo upload/URL,
  video link. Empty list really removes cards (no fallback repopulation).
- Featured student: headline/name/role, cover upload/URL, video URL, visibility
  toggle. Public native video or existing YouTube/Vimeo embed support. No clip is
  configured yet; existing coming-soon state remains until owner adds a video.
- Admin → Website Content (`/admin?tab=content`): page/section selector, search,
  text/image/alt/link/video fields, Save draft / Publish / Discard. A same-origin
  hidden iframe enumerates real page content (222 homepage elements in testing).
  Curated public-page options; the global live editor remains usable on other
  public routes. No new crawling service/API or mocked content backend.
- Admin → Site Images: hero/story/app/training imagery; portable `/api/files/`
  paths resolved with REACT_APP_BACKEND_URL. Existing GridFS upload route reused.
- Live editor: direct text nodes preserve child spans, line breaks and button
  icons; IMG/video/background images, image upload/URL/alt/poster, anchor links.
  Stable `data-cms` selectors keep testimonial edits attached when reordered.
- Semantic homepage edits synchronize into structured Admin settings on publish;
  saving structured content in Admin clears stale corresponding DOM overrides.
- Ordered saves preserve fast edits; field-save failures block publishing.
  Publish/Exit/Discard wait for pending saves rather than swallowing the first
  click after an input loses focus. Uploaded image URL replaces any previously
  typed URL; selecting another image during upload is prevented.
- Public viewers receive published values only. Exit restores published view;
  discard removes drafts. Partial drafts retain previously published properties.
- Mobile Admin navigation uses a compact section select; desktop sidebar retained.
  Old unused duplicate Testimonials component removed to avoid divergent defaults.
- Backend validates content structure/IDs/text bounds/URLs; admin authorization
  and secret handling are unchanged. No new credentials or provider integration.

### Files and data flow
- `backend/content_settings.py`: defaults, content validation, explicit semantic
  binding synchronization. `routers/settings.py` validates saves; `routers/editor.py`
  preserves published props and synchronizes bound content when publishing.
- `frontend/src/lib/liveEditorDom.js`: shared element scanning/reading/application.
  `liveEditor.jsx`: visual controls, queues, draft/publish lifecycle.
- `pages/admin/WebsiteContentPane.jsx`, `TestimonialsPane.jsx`,
  `FeaturedTestimonialForm.jsx`, `SiteImagesPane.jsx`; `pages/Admin.jsx` navigation.
- `components/StudentTestimonials.jsx`, `HeroTestimonial.jsx`,
  `ContentImageInput.jsx`, `MarketingSections.jsx`; `pages/Marketing.jsx` bindings.
- Stores: `app_settings` content objects, `page_edits` drafts/published overrides,
  existing `uploaded_files` and GridFS. No local image-storage dependency.

### Verified
- Testing report `test_reports/iteration_5.json`: 9/9 backend tests passed;
  targeted Admin, public-page and live-editor desktop/mobile flows passed.
- Final backend rerun: `test_reports/content-editor-final-tests.log` and
  `test_reports/pytest/content_editor_final.xml` (9 passed).
- Direct final browser verification: edit image URL, upload image in live editor,
  click Publish once while field-blur save runs, then verify matching photo in
  public DOM and Admin settings. Passed; changed photo visible at 390px.
- Admin screenshots at 1920×800 and 390×844: no overflow. Backend import/health
  and final frontend production build passed; pre-existing unrelated hook lint
  warnings remain. Build log: `test_reports/content-editor-final-build.log`.
- No mocked APIs in content/editor tests. Original student names/quotes/order/
  images and featured visibility restored. Test-only published ribbon text and
  generated verification images cleaned; zero page overrides remain afterward.
- Existing AI still needs a direct OpenAI key; unrelated payment/Zoom/native
  setup remains as previously documented. No auth credentials changed.

## Architecture
- Frontend: React 19, CRA/craco, Tailwind, i18n (EN/ES), existing design unchanged.
  API calls use `process.env.REACT_APP_BACKEND_URL`.
- Backend: `/app/backend/server.py`, routers register on shared `/api` router in
  `core.py`; FastAPI/Uvicorn, Motor/PyMongo. Health: `/api/health`.
- Database configured only through `MONGO_URL` and `DB_NAME`; idempotent startup
  seed for users, catalog, memberships, workshops, class templates/instances.
- Other collections: bookings, orders, payments, settings, notifications,
  private_session_requests, submissions, page edits and editor comments.
- Authentication and existing credential encryption were NOT modified.
  Test login details: `/app/memory/test_credentials.md`.

## Runtime configuration
- Required existing server configuration: `MONGO_URL`, `DB_NAME`, `JWT_SECRET`,
  `CREDENTIALS_MASTER_KEY`, `CORS_ORIGINS`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.
- AI: encrypted Admin `openai_api_key` overrides `OPENAI_API_KEY` in the server
  environment. Both are currently absent; live AI will return a controlled error.
- Model remains Admin setting `assistant_openai_model` (default `gpt-5.4-mini`).
  Voice remains `tts-1`, transcription remains `whisper-1`.
- Uploads now use MongoDB GridFS (`uploaded_objects.files/chunks`) and existing
  `uploaded_files` metadata; no additional storage credentials or proxy needed.
- Optional existing integrations: Stripe, PayPal, Printful, Zoom, SMTP, Twilio,
  VAPID. Configuration and logic remain unchanged by the current task.
- Setup and compatibility details: `/app/backend/DEPLOYMENT.md`.

## Assistant contracts and safeguards
- `/api/assistant/config`, `/chat`, `/chat/stream`, `/voice`, `/tts`, `/greeting`,
  `/audio/{id}`, `/lead`; existing admin usage and lead routes remain.
- SSE stays `data: {JSON}\n\n`, with `type: delta|done|error`, not named SSE events.
- ReplyOut retains session_id, reply, links, transcript, audio_url, audio_error,
  end_conversation. MP3 cache and audio URL endpoints are unchanged.
- UUID conversation memory: last 40 messages, last 16 supplied as context,
  30-day TTL, per-session lease; catalog grounding and links unchanged.
- Existing Mongo request counters (40/minute), daily/session caps are retained.
- Official OpenAI clients and upstream streams are closed per request; explicit
  65s chat / 35s speech / 40s transcription budgets, bounded retry, safe errors.
- Missing key: non-streaming AI calls return 503 with detail; streaming route
  retains its existing SSE error envelope. Config, leads and cached audio remain
  independent of provider credentials. Failed turns do not charge usage.
- Text/voice invitation and browser microphone-consent flows remain unchanged.

## Previous verified functionality (not changed in this task)
- Phases 1–2: extracted project, secret scan, seed, login, API health and frontend
  startup. No cloud deployment or Docker work authorized.
- Inline editor: text, color, image, link edits; draft/preview/publish/discard and
  team comments. Targets test IDs or CSS selectors; admin-only editing.
- App download links: Admin settings for Apple/Google URLs; unset means DEMO /
  coming soon, not working native downloads. Native push not integrated.
- Visitor improvements: homepage/navigation/back links, newsletter Mongo capture,
  testimonials, retreat image slider/student video; no fabricated social embeds.
- Private sessions: €120/session, 1–3 sessions, payment at booking; admin schedules
  Zoom sessions, students/admin receive in-app notifications, optional email.
  Prior reports iteration_1.json and iteration_2.json verified their scope.
- Existing external payment/Zoom/email flows remain unconfigured/test-only or
  MOCKED as previously documented; this task does not activate them.

## Implementation progress — 2026-09-12
- Replaced chat, STT and TTS with official `openai==1.99.9`; no import-time AI
  client and no alternate provider credential fallback.
- Removed storage proxy and startup initialization; Mongo GridFS preserves
  `/api/admin/uploads` and `/api/files/{path}` response formats and authorization.
  Current database had zero uploads, so no stored-file migration was required.
- Removed proprietary frontend build package, injected script and wrapper;
  Admin key status now accurately reads Not configured when no key is set.
- Regenerated pinned requirements in a clean Python environment from public PyPI,
  retaining runtime dependencies and existing pytest tools, excluding unused SDKs.
- Removed stale references from historical notes/tests. Import succeeds both in
  the clean environment and after uninstalling the old package from runtime.
- Fixed GridFS download cleanup for synchronous close methods and generic
  awaitables; regression now requires successful cleanup.

## Verification — 2026-09-12
- Final backend suite: **19/19 passed** after all fixes. Tests cover official SDK
  chat/SSE, STT multipart and TTS binary/cache, voice response fields, genuine
  two-turn memory and isolation, rate/daily/session limits, busy leases, sanitized
  provider failures, cancellation, keyless routes and authenticated file uploads.
- Upstream OpenAI responses in tests are **MOCKED** using `httpx.MockTransport`.
  Runtime has no fake provider responses. Live chat/STT/TTS remain unavailable
  until a direct OpenAI key is configured; live provider validation NOT performed.
- `python -c "import server"` succeeds from backend both in runtime (old package
  uninstalled) and clean Python 3.11 venv. Uvicorn restarts and reports startup
  complete; public health confirms Mongo and seed healthy.
- A second fresh venv installed `pip install --index-url https://pypi.org/simple
  -r requirements.txt` successfully; `pip check` passes. This is an isolated Linux
  install verification, not provisioning/testing an actual remote VPS.
- Frontend production build passed. Targeted desktop/mobile browser checks:
  assistant keyless message and accurate Admin Not configured status; no layout
  regression. Existing horizontal product carousel is clipped, not page overflow.
- Complete JSON for public settings, programs and products exactly matches the
  before-change snapshots; login and other tested non-AI APIs pass.
- Working-tree scan (including ignored source/build files, excluding protected
  Git history/platform metadata and installed node modules): no old SDK name,
  build package, injected script or storage-proxy references.
- Reports: `test_reports/iteration_3.json`, `iteration_4.json`; final post-fix
  `test_reports/pytest/provider_migration_final.xml` and
  `test_reports/provider_migration/final-regression.log` supersede iteration_4's
  close-awaitable observation. Test source: `backend/tests/test_provider_migration.py`.
- No auth credentials were created or changed. Existing test_credentials.md remains
  valid. Final deployment-blocker scan: **PASS**, 2026-09-12. No provisioning or
  cloud deployment performed. Existing production configuration cautions remain.

## Prioritized next actions
- P0: User verification of Testimonials, Site Images, Website Content and live
  editor; feature tests and prior provider migration are complete.
- P1: Owner to replace existing sample quotes/photos and add real student video
  links using the new Admin controls. No video clip has been supplied yet.
- P1: Supply a direct OpenAI project key for live chat/STT/TTS smoke testing.
- P1: Phase 3 containerization and later provisioning only after explicit approval.
- P1: Real payment/fulfillment/Zoom/email keys, restricted production CORS, change
  seeded admin password before real users. Native app links/device verification.
- P2: HTTPS/logging/monitoring/backups under the gated deployment plan; real
  device push after native projects supplied; editor version history.
- Optional enhancement: content version history with one-click restore; separately
  an Admin AI connectivity check without changing existing AI routes.
---

## Deployment Prep — 2026-06 (Emergent hosting)
- Imported tony2027 zip into /app; installed backend (pip) + frontend (yarn) deps.
- Backend `.env` set with MONGO_URL, DB_NAME, JWT_SECRET, CREDENTIALS_MASTER_KEY (fresh Fernet key), ADMIN_EMAIL, ADMIN_PASSWORD, CORS_ORIGINS.
- Verified: `import server` clean, GET /api/health ok (seeded: 3 users/programs, 4 class templates, 28 class instances, 5 products), frontend landing renders, admin login works end-to-end.
- deployment_agent scan: PASS — no hardcoded secrets/URLs, ports correct, CORS + supervisor valid.
- Admin: tony@tonyyoga.com / TonyYoga2026! (see test_credentials.md).
- NOTE: Third-party keys (Stripe, PayPal, Printful, Zoom, OpenAI, VAPID, email/WhatsApp) are NOT set — those features stay inactive until configured in Admin → Settings or backend env. Core app works without them.

## Homepage Private Sessions feature — 2026-06
- Added prominent, animated "Private 1:1 Zoom Sessions with Tony" section to public homepage (Marketing.jsx), placed right after Programs (classes), before Teacher Training.
- Creative Zoom-window visual (generated image) with a floating "Tony" participant tile, LIVE badge, sparkle + shimmer + float motion (framer-motion + CSS); respects prefers-reduced-motion. Responsive (2-col desktop / stacked mobile). CTA -> /private-sessions.
- Price/duration read from public settings (private_session_price / private_session_duration_min) with €120 / 60 min fallback — dedicated admin UI fields for these NOT yet added.
- Footer credit "Developed by Rajeev -> rajeevfreelancer.com" (animated shimmer link).
- Verified by testing agent iteration_6: frontend 100%, 0 console errors.

## Admin-controlled download/offer pop-up — 2026-06
- The 30s app-download pop-up is now fully admin-controlled from Admin → Settings → "Pop-up & app downloads".
- Controls: master ON/OFF toggle; mode = App download (store buttons) OR Custom offer (custom eyebrow/title/description/CTA button+link/optional image).
- Backend: added download_popup_* keys to DEFAULT_SETTINGS + PUBLIC_FIELDS in routers/settings.py.
- Frontend: AppDownloads.jsx gates on download_popup_enabled and renders app vs custom mode; app mode always uses default copy (custom text only applies in custom mode). Admin pane: AppDownloadsSettings.jsx.
- Verified by testing agent iteration_7: backend 100%, frontend 100% (all flows: enable/disable, custom offer, app mode). Minor leak fixed post-test.

## Four admin enhancements — 2026-06
- Schedule Window: admin picks when the pop-up appears (10s/30s/1min/on-exit) + exit-intent toggle. Keys: download_popup_delay_seconds (0 = exit-only), download_popup_on_exit. Wired in AppDownloads.jsx (timer skipped when delay<=0; mouseout exit-intent).
- Offer Image Upload: custom-offer image uses ContentImageInput (GridFS /admin/uploads) instead of URL-only. Key: download_popup_image_url.
- Session Pricing Control: admin sets private_session_price, private_session_duration_min, private_session_image in PrivateSessionsPane → PricingCard. Reflected on /private-sessions + homepage banner; backend charge uses get_setting('private_session_price') in payments.py (server-side price, secure).
- Printful Live Sync: PrintMediaPane connect() now auto-runs stores fetch + sync after a token is saved (autoSync), so products/prices import immediately. Manual Sync still available.
- Verified: testing agent iteration_8 (backend 100%, frontend 100%). Post-test polish: exit-only via delay=0 (backend clamp min 0), numeric coercion on pricing save.

## Offer countdown, session packages, printful auto-refresh, booking calendar — 2026-06
- Offer Countdown: custom-offer pop-up supports optional expiry (download_popup_offer_expiry). Live ticking countdown in popup; offer is gated off after expiry and auto-closes if it expires mid-view. Admin: datetime-local in App Downloads pane.
- Session Packages: admin defines discounted bundles (private_session_packages [{sessions,price,label}]) in PrivateSessionsPane. Booking page shows options with per-count price + savings; backend private_session_amount() computes charge (bundle price wins, else per-session). Dedup by session count (last-write-wins).
- Printful Auto-Refresh: printful_auto_sync_enabled toggle in Print Media pane; nightly printful_nightly_sync_tick() (refactored _sync_store) runs once/24h via server background loop; status endpoint returns auto_sync_enabled. Sync now also refreshes price on existing products.
- Booking Calendar: /private-sessions replaces free-text preferred time with a 14-day date strip + Morning/Afternoon/Evening chips, composing a readable preferred_time string admins see.
- Verified: testing agent iteration_9 (frontend 100%; backend feature assertions pass, lone failure was an xdist test-harness race). Polish applied: auto-close on expiry, invalid-date guard, package dedup.

## Deployment prep (2026-06, E1)
- Installed user-provided `tony2027` zip into /app (preserved platform .git/.emergent).
- Generated + set backend/.env secrets: JWT_SECRET, CREDENTIALS_MASTER_KEY (Fernet),
  ADMIN_EMAIL/ADMIN_PASSWORD, CORS_ORIGINS, FRONTEND_URL. MONGO_URL/DB_NAME = local.
- Installed backend requirements + frontend yarn deps; supervisor backend+frontend RUNNING.
- /api/health passes; DB seeded (users=3, programs=3, classes=28, products=5). Landing page renders.
- Fixed deployment BLOCKER: removed `.env`/`*.env` lines from root .gitignore so env files deploy.
- deployment_agent: PASS (no blockers). App is deployment-ready; user to click Deploy/Publish.

## Current request — direct admin login and advanced dashboard (2026-09-13)
User: "make sure everything control by admin and s of now when i login in admin -
a normal user login is opening first and the click there console then admin open -
correct this when i login as a admin - admin panel should open and make a advance
admin dashboard - modern top graph of website and app performance view and
insatall leaft side all the menu to edid pages and manage". User approved proceeding.

### Implemented
- Fixed root cause: Login.jsx ignored the authenticated user's role and always
  navigated to /home. Shared authRouting now sends admins directly to /admin and
  students to /home. Applied to password login, magic links, /welcome and native
  entry; existing sessions visiting /login redirect correctly. Public homepage
  remains accessible for previews/live editing. Backend JWT/password logic intact.
- Dedicated responsive /admin shell outside member AppShell: fixed left sidebar,
  25 searchable management menus in six groups, mobile accessible drawer, account
  logout, notifications, website/member preview. No member bottom nav in Admin.
  URL-driven tabs support reload, deep links, back/forward. Existing panes retained;
  direct app/offers, class pricing and availability menus added. Panes lazy-load.
- Expanded Pages & live editor to 20 public/member page choices. Existing draft,
  publish, live editing, testimonials, image, settings and product controls retained.
- Dashboard: website/app usage and page-load charts, 7/30/90-day range, refresh,
  CSV download, page views, sessions, installed-app views, document load average,
  popular pages, community growth, business totals, schedule/signups/payments.
  Existing revenue charts retained with separate currencies; all-time paid totals
  use Mongo aggregation instead of the previous 1,000-transaction truncation.
- First-party analytics: public /api/analytics/config and /api/analytics/events;
  admin-only GET /api/admin/analytics and PATCH /api/admin/analytics/config.
  Typed models, UUID event deduplication, per-session ingestion limit, 90-day TTL,
  UTC buckets, weighted load means. New Mongo collections analytics_events and
  analytics_config; no external provider or new credentials.
- Website/PWA/native channels use real platform detection (not ?native=1 preview).
  Tab session expires after 30 minutes inactivity. Only public route families are
  saved; no IP, query, record ID or account identity in events. Excludes staff,
  admin/auth/sensitive routes, editor and content iframes. DNT/GPC/local opt-out
  respected. Privacy page includes disclosure and browser opt-out. Admin can pause
  new collection without deleting past reports. No invented historical data.
- Resolved test findings: explicit trusted CORS origins with credentials support
  (bearer transport unchanged); chart rendering waits for actual dimensions.
  Preview proxy forwards an internal origin in addition to the public origin;
  both are explicitly configured in backend .env. Wildcard CORS now fails fast.

### Architecture / references
- Frontend: lib/authRouting.js, components/UsageTracker.jsx; pages/Admin.jsx;
  pages/admin/{adminNavigation,adminPanes,AdminSidebar,StatsPane,PerformanceChart,
  BusinessOverview,RevenueOverview,DashboardActivity,MeasuredChart,admin.css}.
- Backend: analytics_models.py, routers/analytics.py, server.py startup indexes
  and CORS; routers/admin.py adds currency-separated revenue fields while keeping
  existing response fields. Required env names and database configuration unchanged.
- Existing test credentials in memory/test_credentials.md (also documents existing
  seeded student); no passwords, users, auth tokens or encryption secrets changed.

### Verification
- test_reports/iteration_10.json: admin/student password + magic-link redirects,
  sessions/remember/logout, role guards, all menus, navigation, mobile drawer,
  telemetry, collection toggle, privacy opt-out and content publish/restore passed.
- Final regression after fixes: 21/21 backend tests passed serially, JUnit at
  test_reports/pytest/admin-dashboard-final.xml. Final yarn production build passed
  (test_reports/admin-dashboard-final-build.log); pre-existing lint warnings remain.
- Browser checks after fixes: admin opens directly, data loads, all date ranges and
  metrics switch, positive chart dimensions with zero size warnings, revenue empty
  state/totals visible. Main agent smoke at 1920x800; testing agent verified responsive
  layouts at 320/768/1024/1440 and desktop, no reported overflow or blocking errors.
- New analytics APIs are NOT MOCKED. Synthetic API test fixtures were cleaned;
  actual browser test visits may appear in usage. No native-device runtime available:
  native channel aggregation was tested via scoped fixtures, not physical devices.
- Final notes: test_reports/admin_dashboard_final.md supersedes original iteration-10
  CORS/chart findings. Existing provider-dependent payments/email/Zoom/AI remain
  unconfigured/inactive; this task does not activate or certify those integrations.

### Prioritized next actions (current)
- P0: None open in the implemented scope; owner to review the updated admin workflow.
- P1: Configure and verify required existing integrations; validate analytics on real
  installed PWA/native devices. Keep trusted CORS origins aligned with actual app
  origins when configuring another environment. No publishing performed in this task.
- P1: Replace sample content/testimonials with owner content using Admin controls.
- P2: Page version history/restore; optional booking-conversion funnel and alerts.

## Deployment hardening — 2026-06 (E1, Emergent managed hosting)
- Imported tony2027-main zip into /app (preserved platform .git/.emergent; excluded node_modules/__pycache__/.env).
- Secrets sweep: no hardcoded API keys/DB URIs/tokens in source; no hardcoded localhost/127/:8001 in frontend (all API calls use REACT_APP_BACKEND_URL). Only Stripe key-PREFIX validation logic + placeholders present.
- backend/.env set: MONGO_URL, DB_NAME (local, unchanged), JWT_SECRET (fresh), CREDENTIALS_MASTER_KEY (fresh Fernet), ADMIN_EMAIL/ADMIN_PASSWORD, STRIPE_API_KEY=sk_test_emergent, CORS_ORIGINS (explicit — preview + production emergent.host + localhost; wildcard rejected by server by design).
- frontend/.env unchanged (REACT_APP_BACKEND_URL = preview host).
- Installed backend (pip -r requirements.txt) + frontend (yarn) deps; supervisor backend+frontend RUNNING.
- .gitignore does NOT block .env (ships to deploy). No deploy blocker there.
- Smoke test PASS: import server clean; /api/health ok (seeded users=3, programs=3, class_templates=4, class_instances=28, products=5); external admin login (role=admin, token) OK; public /api/programs read=3; landing page renders.
- deployment_agent flagged CORS wildcard preference; resolved by keeping CORS LOCKED per user requirement and adding production origin (not switching to *).
- Third-party integrations (Stripe live, PayPal, Printful, Zoom, OpenAI, VAPID, email/WhatsApp) NOT configured — inactive until keys added in Admin/env. Core app works without them.
