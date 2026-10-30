"""Phone notifications for the Android and iPhone apps.

Android: Firebase Cloud Messaging (HTTP v1) with the service-account JSON saved in
Admin → Settings → Phone app notifications. iPhone: Apple Push Notification service with
the .p8 key, key ID and team ID saved there. Without those settings nothing is sent and
nothing breaks — the bell and email still work.

The app registers its device token with POST /api/push/device after the member signs in.
"""
import json
import time
from typing import Optional

import httpx
import jwt
from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel, Field

from core import api, db, gen_id, get_current_user, logger, now_utc, require_role
from routers.settings import get_setting

_cache: dict = {}  # access tokens / signed JWTs, refreshed before they expire


class DeviceIn(BaseModel):
    token: str = Field(min_length=20, max_length=4096)
    platform: str = Field(pattern="^(android|ios)$")
    app_version: Optional[str] = Field(default=None, max_length=40)


async def _fcm_account():
    raw = await get_setting("fcm_service_account_json")
    if not raw:
        return None
    try:
        sa = json.loads(raw)
        return sa if sa.get("client_email") and sa.get("private_key") and sa.get("project_id") else None
    except ValueError:
        return None


async def _apns_config():
    key, key_id, team = (await get_setting("apns_key_p8") or "", await get_setting("apns_key_id") or "",
                         await get_setting("apns_team_id") or "")
    if not (key and key_id and team):
        return None
    return {"key": key, "key_id": key_id.strip(), "team": team.strip(),
            "topic": (await get_setting("apns_bundle_id") or "com.tonyoga.app").strip(),
            "host": "https://api.sandbox.push.apple.com" if await get_setting("apns_sandbox") else "https://api.push.apple.com"}


async def status() -> dict:
    enabled = await get_setting("native_push_enabled") is not False
    android, ios = bool(await _fcm_account()), bool(await _apns_config())
    return {"enabled": enabled, "android": enabled and android, "ios": enabled and ios,
            "android_configured": android, "ios_configured": ios,
            "devices": {"android": await db.device_tokens.count_documents({"platform": "android", "active": True}),
                        "ios": await db.device_tokens.count_documents({"platform": "ios", "active": True})}}


@api.get("/push/native-config")
async def native_config():
    """Tells the app whether to ask for notification permission on this platform."""
    s = await status()
    return {"android": s["android"], "ios": s["ios"]}


@api.post("/push/device")
async def register_device(payload: DeviceIn, user: dict = Depends(get_current_user)):
    await db.device_tokens.update_one({"token": payload.token}, {
        "$set": {"user_id": user["id"], "platform": payload.platform, "app_version": payload.app_version,
                 "active": True, "updated_at": now_utc().isoformat()},
        "$setOnInsert": {"id": gen_id(), "token": payload.token, "created_at": now_utc().isoformat()},
    }, upsert=True)
    return {"ok": True}


@api.post("/push/device/remove")
async def remove_device(payload: dict, user: dict = Depends(get_current_user)):
    await db.device_tokens.update_one({"token": str((payload or {}).get("token") or ""), "user_id": user["id"]},
                                      {"$set": {"active": False}})
    return {"ok": True}


@api.get("/admin/native-push/status")
async def admin_native_status(request: Request):
    await require_role(request, ["admin"])
    return await status()


@api.post("/admin/native-push/test")
async def admin_native_test(request: Request):
    """Send a test notification to the admin's own phones."""
    admin = await require_role(request, ["admin"])
    sent = await send_to_user(admin["id"], "Tony Yoga test", "Phone notifications are working.", "/home", raise_errors=True)
    if not sent:
        raise HTTPException(409, "No phone with the Tony Yoga app is signed in to this admin account yet. "
                                 "Open the app on your phone, sign in with this account and allow notifications, then try again.")
    return {"sent": sent}


# ---------------------------------------------------------------------------
# Senders

