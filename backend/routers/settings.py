"""App-wide settings (payments + video) editable from the Admin panel.

Stored as a single document in `app_settings`. DB values OVERRIDE the equivalent
.env variables at runtime, so non-developers can swap keys without redeploying.
Sensitive fields are masked when read and preserved when the masked value is
sent back (i.e. the UI sends "••••••••abcd" and we keep the real value).
"""
import os
from typing import Any, Dict, Optional
from fastapi import Request, HTTPException

from core import api, db, require_role, now_utc, gen_id
from credential_store import encrypt_secret, decrypt_secret
from content_settings import TESTIMONIALS, content_defaults, validate_content, clear_content_overrides


SETTINGS_DOC_ID = "global"

# Fields treated as secrets: masked on read, only overwritten when explicitly set.
SECRET_FIELDS = {
    "stripe_secret_key",
    "stripe_webhook_secret",
    "paypal_client_secret",
    "vimeo_access_token",
    "mux_token_secret",
    "smtp_password",
    "vapid_private_key",
    "instagram_access_token",
    "zoom_client_secret",
    "twilio_auth_token",
    "openai_api_key",
    "gemini_api_key",
    "printful_token",
    "fcm_service_account_json",
    "apns_key_p8",
}

# Map of setting -> env var to fall back on when the DB value is empty.
ENV_FALLBACK = {
    "stripe_publishable_key": "STRIPE_PUBLISHABLE_KEY",
    "stripe_secret_key": "STRIPE_API_KEY",
    "stripe_webhook_secret": "STRIPE_WEBHOOK_SECRET",
    "paypal_client_id": "PAYPAL_CLIENT_ID",
    "paypal_client_secret": "PAYPAL_CLIENT_SECRET",
    "vimeo_access_token": "VIMEO_ACCESS_TOKEN",
    "mux_token_id": "MUX_TOKEN_ID",
    "mux_token_secret": "MUX_TOKEN_SECRET",
    "smtp_host": "SMTP_HOST",
    "smtp_port": "SMTP_PORT",
    "smtp_user": "SMTP_USER",
    "smtp_password": "SMTP_PASSWORD",
    "sender_email": "SENDER_EMAIL",
    "sender_name": "SENDER_NAME",
    "vapid_public_key": "VAPID_PUBLIC_KEY",
    "vapid_private_key": "VAPID_PRIVATE_KEY",
    "vapid_claim_email": "VAPID_CLAIM_EMAIL",
    "zoom_account_id": "ZOOM_ACCOUNT_ID",
    "zoom_client_id": "ZOOM_CLIENT_ID",
    "zoom_client_secret": "ZOOM_CLIENT_SECRET",
    "zoom_host_user_id": "ZOOM_HOST_USER_ID",
    "twilio_account_sid": "TWILIO_ACCOUNT_SID",
    "twilio_auth_token": "TWILIO_AUTH_TOKEN",
    "twilio_whatsapp_from": "TWILIO_WHATSAPP_FROM",
    "openai_api_key": "OPENAI_API_KEY",
    "gemini_api_key": "GEMINI_API_KEY",
    "printful_token": "PRINTFUL_TOKEN",
}

