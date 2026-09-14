"""Workshop retreat reservations with €500 deposit + balance payment."""
import os
from datetime import datetime, timedelta
from typing import Optional
from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr

from core import api, db, now_utc, gen_id, get_current_user

DEPOSIT_EUR = float(os.environ.get("RETREAT_DEPOSIT_EUR", "500"))
BALANCE_DUE_DAYS_BEFORE = int(os.environ.get("RETREAT_BALANCE_DUE_DAYS_BEFORE", "30"))
SEAT_OFFER_HOURS = int(os.environ.get("RETREAT_SEAT_OFFER_HOURS", "48"))
REFUND_CUTOFF_DAYS = int(os.environ.get("RETREAT_REFUND_CUTOFF_DAYS", "60"))


class RetreatReserve(BaseModel):
    workshop_id: str
    name: str
    email: EmailStr
    phone: Optional[str] = None
    yoga_status: str = "Perpetual Yogi"
    years_of_practice: int = 0
    notes: Optional[str] = None
    wants_teacher_training: bool = False


def _balance_due_date(workshop: dict) -> str:
    start = datetime.fromisoformat(str(workshop["start_date"]).replace("Z", "+00:00"))
    due = start - timedelta(days=BALANCE_DUE_DAYS_BEFORE)
    return due.isoformat()


@api.post("/retreats/reserve")
async def reserve_retreat(payload: RetreatReserve, user: dict = Depends(get_current_user)):
    workshop = await db.workshops.find_one({"id": payload.workshop_id})
    if not workshop:
        raise HTTPException(404, "Retreat not found")

    active = await db.workshop_registrations.count_documents(
        {"workshop_id": payload.workshop_id, "status": {"$in": ["deposit_paid", "paid_in_full", "pending_deposit"]}}
    )
    # A seat that was offered to this user (promoted from the waitlist) bypasses the cap.
    offered = await db.workshop_registrations.find_one(
        {"user_id": user["id"], "workshop_id": payload.workshop_id, "status": "seat_offered"}
    )
    if active >= workshop.get("capacity", 14) and not offered:
        raise HTTPException(400, "Retreat full — join the waitlist instead.")

    existing = await db.workshop_registrations.find_one(
        {"user_id": user["id"], "workshop_id": payload.workshop_id, "status": {"$nin": ["cancelled", "waitlisted", "seat_offered"]}},
        {"_id": 0},
    )
    if existing:
        return existing
    # Clear any prior waitlist/offer entry — it's converting into a real reservation.
    await db.workshop_registrations.delete_many(
        {"user_id": user["id"], "workshop_id": payload.workshop_id, "status": {"$in": ["waitlisted", "seat_offered"]}}
    )

    price = float(workshop.get("price_eur", 1600.0))
    deposit = float(workshop.get("deposit_eur") or DEPOSIT_EUR)
    tt_upgrade = float(workshop.get("teacher_training_price_eur") or 0) if payload.wants_teacher_training else 0
    total = price + tt_upgrade
    balance = max(0.0, total - deposit)

    doc = {
        "id": gen_id(),
        "user_id": user["id"],
        "workshop_id": payload.workshop_id,
        "workshop_title": workshop.get("title"),
        "workshop_start_date": workshop.get("start_date"),
        "name": payload.name,
        "email": str(payload.email).lower(),
        "phone": payload.phone,
        "yoga_status": payload.yoga_status,
        "years_of_practice": payload.years_of_practice,
        "wants_teacher_training": payload.wants_teacher_training,
        "notes": payload.notes,
        "total_eur": round(total, 2),
        "deposit_eur": deposit,
        "balance_eur": round(balance, 2),
        "balance_due_date": _balance_due_date(workshop),
        "status": "pending_deposit",
        "deposit_paid_at": None,
        "balance_paid_at": None,
        "created_at": now_utc().isoformat(),
    }
    await db.workshop_registrations.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/retreats/mine")
async def my_retreats(user: dict = Depends(get_current_user)):
    rows = await db.workshop_registrations.find(
        {"user_id": user["id"]}, {"_id": 0},
    ).sort("created_at", -1).to_list(200)
    return rows


class WaitlistJoin(BaseModel):
    workshop_id: str
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None


async def _seats_taken(workshop_id: str) -> int:
    return await db.workshop_registrations.count_documents(
        {"workshop_id": workshop_id, "status": {"$in": ["deposit_paid", "paid_in_full", "pending_deposit", "seat_offered"]}}
    )


