"""Shared core: env, db, jwt, password hashing, helpers, FastAPI router.

All routers import from here.
"""
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import hashlib
import secrets
import uuid
import logging
from typing import List, Optional
from datetime import datetime, timezone, timedelta

import bcrypt
import jwt
from fastapi import APIRouter, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorClient

# ---------------- DB ----------------
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

# ---------------- Router ----------------
api = APIRouter(prefix="/api")

# ---------------- Logger ----------------
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("tony-yoga")

# ---------------- Constants ----------------
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALG = "HS256"


# ---------------- Time / ID helpers ----------------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def gen_id() -> str:
    return str(uuid.uuid4())


def gen_referral_code(name: str) -> str:
    base = "".join(c for c in (name or "").lower() if c.isalnum())[:6] or "yogi"
    return f"{base}-{secrets.token_urlsafe(3).lower().replace('_','').replace('-','')}"


def sha256_hex(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


# ---------------- Checkout return URLs ----------------
# Inside the iOS / Android app the page origin is the app's local web server
# (https://localhost or capacitor://localhost). Payment pages open in the phone's
# browser, which cannot reach that address, so after paying the buyer would land on
# an error page and a PayPal order would never be captured. Send them to the public
# website instead (FRONTEND_URL) and tag the URL so the page tells them to return
# to the app.
NATIVE_APP_ORIGINS = {"https://localhost", "http://localhost", "capacitor://localhost", "ionic://localhost"}


def checkout_return_base(origin_url: Optional[str], client: Optional[str] = None):
    """Return (base_url, extra_query) for payment success/cancel URLs."""
    origin = (origin_url or "").strip().rstrip("/")
    from_app = client == "app" or origin in NATIVE_APP_ORIGINS
    if origin in NATIVE_APP_ORIGINS or not origin.startswith(("http://", "https://")):
        frontend = os.environ.get("FRONTEND_URL", "").strip().rstrip("/")
        if frontend:
            origin = frontend
    return origin, ("&app=1" if from_app else "")


# ---------------- Password helpers ----------------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


# ---------------- JWT ----------------
def create_access_token(user_id: str, email: str, role: str, remember: Optional[bool] = None) -> str:
    # remember True -> 30 days, False -> 1 day, None (default callers) -> 7 days.
    days = 30 if remember else (1 if remember is False else 7)
    payload = {
        "sub": user_id, "email": email, "role": role, "type": "access",
        "exp": now_utc() + timedelta(days=days), "iat": int(now_utc().timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def decode_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])


# ---------------- Auth deps ----------------
async def _user_for_token(token: str, request: Request) -> dict:
    try:
        payload = decode_token(token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(401, "User not found")
    changed = user.get("password_changed_at")
    if changed:
        try:
            changed_ts = int(datetime.fromisoformat(str(changed).replace("Z", "+00:00")).timestamp())
        except ValueError:
            changed_ts = 0
        if int(payload.get("iat") or 0) < changed_ts:
            raise HTTPException(401, "Your password was changed. Please sign in again.")
    if user.get("active") is False:
        recovery_paths = {"/api/auth/me", "/api/auth/logout", "/api/me/account/status", "/api/me/account/cancel-deletion"}
        if not user.get("deletion_scheduled_at") or request.url.path not in recovery_paths:
            raise HTTPException(403, "Account is inactive or pending deletion.")
    return user


async def get_current_user(request: Request) -> dict:
    """The signed-in user from the session cookie or the Bearer token (an old cookie never
    hides a valid Bearer token, e.g. after a password change in the app)."""
    tokens = []
    cookie = request.cookies.get("access_token")
    if cookie:
        tokens.append(cookie)
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer ") and auth[7:] and auth[7:] not in tokens:
        tokens.append(auth[7:])
    if not tokens:
        raise HTTPException(401, "Not authenticated")
    last = None
    for token in tokens:
        try:
            return await _user_for_token(token, request)
        except HTTPException as exc:
            if exc.status_code == 403:
                raise
            last = exc
    raise last


async def get_optional_user(request: Request) -> Optional[dict]:
    """Like get_current_user but returns None for unauthenticated requests instead of raising."""
    try:
        return await get_current_user(request)
    except HTTPException:
        return None



def _public_ip(value: str) -> str:
    import ipaddress
    try:
        ip = ipaddress.ip_address((value or "").strip())
    except ValueError:
        return ""
    return "" if (ip.is_private or ip.is_loopback or ip.is_unspecified or ip.is_reserved or ip.is_multicast) else str(ip)


def client_ip(request: Request) -> str:
    """The visitor's IP. Behind nginx every request comes from 127.0.0.1, so the proxy's headers are
    used when the direct peer is local: the last X-Forwarded-For hop (the one nginx appends), then
    X-Real-IP. A header value must be a public IP address; anything else (a made-up value, a
    loopback/private address) is ignored. With no usable header the peer address is returned —
    "unknown visitor" for the per-visitor limits (see is_local_ip)."""
    import ipaddress
    peer = request.client.host if request.client else ""
    try:
        local = not peer or ipaddress.ip_address(peer).is_private or ipaddress.ip_address(peer).is_loopback
    except ValueError:
        local = True
    if local:
        hops = [h.strip() for h in (request.headers.get("x-forwarded-for") or "").split(",") if h.strip()]
        for candidate in ([hops[-1]] if hops else []) + [request.headers.get("x-real-ip") or ""]:
            ip = _public_ip(candidate)
            if ip:
                return ip
    return peer or "unknown"


def is_local_ip(ip: str) -> bool:
    """True when the visitor's own address is unknown (no usable proxy header): limits that
    count per visitor then apply site-wide instead."""
    import ipaddress
    try:
        a = ipaddress.ip_address(ip)
        return a.is_loopback or a.is_private
    except ValueError:
        return True


async def require_role(request: Request, roles: List[str]) -> dict:
    user = await get_current_user(request)
    if user.get("role") not in roles:
        raise HTTPException(403, "Forbidden")
    return user