DEFAULT_SETTINGS: Dict[str, Any] = {
    # ---- Payments ----
    "default_currency": "usd",            # usd | eur | gbp
    "tax_rate_percent": 0.0,
    "min_order_amount": 0.0,
    "stripe_enabled": False,
    "stripe_verified_at": "",
    "stripe_webhook_received_at": "",
    "stripe_webhook_verified_at": "",
    "stripe_mode": "test",                # test | live
    "stripe_subscriptions_enabled": False,  # when True, memberships use recurring subscriptions with trial. Requires real Stripe key.
    "stripe_publishable_key": "",
    "stripe_secret_key": "",
    "stripe_webhook_secret": "",
    "paypal_enabled": False,
    "paypal_mode": "sandbox",             # sandbox | live
    "paypal_client_id": "",
    "paypal_client_secret": "",
    "paypal_webhook_id": "",
    "crypto_enabled": False,
    "success_url_path": "/checkout/success",
    "cancel_url_path": "/checkout/cancel",
    # ---- Email (SMTP) ----
    "email_enabled": False,
    "smtp_host": "smtp.gmail.com",
    "smtp_port": 587,
    "smtp_user": "",
    "smtp_password": "",
    "sender_email": "",
    "sender_name": "Tony Yoga",
    # ---- Web Push (VAPID) ----
    "push_enabled": False,
    "vapid_public_key": "",
    "vapid_private_key": "",
    "vapid_claim_email": "mailto:tony@tonysanchezyoga.com",
    "reminder_lead_minutes": 30,
    # ---- Zoom (live classes + cloud recordings) ----
    "zoom_enabled": False,
    "zoom_verified_at": "",
    "private_reminders_enabled": True,
    "private_reminder_lead_minutes": 30,
    "challenges_enabled": True,
    "zoom_account_id": "",
    "zoom_client_id": "",
    "zoom_client_secret": "",
    "zoom_host_user_id": "",
    "recording_replay_days": 3,      # default replay window for class recordings
    # ---- WhatsApp (Twilio) notifications ----
    "whatsapp_enabled": False,
    "twilio_account_sid": "",
    "twilio_auth_token": "",
    "twilio_whatsapp_from": "",      # e.g. whatsapp:+14155238886 (Twilio sandbox)
    # ---- Video ----
    "default_video_provider": "youtube",  # youtube | vimeo | mux
    "vimeo_access_token": "",
    "mux_token_id": "",
    "mux_token_secret": "",
    "video_autoplay": False,
    "video_default_quality": "auto",      # auto | 480p | 720p | 1080p
    "video_allow_downloads": False,
    "video_drm_enabled": False,
    "video_default_duration_minutes": 30,
    "video_watermark_text": "",
    # ---- Social links (footer + about pages) ----
    "social_facebook": "https://www.facebook.com/TonYoga.online/",
    "social_instagram": "https://www.instagram.com/tonyoga_school/",
    "social_youtube": "https://www.youtube.com/channel/UCrOeMWIAVwYhPwwF5cQZk3g",
    "social_linkedin": "https://www.linkedin.com/in/tonysanchezyoga/",
    "social_whatsapp": "",
    "social_tiktok": "",
    # ---- Marketing hero testimonial ----
    "hero_testimonial": {},               # {video_url, poster_url, name, role, headline}
    # ---- Marketing testimonials (admin-managed list on the homepage) ----
    "testimonials": TESTIMONIALS,         # [] explicitly removes all testimonials
    # ---- Instagram feed (homepage reels) ----
    "reels_enabled": True,                # show/hide the Instagram reels section
    "instagram_reels": [],                # list of {shortcode, caption}; empty → curated defaults
    "instagram_auto_sync": False,         # auto-pull latest reels via Meta Graph API
    "instagram_user_id": "",              # IG professional account id
    "instagram_access_token": "",         # long-lived IG User token (secret)
    "instagram_last_sync": "",            # ISO timestamp of last successful sync
    "instagram_last_error": "",           # last sync error (for admin visibility)
    # ---- Printful fulfillment (Part B) ----
    "printful_token": "",                 # Printful API token (paste in Admin → Print Media)
    "printful_fulfill_enabled": True,     # auto-submit paid Printful orders (only fires on live payments)
    "printful_auto_sync_enabled": False,  # nightly product/price re-sync from the connected store
    # ---- Site images (admin-editable homepage art; empty → generic stock default) ----
    "site_images": {},                    # {hero, story, app_cta, ...} url map
    # ---- AI assistant (homepage chat + voice) ----
    "assistant_enabled": True,
    "app_store_url": "",
    "google_play_url": "https://play.google.com/store/apps/details?id=com.tonyoga.app&hl=en_IN",
    # ---- Download / offer pop-up (admin-controlled) ----
    "download_popup_enabled": True,       # master on/off for the pop-up
    "download_popup_mode": "app",         # "app" (store buttons) | "custom" (your own offer)
    "download_popup_delay_seconds": 30,   # how long before the pop-up appears
    "download_popup_on_exit": False,      # also show on exit-intent (mouse leaves the page)
    "download_popup_eyebrow": "",         # empty → sensible default per mode
    "download_popup_title": "",
    "download_popup_description": "",
    "download_popup_cta_label": "",       # custom-offer button text
    "download_popup_cta_url": "",         # custom-offer button link
    "download_popup_image_url": "",       # optional custom image (empty → brand logo)
    "download_popup_offer_expiry": "",    # optional ISO datetime; custom offer hides a live countdown + expires
    # ---- Private 1:1 sessions (admin-controlled pricing) ----
    "private_session_price": 120.0,       # price per session (EUR)
    "private_session_duration_min": 60,   # session length in minutes
    "private_session_image": "",          # hero/photo for the private-sessions section
    "private_session_packages": [],       # [{sessions:int, price:float, label?:str}] discounted bundles
    "assistant_greeting": "I'm Tony's assistant. How can I help you?",
    "assistant_popup_delay": 12,
    # Direct OpenAI key powers chat + voice; an empty DB key uses OPENAI_API_KEY.
    # Missing keys disable AI calls only, not application startup.
    "openai_api_key": "",
    "assistant_openai_model": "gpt-5.4-mini",
    "assistant_voice": "nova",            # OpenAI TTS voice: alloy|echo|fable|onyx|nova|shimmer
    # Which AI runs chat + voice: "auto" = Gemini when a Gemini key is set, otherwise OpenAI.
    "assistant_provider": "auto",         # auto | openai | gemini
    "gemini_api_key": "",                 # Google AI Studio key; an empty DB key uses GEMINI_API_KEY
    "assistant_gemini_model": "gemini-3.5-flash-lite",
    "assistant_gemini_tts_model": "gemini-3.8-flash-lite-tts",
    "assistant_gemini_voice": "Kore",     # Gemini prebuilt voice (Kore, Aoede, Leda, Puck, Charon…)
    "assistant_daily_limit": 300,         # max AI turns/day (0 = unlimited) — guards against runaway OpenAI spend
    "assistant_session_limit": 25,        # max AI turns per visitor session (0 = unlimited)
    # New-lead WhatsApp alert to the owner (requires WhatsApp/Twilio configured below).
    "lead_alert_enabled": True,
    "lead_alert_whatsapp": "",            # owner number for alerts; falls back to social_whatsapp
    # ---- Phone app push (Android via Firebase Cloud Messaging, iPhone via Apple Push) ----
    "native_push_enabled": True,
    "fcm_service_account_json": "",       # Firebase → Project settings → Service accounts → private key JSON
    "apns_key_p8": "",                    # Apple Developer → Keys → APNs key (.p8 contents)
    "apns_key_id": "",
    "apns_team_id": "",
    "apns_bundle_id": "com.tonyoga.app",
    "apns_sandbox": False,                # True only for Xcode debug builds
    # ---- Member care ----
    "membership_reminder_days": 3,        # remind members this many days before access ends (0 = off)
    "auto_reconcile_payments": True,      # re-check unconfirmed card/PayPal payments every few minutes
    "pause_enabled": True,                # members may pause their membership themselves
    "pause_max_months": 3,
    "stay_offer_percent": 0,              # store credit (% of plan price) offered when someone cancels; 0 = no offer
    "stay_offer_text": "",
    "past_due_grace_days": 7,             # access kept this many days after a renewal card payment fails
    "gifts_enabled": True,                # "Give a membership" on the website
    # ---- Community ----
    "monthly_theme": {},                  # {title, text, image, link_label, link_url, month: "YYYY-MM"} shown on Today
    # ---- Hotel & resort partners ----
    "hotels_enabled": False,              # public /hotels page + partner portal
    "hotel_deposit_percent": 30,          # deposit asked when a stay is confirmed
    "hotel_balance_due_days": 30,         # balance due this many days before the stay
    "hotel_guest_free_days": 30,          # free online access for guests who scan the stay QR code
    "hotel_contact_email": "",            # where partner applications are sent (blank = admins)
    "hotel_guest_plan_id": "",            # plan guests get free (blank = the lowest-priced active plan)
    "hotel_cancellation_terms": ("The deposit secures the dates. Cancel more than 60 days before the first day for a full refund of the deposit. "
                                 "Cancel 30 to 60 days before and the deposit is kept. Cancel less than 30 days before and the full programme fee is due. "
                                 "If Tony Yoga cancels, everything paid is refunded."),
    "hotel_waiver_text": ("I take part at my own risk. I will tell the teacher about any injury, health condition or pregnancy before class, "
                          "and I can stop or rest at any time."),
    # ---- Invoices (hotel partners, teacher fees) ----
    "invoice_business_name": "Tony Yoga",
    "invoice_business_address": "",
    "invoice_tax_id": "",
    "invoice_footer": "",
    # ---- Teacher hub ----
    "teachers_enabled": False,            # public /teachers directory + teacher accounts
    "teacher_tiers": [
        {"id": "basic", "name": "Basic", "price": 39, "currency": "eur", "max_offerings": 3, "max_students": 50, "platform_fee_percent": 0,
         "features": ["Profile in the directory", "Up to 3 classes or courses", "Student list and messages"]},
        {"id": "pro", "name": "Pro", "price": 89, "currency": "eur", "max_offerings": 15, "max_students": 300, "platform_fee_percent": 0,
         "features": ["Everything in Basic", "Up to 15 classes or courses", "Featured in the directory", "Online payments to your account"]},
        {"id": "studio", "name": "Studio", "price": 149, "currency": "eur", "max_offerings": 100, "max_students": 3000, "platform_fee_percent": 0,
         "features": ["Everything in Pro", "Unlimited classes and courses", "Studio page for several teachers", "Priority support"]},
    ],
    "teacher_ce_hours_per_year": 20,      # continuing-education hours a certified teacher logs each year
    "teacher_certified_label": "Tony-Certified",
}

