"""Referrals: invite (rate-limited, deduped), my-stats, admin analytics."""
import os
from typing import Dict, Any
from datetime import timedelta
from fastapi import Depends, HTTPException, Request

from core import api, db, now_utc, gen_id, gen_referral_code, get_current_user, require_role
from models import ReferralInviteRequest
from email_service import send_referral_invite as email_referral_invite

# Env-configurable limits
MAX_EMAILS_PER_REQUEST = int(os.environ.get("REFERRALS_MAX_PER_REQUEST", "20"))
MAX_INVITES_PER_DAY = int(os.environ.get("REFERRALS_MAX_PER_DAY", "100"))


@api.post("/referrals/invite")
async def send_referral_invites(payload: ReferralInviteRequest, user: dict = Depends(get_current_user)):
    # Dedupe + normalize
    unique_emails = []
    seen = set()
    for raw in payload.emails:
        e = str(raw).lower().strip()
        if e and e not in seen:
            seen.add(e); unique_emails.append(e)

    if len(unique_emails) == 0:
        raise HTTPException(400, "No valid emails provided")
    if len(unique_emails) > MAX_EMAILS_PER_REQUEST:
        raise HTTPException(400, f"Maximum {MAX_EMAILS_PER_REQUEST} emails per request")

    # Per-day quota check — uses native BSON datetime for accurate comparison
    since = now_utc() - timedelta(days=1)
    recent = await db.referral_invites.count_documents({
        "referrer_id": user["id"], "created_at": {"$gte": since},
    })
    if recent + len(unique_emails) > MAX_INVITES_PER_DAY:
        raise HTTPException(429, f"Daily invite limit reached ({MAX_INVITES_PER_DAY}/day). Try again tomorrow.")

    # Ensure user has a code
    code = user.get("referral_code")
    if not code:
        code = gen_referral_code(user.get("name", "yogi"))
        await db.users.update_one({"id": user["id"]}, {"$set": {"referral_code": code}})
    frontend_url = os.environ.get("FRONTEND_URL", "")
    share_url = f"{frontend_url}/register?ref={code}"

    sent, failed, skipped = [], [], []
    for email in unique_emails:
        existing = await db.users.find_one({"email": email})
        if existing:
            skipped.append({"email": email, "reason": "already_registered"})
            continue
        ok = await email_referral_invite(email, user.get("name", "A friend"), share_url, payload.personal_note)
        await db.referral_invites.insert_one({
            "id": gen_id(), "referrer_id": user["id"], "invited_email": email,
            "personal_note": payload.personal_note, "sent": ok,
            "created_at": now_utc(),  # native datetime
        })
        (sent if ok else failed).append(email)
    return {"sent": sent, "failed": failed, "skipped": skipped, "share_url": share_url}


@api.get("/referrals/mine")
async def my_referrals(user: dict = Depends(get_current_user)):
    code = user.get("referral_code")
    if not code:
        code = gen_referral_code(user.get("name", "yogi"))
        await db.users.update_one({"id": user["id"]}, {"$set": {"referral_code": code}})
    referrals = await db.referrals.find({"referrer_id": user["id"]}, {"_id": 0}).to_list(500)
    credits = await db.referral_credits.find({"user_id": user["id"], "active": True}, {"_id": 0}).to_list(50)
    return {
        "referral_code": code,
        "share_url": f"{os.environ.get('FRONTEND_URL', '')}/register?ref={code}",
        "total_signups": len(referrals),
        "total_converted": sum(1 for r in referrals if r["status"] == "converted"),
        "pending_credits_days": sum(c["days"] for c in credits),
        "referrals": referrals,
    }


@api.get("/admin/referrals/analytics")
async def admin_referral_analytics(request: Request):
    await require_role(request, ["admin"])
    referrals = await db.referrals.find({}, {"_id": 0}).to_list(2000)
    invites = await db.referral_invites.find({}, {"_id": 0}).to_list(5000)
    total_invites = len(invites)
    total_signups = len(referrals)
    total_converted = sum(1 for r in referrals if r["status"] == "converted")
    by_referrer: Dict[str, Dict[str, Any]] = {}
    for r in referrals:
        b = by_referrer.setdefault(r["referrer_id"], {"signups": 0, "converted": 0})
        b["signups"] += 1
        if r["status"] == "converted":
            b["converted"] += 1
    referrer_ids = list(by_referrer.keys())
    users_lookup = {u["id"]: u for u in await db.users.find({"id": {"$in": referrer_ids}}, {"_id": 0, "password_hash": 0}).to_list(2000)}
    top = sorted(
        [
            {"user_id": rid,
             "name": users_lookup.get(rid, {}).get("name", "Unknown"),
             "email": users_lookup.get(rid, {}).get("email", ""),
             "referral_code": users_lookup.get(rid, {}).get("referral_code", ""),
             **stats}
            for rid, stats in by_referrer.items()
        ],
        key=lambda x: (x["converted"], x["signups"]), reverse=True,
    )[:20]
    raw_signup_rate = (total_signups / total_invites) * 100 if total_invites else 0
    return {
        "total_invites_sent": total_invites,
        "total_signups": total_signups,
        "total_converted": total_converted,
        "conversion_rate": round((total_converted / total_signups) * 100, 1) if total_signups else 0,
        "signup_rate": round(min(raw_signup_rate, 100.0), 1),
        "top_referrers": top,
    }