async def _fcm_access_token(sa: dict) -> str:
    cached = _cache.get("fcm")
    if cached and cached[1] > time.time() + 60 and cached[2] == sa["client_email"]:
        return cached[0]
    now = int(time.time())
    assertion = jwt.encode({"iss": sa["client_email"], "scope": "https://www.googleapis.com/auth/firebase.messaging",
                            "aud": sa.get("token_uri") or "https://oauth2.googleapis.com/token", "iat": now, "exp": now + 3600},
                           sa["private_key"], algorithm="RS256")
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(sa.get("token_uri") or "https://oauth2.googleapis.com/token",
                              data={"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": assertion})
    if r.status_code != 200:
        raise HTTPException(502, f"Firebase refused the service account (HTTP {r.status_code}).")
    data = r.json()
    _cache["fcm"] = (data["access_token"], time.time() + int(data.get("expires_in", 3600)), sa["client_email"])
    return data["access_token"]


async def _send_fcm(tokens, title, body, url, sa):
    access = await _fcm_access_token(sa)
    sent, dead = 0, []
    async with httpx.AsyncClient(timeout=20) as client:
        for token in tokens:
            r = await client.post(f"https://fcm.googleapis.com/v1/projects/{sa['project_id']}/messages:send",
                                  headers={"Authorization": f"Bearer {access}"},
                                  json={"message": {"token": token, "notification": {"title": title, "body": body},
                                                    "data": {"url": url or "/"},
                                                    "android": {"priority": "high", "notification": {"sound": "default"}}}})
            if r.status_code == 200:
                sent += 1
            elif r.status_code in (404, 400) and ("UNREGISTERED" in r.text or "INVALID_ARGUMENT" in r.text and "token" in r.text.lower()):
                dead.append(token)
            else:
                logger.warning("FCM send failed: HTTP %s %s", r.status_code, r.text[:200])
    return sent, dead


def _apns_jwt(cfg) -> str:
    cached = _cache.get("apns")
    if cached and cached[1] > time.time() and cached[2] == cfg["key_id"]:
        return cached[0]
    token = jwt.encode({"iss": cfg["team"], "iat": int(time.time())}, cfg["key"], algorithm="ES256",
                       headers={"kid": cfg["key_id"]})
    _cache["apns"] = (token, time.time() + 45 * 60, cfg["key_id"])
    return token


async def _send_apns(tokens, title, body, url, cfg):
    sent, dead = 0, []
    payload = {"aps": {"alert": {"title": title, "body": body}, "sound": "default"}, "url": url or "/"}
    async with httpx.AsyncClient(http2=True, timeout=20) as client:
        for token in tokens:
            r = await client.post(f"{cfg['host']}/3/device/{token}", json=payload, headers={
                "authorization": f"bearer {_apns_jwt(cfg)}", "apns-topic": cfg["topic"],
                "apns-push-type": "alert", "apns-priority": "10"})
            if r.status_code == 200:
                sent += 1
            elif r.status_code == 410 or "BadDeviceToken" in r.text or "Unregistered" in r.text:
                dead.append(token)
            else:
                logger.warning("APNs send failed: HTTP %s %s", r.status_code, r.text[:200])
    return sent, dead


async def send_to_user(user_id: str, title: str, body: str, url: str = "/", raise_errors: bool = False) -> int:
    """Push to every phone the member signed in on. Returns how many phones accepted it."""
    if await get_setting("native_push_enabled") is False:
        return 0
    rows = await db.device_tokens.find({"user_id": user_id, "active": True}, {"_id": 0, "token": 1, "platform": 1}).to_list(20)
    if not rows:
        return 0
    total = 0
    for platform, getter, sender in (("android", _fcm_account, _send_fcm), ("ios", _apns_config, _send_apns)):
        tokens = [r["token"] for r in rows if r.get("platform") == platform]
        cfg = await getter() if tokens else None
        if not cfg:
            continue
        try:
            sent, dead = await sender(tokens, title[:120], body[:400], url, cfg)
        except Exception as exc:
            if raise_errors:
                raise HTTPException(502, f"Could not reach {'Firebase' if platform == 'android' else 'Apple'}: {str(getattr(exc, 'detail', exc))[:160]}")
            logger.warning("%s push failed (%s)", platform, type(exc).__name__)
            continue
        total += sent
        if dead:
            await db.device_tokens.update_many({"token": {"$in": dead}}, {"$set": {"active": False}})
    return total
