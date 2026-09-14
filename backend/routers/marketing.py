"""Marketing site backends: newsletter, free-class signup, IG reels."""
import os
import re
import secrets
from typing import Optional
from fastapi import HTTPException, Request
from pydantic import BaseModel, EmailStr
import httpx

from core import api, db, gen_id, now_utc, logger
from routers.settings import get_setting, SETTINGS_DOC_ID

GRAPH_VERSION = "v21.0"
GRAPH_BASE = "https://graph.instagram.com"


def _shortcode_from_permalink(url: str) -> str:
    """Derive the reel/post shortcode from an Instagram permalink."""
    m = re.search(r"instagram\.com/(?:reel|p|tv)/([A-Za-z0-9_-]+)", url or "")
    return m.group(1) if m else ""


async def instagram_sync() -> dict:
    """Pull latest media from the Instagram Graph API into settings.instagram_reels.

    Graceful no-op when no token/user id is configured. Keeps the previous cached
    reels on failure (never wipes a good feed because one API call failed).
    """
    token = await get_setting("instagram_access_token")
    ig_user_id = await get_setting("instagram_user_id")
    if not token or not ig_user_id:
        return {"ok": False, "code": "not_connected", "error": "Instagram not connected — add an access token and account id in Settings."}
    fields = "id,media_type,media_product_type,permalink,caption,thumbnail_url,media_url,timestamp"
    url = f"{GRAPH_BASE}/{GRAPH_VERSION}/{ig_user_id}/media"
    try:
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.get(url, params={"fields": fields, "limit": 12, "access_token": token})
        if r.status_code != 200:
            err = f"Instagram API {r.status_code}: {r.text[:200]}"
            await db.app_settings.update_one({"_id": SETTINGS_DOC_ID}, {"$set": {"instagram_last_error": err}}, upsert=True)
            return {"ok": False, "code": "api_error", "error": err}
        data = r.json().get("data", [])
    except Exception as e:
        err = f"Instagram sync failed: {e}"
        await db.app_settings.update_one({"_id": SETTINGS_DOC_ID}, {"$set": {"instagram_last_error": err}}, upsert=True)
        return {"ok": False, "code": "api_error", "error": err}

    reels = []
    for item in data:
        permalink = item.get("permalink", "")
        shortcode = _shortcode_from_permalink(permalink)
        if not shortcode:
            continue
        caption = (item.get("caption") or "").split("\n")[0][:120]
        reels.append({
            "shortcode": shortcode,
            "caption": caption,
            "thumbnail_url": item.get("thumbnail_url") or item.get("media_url") or "",
            "permalink": permalink,
        })
    reels = reels[:8]
    await db.app_settings.update_one(
        {"_id": SETTINGS_DOC_ID},
        {"$set": {"instagram_reels": reels, "instagram_last_sync": now_utc().isoformat(), "instagram_last_error": ""}},
        upsert=True,
    )
    return {"ok": True, "count": len(reels), "reels": reels}


async def instagram_sync_tick():
    """Called from the background loop; syncs at most ~every 30 min when auto-sync is on."""
    if not await get_setting("instagram_auto_sync"):
        return
    last = await get_setting("instagram_last_sync")
    if last:
        try:
            from datetime import datetime
            delta = (now_utc() - datetime.fromisoformat(last)).total_seconds()
            if delta < 1800:
                return
        except Exception:
            pass
    await instagram_sync()


@api.post("/admin/instagram/sync")
async def admin_instagram_sync(request: Request):
    """Manual 'Sync now' — pull latest reels from Instagram. Admin only."""
    from core import require_role
    await require_role(request, ["admin"])
    result = await instagram_sync()
    if not result.get("ok"):
        status = 400 if result.get("code") == "not_connected" else 502
        raise HTTPException(status, result.get("error", "Sync failed"))
    return result


# No fabricated fallback posts: the section stays hidden until real reels are configured.
DEFAULT_REELS = []


@api.get("/marketing/reels")
async def marketing_reels():
    """Public list of Instagram reel shortcodes for the marketing homepage."""
    reels = await get_setting("instagram_reels")
    if isinstance(reels, list) and reels:
        return reels
    return DEFAULT_REELS


