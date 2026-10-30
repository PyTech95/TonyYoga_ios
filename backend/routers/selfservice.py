"""Member self-service for memberships, EU withdrawal requests, refunds and gift memberships.

- Pause (1–3 months, access stops and the unused days come back on resume), cancel with a
  reason and an optional "stay" offer (store credit), Stripe card update (customer portal).
- Upgrade quote: moving to a pricier plan deducts the unused part of the current plan; any other
  plan bought while one is active starts when the current one ends, so no days are lost.
- EU "withdraw from contract" button (Directive 2023/2673): two steps, emailed confirmation,
  an admin queue with refund.
- Refunds through Stripe or PayPal from the admin, with access removed when chosen.
- Gift memberships: buy a plan for someone, they redeem a code.
"""
import asyncio
import re
import secrets
from datetime import timedelta
from typing import Optional

import httpx
from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field

from access_terms import LIFETIME_END, active_memberships, parse_dt
from core import api, db, gen_id, get_current_user, get_optional_user, logger, now_utc, require_role
from labels import plan_name
from routers.settings import get_setting

CYCLE_DAYS = {"weekly": 7, "monthly": 30, "quarterly": 90, "yearly": 365}
CANCEL_REASONS = {"too_expensive": "Too expensive", "not_using": "Not using it enough", "technical": "Technical problems",
                  "content": "Missing classes or courses I want", "break": "Taking a break", "other": "Something else"}


async def _my_sub(user: dict, sub_id: str) -> dict:
    sub = await db.subscriptions.find_one({"id": sub_id, "user_id": user["id"]}, {"_id": 0})
    if not sub:
        raise HTTPException(404, "Membership not found")
    return sub


def _iso(dt):
    return dt.isoformat()


async def _audit(user_id, action, details, by=None):
    await db.member_audit.insert_one({"id": gen_id(), "user_id": user_id, "action": action, "details": details[:500],
                                      "admin_email": by, "at": now_utc().isoformat()})


# ---------------------------------------------------------------------------
# Pause / resume

class PauseIn(BaseModel):
    months: int = Field(ge=1, le=12)


@api.get("/me/memberships/options")
async def my_membership_options(user: dict = Depends(get_current_user)):
    """What the member may do with their membership (shown on My Yoga)."""
    offer_pct = int(await get_setting("stay_offer_percent") or 0)
    return {"pause_enabled": await get_setting("pause_enabled") is not False,
            "pause_max_months": int(await get_setting("pause_max_months") or 3),
            "stay_offer": {"percent": offer_pct, "text": await get_setting("stay_offer_text") or ""} if offer_pct > 0 else None,
            "reasons": [{"id": k, "label": v} for k, v in CANCEL_REASONS.items()],
            "withdrawal_days": 14}


@api.post("/me/memberships/{sub_id}/pause")
async def pause_membership(sub_id: str, payload: PauseIn, user: dict = Depends(get_current_user)):
    if await get_setting("pause_enabled") is False:
        raise HTTPException(409, "Pausing isn't available right now. Please contact us.")
    max_months = int(await get_setting("pause_max_months") or 3)
    if payload.months > max_months:
        raise HTTPException(422, f"You can pause for up to {max_months} month(s).")
    sub = await _my_sub(user, sub_id)
    if sub.get("source") == "apple_iap":
        raise HTTPException(409, "Apple subscriptions are paused or cancelled in your Apple ID settings.")
    if sub.get("status") not in ("active", "trialing"):
        raise HTTPException(409, "Only an active membership can be paused.")
    now = now_utc()
    end = parse_dt(sub.get("end_date"))
    if not end or end <= now:
        raise HTTPException(409, "This membership has already ended.")
    recent = [p for p in sub.get("pauses") or [] if parse_dt(p.get("at")) and parse_dt(p["at"]) > now - timedelta(days=180)]
    if recent:
        raise HTTPException(409, "A membership can be paused once every 6 months.")
    resume_at = now + timedelta(days=30 * payload.months)
    if sub.get("stripe_subscription_id"):
        try:
            import stripe
            from routers.payments import _stripe_api_key
            await asyncio.to_thread(stripe.Subscription.modify, sub["stripe_subscription_id"], api_key=await _stripe_api_key(),
                                    pause_collection={"behavior": "void", "resumes_at": int(resume_at.timestamp())})
        except Exception as exc:
            logger.warning("Stripe pause failed (%s)", type(exc).__name__)
            raise HTTPException(502, "We couldn't pause your card payments. Please try again or contact us.")
    remaining = int((end - now).total_seconds()) if not str(sub.get("end_date")).startswith("2099") else None
    await db.subscriptions.update_one({"id": sub_id}, {"$set": {"status": "paused", "paused_at": _iso(now), "resume_at": _iso(resume_at),
                                                               "remaining_seconds": remaining},
                                                      "$push": {"pauses": {"at": _iso(now), "months": payload.months}}})
    await _audit(user["id"], "membership_paused", f"Paused by the member for {payload.months} month(s) until {resume_at.date()}")
    from notify import notify_member
    await notify_member(user["id"], "Membership paused", f"Your membership is paused until {resume_at.strftime('%d %b %Y')}. Your unused days are kept.", "/my-yoga")
    return {"ok": True, "resume_at": _iso(resume_at)}


