"""GDPR account management — 30-day grace-period deletion + public deletion request.

Store compliance (Apple 5.1.1(v) + Google Play Data deletion): logged-in users can
request account deletion in-app; a public page/endpoint lets anyone start the process.
Deletion deactivates the account immediately and permanently purges it (plus personal
data) after a 30-day grace window. Anonymized payment/order records are retained for
legal/tax purposes only.
"""
from datetime import timedelta
import os
import asyncio
from commerce_lock import delivery_lock

from fastapi import Depends, HTTPException
from pydantic import BaseModel, EmailStr

from core import api, db, logger, now_utc, gen_id, verify_password, get_current_user

GRACE_DAYS = 30

# Collections holding a user's personal data (removed on purge).
_PERSONAL_COLLECTIONS = [
    "subscriptions", "program_enrollments", "program_purchases", "bookings",
    "class_passes", "submissions", "favorites", "wishlist", "progress",
    "referrals", "referral_credits", "notifications", "push_subscriptions",
    "workshop_registrations", "waitlist", "streaks", "certificates",
    "access_grants", "watch_progress", "assignment_submissions", "private_session_requests",
    "practice_streaks", "challenge_enrollments", "free_class_grants", "pass_usages",
    "user_notifications", "assistant_requests", "assistant_usage", "chatbot_sessions",
    "ios_purchase_intents", "teacher_training_registrations",
    "device_tokens", "membership_picks", "member_audit", "practice_plans",
    "hotel_guests", "teacher_enrollments", "teacher_students", "teacher_credits", "teachers",
    "lesson_completions", "quiz_attempts", "lesson_notes", "lesson_questions",
]


class DeleteAccountRequest(BaseModel):
    password: str | None = None
    reason: str | None = None


class PublicDeletionRequest(BaseModel):
    email: EmailStr
    reason: str | None = None


@api.get("/me/account/status")
async def account_status(user: dict = Depends(get_current_user)):
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0, "deletion_scheduled_at": 1, "active": 1})
    scheduled = (fresh or {}).get("deletion_scheduled_at")
    return {
        "deletion_scheduled": bool(scheduled),
        "deletion_scheduled_at": scheduled,
        "grace_days": GRACE_DAYS,
    }


@api.delete("/me/account")
async def request_account_deletion(payload: DeleteAccountRequest, user: dict = Depends(get_current_user)):
    """Schedule the logged-in user's account for permanent deletion after a 30-day grace period.
    Re-verifies the password when the account has one (magic-link accounts may not)."""
    full = await db.users.find_one({"id": user["id"]})
    if not full:
        raise HTTPException(404, "Account not found")
    pw_hash = full.get("password_hash")
    if pw_hash:
        if not payload.password or not verify_password(payload.password, pw_hash):
            raise HTTPException(401, "Incorrect password. Please re-enter your password to confirm.")

    purge_at = (now_utc() + timedelta(days=GRACE_DAYS)).isoformat()
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "active": False,
            "deletion_requested_at": now_utc().isoformat(),
            "deletion_scheduled_at": purge_at,
            "deletion_reason": (payload.reason or "")[:500],
        }},
    )
    logger.info(f"[ACCOUNT DELETION] scheduled for user {user['id']} ({full.get('email')}) at {purge_at}")
    try:
        from email_service import send_account_deletion_scheduled
        await send_account_deletion_scheduled(full.get("email"), full.get("name") or "", purge_at)
    except Exception as e:
        logger.warning(f"deletion-scheduled email skipped: {e}")
    return {"ok": True, "deletion_scheduled_at": purge_at, "grace_days": GRACE_DAYS}


@api.post("/me/account/cancel-deletion")
async def cancel_account_deletion(user: dict = Depends(get_current_user)):
    """Undo a pending deletion within the grace window and reactivate the account."""
    full = await db.users.find_one({"id": user["id"]})
    if not full or not full.get("deletion_scheduled_at"):
        raise HTTPException(400, "No pending deletion to cancel.")
    if full["deletion_scheduled_at"] <= now_utc().isoformat():
        raise HTTPException(409, "The account deletion deadline has passed. Contact support.")
    if full.get("deletion_purge_started_at"):
        raise HTTPException(409, "Account deletion is already being finalized.")
    result = await db.users.update_one(
        {"id": user["id"], "deletion_scheduled_at": full["deletion_scheduled_at"], "deletion_purge_started_at": {"$exists": False}},
        {"$set": {"active": True},
         "$unset": {"deletion_requested_at": "", "deletion_scheduled_at": "", "deletion_reason": ""}},
    )
    if not result.matched_count:
        raise HTTPException(409, "Deletion is being finalized; contact support.")
    logger.info(f"[ACCOUNT DELETION] cancelled for user {user['id']} ({full.get('email')})")
    return {"ok": True}