# Fields safe to expose to unauthenticated clients (frontend bootstrapping).
PUBLIC_FIELDS = {
    "challenges_enabled",
    "app_store_url",
    "google_play_url",
    "download_popup_enabled",
    "download_popup_mode",
    "download_popup_delay_seconds",
    "download_popup_on_exit",
    "download_popup_eyebrow",
    "download_popup_title",
    "download_popup_description",
    "download_popup_cta_label",
    "download_popup_cta_url",
    "download_popup_image_url",
    "download_popup_offer_expiry",
    "private_session_price",
    "private_session_duration_min",
    "private_session_image",
    "private_session_packages",
    "default_currency",
    "stripe_enabled",
    "stripe_publishable_key",
    "stripe_subscriptions_enabled",
    "paypal_enabled",
    "paypal_mode",
    "crypto_enabled",
    "tax_rate_percent",
    "min_order_amount",
    "default_video_provider",
    "video_autoplay",
    "video_default_quality",
    "video_allow_downloads",
    "video_watermark_text",
    "social_facebook",
    "social_instagram",
    "social_youtube",
    "social_linkedin",
    "social_whatsapp",
    "social_tiktok",
    "hero_testimonial",
    "testimonials",
    "reels_enabled",
    "site_images",
    "assistant_enabled",
    "assistant_greeting",
    "assistant_popup_delay",
    "social_whatsapp",
    "monthly_theme",
    "gifts_enabled",
    "hotels_enabled",
    "teachers_enabled",
    "teacher_tiers",
    "teacher_certified_label",
}