async def resume_sub(sub: dict, by: str = "member"):
    now = now_utc()
    if sub.get("remaining_seconds") is None:
        end = LIFETIME_END
    else:
        end = _iso(now + timedelta(seconds=int(sub["remaining_seconds"])))
    if sub.get("stripe_subscription_id"):
        try:
            import stripe
            from routers.payments import _stripe_api_key
            await asyncio.to_thread(stripe.Subscription.modify, sub["stripe_subscription_id"], api_key=await _stripe_api_key(), pause_collection="")
        except Exception as exc:
            logger.warning("Stripe resume failed (%s)", type(exc).__name__)
    await db.subscriptions.update_one({"id": sub["id"]}, {"$set": {"status": "active", "end_date": end, "next_billing_date": end, "resumed_at": _iso(now)},
                                                         "$unset": {"paused_at": "", "resume_at": "", "remaining_seconds": ""}})
    await _audit(sub["user_id"], "membership_resumed", f"Resumed ({by}); now runs until {str(end)[:10]}")
    return end


@api.post("/me/memberships/{sub_id}/resume")
async def resume_membership(sub_id: str, user: dict = Depends(get_current_user)):
    sub = await _my_sub(user, sub_id)
    if sub.get("status") != "paused":
        raise HTTPException(409, "This membership isn't paused.")
    end = await resume_sub(sub)
    return {"ok": True, "end_date": end}


async def resume_paused_tick():
    rows = await db.subscriptions.find({"status": "paused", "resume_at": {"$lte": now_utc().isoformat()}}, {"_id": 0}).to_list(500)
    from notify import notify_member
    for sub in rows:
        end = await resume_sub(sub, by="automatic")
        await notify_member(sub["user_id"], "Welcome back", f"Your membership is active again until {str(end)[:10]}.", "/my-yoga",
                            dedupe_key=f"resumed:{sub['id']}:{str(sub.get('resume_at'))[:10]}")


# ---------------------------------------------------------------------------
# Cancel (with reason and an optional stay offer)

class CancelIn(BaseModel):
    reason: str = Field(pattern="^(too_expensive|not_using|technical|content|break|other)$")
    details: Optional[str] = Field(default=None, max_length=1000)
    accept_offer: bool = False


@api.post("/me/memberships/{sub_id}/cancel")
async def cancel_membership(sub_id: str, payload: CancelIn, user: dict = Depends(get_current_user)):
    sub = await _my_sub(user, sub_id)
    if sub.get("source") == "apple_iap":
        raise HTTPException(409, "Apple subscriptions are cancelled in your Apple ID settings (Settings → your name → Subscriptions).")
    if sub.get("status") not in ("active", "trialing", "past_due", "paused"):
        raise HTTPException(409, "This membership isn't active.")
    plan = await db.membership_plans.find_one({"id": sub.get("plan_id")}, {"_id": 0}) or {}
    from routers.notifications import push_admins
    if payload.accept_offer:
        pct = int(await get_setting("stay_offer_percent") or 0)
        if pct <= 0:
            raise HTTPException(409, "There's no offer right now.")
        paid = await paid_value(sub)
        if paid <= 0 or sub.get("status") == "trialing":
            raise HTTPException(409, "This offer is for paid memberships.")
        try:
            await db.stay_offers.insert_one({"_id": f"{user['id']}:{now_utc().year}", "user_id": user["id"], "subscription_id": sub_id,
                                             "at": now_utc().isoformat()})
        except Exception:
            raise HTTPException(409, "You've already used this offer this year.")
        credit = round(min(float(plan.get("price") or 0), paid) * pct / 100, 2)
        await db.users.update_one({"id": user["id"]}, {"$inc": {"store_credit": credit}})
        await _audit(user["id"], "stay_offer_accepted", f"Stayed with {pct}% offer: {credit:.2f} store credit (reason: {CANCEL_REASONS[payload.reason]})")
        await push_admins("Member stayed", f"{user.get('email')} accepted the stay offer ({pct}%). Reason they gave: {CANCEL_REASONS[payload.reason]}.",
                          "/admin?tab=students")
        return {"stayed": True, "credit": credit}
    if sub.get("stripe_subscription_id"):
        try:
            import stripe
            from routers.payments import _stripe_api_key
            await asyncio.to_thread(stripe.Subscription.modify, sub["stripe_subscription_id"], api_key=await _stripe_api_key(), cancel_at_period_end=True)
        except Exception as exc:
            logger.warning("Stripe cancel failed (%s)", type(exc).__name__)
            raise HTTPException(502, "We couldn't stop your card payments. Please try again or contact us.")
    await db.subscriptions.update_one({"id": sub_id}, {"$set": {"cancel_at_period_end": True, "cancel_reason": payload.reason,
                                                               "cancel_details": payload.details, "cancel_requested_at": now_utc().isoformat()}})
    await _audit(user["id"], "membership_cancel_requested", f"{plan_name(plan)}: {CANCEL_REASONS[payload.reason]}" + (f" — {payload.details}" if payload.details else ""))
    await push_admins("Membership cancelled", f"{user.get('email')} cancelled {plan_name(plan)}. Reason: {CANCEL_REASONS[payload.reason]}.", "/admin?tab=students")
    from notify import notify_member
    end = str(sub.get("end_date") or "")[:10]
    await notify_member(user["id"], "Membership cancelled", f"Your {plan_name(plan)} membership won't renew. You keep full access until {end}.", "/my-yoga")
    return {"ok": True, "access_until": sub.get("end_date")}


