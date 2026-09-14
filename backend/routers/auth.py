"""Auth & profile routes (with SHA-256-fast magic-link consume)."""
import os
import secrets
from datetime import datetime, timedelta

from fastapi import Depends, HTTPException, Response, Request

from core import (
    api, db, logger, now_utc, gen_id, gen_referral_code, sha256_hex,
    hash_password, verify_password, create_access_token, get_current_user,
)
from models import (
    UserCreate, UserLogin, UserProfileUpdate,
    MagicLinkRequest, MagicLinkConsume, PasswordReset, ForgotPassword,
)
from email_service import (
    send_magic_link as email_magic_link,
    send_password_reset as email_password_reset,
)

# ---------- Brute-force protection ----------
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_MINUTES = 15


async def _check_lockout(identifier: str):
    rec = await db.login_attempts.find_one({"identifier": identifier})
    if rec and rec.get("locked_until"):
        try:
            locked_until = datetime.fromisoformat(rec["locked_until"])
        except Exception:
            locked_until = None
        if locked_until and locked_until > now_utc():
            mins = max(1, int((locked_until - now_utc()).total_seconds() // 60) + 1)
            raise HTTPException(429, f"Too many failed attempts. Please try again in {mins} minute(s).")


async def _register_failed_attempt(identifier: str):
    rec = await db.login_attempts.find_one({"identifier": identifier})
    count = ((rec or {}).get("count", 0)) + 1
    update = {"count": count, "last_attempt": now_utc().isoformat(), "identifier": identifier}
    if count >= MAX_FAILED_ATTEMPTS:
        update["locked_until"] = (now_utc() + timedelta(minutes=LOCKOUT_MINUTES)).isoformat()
        update["count"] = 0  # reset the counter once locked
    await db.login_attempts.update_one({"identifier": identifier}, {"$set": update}, upsert=True)


@api.post("/auth/register")
async def register(payload: UserCreate, response: Response):
    email = payload.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already registered")
    referred_by_user = None
    if payload.referral_code:
        referred_by_user = await db.users.find_one({"referral_code": payload.referral_code.lower()})
    user = {
        "id": gen_id(),
        "email": email,
        "name": payload.name,
        "password_hash": hash_password(payload.password),
        "role": "student",
        "timezone": "UTC",
        "level": "beginner",
        "goals": [],
        "source": "referral" if referred_by_user else "direct",
        "referral_code": gen_referral_code(payload.name),
        "referred_by": referred_by_user["id"] if referred_by_user else None,
        "created_at": now_utc().isoformat(),
        "active": True,
    }
    await db.users.insert_one(user)
    if referred_by_user:
        await db.referrals.insert_one({
            "id": gen_id(),
            "referrer_id": referred_by_user["id"],
            "referred_user_id": user["id"],
            "referred_email": email,
            "status": "signed_up",
            "reward_granted": False,
            "created_at": now_utc().isoformat(),
        })
    token = create_access_token(user["id"], email, user["role"])
    response.set_cookie("access_token", token, httponly=True, samesite="lax", max_age=7 * 86400, path="/")
    # Best-effort welcome email to the new member (no-op if SMTP disabled).
    try:
        from email_service import send_welcome_email
        await send_welcome_email(email, payload.name)
    except Exception as e:
        logger.warning(f"welcome email failed for {email}: {e}")
    user.pop("password_hash", None); user.pop("_id", None)
    return {"user": user, "token": token}


@api.post("/auth/login")
async def login(payload: UserLogin, response: Response, request: Request):
    email = payload.email.lower()
    xff = request.headers.get("x-forwarded-for", "")
    ip = (xff.split(",")[0].strip() if xff else None) or (request.client.host if request.client else "unknown")
    identifier = f"{ip}:{email}"
    await _check_lockout(identifier)
    user = await db.users.find_one({"email": email})
    if not user or not user.get("password_hash") or not verify_password(payload.password, user["password_hash"]):
        await _register_failed_attempt(identifier)
        raise HTTPException(401, "Invalid email or password")
    if not user.get("active", True):
        # Allow sign-in during the 30-day deletion grace period so the user can cancel/restore.
        if not user.get("deletion_scheduled_at"):
            raise HTTPException(403, "Account disabled")
    await db.login_attempts.delete_one({"identifier": identifier})  # clear on success
    token = create_access_token(user["id"], email, user["role"], remember=payload.remember)
    cookie_age = (30 if payload.remember else (1 if payload.remember is False else 7)) * 86400
    response.set_cookie("access_token", token, httponly=True, samesite="lax", max_age=cookie_age, path="/")
    user.pop("password_hash", None); user.pop("_id", None)
    return {"user": user, "token": token}


@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


# ---- Magic-link with SHA-256 fast lookup ----
async def _create_magic_link(email: str, link_type: str, ttl: timedelta) -> str:
    token_plain = secrets.token_urlsafe(32)
    await db.magic_link_tokens.insert_one({
        "id": gen_id(),
        "email": email,
        "token_sha": sha256_hex(token_plain),  # O(1) lookup
        "type": link_type,
        "expires_at": (now_utc() + ttl).isoformat(),
        "used_at": None,
        "created_at": now_utc().isoformat(),
    })
    return token_plain


@api.post("/auth/magic-link/request")
async def magic_link_request(payload: MagicLinkRequest):
    email = payload.email.lower()
    token_plain = await _create_magic_link(email, payload.type, timedelta(hours=24))
    frontend_url = os.environ.get("FRONTEND_URL", "")
    magic_url = f"{frontend_url}/magic-link?token={token_plain}"
    logger.info(f"[MAGIC LINK to {email}] {magic_url}")
    sent = await email_magic_link(email, magic_url, payload.type)
    return {"ok": True, "magic_url": magic_url if not sent else None, "email_sent": sent, "expires_in_hours": 24}


@api.post("/auth/magic-link/consume")
async def magic_link_consume(payload: MagicLinkConsume, response: Response):
    # O(1) lookup via SHA-256
    sha = sha256_hex(payload.token)
    matched = await db.magic_link_tokens.find_one({"token_sha": sha, "used_at": None})

    if not matched:
        raise HTTPException(400, "Invalid or expired magic link")
    expires = datetime.fromisoformat(matched["expires_at"])
    if expires < now_utc():
        raise HTTPException(400, "Magic link expired")
    await db.magic_link_tokens.update_one({"id": matched["id"]}, {"$set": {"used_at": now_utc().isoformat()}})

    user = await db.users.find_one({"email": matched["email"]})
    if not user:
        user = {
            "id": gen_id(), "email": matched["email"],
            "name": matched["email"].split("@")[0],
            "role": "student", "source": "magic_link",
            "referral_code": gen_referral_code(matched["email"].split("@")[0]),
            "active": True, "created_at": now_utc().isoformat(),
        }
        await db.users.insert_one(user)
    token = create_access_token(user["id"], user["email"], user["role"])
    response.set_cookie("access_token", token, httponly=True, samesite="lax", max_age=7 * 86400, path="/")
    user.pop("password_hash", None); user.pop("_id", None)
    return {"user": user, "token": token, "link_type": matched["type"]}


@api.post("/auth/forgot-password")
async def forgot_password(payload: ForgotPassword):
    user = await db.users.find_one({"email": payload.email.lower()})
    if not user:
        return {"ok": True}
    token_plain = secrets.token_urlsafe(32)
    await db.password_reset_tokens.insert_one({
        "id": gen_id(), "user_id": user["id"],
        "token_sha": sha256_hex(token_plain),
        "expires_at": (now_utc() + timedelta(hours=1)).isoformat(),
        "used": False,
    })
    frontend_url = os.environ.get("FRONTEND_URL", "")
    reset_url = f"{frontend_url}/reset-password?token={token_plain}"
    logger.info(f"[PASSWORD RESET for {payload.email}] {reset_url}")
    await email_password_reset(payload.email.lower(), reset_url)
    return {"ok": True}


@api.post("/auth/reset-password")
async def reset_password(payload: PasswordReset):
    sha = sha256_hex(payload.token)
    rec = await db.password_reset_tokens.find_one({"token_sha": sha, "used": False})
    if not rec or datetime.fromisoformat(rec["expires_at"]) < now_utc():
        raise HTTPException(400, "Invalid or expired token")
    await db.users.update_one({"id": rec["user_id"]}, {"$set": {"password_hash": hash_password(payload.new_password)}})
    await db.password_reset_tokens.update_one({"id": rec["id"]}, {"$set": {"used": True}})
    return {"ok": True}


@api.patch("/auth/profile")
async def update_profile(payload: UserProfileUpdate, user: dict = Depends(get_current_user)):
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if update:
        await db.users.update_one({"id": user["id"]}, {"$set": update})
    return await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