@api.get("/admin/marketing/ribbon-stats")
async def ribbon_stats():
    """Signups grouped by ribbon variant so Tony can pick a winner."""
    pipeline = [
        {"$match": {"source": {"$regex": "^ribbon_"}}},
        {"$group": {"_id": "$source", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    rows = await db.free_class_grants.aggregate(pipeline).to_list(50)
    total = sum(int(r.get("count", 0)) for r in rows)
    return {
        "total": total,
        "variants": [{"variant": (r["_id"] or "").replace("ribbon_", ""), "count": r["count"]} for r in rows],
    }


class FreeClassSignup(BaseModel):
    email: EmailStr
    name: Optional[str] = None
    source: Optional[str] = "marketing_ribbon"


class NewsletterIn(BaseModel):
    email: EmailStr


class NewsletterOut(BaseModel):
    ok: bool


@api.post('/submissions/newsletter', response_model=NewsletterOut)
async def subscribe_newsletter(payload: NewsletterIn):
    """Save consent without claiming an email was sent. Repeated signups are idempotent."""
    email = str(payload.email).lower().strip()
    await db.newsletter_subscribers.update_one({'_id': email}, {
        '$set': {'email': email, 'subscribed': True, 'updated_at': now_utc().isoformat()},
        '$setOnInsert': {'id': gen_id(), 'created_at': now_utc().isoformat()}}, upsert=True)
    return NewsletterOut(ok=True)


@api.post("/marketing/free-class-signup")
async def free_class_signup(payload: FreeClassSignup):
    """Capture an email on the marketing site → grant one drop-in class pass.

    Idempotent per email: repeated signups return the existing pass without
    granting a second one.
    """
    email = str(payload.email).lower().strip()
    # Simple abuse guard: check if we've granted a free pass to this email already
    existing_grant = await db.free_class_grants.find_one({"email": email})
    if existing_grant:
        return {
            "ok": True,
            "already_granted": True,
            "message": "You've already claimed your free class. Sign in and book it!",
        }

    # Find or create a user account. If the email exists, just credit their pass.
    user = await db.users.find_one({"email": email})
    if not user:
        # Create a lightweight placeholder user; they'll set a password via
        # magic-link when they claim the pass in the app.
        placeholder_password_hash = "$2b$12$" + secrets.token_urlsafe(24)[:53]  # unusable — forces reset
        user = {
            "id": gen_id(),
            "email": email,
            "name": (payload.name or email.split("@")[0]).strip(),
            "password_hash": placeholder_password_hash,
            "role": "student",
            "created_at": now_utc().isoformat(),
            "source": payload.source or "marketing_ribbon",
            "requires_password_reset": True,
        }
        await db.users.insert_one(user)

    # Grant a single-credit class pass
    pack = {
        "id": gen_id(),
        "user_id": user["id"],
        "type": "free_intro",
        "remaining": 1,
        "credits_initial": 1,
        "active": True,
        "source": payload.source or "marketing_ribbon",
        "created_at": now_utc().isoformat(),
    }
    await db.class_passes.insert_one(pack)
    await db.free_class_grants.insert_one({
        "id": gen_id(),
        "email": email,
        "user_id": user["id"],
        "pass_id": pack["id"],
        "created_at": now_utc().isoformat(),
    })

    # Send welcome email with magic-link (best-effort)
    try:
        from email_service import send_email
        frontend = os.environ.get("FRONTEND_URL", "").rstrip("/")
        # Simplest onboarding: point them at /register with a helpful note
        signup_url = f"{frontend}/register?email={email}&welcome=1" if frontend else "/register"
        html = f"""
        <div style="font-family: Georgia, serif; max-width: 480px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #1C221F;">Your first class is on us.</h2>
            <p style="color: #545E56; line-height: 1.6;">
                Welcome to Tony Yoga. One class credit has been added to your account —
                pick any live class in the schedule.
            </p>
            <p style="text-align: center; margin: 24px 0;">
                <a href="{signup_url}" style="background: #B25A45; color: #FAFAF7; padding: 12px 24px; border-radius: 999px; text-decoration: none; font-weight: 600;">Set up your account</a>
            </p>
            <p style="color: #6B7269; font-size: 13px; line-height: 1.6;">
                Slow down. Breathe in. Begin again.<br>— Tony
            </p>
        </div>
        """
        await send_email(email, "Your first class is on us · Tony Yoga", html, "Welcome to Tony Yoga — your first class credit is in your account.")
    except Exception as e:
        logger.warning(f"free-class welcome email failed: {e}")

    return {
        "ok": True,
        "already_granted": False,
        "email": email,
        "message": "One class credit added. Sign in to book.",
    }