@api.post("/me/memberships/{sub_id}/keep")
async def undo_cancel(sub_id: str, user: dict = Depends(get_current_user)):
    sub = await _my_sub(user, sub_id)
    if sub.get("stripe_subscription_id"):
        try:
            import stripe
            from routers.payments import _stripe_api_key
            await asyncio.to_thread(stripe.Subscription.modify, sub["stripe_subscription_id"], api_key=await _stripe_api_key(), cancel_at_period_end=False)
        except Exception as exc:
            logger.warning("Stripe un-cancel failed (%s)", type(exc).__name__)
            raise HTTPException(502, "We couldn't restart your card payments. Please try again.")
    await db.subscriptions.update_one({"id": sub_id}, {"$set": {"cancel_at_period_end": False}, "$unset": {"cancel_requested_at": ""}})
    await _audit(user["id"], "membership_kept", "The member undid their cancellation")
    return {"ok": True}


@api.post("/me/billing-portal")
async def billing_portal(request: Request, user: dict = Depends(get_current_user)):
    """Stripe's page where members with automatic card payments update their card and see invoices."""
    sub = await db.subscriptions.find_one({"user_id": user["id"], "stripe_customer_id": {"$nin": [None, ""]}}, {"_id": 0}, sort=[("end_date", -1)])
    customer = (sub or {}).get("stripe_customer_id") or user.get("stripe_customer_id")
    if not customer:
        raise HTTPException(409, "Your membership isn't paid by automatic card payments, so there is no card to update.")
    import stripe
    from core import checkout_return_base
    from routers.payments import _stripe_api_key
    body = await request.json() if request.headers.get("content-type", "").startswith("application/json") else {}
    base, _ = checkout_return_base((body or {}).get("origin_url"), (body or {}).get("client"))
    try:
        session = await asyncio.to_thread(stripe.billing_portal.Session.create, customer=customer, return_url=f"{base}/my-yoga",
                                          api_key=await _stripe_api_key())
    except Exception as exc:
        logger.warning("Stripe portal failed (%s)", type(exc).__name__)
        raise HTTPException(502, "The card page is unavailable right now. Please try again later.")
    return {"url": session.url}


# ---------------------------------------------------------------------------
# Upgrade / queue quote (used by the Memberships page and by checkout)

def _txn_id_of(sub: dict) -> Optional[str]:
    if sub.get("transaction_id"):
        return sub["transaction_id"]
    sid = str(sub.get("id") or "")
    return sid[len("payment:"):] if sid.startswith("payment:") else None


async def paid_value(sub: dict) -> float:
    """Money actually paid for a membership (card/PayPal + store credit, minus refunds); 0 if free."""
    tid = _txn_id_of(sub)
    if not tid:
        return 0.0
    txn = await db.payment_transactions.find_one({"id": tid, "payment_status": {"$in": ["paid", "partially_refunded"]}},
                                                 {"_id": 0, "amount": 1, "credit_applied": 1, "refunded_amount": 1, "provider": 1})
    if not txn:
        return 0.0
    amount = float(txn.get("amount") or 0)
    if txn.get("provider") != "credit":
        amount += float(txn.get("credit_applied") or 0)
    return max(0.0, round(amount - float(txn.get("refunded_amount") or 0), 2))