def _mask(value: str) -> str:
    if not value:
        return ""
    if len(value) <= 6:
        return "••••"
    return "•" * 8 + value[-4:]


def _is_masked(value: Any) -> bool:
    return isinstance(value, str) and value.startswith("•")


async def get_all_settings() -> Dict[str, Any]:
    """Return merged settings: defaults <- DB. Does NOT apply env fallback."""
    doc = await db.app_settings.find_one({"_id": SETTINGS_DOC_ID}, {"_id": 0}) or {}
    merged = {**DEFAULT_SETTINGS}
    for k, v in doc.items():
        if k.startswith("_"):
            continue
        merged[k] = decrypt_secret(v) if k in SECRET_FIELDS else v
    return content_defaults(merged)


async def get_setting(key: str) -> Any:
    """Read a single effective setting. Empty DB values fall back to ENV."""
    settings = await get_all_settings()
    val = settings.get(key)
    if (val is None or val == "") and key in ENV_FALLBACK:
        return os.environ.get(ENV_FALLBACK[key], "")
    return val


async def private_session_amount(qty: int) -> float:
    """Total EUR for `qty` private sessions: a matching bundle price wins, else per-session price."""
    settings = await get_all_settings()
    try:
        price_each = float(settings.get("private_session_price") or 120.0)
    except (TypeError, ValueError):
        price_each = 120.0
    if price_each <= 0:
        price_each = 120.0
    for p in (settings.get("private_session_packages") or []):
        try:
            if int(p.get("sessions")) == int(qty):
                return round(float(p.get("price")), 2)
        except (TypeError, ValueError):
            continue
    return round(price_each * qty, 2)


# Tony's photos that ship with the website (frontend/public/brand/tony). They are written into
# the database once, so every picture on the site comes from Admin → Site images.
STARTER_SITE_IMAGES = {
    "hero": "/brand/tony/hero-poster.jpg",
    "story": "/brand/tony/tony-story.jpg",
    "teacher_training": "/brand/tony/group.jpg",
    "app_home": "/brand/tony/tony-portrait.jpg",
    "tony_portrait": "/brand/tony/tony-face.jpg",
    "private_session": "/brand/tony/private-session.jpg",
    "tt_page_hero": "/brand/tony/tt-hero.jpg",
    "tt_page_group": "/brand/tony/group-wide.jpg",
    "library_1": "/brand/tony/pose-backbend.jpg",
    "library_2": "/brand/tony/pose-forward-fold.jpg",
    "library_3": "/brand/tony/pose-kneel-fold.jpg",
    "library_4": "/brand/tony/tony-seated.jpg",
}