@api.post("/retreats/waitlist")
async def join_waitlist(payload: WaitlistJoin, user: dict = Depends(get_current_user)):
    workshop = await db.workshops.find_one({"id": payload.workshop_id})
    if not workshop:
        raise HTTPException(404, "Retreat not found")
    existing = await db.workshop_registrations.find_one(
        {"user_id": user["id"], "workshop_id": payload.workshop_id, "status": {"$ne": "cancelled"}}, {"_id": 0},
    )
    if existing:
        return existing  # already reserved or already waitlisted
    if await _seats_taken(payload.workshop_id) < workshop.get("capacity", 14):
        raise HTTPException(400, "Seats are available — reserve directly instead of waitlisting.")
    waiting = await db.workshop_registrations.count_documents(
        {"workshop_id": payload.workshop_id, "status": "waitlisted"}
    )
    doc = {
        "id": gen_id(), "user_id": user["id"], "workshop_id": payload.workshop_id,
        "workshop_title": workshop.get("title"), "workshop_start_date": workshop.get("start_date"),
        "name": payload.name or user.get("name"), "email": (payload.email or user.get("email") or "").lower(),
        "phone": payload.phone, "status": "waitlisted", "waitlist_position": waiting + 1,
        "created_at": now_utc().isoformat(),
    }
    await db.workshop_registrations.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/retreats/{workshop_id}/availability")
async def retreat_availability(workshop_id: str):
    workshop = await db.workshops.find_one({"id": workshop_id}, {"_id": 0})
    if not workshop:
        raise HTTPException(404, "Retreat not found")
    taken = await _seats_taken(workshop_id)
    cap = workshop.get("capacity", 14)
    waiting = await db.workshop_registrations.count_documents({"workshop_id": workshop_id, "status": "waitlisted"})
    return {"capacity": cap, "taken": taken, "seats_left": max(0, cap - taken), "is_full": taken >= cap, "waitlist_count": waiting}


@api.post("/retreats/{reservation_id}/cancel")
async def cancel_reservation(reservation_id: str, user: dict = Depends(get_current_user)):
    reg = await db.workshop_registrations.find_one({"id": reservation_id})
    if not reg:
        raise HTTPException(404, "Reservation not found")
    if reg["user_id"] != user["id"] and user.get("role") not in ("admin", "support"):
        raise HTTPException(403, "Forbidden")
    if reg.get("status") == "cancelled":
        raise HTTPException(400, "This reservation is already cancelled.")

    # Refund rule: fully refundable if cancelling at least REFUND_CUTOFF_DAYS before the retreat starts.
    refund_eligible = False
    start_iso = reg.get("workshop_start_date")
    if start_iso:
        start = datetime.fromisoformat(str(start_iso).replace("Z", "+00:00"))
        days_until = (start - now_utc()).days
        refund_eligible = days_until >= REFUND_CUTOFF_DAYS
    paid_something = reg.get("status") in ("deposit_paid", "paid_in_full")
    if not paid_something:
        refund_status = "not_applicable"
    else:
        refund_status = "refund_pending" if refund_eligible else "non_refundable"

    await db.workshop_registrations.update_one(
        {"id": reservation_id},
        {"$set": {
            "status": "cancelled",
            "cancelled_at": now_utc().isoformat(),
            "refund_eligible": refund_eligible,
            "refund_status": refund_status,
        }},
    )
    await _promote_waitlist(reg["workshop_id"])
    if refund_status == "refund_pending":
        message = f"Reservation cancelled. Your deposit is refundable — Tony will process it within a few days."
    elif refund_status == "non_refundable":
        message = f"Reservation cancelled. As it's within {REFUND_CUTOFF_DAYS} days of the retreat, the deposit is non-refundable per policy."
    else:
        message = "Reservation cancelled."
    return {"ok": True, "refund_eligible": refund_eligible, "refund_status": refund_status,
            "refund_cutoff_days": REFUND_CUTOFF_DAYS, "message": message}


async def _promote_waitlist(workshop_id: str):
    """If a seat is free, offer it to the earliest person on the waitlist + notify them."""
    workshop = await db.workshops.find_one({"id": workshop_id})
    if not workshop:
        return
    if await _seats_taken(workshop_id) >= workshop.get("capacity", 14):
        return
    nxt = await db.workshop_registrations.find_one(
        {"workshop_id": workshop_id, "status": "waitlisted"}, sort=[("created_at", 1)]
    )
    if not nxt:
        return
    await db.workshop_registrations.update_one(
        {"id": nxt["id"]}, {"$set": {
            "status": "seat_offered",
            "seat_offered_at": now_utc().isoformat(),
            "seat_offer_expires_at": (now_utc() + timedelta(hours=SEAT_OFFER_HOURS)).isoformat(),
        }}
    )
    title = workshop.get("title", "retreat")
    try:
        from routers.push import notify_user
        await notify_user(
            nxt["user_id"], f"A seat opened · {title}",
            f"You're off the waitlist! Claim your seat within {SEAT_OFFER_HOURS}h before it rolls to the next person.",
            f"/workshops/{workshop_id}",
        )
    except Exception as e:
        _logger.warning(f"waitlist push failed: {e}")
    try:
        from email_service import send_email
        if nxt.get("email"):
            await send_email(
                nxt["email"], f"A seat opened for {title} 🌿",
                f"<h3>Good news — a seat just opened for {title}.</h3>"
                f"<p>You're first on the waitlist. Reserve your seat with your deposit in-app "
                f"within <strong>{SEAT_OFFER_HOURS} hours</strong> — after that it rolls to the next person.</p>"
                f"<p>— Tony</p>",
            )
    except Exception as e:
        _logger.warning(f"waitlist email failed: {e}")