async def membership_switch(user_id: str, plan: dict) -> dict:
    """How buying `plan` relates to the member's current one-time membership.
    upgrade: pricier plan → starts now, unused value of the current plan is deducted.
    queued: any other plan while one is active → starts when the current one ends."""
    price = float(plan.get("price") or 0)
    current = [s for s in await active_memberships(user_id) if s.get("source") not in ("apple_iap",) and not s.get("stripe_subscription_id")]
    if not current:
        return {"mode": "new", "price": price, "credit": 0.0, "charge": price, "starts_at": None}
    cur = max(current, key=lambda s: str(s.get("end_date")))
    cur_plan = await db.membership_plans.find_one({"id": cur.get("plan_id")}, {"_id": 0}) or {}
    end = parse_dt(cur.get("end_date"))
    if str(cur.get("end_date")).startswith("2099"):
        return {"mode": "lifetime", "price": price, "credit": 0.0, "charge": price, "starts_at": None, "current_plan": plan_name(cur_plan)}
    cur_price = float(cur_plan.get("price") or 0)
    paid = await paid_value(cur)
    same_currency = (cur_plan.get("currency") or "").lower() == (plan.get("currency") or "").lower()
    if cur.get("plan_id") != plan.get("id") and price > cur_price and same_currency and paid > 0:
        # Credit only what was really paid for the current membership (gifts, guest months and
        # free memberships from the studio give no credit; they simply run first).
        period = CYCLE_DAYS.get(cur_plan.get("billing_cycle"), 30) * 86400
        left = max(0.0, (end - now_utc()).total_seconds())
        credit = round(min(paid, paid * left / period), 2)
        credit = min(credit, round(price - 0.5, 2))
        return {"mode": "upgrade", "price": price, "credit": credit, "charge": round(price - credit, 2), "starts_at": None,
                "replaces_subscription_id": cur["id"], "current_plan": plan_name(cur_plan), "current_ends": cur.get("end_date")}
    return {"mode": "queued", "price": price, "credit": 0.0, "charge": price, "starts_at": cur.get("end_date"),
            "current_plan": plan_name(cur_plan), "current_ends": cur.get("end_date")}