@api.post("/account/deletion-request")
async def public_deletion_request(payload: PublicDeletionRequest):
    """Public (no-auth) deletion request — for users who cannot sign in. Records the
    request and notifies the team, who process it manually within 30 days. Always
    returns ok to avoid leaking whether an email is registered."""
    email = payload.email.lower()
    await db.deletion_requests.insert_one({
        "id": gen_id(), "email": email, "reason": (payload.reason or "")[:500],
        "status": "received", "created_at": now_utc().isoformat(),
    })
    logger.info(f"[ACCOUNT DELETION] public request received for {email}")
    try:
        from email_service import send_deletion_request_ack, send_deletion_request_admin
        await send_deletion_request_ack(email)
        await send_deletion_request_admin(email, payload.reason or "")
    except Exception as e:
        logger.warning(f"public deletion-request email skipped: {e}")
    return {"ok": True, "message": "We received your request and will delete your data within 30 days."}


async def _run_purge_deleted_accounts() -> dict:
    """Finalize authenticated requests after the advertised grace period.
    Only explicit deletion requests are eligible. A failed cleanup keeps the account
    blocked and queues a retry; it is never reported as successfully purged.
    Shared provider/tax records require the separate retention policy in the runbook.
    """
    purged, failed = 0, 0
    async with delivery_lock(db, "account-purge"):
        cursor = db.users.find({"active": False, "deletion_scheduled_at": {"$lt": now_utc().isoformat(), "$ne": None}})
        async for u in cursor:
            uid, email = u["id"], u.get("email", "")
            try:
                claimed = await db.users.update_one(
                    {"id": uid, "active": False, "deletion_scheduled_at": u["deletion_scheduled_at"]},
                    {"$set": {"deletion_purge_started_at": now_utc().isoformat()}})
                if not claimed.matched_count:
                    continue
                for coll in _PERSONAL_COLLECTIONS:
                    await db[coll].delete_many({"user_id": uid})
                await db.hotel_partners.update_many({"user_ids": uid}, {"$pull": {"user_ids": uid}})
                # The following records use email or reference fields rather than user_id.
                for coll in ("magic_link_tokens", "password_reset_tokens", "deletion_requests", "newsletter_subscribers", "quiz_leads", "ai_leads", "enquiries", "instructor_applications", "referral_invites"):
                    await db[coll].delete_many({"$or": [{"user_id": uid}, {"email": email}]})
                await db.referrals.delete_many({"$or": [{"referrer_id": uid}, {"referred_user_id": uid}]})
                for coll in ("payment_transactions", "orders", "ios_transactions"):
                    await db[coll].update_many({"user_id": uid}, {
                        "$set": {"user_id": "deleted", "user_email": "deleted@removed", "personal_data_erased": True},
                        "$unset": {"shipping_address": "", "billing_address": "", "notes": "", "admin_notes": "", "metadata": "", "intent_id": ""}})
                await db.users.delete_one({"id": uid, "active": False, "deletion_scheduled_at": u["deletion_scheduled_at"]})
                purged += 1
            except Exception as exc:
                failed += 1
                logger.error("Account deletion cleanup failed; retained for retry (%s)", type(exc).__name__)
    return {"ok": failed == 0, "purged": purged, "failed": failed}


async def account_deletion_worker():
    """Explicit opt-in in deployment config. Never executes merely by importing a module."""
    while True:
        if os.environ.get("ACCOUNT_DELETION_PURGE_ENABLED", "false").lower() == "true":
            try:
                await _run_purge_deleted_accounts()
            except Exception as exc:
                logger.error("Account deletion worker needs attention (%s)", type(exc).__name__)
        await asyncio.sleep(3600)


@api.get("/admin/deletion-requests/pending")
async def pending_deletions(user: dict = Depends(get_current_user)):
    """Admin: how many accounts are past their 30-day grace window and awaiting purge."""
    if user.get("role") != "admin":
        raise HTTPException(403, "Forbidden")
    now_iso = now_utc().isoformat()
    due = await db.users.count_documents({"deletion_scheduled_at": {"$lt": now_iso, "$ne": None}})
    return {"ok": True, "due": due}


@api.post("/admin/deletion-requests/purge")
async def purge_deleted_accounts(user: dict = Depends(get_current_user)):
    """Admin-only manual finalization of expired, authenticated deletion requests."""
    if user.get("role") != "admin":
        raise HTTPException(403, "Forbidden")
    return await _run_purge_deleted_accounts()
