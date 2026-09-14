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
| `CORS_ORIGINS` | Comma-separated list of your real frontend origins, e.g. `https://tonyyoga.com,https://www.tonyyoga.com`. Wildcard `*` is rejected by design. |
| `STRIPE_API_KEY` | Optional; your real Stripe secret key (`sk_live_...`). Leave unset to keep card checkout off. |

Optional integration keys (Stripe/PayPal/Zoom/SMTP/Twilio/OpenAI/VAPID/Printful)
can be set via env OR pasted in **Admin → Settings** at runtime (DB values override env).

## 3. Frontend
Set the backend URL, then build:
```sh
cd frontend
echo "REACT_APP_BACKEND_URL=https://api.yourdomain.com" > .env   # your backend origin
yarn install
yarn build
```
Serve the `build/` directory as static files. Route `/api/*` to the backend
(port 8001) via your reverse proxy so the frontend and API share one origin.

Example nginx:
```
location /api/ { proxy_pass http://127.0.0.1:8001; }
location /     { root /var/www/tony/build; try_files $uri /index.html; }
```

## 4. Mobile
- **PWA:** already configured (`public/manifest.json`, `public/sw.js`). Installable
  from the browser; works offline-capable. No extra setup.
- **Native (iOS/Android):** Capacitor config in `frontend/capacitor.config.json`
  (`webDir: build`). After `yarn build`: `npx cap sync` then open in Xcode/Android
  Studio. `isNativeApp()` auto-detects the native runtime.

## 5. Admin controls (no redeploy needed)
- **App/Play Store links:** Admin → Settings → *Pop-up & app downloads* — add the
  Apple App Store and Google Play URLs anytime; empty shows "Coming soon · Demo".
- **Pop-up:** same pane — master on/off, timing (10s/30s/1min/exit-intent), and
  mode (App download **or** a fully custom offer with your own title/text/button/
  image/expiry countdown).
- Payments, email, Zoom, WhatsApp, AI, Printful, testimonials, site images and
  page content are all editable from the Admin panel.