@api.get("/me/membership-quote/{plan_id}")
async def membership_quote(plan_id: str, user: dict = Depends(get_current_user)):
    plan = await db.membership_plans.find_one({"id": plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(404, "Plan not found")
    return {**await membership_switch(user["id"], plan), "currency": plan.get("currency")}


# ---------------------------------------------------------------------------
# Refunds (admin)

async def refund_transaction(txn: dict, amount: Optional[float] = None) -> dict:
    """Refund through the provider that took the money. Returns {refunded, provider_ref}."""
    provider = txn.get("provider") or "stripe"
    total = float(txn.get("amount") or 0)
    amt = round(float(amount if amount is not None else total), 2)
    if amt <= 0 or amt > total + 0.001:
        raise HTTPException(422, "Refund amount must be more than 0 and not more than the payment.")
    if provider == "credit":
        await db.users.update_one({"id": txn["user_id"]}, {"$inc": {"store_credit": amt}})
        return {"refunded": amt, "provider_ref": "store credit returned"}
    if provider == "stripe":
        import stripe
        from routers.payments import _stripe_api_key, _to_minor_units
        key = await _stripe_api_key()
        kw = {"api_key": key}
        if txn.get("stripe_account"):
            kw["stripe_account"] = txn["stripe_account"]
        session = await asyncio.to_thread(stripe.checkout.Session.retrieve, txn["session_id"], **kw)
        pi = session.get("payment_intent") if isinstance(session, dict) else getattr(session, "payment_intent", None)
        if not pi:
            raise HTTPException(409, "Stripe has no payment for this checkout (it may be a subscription invoice). Refund it in the Stripe dashboard.")
        params = {"payment_intent": pi if isinstance(pi, str) else pi.get("id")}
        if amt < total:
            params["amount"] = _to_minor_units(amt, txn.get("currency"))
        if txn.get("stripe_account"):
            params["refund_application_fee"] = True
        if txn.get("_refund_key"):
            kw["idempotency_key"] = txn["_refund_key"]
        refund = await asyncio.to_thread(stripe.Refund.create, **params, **kw)
        return {"refunded": amt, "provider_ref": refund.get("id") if isinstance(refund, dict) else getattr(refund, "id", "")}
    if provider == "paypal":
        from routers.paypal import _paypal_access_token, _paypal_base_url
        capture = txn.get("paypal_capture_id")
        if not capture:
            raise HTTPException(409, "No PayPal capture is recorded for this payment. Refund it in your PayPal account.")
        token = await _paypal_access_token()
        body = {} if amt >= total else {"amount": {"value": f"{amt:.2f}", "currency_code": str(txn.get("currency") or "EUR").upper()}}
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(f"{await _paypal_base_url()}/v2/payments/captures/{capture}/refund",
                                  headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json",
                                           "PayPal-Request-Id": txn.get("_refund_key") or f"refund-{txn['id']}-{amt}"}, json=body)
        if r.status_code not in (200, 201):
            raise HTTPException(502, f"PayPal refused the refund (HTTP {r.status_code}). Refund it in your PayPal account.")
        return {"refunded": amt, "provider_ref": r.json().get("id")}
    raise HTTPException(409, f"{provider} payments are refunded in their own dashboard.")


async def revoke_delivery(txn: dict, by: str) -> list:
    """Take back what a payment delivered (courses, classes, membership, credits)."""
    now = now_utc().isoformat()
    done = []
    g = await db.access_grants.update_many({"transaction_id": txn["id"], "revoked_at": {"$in": [None, ""]}}, {"$set": {"revoked_at": now, "revoked_by": by}})
    if g.modified_count:
        done.append(f"{g.modified_count} access removed")
    s = await db.subscriptions.update_many({"id": f"payment:{txn['id']}", "status": {"$in": ["active", "trialing", "paused", "past_due"]}},
                                           {"$set": {"status": "cancelled", "cancelled_at": now, "cancelled_by": by}})
    if s.modified_count:
        done.append("membership ended")
    p = await db.class_passes.update_many({"id": f"payment:{txn['id']}"}, {"$set": {"active": False}})
    if p.modified_count:
        done.append("class credits removed")
    if txn.get("item_type") == "program" and not txn.get("access_snapshot"):
        await db.payment_transactions.update_one({"id": txn["id"]}, {"$set": {"access_revoked_at": now}})
        done.append("course removed")
    if txn.get("item_type") == "gift_membership":
        gift = await db.membership_gifts.find_one({"id": f"gift:{txn['id']}"}, {"_id": 0})
        if gift and gift.get("status") == "unredeemed":
            await db.membership_gifts.update_one({"id": gift["id"], "status": "unredeemed"}, {"$set": {"status": "revoked", "revoked_at": now}})
            done.append("gift code cancelled")
        elif gift and gift.get("status") == "redeemed":
            r = await db.subscriptions.update_many({"gift_code": gift["code"], "status": {"$in": ["active", "trialing", "paused"]}},
                                                   {"$set": {"status": "cancelled", "cancelled_at": now, "cancelled_by": by}})
            await db.membership_gifts.update_one({"id": gift["id"]}, {"$set": {"status": "revoked", "revoked_at": now}})
            if r.modified_count:
                done.append("gifted membership ended")
    if txn.get("item_type") == "teacher_offering":
        e = await db.teacher_enrollments.find_one({"_id": f"txn:{txn['id']}"}, {"_id": 0})
        if e and e.get("status") != "cancelled":
            await db.teacher_enrollments.update_one({"id": e["id"]}, {"$set": {"status": "cancelled", "cancelled_at": now, "refunded": True}})
            if e.get("kind") == "pack" and e.get("credits_total") and e.get("credits_granted", True):
                await db.teacher_credits.update_one({"teacher_id": e["teacher_id"], "user_id": e["user_id"]}, {"$inc": {"remaining": -int(e["credits_total"])}})
                await db.teacher_credits.update_one({"teacher_id": e["teacher_id"], "user_id": e["user_id"], "remaining": {"$lt": 0}}, {"$set": {"remaining": 0}})
            done.append("teacher booking cancelled")
    if txn.get("item_type") == "membership" and (txn.get("metadata") or {}).get("switch_mode") == "upgrade":
        old = await db.subscriptions.find_one({"replaced_by": f"payment:{txn['id']}", "status": "replaced"}, {"_id": 0})
        if old and old.get("original_end_date") and str(old["original_end_date"]) > now:
            await db.subscriptions.update_one({"id": old["id"]}, {"$set": {"status": "active", "end_date": old["original_end_date"],
                                                                          "next_billing_date": old["original_end_date"]},
                                                                 "$unset": {"replaced_by": ""}})
            done.append("previous membership restored")
    if txn.get("item_type") in ("hotel_deposit", "hotel_balance"):
        await db.hotel_stays.update_one({"id": txn.get("item_id")}, {"$push": {"history": {"status": "refund", "at": now, "by": by,
                                                                                            "note": f"{txn['item_type'].split('_')[1]} refunded"}}})
        done.append("noted on the stay")
    return done


class RefundIn(BaseModel):
    amount: Optional[float] = Field(default=None, gt=0)
    revoke_access: bool = True
    note: str = Field(min_length=3, max_length=300)


@api.post("/admin/payments/{txn_id}/refund")
async def admin_refund(txn_id: str, payload: RefundIn, request: Request):
    admin = await require_role(request, ["admin"])
    txn = await db.payment_transactions.find_one({"id": txn_id}, {"_id": 0})
    if not txn or txn.get("payment_status") not in ("paid", "partially_refunded"):
        raise HTTPException(409, "Only confirmed payments can be refunded.")
    already = float(txn.get("refunded_amount") or 0)
    left = round(float(txn.get("amount") or 0) - already, 2)
    amount = round(payload.amount if payload.amount is not None else left, 2)
    if amount > left + 0.001:
        raise HTTPException(422, f"Only {left:.2f} is left to refund on this payment.")
    # Claim the payment so two clicks can never send two refunds.
    claimed = await db.payment_transactions.update_one({"id": txn_id, "refund_in_progress": {"$ne": True}, "refunded_amount": txn.get("refunded_amount")},
                                                       {"$set": {"refund_in_progress": True}})
    if not claimed.modified_count:
        raise HTTPException(409, "A refund for this payment is already being processed. Refresh in a moment.")
    try:
        if txn.get("marked_paid_by") and (txn.get("provider") or "stripe") != "credit":
            result = {"refunded": amount, "provider_ref": "confirmed by hand — return the money the way it was paid"}
        else:
            result = await refund_transaction({**txn, "amount": left, "_refund_key": f"refund-{txn_id}-{already:.2f}-{amount:.2f}"}, amount)
    except Exception:
        await db.payment_transactions.update_one({"id": txn_id}, {"$unset": {"refund_in_progress": ""}})
        raise
    total_refunded = round(already + result["refunded"], 2)
    full = total_refunded >= float(txn.get("amount") or 0) - 0.001
    await db.payment_transactions.update_one({"id": txn_id}, {"$set": {
        "payment_status": "refunded" if full else "partially_refunded", "refunded_amount": total_refunded,
        "refunded_at": now_utc().isoformat(), "refunded_by": admin.get("email"), "refund_note": payload.note},
        "$unset": {"refund_in_progress": ""},
        "$push": {"refunds": {"amount": result["refunded"], "ref": result["provider_ref"], "at": now_utc().isoformat(), "by": admin.get("email")}}})
    removed = await revoke_delivery(txn, admin.get("email")) if payload.revoke_access else []
    await _audit(txn.get("user_id"), "refund", f"Refunded {result['refunded']:.2f} {str(txn.get('currency') or '').upper()} ({payload.note})"
                 + (f"; {', '.join(removed)}" if removed else ""), admin.get("email"))
    from notify import notify_member
    await notify_member(txn.get("user_id"), "Refund on its way", f"We refunded {result['refunded']:.2f} {str(txn.get('currency') or '').upper()}. "
                        "It can take 5–10 days to appear on your statement.", "/my-yoga")
    return {"ok": True, **result, "access_removed": removed}


# ---------------------------------------------------------------------------
# EU online withdrawal ("withdraw from contract") — two steps + emailed confirmation

class WithdrawalIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    transaction_id: Optional[str] = Field(default=None, max_length=80)
    order_reference: Optional[str] = Field(default=None, max_length=120)
    details: Optional[str] = Field(default=None, max_length=1500)
    confirm: bool = False


@api.get("/me/withdrawable")
async def my_withdrawable(user: dict = Depends(get_current_user)):
    """Purchases from the last 14 days the member may withdraw from."""
    from routers.members import payment_rows
    since = (now_utc() - timedelta(days=14)).isoformat()
    rows = await payment_rows({"user_id": user["id"], "payment_status": "paid", "completed_at": {"$gte": since}}, 50)
    return [{k: r[k] for k in ("id", "description", "amount", "currency", "completed_at", "provider")} for r in rows]


@api.post("/withdrawals")
async def request_withdrawal(payload: WithdrawalIn, request: Request):
    user = await get_optional_user(request)
    txn = None
    if payload.transaction_id:
        txn = await db.payment_transactions.find_one({"id": payload.transaction_id}, {"_id": 0})
        if not txn or (user and txn.get("user_id") != user["id"]) or (not user and (txn.get("user_email") or "").lower() != payload.email.lower()):
            raise HTTPException(404, "We couldn't find that purchase for your account.")
    ip = (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "")).split(",")[0].strip()
    day = (now_utc() - timedelta(days=1)).isoformat()
    if payload.confirm and (await db.withdrawals.count_documents({"email": payload.email.lower(), "created_at": {"$gte": day}}) >= 5
                            or (ip and await db.withdrawals.count_documents({"ip": ip, "created_at": {"$gte": day}}) >= 20)):
        raise HTTPException(429, "We already received your request. We'll reply by email.")
    if not payload.confirm:
        # Step 1: show what will be sent; nothing is stored until the member confirms.
        return {"step": "confirm", "summary": {"name": payload.name, "email": payload.email,
                                                "purchase": (txn or {}).get("item_type") or payload.order_reference or "not specified",
                                                "details": payload.details}}
    doc = {"id": gen_id(), "user_id": (user or {}).get("id") or (txn or {}).get("user_id"), "name": payload.name, "email": payload.email.lower(),
           "transaction_id": payload.transaction_id, "order_reference": payload.order_reference, "details": payload.details,
           "status": "received", "created_at": now_utc().isoformat(), "ip": ip}
    if txn:
        from routers.payments import _receipt_description
        doc.update(description=await _receipt_description(txn), amount=txn.get("amount"), currency=txn.get("currency"), paid_at=txn.get("completed_at"))
    await db.withdrawals.insert_one({**doc, "_id": doc["id"]})
    try:
        from email_service import send_email, _wrap
        import html as _h
        when = now_utc().strftime("%d %B %Y, %H:%M UTC")
        body = (f"We received your withdrawal on <strong>{when}</strong>.<br/><br/>Purchase: {_h.escape(doc.get('description') or payload.order_reference or 'as described')}"
                + (f"<br/>Your note: {_h.escape(payload.details)}" if payload.details else "")
                + f"<br/>Reference: {doc['id'][:8].upper()}<br/><br/>We'll reply within 14 days and refund any money owed in the same way you paid.")
        await send_email(payload.email, "We received your withdrawal — Tony Yoga", _wrap("Withdrawal received.", body),
                         f"We received your withdrawal on {when}. Reference {doc['id'][:8].upper()}.")
    except Exception as exc:
        logger.warning("withdrawal email failed (%s)", type(exc).__name__)
    from routers.notifications import push_admins
    await push_admins("Withdrawal request", f"{payload.email} asked to withdraw ({doc.get('description') or payload.order_reference or 'no purchase chosen'}).",
                      "/admin?tab=students&view=payments")
    return {"step": "done", "reference": doc["id"][:8].upper(), "received_at": doc["created_at"]}