async def ensure_site_images() -> None:
    """Run once: fill empty Site images slots with the photos above. Slots the admin already
    set are kept; a slot emptied later stays empty. No hero video is added."""
    doc = await db.app_settings.find_one({"_id": SETTINGS_DOC_ID}, {"_id": 0, "site_images": 1, "_site_images_seeded": 1}) or {}
    if doc.get("_site_images_seeded"):
        return
    images = dict(doc.get("site_images") or {})
    for slot, path in STARTER_SITE_IMAGES.items():
        if not images.get(slot):
            images[slot] = path
    if images.get("hero_video") == "off":
        images["hero_video"] = ""
    await db.app_settings.update_one(
        {"_id": SETTINGS_DOC_ID},
        {"$set": {"site_images": images, "_site_images_seeded": now_utc().isoformat()}, "$setOnInsert": {"_id": SETTINGS_DOC_ID}},
        upsert=True,
    )


async def save_settings(update: Dict[str, Any], admin: dict | None = None) -> None:
    """Persist a subset of settings (used by the per-integration Save & Verify flows).
    Only keys present in DEFAULT_SETTINGS are written."""
    clean = {k: v for k, v in update.items() if k in DEFAULT_SETTINGS}
    validate_content(clean)
    if not clean:
        return
    from integration_config import validate_integration_update
    await validate_integration_update(clean)
    for key in SECRET_FIELDS.intersection(clean):
        clean[key] = encrypt_secret(clean[key])
    clean["_updated_at"] = now_utc().isoformat()
    if admin:
        clean["_updated_by"] = admin.get("id")
    await db.app_settings.update_one(
        {"_id": SETTINGS_DOC_ID},
        {"$set": clean, "$setOnInsert": {"_id": SETTINGS_DOC_ID}},
        upsert=True,
    )
    if admin:
        await _write_audit(admin, [k for k in clean if not k.startswith("_")])
    await clear_content_overrides(clean.keys())



# ----------------------------------------------------------------------------
# Endpoints
# ----------------------------------------------------------------------------
@api.get("/admin/settings")
async def admin_get_settings(request: Request):
    await require_role(request, ["admin"])
    settings = await get_all_settings()
    out: Dict[str, Any] = {}
    for k, v in settings.items():
        if k in SECRET_FIELDS:
            # Compute effective value (DB or env) so we can show "is configured"
            effective = v or os.environ.get(ENV_FALLBACK.get(k, ""), "")
            out[k] = _mask(str(effective))
            out[f"{k}_set"] = bool(effective)
            out[f"{k}_from_env"] = bool(not v and os.environ.get(ENV_FALLBACK.get(k, ""), ""))
        elif k in ENV_FALLBACK:
            # Non-secret with env fallback (e.g. stripe publishable key) — show full value.
            effective = v or os.environ.get(ENV_FALLBACK[k], "")
            out[k] = effective
            out[f"{k}_from_env"] = bool(not v and os.environ.get(ENV_FALLBACK[k], ""))
        else:
            out[k] = v
    return out


