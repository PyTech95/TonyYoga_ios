# Tony Yoga — Self-Hosting on a VPS (no Emergent dependency)

This app runs entirely on your own infrastructure. Nothing at runtime depends on
Emergent: no Emergent npm packages, no `emergentintegrations`, no Emergent-hosted
images (all seed/homepage images are bundled in `frontend/public/brand/`).
All URLs and secrets come from environment variables.

## Stack
- Frontend: React 19 (CRA/craco) → static build served by nginx/Apache/any static host.
- Backend: FastAPI + Uvicorn (Python 3.11+).
- Database: MongoDB (self-managed or Atlas).

## 1. MongoDB
Provision MongoDB and note the connection string + database name.

## 2. Backend
```sh
cd backend
python3.11 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
# Run behind a process manager (systemd/pm2/supervisor):
uvicorn server:app --host 0.0.0.0 --port 8001
```
The app seeds initial content on first boot (idempotent). Health: `GET /api/health`.

### Required backend env (`backend/.env` or process env)
| Variable | Notes |
| --- | --- |
| `MONGO_URL` | Your MongoDB URI |
| `DB_NAME` | Database name |
| `JWT_SECRET` | Long random string (rotate the current one for production) |
| `CREDENTIALS_MASTER_KEY` | Fernet key for encrypting saved admin secrets — generate with `python -c "from cryptography.fernet import Fernet;print(Fernet.generate_key().decode())"` and NEVER change it after data is saved |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Seeded admin login — change before real users |
| `CORS_ORIGINS` | Comma-separated list of your real frontend origins, e.g. `https://tonyoga.com,https://www.tonyoga.com`. Add `https://localhost,capacitor://localhost` so the Android and iOS apps can reach the API. Wildcard `*` is rejected by design. |
| `STRIPE_API_KEY` | Optional; your real Stripe secret key (`sk_live_...`). Leave unset to keep card checkout off. |
| `FRONTEND_URL` | Your public website, e.g. `https://tonyoga.com`. Used in emails, referral links and — important for the iOS/Android app — as the page buyers return to after paying in the phone's browser. |
| `PRERENDER_COMMAND` | Optional but recommended. Re-writes the pre-built pages search engines read a few seconds after the admin saves SEO settings, custom pages or Journal posts. Example: `cd /var/www/tony/frontend && REACT_APP_BACKEND_URL=https://tonyoga.com node scripts/prerender.mjs` (the user running the backend needs write access to `frontend/build`). Leave unset and those pages refresh on the next `yarn build`. |
| `MAX_VIDEO_BYTES` | Optional. Largest video the admin can upload (default 60 MB) — for the homepage hero loop and page videos. Long lessons belong on YouTube/Vimeo. |

Optional integration keys (Stripe/PayPal/Zoom/SMTP/Twilio/OpenAI/VAPID/Printful)
can be set via env OR pasted in **Admin → Settings** at runtime (DB values override env).

## 3. Frontend
Set the backend URL, then build:
```sh
cd frontend
echo "REACT_APP_BACKEND_URL=https://api.yourdomain.com" > .env   # your backend origin
echo "REACT_APP_SITE_URL=https://tonyoga.com" >> .env              # optional, this is the default
yarn install
yarn build
```
`yarn build` now also runs `scripts/prerender.mjs`, which writes a real HTML page
for every public URL (home, programs, schedule, retreats, the Locations pages…),
plus `sitemap.xml`, `robots.txt` and `llms.txt`. If the API is reachable during
the build, program, shop and retreat pages are pre-rendered too.

Serve the `build/` directory as static files. Route `/api/*` to the backend
(port 8001) via your reverse proxy so the frontend and API share one origin.

Example nginx (note `$uri/index.html` — it serves the pre-rendered pages):
```
location /api/ { proxy_pass http://127.0.0.1:8001; }
location /     { root /var/www/tony/build; try_files $uri $uri/index.html /index.html; }
```
Apache / LiteSpeed (Hostinger): the included `build/.htaccess` already does this.

After deploying, add the site in Google Search Console and Bing Webmaster Tools
and submit `https://tonyoga.com/sitemap.xml`.

### Updating an existing server
Use `deploy/server-deploy.sh` (see `deploy/README.md`): `check`, then `deploy <zip>`. It backs up code,
website and database, updates the backend, builds the website beside the live one and swaps it in, with
automatic fallback, and `rollback` puts the previous version back.

## 4. Mobile
- **PWA:** already configured (`public/manifest.json`, `public/sw.js`). Installable
  from the browser; works offline-capable. No extra setup.
- **Android release (Play Store):** `mobile/` (package `com.tonyoga.app`). On Windows double-click
  `mobile/Build Android app.bat` — see `mobile/README.md`. Raise `versionCode` for every upload.
- **iPhone release (App Store):** built by GitHub Actions from `frontend/` with
  `.github/workflows/ios-testflight.yml` (macOS runner, Xcode 26). Set `APP_VERSION` in that file,
  merge to `main` (or run the workflow by hand), and the build lands in TestFlight. Apple in-app
  purchases are handled by `backend/routers/ios_commerce.py` with the settings in `backend/.env`
  and `/etc/tonyoga/` (see `START_HERE_HINDI.md`); `requirements-ios.txt` adds its one package.
  Inside the iPhone app: English/Spanish only, App Store prices, no outside purchase links.
- **Native (iOS/Android):** Capacitor config in `frontend/capacitor.config.json`
  (`webDir: build`). After `yarn build`: `npx cap sync` then open in Xcode/Android
  Studio. `isNativeApp()` auto-detects the native runtime; `isIOSApp()` the iPhone app.
  - iOS uses `contentInset: "never"`: the web layer handles the notch / Dynamic
    Island and home indicator itself (CSS `env(safe-area-inset-*)`), so screens use
    the full display without gaps. `npx cap sync` copies this setting into Xcode.
  - Android: the SystemBars plugin (`insetsHandling: "css"`) passes the status / navigation
    bar sizes to the page as `--safe-area-inset-*`, so nothing sits under them on Android 15+.
  - Payments open in the phone's browser and return to `FRONTEND_URL`; the app
    refreshes automatically when the member switches back.

## 5. Admin controls (no redeploy needed)
- **App/Play Store links:** Admin → Settings → *Pop-up & app downloads* — add the
  Apple App Store and Google Play URLs anytime; empty shows "Coming soon · Demo".
- **Pop-up:** same pane — master on/off, timing (10s/30s/1min/exit-intent), and
  mode (App download **or** a fully custom offer with your own title/text/button/
  image/expiry countdown).
- Payments, email, Zoom, WhatsApp, AI, Printful, testimonials, site images and
  page content are all editable from the Admin panel.
- **Website content (A to Z):** Custom pages (About, Services and any new page with
  text, photos, videos, buttons, cards and FAQs — shown in the website menu, footer
  and app menu), SEO & Google (titles, descriptions, share images, Search Console /
  Bing codes, cities on the Locations pages), Journal & news, Instructors (photo &
  bio), Packages & prices (memberships, class passes, teacher training) and Site
  images (every photo of Tony, plus the homepage hero video).