@api.get("/admin/withdrawals")
async def admin_withdrawals(request: Request, status: str = "open"):
    await require_role(request, ["admin"])
    q = {"status": "received"} if status == "open" else {}
    return await db.withdrawals.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)


class WithdrawalDecision(BaseModel):
    action: str = Field(pattern="^(refund|decline|close)$")
    note: str = Field(min_length=3, max_length=500)
    revoke_access: bool = True


@api.post("/admin/withdrawals/{wid}")
async def admin_decide_withdrawal(wid: str, payload: WithdrawalDecision, request: Request):
    admin = await require_role(request, ["admin"])
    w = await db.withdrawals.find_one({"id": wid}, {"_id": 0})
    if not w:
        raise HTTPException(404, "Request not found")
    result = None
    if payload.action == "refund":
        if not w.get("transaction_id"):
            raise HTTPException(409, "No purchase is linked to this request. Refund it from the student's payments.")
        result = await admin_refund(w["transaction_id"], RefundIn(revoke_access=payload.revoke_access, note=f"Withdrawal: {payload.note}"), request)
    await db.withdrawals.update_one({"id": wid}, {"$set": {"status": {"refund": "refunded", "decline": "declined", "close": "closed"}[payload.action],
                                                          "decided_at": now_utc().isoformat(), "decided_by": admin.get("email"), "decision_note": payload.note}})
    if payload.action == "decline":
        try:
            from email_service import send_email, _wrap
            import html as _h
            await send_email(w["email"], "About your withdrawal — Tony Yoga", _wrap("About your withdrawal.", _h.escape(payload.note)), payload.note)
        except Exception:
            pass
    return {"ok": True, "refund": result}