@api.patch("/admin/settings")
async def admin_patch_settings(payload: Dict[str, Any], request: Request):
    admin = await require_role(request, ["admin"])
    from urllib.parse import urlparse
    for field, host in (("app_store_url", "apps.apple.com"), ("google_play_url", "play.google.com")):
        if field in payload:
            value = payload[field]
            if not isinstance(value, str):
                raise HTTPException(422, f"{field} must be a store link or empty.")
            value = value.strip()
            try:
                parsed = urlparse(value)
                valid = parsed.scheme == "https" and parsed.hostname == host and not parsed.username and not parsed.password and parsed.port in (None, 443)
            except ValueError:
                valid = False
            if value and (len(value) > 2000 or not valid):
                raise HTTPException(422, f"Please use an https://{host}/ app listing link.")
            payload[field] = value
    if "assistant_popup_delay" in payload:
        try:
            delay = int(payload["assistant_popup_delay"])
        except (ValueError, TypeError):
            raise HTTPException(422, "Assistant delay must be 10–15 seconds.")
        if not 10 <= delay <= 15:
            raise HTTPException(422, "Assistant delay must be 10–15 seconds.")
        payload["assistant_popup_delay"] = delay
    if "download_popup_delay_seconds" in payload:
        try:
            payload["download_popup_delay_seconds"] = max(0, min(300, int(payload["download_popup_delay_seconds"])))
        except (ValueError, TypeError):
            raise HTTPException(422, "Pop-up delay must be a number of seconds.")
    if "private_session_price" in payload:
        try:
            p = float(payload["private_session_price"])
        except (ValueError, TypeError):
            raise HTTPException(422, "Private session price must be a number.")
        if p < 0:
            raise HTTPException(422, "Private session price cannot be negative.")
        payload["private_session_price"] = p
    if "private_session_duration_min" in payload:
        try:
            payload["private_session_duration_min"] = max(15, min(240, int(payload["private_session_duration_min"])))
        except (ValueError, TypeError):
            raise HTTPException(422, "Private session length must be a number of minutes.")
    if "private_session_packages" in payload:
        raw = payload["private_session_packages"]
        if not isinstance(raw, list):
            raise HTTPException(422, "Session packages must be a list.")
        clean_pkgs = {}
        for p in raw[:12]:
            if not isinstance(p, dict):
                continue
            try:
                sessions = int(p.get("sessions"))
                price = float(p.get("price"))
            except (TypeError, ValueError):
                raise HTTPException(422, "Each package needs a session count and a price.")
            if sessions < 1 or sessions > 50 or price < 0:
                raise HTTPException(422, "Package sessions must be 1–50 and price non-negative.")
            label = str(p.get("label") or "").strip()[:60]
            clean_pkgs[sessions] = {"sessions": sessions, "price": price, "label": label}  # last write wins per count
        payload["private_session_packages"] = sorted(clean_pkgs.values(), key=lambda x: x["sessions"])
    # Validate Stripe key formats up-front (reject obvious typos before they break checkout).
    _prefixes = {"stripe_secret_key": ("sk_", "rk_"), "stripe_publishable_key": "pk_", "stripe_webhook_secret": "whsec_"}
    for k, pfx in _prefixes.items():
        v = payload.get(k)
        if isinstance(v, str) and v and v != "__clear__" and not _is_masked(v) and not v.startswith(pfx):
            raise HTTPException(400, f"{k} must start with '{pfx}'")
    if payload.get("fcm_service_account_json") not in (None, "", "__clear__") and not _is_masked(payload.get("fcm_service_account_json")):
        import json as _json
        try:
            sa = _json.loads(payload["fcm_service_account_json"])
            assert sa.get("client_email") and sa.get("private_key") and sa.get("project_id")
        except Exception:
            raise HTTPException(422, "Paste the whole Firebase service-account JSON file (it has project_id, client_email and private_key).")
    if payload.get("apns_key_p8") not in (None, "", "__clear__") and not _is_masked(payload.get("apns_key_p8")):
        if "BEGIN PRIVATE KEY" not in str(payload["apns_key_p8"]):
            raise HTTPException(422, "Paste the whole Apple .p8 key, including the BEGIN/END PRIVATE KEY lines.")
    for k, n in (("apns_key_id", 10), ("apns_team_id", 10)):
        v = payload.get(k)
        if v not in (None, "") and not (isinstance(v, str) and len(v.strip()) == n and v.strip().isalnum()):
            raise HTTPException(422, f"{k.replace('_', ' ').replace('apns', 'Apple')} must be {n} letters/numbers.")
    if "membership_reminder_days" in payload:
        try:
            payload["membership_reminder_days"] = max(0, min(30, int(payload["membership_reminder_days"])))
        except (TypeError, ValueError):
            raise HTTPException(422, "Reminder days must be a number from 0 to 30.")
    for key, lo, hi in (("pause_max_months", 1, 12), ("stay_offer_percent", 0, 100), ("past_due_grace_days", 0, 30),
                        ("hotel_deposit_percent", 0, 100), ("hotel_balance_due_days", 0, 120), ("hotel_guest_free_days", 0, 365),
                        ("teacher_ce_hours_per_year", 0, 200)):
        if key in payload:
            try:
                payload[key] = max(lo, min(hi, int(payload[key])))
            except (TypeError, ValueError):
                raise HTTPException(422, f"{key.replace('_', ' ').capitalize()} must be a number from {lo} to {hi}.")
    for key, limit in (("hotel_cancellation_terms", 2000), ("hotel_waiver_text", 2000), ("invoice_business_name", 120),
                       ("invoice_business_address", 400), ("invoice_tax_id", 40), ("invoice_footer", 400), ("hotel_contact_email", 200),
                       ("hotel_guest_plan_id", 80), ("teacher_certified_label", 40)):
        if key in payload and len(str(payload[key] or "")) > limit:
            raise HTTPException(422, f"{key.replace('_', ' ').capitalize()} must be {limit} characters or fewer.")
    if "stay_offer_text" in payload and len(str(payload["stay_offer_text"] or "")) > 300:
        raise HTTPException(422, "Stay offer text must be 300 characters or fewer.")
    if "teacher_tiers" in payload:
        tiers = payload["teacher_tiers"]
        if not isinstance(tiers, list) or not 1 <= len(tiers) <= 6:
            raise HTTPException(422, "Teacher tiers must be a list of 1 to 6 tiers.")
        clean = []
        for t in tiers:
            if not isinstance(t, dict) or not __import__("re").match(r"^[a-z0-9_-]{2,20}$", str(t.get("id") or "")):
                raise HTTPException(422, "Each tier needs an id of 2–20 lowercase letters or numbers.")
            try:
                clean.append({"id": t["id"], "name": str(t.get("name") or t["id"])[:40], "price": max(0.0, round(float(t.get("price") or 0), 2)),
                              "currency": str(t.get("currency") or "eur").lower()[:3], "max_offerings": max(0, int(t.get("max_offerings") or 0)),
                              "max_students": max(0, int(t.get("max_students") or 0)),
                              "platform_fee_percent": max(0.0, min(30.0, float(t.get("platform_fee_percent") or 0))),
                              "stripe_price_id": str(t.get("stripe_price_id") or "")[:80],
                              "features": [str(f)[:120] for f in (t.get("features") or [])][:8]})
            except (TypeError, ValueError):
                raise HTTPException(422, "Tier prices and limits must be numbers.")
        payload["teacher_tiers"] = clean
    if "monthly_theme" in payload:
        theme = payload["monthly_theme"] or {}
        if not isinstance(theme, dict):
            raise HTTPException(422, "Monthly theme must be an object.")
        clean_theme = {}
        for key, limit in (("title", 80), ("text", 400), ("image", 500), ("link_label", 40), ("link_url", 300), ("month", 7)):
            value = theme.get(key)
            if value in (None, ""):
                continue
            if not isinstance(value, str) or len(value) > limit:
                raise HTTPException(422, f"Monthly theme {key.replace('_', ' ')} is too long.")
            clean_theme[key] = value.strip()
        if clean_theme.get("link_url") and not (clean_theme["link_url"].startswith("/") or clean_theme["link_url"].startswith("https://")):
            raise HTTPException(422, "Theme link must start with / or https://")
        if clean_theme.get("month") and not __import__("re").match(r"^\d{4}-\d{2}$", clean_theme["month"]):
            raise HTTPException(422, "Theme month must look like 2026-11.")
        payload["monthly_theme"] = clean_theme
    if "assistant_provider" in payload and payload["assistant_provider"] not in ("auto", "openai", "gemini"):
        raise HTTPException(422, "AI provider must be Automatic, OpenAI or Gemini.")
    for k in ("assistant_gemini_model", "assistant_gemini_tts_model"):
        v = payload.get(k)
        if v is not None and not (isinstance(v, str) and len(v) <= 60 and v.startswith("gemini-")
                                  and all(c.isalnum() or c in ".-" for c in v)):
            raise HTTPException(422, "Use a Gemini model name such as gemini-3.5-flash-lite.")
    if "assistant_gemini_voice" in payload:
        from assistant_gemini import GEMINI_VOICES
        if payload["assistant_gemini_voice"] not in GEMINI_VOICES:
            raise HTTPException(422, "Unsupported Gemini voice.")
    update: Dict[str, Any] = {}
    for k, v in payload.items():
        if k not in DEFAULT_SETTINGS:
            continue
        if k in {"stripe_verified_at", "zoom_verified_at", "stripe_webhook_received_at", "stripe_webhook_verified_at"}:
            continue
        # Explicit clear sentinel for secrets ("__clear__" wipes the stored value).
        if k in SECRET_FIELDS and v == "__clear__":
            update[k] = ""
            continue
        # Ignore masked or empty values for secret fields (would wipe real key).
        if k in SECRET_FIELDS and (_is_masked(v) or v in (None, "")):
            continue
        # Light type coercion
        default_v = DEFAULT_SETTINGS[k]
        if isinstance(default_v, bool):
            if not isinstance(v, bool):
                raise HTTPException(422, f"{k} must be true or false.")
            update[k] = bool(v)
        elif isinstance(default_v, int) and not isinstance(default_v, bool):
            try:
                update[k] = int(v)
            except (TypeError, ValueError):
                continue
            if k == "reminder_lead_minutes":
                update[k] = max(5, min(240, update[k]))
            if k == "private_reminder_lead_minutes" and not 5 <= update[k] <= 240:
                raise HTTPException(422, "Private session reminders must be 5–240 minutes before the session.")
        elif isinstance(default_v, float):
            try:
                update[k] = float(v)
            except (TypeError, ValueError):
                continue
        else:
            update[k] = v
    if not update:
        return {"updated": 0, "warnings": []}
    await save_settings(update, admin)
    real_keys = [k for k in update if not k.startswith("_")]
    # Live-mode / test-key mismatch warning (non-blocking).
    warnings = []
    eff_mode = await get_setting("stripe_mode")
    eff_secret = await get_setting("stripe_secret_key")
    if eff_mode == "live" and isinstance(eff_secret, str) and eff_secret.startswith("sk_test_"):
        warnings.append("Stripe is set to LIVE mode but the secret key is a test key (sk_test_). Real charges will fail.")
    if eff_mode == "live" and not eff_secret:
        warnings.append("Stripe is set to LIVE mode but no secret key is configured.")
    return {"updated": len(real_keys), "keys": real_keys, "warnings": warnings}


