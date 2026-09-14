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
        "exp": now_utc() + timedelta(days=days),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def decode_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])


# ---------------- Auth deps ----------------
async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = decode_token(token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(401, "User not found")
    return user


async def get_optional_user(request: Request) -> Optional[dict]:
    """Like get_current_user but returns None for unauthenticated requests instead of raising."""
    try:
        return await get_current_user(request)
    except HTTPException:
        return None



async def require_role(request: Request, roles: List[str]) -> dict:
    user = await get_current_user(request)
    if user.get("role") not in roles:
        raise HTTPException(403, "Forbidden")
    return user