# ---------------------------------------------------------------------------
# Gift memberships

def _gift_code() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "GIFT-" + "".join(secrets.choice(alphabet) for _ in range(4)) + "-" + "".join(secrets.choice(alphabet) for _ in range(4))


async def create_gift_from_payment(txn: dict):
    """Called when a gift membership is paid: make the code, email the buyer (and the recipient)."""
    gid = f"gift:{txn['id']}"
    if await db.membership_gifts.find_one({"_id": gid}):
        return
    meta = txn.get("metadata") or {}
    plan = await db.membership_plans.find_one({"id": txn.get("item_id")}, {"_id": 0}) or {}
    days = CYCLE_DAYS.get(plan.get("billing_cycle"), 30)
    gift = {"_id": gid, "id": gid, "code": _gift_code(), "plan_id": plan.get("id"), "plan_name": plan_name(plan), "days": days,
            "buyer_id": txn["user_id"], "buyer_email": txn.get("user_email"), "recipient_name": meta.get("recipient_name") or "",
            "recipient_email": (meta.get("recipient_email") or "").lower(), "message": meta.get("gift_message") or "",
            "status": "unredeemed", "created_at": now_utc().isoformat(), "expires_at": (now_utc() + timedelta(days=365)).isoformat(),
            "transaction_id": txn["id"]}
    await db.membership_gifts.insert_one(gift)
    await _send_gift_emails(gift)


async def _send_gift_emails(gift: dict):
    try:
        import html as _h
        from email_service import send_email, _wrap
        from notify import site_url
        url = site_url(f"/redeem?code={gift['code']}")
        await send_email(gift["buyer_email"], f"Your gift: {gift['plan_name']} membership",
                         _wrap("Your gift is ready.", f"Gift code: <strong>{gift['code']}</strong><br/>{gift['days']} days of {_h.escape(gift['plan_name'])}."
                               + (f"<br/>We also emailed it to {_h.escape(gift['recipient_email'])}." if gift["recipient_email"] else
                                  "<br/>Share the code or the link below with the person you're gifting it to."), "Redeem link", url),
                         f"Gift code {gift['code']}: {url}")
        if gift["recipient_email"]:
            note = f"<br/><br/><em>“{_h.escape(gift['message'])}”</em>" if gift["message"] else ""
            await send_email(gift["recipient_email"], "You've received a Tony Yoga membership",
                             _wrap("A gift for your practice.", f"Hi {_h.escape(gift['recipient_name'] or 'there')}, someone gave you "
                                   f"{gift['days']} days of the {_h.escape(gift['plan_name'])} membership.{note}<br/><br/>Your code: <strong>{gift['code']}</strong>",
                                   "Start my membership", url),
                             f"You've received {gift['days']} days of Tony Yoga. Code {gift['code']}: {url}")
    except Exception as exc:
        logger.warning("gift email failed (%s)", type(exc).__name__)


class RedeemIn(BaseModel):
    code: str = Field(min_length=6, max_length=40)