async def _write_audit(admin: dict, keys: list):
    """Append an audit entry. Records which keys changed and by whom — never the values."""
    if not keys:
        return
    await db.settings_audit.insert_one({
        "id": gen_id(),
        "admin_id": admin.get("id"),
        "admin_email": admin.get("email"),
        "keys": keys,
        "secret_changed": [k for k in keys if k in SECRET_FIELDS],
        "at": now_utc().isoformat(),
    })


@api.get("/settings/public")
async def public_settings():
    """Read-only public-safe settings (no secrets, no auth required)."""
    settings = await get_all_settings()
    out = {k: await get_setting(k) for k in PUBLIC_FIELDS if k in settings}
    # Public website address, so the mobile app can build shareable links
    # (certificates) instead of its internal https://localhost address.
    out["site_url"] = os.environ.get("FRONTEND_URL", "").strip().rstrip("/")
    return out


@api.get("/admin/integrations/status")
async def admin_integrations_status(request: Request):
    await require_role(request, ["admin"])
    from integration_config import integration_status
    return await integration_status()


@api.get("/admin/private-reminders/status")
async def admin_reminder_status(request: Request):
    await require_role(request, ["admin"])
    job = await db.background_jobs.find_one({"_id": "private_reminders"}, {"_id": 0}) or {}
    return {"enabled": await get_setting("private_reminders_enabled"),
            "lead_minutes": await get_setting("private_reminder_lead_minutes"), "job": job}