async def expire_seat_offers_tick():
    """Expire seat offers older than SEAT_OFFER_HOURS and promote the next waitlister.
    Called from the server.py background loop."""
    now = now_utc()
    expired = await db.workshop_registrations.find(
        {"status": "seat_offered", "seat_offer_expires_at": {"$lte": now.isoformat()}},
        {"_id": 0},
    ).to_list(200)
    for r in expired:
        await db.workshop_registrations.update_one(
            {"id": r["id"]},
            {"$set": {"status": "offer_expired", "offer_expired_at": now.isoformat()}},
        )
        title = r.get("workshop_title", "retreat")
        try:
            from routers.push import notify_user
            await notify_user(
                r["user_id"], f"Seat offer expired · {title}",
                "The window to claim your seat has passed — it's been offered to the next person.",
                "/workshops",
            )
        except Exception as e:
            _logger.warning(f"expire notify failed: {e}")
        # Free the seat -> offer to the next waitlister.
        await _promote_waitlist(r["workshop_id"])
    if expired:
        _logger.info(f"seat offers expired: {len(expired)}")
    return len(expired)


@api.get("/retreats/{reservation_id}")
async def get_reservation(reservation_id: str, user: dict = Depends(get_current_user)):
    doc = await db.workshop_registrations.find_one({"id": reservation_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Reservation not found")
    if doc["user_id"] != user["id"] and user.get("role") not in ("admin", "support"):
        raise HTTPException(403, "Forbidden")
    return doc


# ---------- Balance reminders (called from server.py background loop) ----------
import logging
_logger = logging.getLogger("tony-yoga.retreats")


async def send_balance_reminders_tick():
    """Send a push + email reminder 7 days before balance_due_date for reservations
    still in 'deposit_paid' state. Idempotent via `balance_reminder_sent_at`."""
    now = now_utc()
    window_end = now + timedelta(days=7, minutes=1)
    window_start = now + timedelta(days=7, minutes=-1)
    # Idempotency: we only look at reservations whose balance_due_date lands in a
    # small window around "now + 7 days" AND haven't yet been reminded.
    pending = await db.workshop_registrations.find(
        {
            "status": "deposit_paid",
            "balance_due_date": {"$gte": window_start.isoformat(), "$lte": window_end.isoformat()},
            "balance_reminder_sent_at": {"$exists": False},
        },
        {"_id": 0},
    ).to_list(200)
    total_sent = 0
    for r in pending:
        try:
            # Push
            from routers.push import _send_one
            subs = await db.push_subscriptions.find({"user_id": r["user_id"], "active": True}, {"_id": 0}).to_list(10)
            due = str(r.get("balance_due_date", ""))[:10]
            payload = {
                "title": f"Balance due in 7 days · €{int(r.get('balance_eur', 0))}",
                "body": f"Your {r.get('workshop_title', 'retreat')} balance is due {due}. Tap to pay.",
                "url": "/profile",
            }
            for s in subs:
                if _send_one(s, payload):
                    total_sent += 1
            # Email
            from email_service import send_email
            html = (
                f"<h3>Your balance for {r.get('workshop_title')}</h3>"
                f"<p>Just a gentle reminder — your remaining <strong>€{int(r.get('balance_eur', 0))}</strong> "
                f"is due on <strong>{due}</strong>. You can pay in-app under Profile · Your retreats.</p>"
                f"<p>See you on the mat.<br/>— Tony</p>"
            )
            if r.get("email"):
                await send_email(r["email"], f"Balance due · {r.get('workshop_title')}", html)
        except Exception as e:
            _logger.warning(f"balance reminder send failed for {r.get('id')}: {e}")
        await db.workshop_registrations.update_one(
            {"id": r["id"]},
            {"$set": {"balance_reminder_sent_at": now.isoformat()}},
        )

    # Due-now reminder: email the moment the balance becomes due (30 days before the
    # retreat), idempotent via `balance_due_now_sent_at`.
    due_now = await db.workshop_registrations.find(
        {
            "status": "deposit_paid",
            "balance_due_date": {"$lte": now.isoformat()},
            "balance_due_now_sent_at": {"$exists": False},
        },
        {"_id": 0},
    ).to_list(200)
    for r in due_now:
        try:
            from email_service import send_email
            due = str(r.get("balance_due_date", ""))[:10]
            html = (
                f"<h3>Balance now due · {r.get('workshop_title')}</h3>"
                f"<p>Your remaining balance of <strong>€{int(r.get('balance_eur', 0))}</strong> is now due "
                f"(as of <strong>{due}</strong>). Please complete payment in-app under Profile · Your retreats "
                f"to keep your seat.</p>"
                f"<p>With gratitude,<br/>— Tony</p>"
            )
            if r.get("email"):
                await send_email(r["email"], f"Balance now due · {r.get('workshop_title')}", html)
        except Exception as e:
            _logger.warning(f"balance due-now reminder failed for {r.get('id')}: {e}")
        await db.workshop_registrations.update_one(
            {"id": r["id"]},
            {"$set": {"balance_due_now_sent_at": now.isoformat()}},
        )

    if pending:
        _logger.info(f"balance reminders: notified {len(pending)} reservation(s)")
    return len(pending) + len(due_now)