@api.post("/gifts/redeem")
async def redeem_gift(payload: RedeemIn, user: dict = Depends(get_current_user)):
    code = re.sub(r"\s", "", payload.code).upper()
    gift = await db.membership_gifts.find_one({"code": code}, {"_id": 0})
    if not gift:
        raise HTTPException(404, "That gift code doesn't exist. Check the letters and try again.")
    if gift["status"] != "unredeemed":
        raise HTTPException(409, "This gift has already been used.")
    if str(gift.get("expires_at") or "9") < now_utc().isoformat():
        raise HTTPException(409, "This gift code has expired.")
    claimed = await db.membership_gifts.update_one({"code": code, "status": "unredeemed"},
                                                   {"$set": {"status": "redeemed", "redeemed_by": user["id"], "redeemed_at": now_utc().isoformat()}})
    if not claimed.modified_count:
        raise HTTPException(409, "This gift has already been used.")
    plan = await db.membership_plans.find_one({"id": gift["plan_id"]}, {"_id": 0})
    if not plan:
        raise HTTPException(409, "This membership no longer exists. Please contact us.")
    current = await active_memberships(user["id"])
    start = max([parse_dt(s["end_date"]) for s in current if not str(s.get("end_date")).startswith("2099")] + [now_utc()])
    end = start + timedelta(days=int(gift["days"]))
    from routers.members import give_membership
    sub = await give_membership(user["id"], plan, start.isoformat(), end.isoformat(), source="gift")
    await db.subscriptions.update_one({"id": sub["id"]}, {"$set": {"gift_code": code}})
    await _audit(user["id"], "gift_redeemed", f"{gift['plan_name']} gift ({gift['days']} days) from {gift.get('buyer_email')}")
    from notify import notify_member
    await notify_member(user["id"], "Gift membership activated", f"Your {gift['plan_name']} membership runs until {end.strftime('%d %b %Y')}.", "/my-yoga")
    if gift.get("buyer_id"):
        await notify_member(gift["buyer_id"], "Your gift was opened", f"{gift.get('recipient_name') or 'Your friend'} started the membership you gave them.", "/my-yoga", email=False)
    return {"ok": True, "plan_name": gift["plan_name"], "starts_at": sub["start_date"], "ends_at": sub["end_date"]}


@api.get("/me/gifts")
async def my_gifts(user: dict = Depends(get_current_user)):
    return await db.membership_gifts.find({"buyer_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)


_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


async def _gift_price(item_id, quantity, user_id, extra):
    if await get_setting("gifts_enabled") is False:
        raise HTTPException(409, "Gift memberships aren't available right now.")
    plan = await db.membership_plans.find_one({"id": item_id}, {"_id": 0})
    if not plan or plan.get("is_active") is False:
        raise HTTPException(404, "Plan not found")
    if quantity != 1:
        raise HTTPException(422, "Buy one gift at a time.")
    if extra.get("recipient_email") and not _EMAIL_RE.match(extra["recipient_email"]):
        raise HTTPException(422, "The recipient's email address doesn't look right.")
    return plan["price"], plan["currency"], {"plan_name": plan_name(plan), "product_name": f"Gift: {plan_name(plan)} membership — Tony Yoga", **extra}


async def _gift_describe(txn):
    plan = await db.membership_plans.find_one({"id": txn.get("item_id")}, {"_id": 0}) or {}
    return f"Gift membership — {plan_name(plan)}"


async def _gift_message(txn):
    to = (txn.get("metadata") or {}).get("recipient_email")
    return "Your gift is ready", ("We emailed the gift code to you" + (f" and to {to}." if to else ". Share it with the lucky person."))


async def _gift_link(txn):
    return "/gift?sent=1"


from payment_items import register  # noqa: E402

register("gift_membership", price=_gift_price, fulfill=create_gift_from_payment, describe=_gift_describe,
         message=_gift_message, link=_gift_link, credit=True, meta_keys=("recipient_name", "recipient_email", "gift_message"))


@api.get("/admin/gifts")
async def admin_gifts(request: Request):
    await require_role(request, ["admin"])
    return await db.membership_gifts.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)


@api.post("/admin/gifts/{gift_id}/resend")
async def admin_resend_gift(gift_id: str, request: Request):
    await require_role(request, ["admin"])
    gift = await db.membership_gifts.find_one({"id": gift_id}, {"_id": 0})
    if not gift:
        raise HTTPException(404, "Gift not found")
    await _send_gift_emails(gift)
    return {"ok": True}


@api.get("/gifts/check/{code}")
async def check_gift(code: str):
    """Shown on /redeem before signing in: what the code is for (no personal details)."""
    gift = await db.membership_gifts.find_one({"code": re.sub(r"\s", "", code).upper()}, {"_id": 0, "plan_name": 1, "days": 1, "status": 1, "expires_at": 1})
    if not gift:
        raise HTTPException(404, "That gift code doesn't exist.")
    return {"plan_name": gift["plan_name"], "days": gift["days"], "valid": gift["status"] == "unredeemed" and str(gift.get("expires_at") or "9") > now_utc().isoformat()}