@api.post("/admin/email/test")
async def admin_test_email(payload: Dict[str, Any], request: Request):
    """Send a test email to verify the configured SMTP settings work."""
    admin = await require_role(request, ["admin"])
    to = (payload.get("to") or admin.get("email") or "").strip()
    if not to:
        return {"ok": False, "error": "No recipient address."}
    from email_service import send_test_email
    ok = await send_test_email(to)
    return {"ok": ok, "to": to,
            "error": None if ok else "Send failed — check SMTP host, port, user and app password."}


@api.post("/admin/whatsapp/test")
async def admin_test_whatsapp(payload: Dict[str, Any], request: Request):
    """Send a test WhatsApp message to verify Twilio settings."""
    await require_role(request, ["admin"])
    to = (payload.get("to") or "").strip()
    if not to:
        return {"ok": False, "error": "Enter a WhatsApp number (E.164, e.g. +34600123456)."}
    from whatsapp_service import whatsapp_enabled, send_whatsapp
    if not await whatsapp_enabled():
        return {"ok": False, "error": "WhatsApp is not configured. Add Twilio SID, token and From number."}
    ok = await send_whatsapp(to, "Tony Yoga test message — your WhatsApp alerts are working. 🧘")
    return {"ok": ok, "to": to, "error": None if ok else "Send failed — check Twilio credentials and the From number."}


@api.post("/admin/push/generate-vapid")
async def admin_generate_vapid(request: Request):
    """Generate a fresh VAPID keypair, store it, and enable web push."""
    admin = await require_role(request, ["admin"])
    from routers.push import generate_vapid_keys
    private_key, public_key = generate_vapid_keys()
    await db.app_settings.update_one(
        {"_id": SETTINGS_DOC_ID},
        {"$set": {
            "vapid_private_key": private_key,
            "vapid_public_key": public_key,
            "push_enabled": True,
            "_updated_by": admin["id"],
            "_updated_at": now_utc().isoformat(),
        }, "$setOnInsert": {"_id": SETTINGS_DOC_ID}},
        upsert=True,
    )
    await _write_audit(admin, ["vapid_public_key", "vapid_private_key", "push_enabled"])
    return {"ok": True, "public_key": public_key}


@api.get("/admin/settings/audit")
async def admin_settings_audit(request: Request):
    """Recent history of settings changes (who + which keys + when). Admin only."""
    await require_role(request, ["admin"])
    rows = await db.settings_audit.find({}, {"_id": 0}).sort("at", -1).to_list(50)
    return rows
