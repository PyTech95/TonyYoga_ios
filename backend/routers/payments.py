"""Stripe checkout + fulfillment + webhook."""
import os
import asyncio
from datetime import datetime, timedelta
from typing import Dict
from fastapi import Depends, HTTPException, Request

from core import api, db, logger, now_utc, gen_id, get_current_user
from models import CheckoutRequest
from routers.settings import get_setting
from access_terms import make_grant, fulfill_access, class_pricing, parse_dt, term_window
import stripe  # official Stripe Python SDK

# Currencies Stripe treats as zero-decimal (amount is NOT multiplied by 100).
_ZERO_DECIMAL = {"bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf"}


def _to_minor_units(amount: float, currency: str) -> int:
    if (currency or "").lower() in _ZERO_DECIMAL:
        return int(round(float(amount)))
    return int(round(float(amount) * 100))


async def _create_onetime_session(*, amount, currency, success_url, cancel_url, metadata, customer_email, product_name):
    """One-time Checkout session via the official Stripe SDK."""
    key = await _require_stripe_key()
    try:
        return await asyncio.to_thread(stripe.checkout.Session.create,
            api_key=key,
            mode="payment",
            success_url=success_url,
            cancel_url=cancel_url,
            metadata=metadata,
            customer_email=customer_email,
            line_items=[{
                "price_data": {
                    "currency": (currency or "usd").lower(),
                    "unit_amount": _to_minor_units(amount, currency),
                    "product_data": {"name": product_name or "Tony Yoga"},
                },
                "quantity": 1,
            }],
        )
    except stripe.error.AuthenticationError:
        logger.warning("Stripe authentication failed")
        raise HTTPException(503, "Payments are not configured correctly. Please contact support.")
    except stripe.error.StripeError:
        logger.warning("Stripe checkout session failed")
        raise HTTPException(503, "Unable to start checkout right now. Please try again shortly.")


# Map our billing_cycle field to Stripe recurring interval params.
_BILLING_CYCLE_TO_STRIPE = {
    "weekly":    {"interval": "week",  "interval_count": 1},
    "monthly":   {"interval": "month", "interval_count": 1},
    "quarterly": {"interval": "month", "interval_count": 3},
    "yearly":    {"interval": "year",  "interval_count": 1},
}


async def _stripe_api_key() -> str:
    """Effective Stripe secret: DB setting first, then env fallback."""
    key = await get_setting("stripe_secret_key")
    return key or os.environ.get("STRIPE_API_KEY", "")


def _is_valid_stripe_key(key: str) -> bool:
    """A real Stripe secret/restricted key is sk_/rk_ (test or live) + a long token.
    The `sk_test_emergent` placeholder and blanks are rejected so checkout can fail
    gracefully with a 503 instead of a raw 500 from the Stripe SDK."""
    if not key or not isinstance(key, str):
        return False
    if not (key.startswith("sk_") or key.startswith("rk_")):
        return False
    return len(key) >= 20 and "emergent" not in key.lower()


async def _require_stripe_key() -> str:
    key = await _stripe_api_key()
    if not (await get_setting("stripe_enabled") and await get_setting("stripe_verified_at") and await get_setting("stripe_webhook_secret") and _is_valid_stripe_key(key)):
        logger.warning("Stripe key missing/invalid — add a valid key in Admin → Settings.")
        raise HTTPException(503, "Card payments are temporarily unavailable. Please try again later.")
    stripe.api_key = key
    return key


async def _create_subscription_session(*, user: dict, plan: dict, origin_url: str) -> dict:
    """Create a Stripe Checkout session in subscription mode with optional trial_period_days.

    Uses the official Stripe SDK in subscription mode.
    Returns {url, session_id, amount, currency, metadata}.
    """
    await _require_stripe_key()
    cycle = plan.get("billing_cycle", "monthly")
    recurring = _BILLING_CYCLE_TO_STRIPE.get(cycle, _BILLING_CYCLE_TO_STRIPE["monthly"])
    currency = (plan.get("currency") or "usd").lower()
    unit_amount = int(round(float(plan["price"]) * 100))  # Stripe wants integer cents
    trial_days = int(plan.get("trial_days") or 0)

    subscription_data: Dict = {
        "metadata": {
            "user_id": user["id"],
            "plan_id": plan["id"],
            "plan_name": plan.get("name", ""),
        },
    }
    if trial_days > 0:
        subscription_data["trial_period_days"] = trial_days

    metadata = {
        "user_id": user["id"], "user_email": user["email"],
        "item_type": "membership", "item_id": plan["id"],
        "quantity": "1", "plan_name": plan.get("name", ""),
        "trial_days": str(trial_days),
    }
    session = stripe.checkout.Session.create(
        mode="subscription",
        customer_email=user["email"],
        line_items=[{
            "price_data": {
                "currency": currency,
                "product_data": {"name": plan.get("name") or "Membership"},
                "unit_amount": unit_amount,
                "recurring": recurring,
            },
            "quantity": 1,
        }],
        success_url=f"{origin_url}/checkout/success?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{origin_url}/checkout/cancel",
        metadata=metadata,
        subscription_data=subscription_data,
    )
    return {
        "url": session.url,
        "session_id": session.id,
        "amount": float(plan["price"]),
        "currency": currency,
        "metadata": metadata,
    }


# Yoga Teacher Training tiers (single source of truth for prices — anti-tamper).
TEACHER_TRAINING_CATALOG = {
    "core26": {"id": "core26", "name": "Core 26+ · 200-Hour Teacher Training", "price": 3500.0,
               "hours": 200, "dates": "23–29 April 2026",
               "includes": ["9:00–1:00pm / 3:00–6:00pm daily", "6 nights · 3 daily meals",
                            "100 hours in-person workshop", "200 hours online training",
                            "30 hours anatomy", "20 hours internship"]},
    "core40": {"id": "core40", "name": "Core 40 · 300-Hour Teacher Training", "price": 4500.0,
               "hours": 300, "dates": "11–19 December 2026",
               "includes": ["6 nights · 3 daily meals", "100 hours in-person workshop",
                            "300 hours online training", "30 hours anatomy", "30 hours physiology",
                            "30 hours yoga philosophy", "10-hour CPR course", "30 hours internship"]},
    "core84": {"id": "core84", "name": "Core 84 · 500-Hour Teacher Training", "price": 5500.0,
               "hours": 500, "dates": "3–9 August 2026",
               "includes": ["9:00–1:00pm / 3:00–6:00pm daily", "6 nights · 3 daily meals",
                            "100 hours in-person workshop", "220 hours online training",
                            "30 hours anatomy", "30 hours physiology", "30 hours yoga philosophy",
                            "10-hour CPR course", "30 hours internship"]},
}


@api.get("/teacher-training")
async def list_teacher_training():
    """Public: the teacher-training tiers rendered on the /teacher-training page."""
    return [TEACHER_TRAINING_CATALOG[k] for k in ("core26", "core40", "core84")]


async def _resolve_price(item_type: str, item_id: str, quantity: int, user_id: str = None):
    if item_type == "teacher_training":
        t = TEACHER_TRAINING_CATALOG.get(item_id)
        if not t:
            raise HTTPException(404, "Training not found")
        return t["price"], "eur", {"training_name": t["name"], "training_dates": t["dates"]}
    if item_type == "membership":
        plan = await db.membership_plans.find_one({"id": item_id})
        if not plan: raise HTTPException(404, "Plan not found")
        return plan["price"], plan["currency"], {"plan_name": plan["name"]}
    if item_type == "program":
        program = await db.programs.find_one({"id": item_id})
        if not program: raise HTTPException(404, "Program not found")
        if program.get("price_model") in ("free", "membership"):
            raise HTTPException(409, "This course is accessed through its listed membership or free option.")
        if quantity != 1 or float(program.get("price", 0)) <= 0:
            raise HTTPException(422, "A course subscription requires one item and a positive price.")
        grant = await make_grant("program", item_id, program["title"], program.get("access_term"), user_id)
        grant["return_path"] = f"/programs/{item_id}"
        return program["price"], program.get("currency", "usd"), {"program_title": program["title"], "product_name": f"{program['title']} — fixed-term subscription", "_access_snapshot": {"version": 1, "grants": [grant]}}
    if item_type in ("class_one_time", "class_subscription"):
        if quantity != 1:
            raise HTTPException(422, "Choose one class purchase at a time.")
        if item_type == "class_one_time":
            instance = await db.class_instances.find_one({"id": item_id}, {"_id": 0})
            if not instance or instance.get("status") == "cancelled" or parse_dt(instance["start_time"]) <= now_utc():
                raise HTTPException(409, "This class is no longer available.")
            config = await class_pricing(instance)
            if config["mode"] not in ("one_time", "both"):
                raise HTTPException(409, "One-time purchase is not offered for this class.")
            replay = int(await get_setting("recording_replay_days") or 3)
            term = {"mode": "fixed", "starts_at": now_utc().isoformat(), "ends_at": (parse_dt(instance["end_time"]) + timedelta(days=replay)).isoformat()}
            grant = await make_grant("class_instance", item_id, instance["title"], term, user_id)
            grant["return_path"] = f"/schedule/{item_id}"
            price = config["one_time_price"]
        else:
            template = await db.class_templates.find_one({"id": item_id, "location_type": "online"}, {"_id": 0})
            if not template:
                raise HTTPException(404, "Zoom class series not found")
            config = await class_pricing({**template, "template_id": item_id})
            if config["mode"] not in ("subscription", "both"):
                raise HTTPException(409, "Subscription is not offered for this class series.")
            grant = await make_grant("class_template", item_id, template["title"], config["term"], user_id)
            grant["return_path"] = "/schedule"
            price = config["subscription_price"]
        return price, config["currency"], {"product_name": grant["title"], "_access_snapshot": {"version": 1, "grants": [grant]}}
    if item_type == "product":
        product = await db.products.find_one({"id": item_id})
        if not product: raise HTTPException(404, "Product not found")
        return product["price"] * quantity, product["currency"], {"product_title": product["title"], "quantity": str(quantity)}
    if item_type == "cart":
        # item_id holds the order_id; use the persisted order total (already enriched with items)
        order = await db.orders.find_one({"id": item_id})
        if not order: raise HTTPException(404, "Order not found")
        titles = ", ".join(i["title"] for i in order.get("items", []))[:400]
        return order["total"], order.get("currency", "usd"), {"order_id": item_id, "item_titles": titles}
    if item_type == "workshop_deposit":
        reg = await db.workshop_registrations.find_one({"id": item_id})
        if not reg: raise HTTPException(404, "Reservation not found")
        if reg.get("status") != "pending_deposit":
            raise HTTPException(400, f"Reservation is not awaiting a deposit (status={reg.get('status')})")
        return reg["deposit_eur"], "eur", {"reservation_id": item_id, "workshop_title": reg.get("workshop_title", ""), "payment_kind": "deposit"}
    if item_type == "workshop_balance":
        reg = await db.workshop_registrations.find_one({"id": item_id})
        if not reg: raise HTTPException(404, "Reservation not found")
        if reg.get("status") != "deposit_paid":
            raise HTTPException(400, f"Reservation not eligible for balance (status={reg.get('status')})")
        return reg["balance_eur"], "eur", {"reservation_id": item_id, "workshop_title": reg.get("workshop_title", ""), "payment_kind": "balance"}
    if item_type == "drop_in":
        p = {"price": 22.0}
        try:
            from routers.passes import PASS_CATALOG
            p = PASS_CATALOG.get("drop_in", p)
        except Exception:
            pass
        return p["price"], "usd", {"description": "Drop-in class", "pass_type": "drop_in", "credits": "1"}
    if item_type == "class_pack":
        p = {"price": 99.0}
        try:
            from routers.passes import PASS_CATALOG
            p = PASS_CATALOG.get("class_pack", p)
        except Exception:
            pass
        return p["price"], "usd", {"description": "5-class pack", "pass_type": "class_pack", "credits": "5"}
    if item_type == "private_session":
        req = await db.private_session_requests.find_one({"id": item_id, "user_id": user_id}, {"_id": 0})
        if not req:
            raise HTTPException(404, "Private session request not found.")
        if req.get("status") != "pending_payment":
            raise HTTPException(409, "This private session request is already paid or closed.")
        from routers.availability import validate_request_hold
        await validate_request_hold(req)
        qty = req["sessions_total"]
        if quantity != qty:
            raise HTTPException(422, "Session quantity must match your booking request.")
        from routers.settings import private_session_amount
        total = req.get("amount") if req.get("selected_slots") else await private_session_amount(qty)
        return total, "eur", {"description": f"Private session × {qty}", "request_id": item_id, "sessions": str(qty)}
    if item_type == "bundle":
        bundle = await db.bundles.find_one({"id": item_id})
        if not bundle: raise HTTPException(404, "Bundle not found")
        if not bundle.get("active", True) or quantity != 1:
            raise HTTPException(409, "Bundle is unavailable.")
        grants = []
        for pid in bundle.get("program_ids", []):
            program = await db.programs.find_one({"id": pid}, {"_id": 0})
            if not program:
                raise HTTPException(409, "A course in this bundle is unavailable.")
            grant = await make_grant("program", pid, program["title"], program.get("access_term"), user_id)
            grant["return_path"] = f"/programs/{pid}"
            grants.append(grant)
        if not grants:
            raise HTTPException(409, "This bundle has no courses.")
        return bundle["price"], (bundle.get("currency") or "eur"), {"bundle_title": bundle.get("title", ""), "_access_snapshot": {"version": 1, "grants": grants}}
    raise HTTPException(400, "Invalid item type")


async def _reserve_store_credit(user_id: str, amount: float) -> float:
    """Atomically reserve up to `amount` of the user's store credit. Returns the
    amount actually reserved (0 if none available). Credit is treated 1:1 as money."""
    u = await db.users.find_one({"id": user_id}, {"store_credit": 1})
    bal = round(float((u or {}).get("store_credit") or 0), 2)
    applied = round(min(bal, float(amount)), 2)
    if applied <= 0:
        return 0.0
    r = await db.users.update_one(
        {"id": user_id, "store_credit": {"$gte": applied}},
        {"$inc": {"store_credit": -applied}},
    )
    return applied if r.modified_count else 0.0


async def _release_store_credit(user_id: str, amount: float):
    if amount and amount > 0:
        await db.users.update_one({"id": user_id}, {"$inc": {"store_credit": round(float(amount), 2)}})


async def release_stranded_credit_tick():
    """Return reserved store credit for unpaid checkouts abandoned >45 min ago
    (safety net for users who close the Stripe/PayPal page without cancelling)."""
    from datetime import timedelta
    cutoff = (now_utc() - timedelta(minutes=45)).isoformat()
    cursor = db.payment_transactions.find({
        "payment_status": "initiated",
        "credit_applied": {"$gt": 0},
        "credit_released": {"$ne": True},
        "created_at": {"$lt": cutoff},
    })
    async for txn in cursor:
        await _release_store_credit(txn.get("user_id"), txn.get("credit_applied") or 0)
        await db.payment_transactions.update_one(
            {"id": txn["id"]}, {"$set": {"credit_released": True, "status": "expired"}}
        )


def _credit_eligible(item_type: str) -> bool:
    # Store credit applies to one-time purchases (not real Stripe subscriptions).
    return item_type in (
        "membership", "program", "product", "cart", "bundle", "class_one_time", "class_subscription",
        "workshop_deposit", "workshop_balance", "drop_in", "class_pack", "private_session",
    )


async def _fulfill_credit_only(*, user: dict, item_type: str, item_id: str, quantity: int,
                               currency: str, credit_applied: float, meta: dict, access_snapshot=None):
    """When store credit fully covers the price, complete the purchase with no gateway."""
    txn = {
        "id": gen_id(), "session_id": f"credit_{gen_id()}",
        "provider": "credit",
        "user_id": user["id"], "user_email": user["email"],
        "amount": round(credit_applied, 2), "currency": currency,
        "credit_applied": round(credit_applied, 2),
        "item_type": item_type, "item_id": item_id,
        "quantity": quantity,
        "metadata": {"user_id": user["id"], "user_email": user["email"],
                     "item_type": item_type, "item_id": item_id,
                     "quantity": str(quantity), **(meta or {})},
        "payment_status": "paid", "status": "complete", "mode": "credit",
        "created_at": now_utc().isoformat(), "completed_at": now_utc().isoformat(),
    }
    if access_snapshot:
        txn["access_snapshot"] = access_snapshot
    await db.payment_transactions.insert_one(txn)
    await _fulfill_payment(txn)
    return txn


@api.post("/checkout/credit-release")
async def release_credit(request: Request, user: dict = Depends(get_current_user)):
    """Refund reserved store credit for an abandoned/cancelled unpaid checkout."""
    body = await request.json()
    session_id = (body or {}).get("session_id")
    if not session_id:
        raise HTTPException(400, "session_id required")
    txn = await db.payment_transactions.find_one({"session_id": session_id, "user_id": user["id"]})
    if not txn:
        raise HTTPException(404, "Transaction not found")
    applied = round(float(txn.get("credit_applied") or 0), 2)
    if txn.get("payment_status") == "paid" or txn.get("credit_released") or applied <= 0:
        return {"released": 0.0}
    await _release_store_credit(user["id"], applied)
    await db.payment_transactions.update_one({"session_id": session_id}, {"$set": {"credit_released": True}})
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0, "store_credit": 1})
    return {"released": applied, "store_credit": round((fresh or {}).get("store_credit", 0) or 0, 2)}


@api.post("/checkout/session")
async def create_checkout(payload: CheckoutRequest, request: Request, user: dict = Depends(get_current_user)):
    # Memberships CAN go through Stripe Subscriptions (with trial) when the admin
    # explicitly enables it AND a real Stripe key is configured. Otherwise we fall
    # back to the safe one-time payment flow (customer pays for one full billing
    # cycle up-front; admin can extend manually).
    subs_enabled = bool(await get_setting("stripe_subscriptions_enabled"))
    if payload.item_type == "membership" and subs_enabled:
        plan = await db.membership_plans.find_one({"id": payload.item_id})
        if not plan:
            raise HTTPException(404, "Plan not found")
        try:
            session = await _create_subscription_session(user=user, plan=plan, origin_url=payload.origin_url)
        except stripe.error.StripeError as e:
            logger.exception(f"Stripe subscription creation failed: {e}")
            raise HTTPException(503, "Unable to start the subscription right now. Please try again shortly.")
        await db.payment_transactions.insert_one({
            "id": gen_id(), "session_id": session["session_id"],
            "user_id": user["id"], "user_email": user["email"],
            "amount": session["amount"], "currency": session["currency"],
            "item_type": "membership", "item_id": payload.item_id,
            "quantity": 1, "metadata": session["metadata"],
            "payment_status": "initiated", "status": "open",
            "mode": "subscription",
            "trial_days": int(plan.get("trial_days") or 0),
            "created_at": now_utc().isoformat(),
        })
        return {"url": session["url"], "session_id": session["session_id"]}

    amount, currency, meta = await _resolve_price(payload.item_type, payload.item_id, payload.quantity, user["id"])
    access_snapshot = meta.pop("_access_snapshot", None)

    # Gift-card store credit: reserve and deduct from the amount to charge.
    credit_applied = 0.0
    if payload.apply_credit and _credit_eligible(payload.item_type):
        credit_applied = await _reserve_store_credit(user["id"], float(amount))
    charge_amount = round(float(amount) - credit_applied, 2)
    if credit_applied > 0 and charge_amount <= 0.009:
        # Credit fully covers it — no gateway needed.
        await _fulfill_credit_only(user=user, item_type=payload.item_type, item_id=payload.item_id,
                                   quantity=payload.quantity, currency=currency,
                                   credit_applied=credit_applied, meta=meta, access_snapshot=access_snapshot)
        return {"credit_only": True, "credit_applied": credit_applied}

    success_url = f"{payload.origin_url}/checkout/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{payload.origin_url}/checkout/cancel?session_id={{CHECKOUT_SESSION_ID}}"
    metadata = {
        "user_id": user["id"], "user_email": user["email"],
        "item_type": payload.item_type, "item_id": payload.item_id,
        "quantity": str(payload.quantity), **meta,
    }
    try:
        session = await _create_onetime_session(
            amount=float(charge_amount), currency=currency,
            success_url=success_url, cancel_url=cancel_url, metadata=metadata,
            customer_email=user.get("email"),
            product_name=meta.get("product_name") or meta.get("title") or meta.get("name"),
        )
    except Exception:
        await _release_store_credit(user["id"], credit_applied)
        raise
    await db.payment_transactions.insert_one({
        "id": gen_id(), "session_id": session.id,
        "user_id": user["id"], "user_email": user["email"],
        "amount": float(charge_amount), "currency": currency,
        "credit_applied": credit_applied,
        "item_type": payload.item_type, "item_id": payload.item_id,
        "quantity": payload.quantity, "metadata": metadata,
        "payment_status": "initiated", "status": "open",
        "mode": "payment",
        **({"access_snapshot": access_snapshot} if access_snapshot else {}),
        "created_at": now_utc().isoformat(),
    })
    return {"url": session.url, "session_id": session.id}


@api.get("/checkout/status/{session_id}")
async def checkout_status(session_id: str, request: Request):
    txn = await db.payment_transactions.find_one({"session_id": session_id})
    if not txn:
        raise HTTPException(404, "Transaction not found")

    # Subscription-mode sessions: query Stripe directly (retrieve + expand subscription)
    # so we can reflect trial/active status accurately.
    if txn.get("mode") == "subscription":
        stripe.api_key = await _stripe_api_key()
        try:
            s = stripe.checkout.Session.retrieve(session_id, expand=["subscription"])
        except Exception as e:
            logger.warning(f"Stripe subscription status lookup failed for {session_id}: {e}")
            raise HTTPException(404, "Session not found at Stripe")
        sub = s.get("subscription")
        sub_status = sub["status"] if isinstance(sub, dict) else None  # trialing|active|past_due|canceled|...
        # For subscription sessions, "paid" means either the trial started OR first invoice succeeded.
        session_complete = s.get("status") == "complete"
        is_active = sub_status in ("trialing", "active")
        if session_complete and is_active and txn.get("payment_status") != "paid":
            await db.payment_transactions.update_one(
                {"session_id": session_id},
                {"$set": {
                    "payment_status": "paid", "status": "complete",
                    "stripe_subscription_id": (sub.get("id") if isinstance(sub, dict) else None),
                    "stripe_subscription_status": sub_status,
                    "completed_at": now_utc().isoformat(),
                }},
            )
            await _fulfill_payment(await db.payment_transactions.find_one({"session_id": session_id}))
        return {
            "status": s.get("status", "open"),
            "payment_status": "paid" if (session_complete and is_active) else "pending",
            "subscription_status": sub_status,
            "amount_total": s.get("amount_total", 0),
            "currency": s.get("currency", txn.get("currency", "usd")),
            "metadata": s.get("metadata", {}) or {},
        }

    try:
        status = await asyncio.to_thread(stripe.checkout.Session.retrieve, session_id, api_key=await _stripe_api_key())
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Stripe status lookup failed for {session_id}: {e}")
        raise HTTPException(404, "Session not found at Stripe")
    if status.payment_status == "paid" and (txn.get("payment_status") != "paid" or ((txn.get("access_snapshot") or txn.get("item_type") == "private_session") and not txn.get("fulfilled_at"))):
        _validate_paid_session(txn, status)
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {"payment_status": status.payment_status, "status": status.status, "completed_at": now_utc().isoformat()}},
        )
        await _fulfill_payment(txn)
    else:
        await db.payment_transactions.update_one(
            {"session_id": session_id}, {"$set": {"payment_status": status.payment_status, "status": status.status}},
        )
    return {
        "status": status.status, "payment_status": status.payment_status,
        "amount_total": status.amount_total, "currency": status.currency, "metadata": dict(status.metadata or {}),
    }


async def _receipt_description(txn: dict) -> str:
    it = txn.get("item_type"); iid = txn.get("item_id")
    if it == "membership":
        plan = await db.membership_plans.find_one({"id": iid})
        tier = ((plan or {}).get("tier") or "").replace("_", " ")
        return f"{tier.title()} membership".strip() or "Membership"
    if it == "program":
        prog = await db.programs.find_one({"id": iid})
        return f"Program — {(prog or {}).get('title', 'Program')}"
    if it in ("product", "cart"):
        return "Shop order"
    if it == "workshop_deposit":
        return "Workshop / retreat deposit"
    if it == "workshop_balance":
        return "Workshop / retreat balance"
    if it == "drop_in":
        return "Drop-in class"
    if it == "class_pack":
        return "Class pack (5 classes)"
    if it == "private_session":
        return "Private session with Tony"
    return "Tony Yoga purchase"


async def _send_receipt(txn: dict):
    """Best-effort branded receipt email after a successful payment."""
    try:
        user = await db.users.find_one({"id": txn.get("user_id")})
        if not user or not user.get("email"):
            return
        from email_service import send_payment_receipt
        desc = await _receipt_description(txn)
        await send_payment_receipt(
            user["email"], desc, float(txn.get("amount", 0)),
            txn.get("currency", "usd"), txn.get("session_id"),
        )
    except Exception as e:
        logger.warning(f"receipt email skipped: {e}")


async def _fulfill_payment(txn: dict):
    if txn.get("access_snapshot"):
        # Retry-safe even if a previous webhook marked paid before fulfillment failed.
        await fulfill_access(txn)
        return
    if txn.get("item_type") == "private_session" and txn.get("fulfilled_at"):
        return
    item_type = txn["item_type"]; item_id = txn["item_id"]; user_id = txn["user_id"]
    delivery_id = "payment:" + str(txn["id"])
    paid_at = txn.get("completed_at") or txn.get("created_at") or now_utc().isoformat()
    # Safety: if the abandonment sweeper already refunded this txn's reserved credit
    # but the gateway payment landed late, re-consume that credit so it isn't double-spent.
    if txn.get("credit_released") and (txn.get("credit_applied") or 0) > 0:
        await db.users.update_one({"id": user_id}, {"$inc": {"store_credit": -round(float(txn["credit_applied"]), 2)}})
        await db.payment_transactions.update_one({"id": txn.get("id")}, {"$set": {"credit_released": False}})
    if item_type == "membership":
        plan = await db.membership_plans.find_one({"id": item_id})
        if not plan: return
        days_per_cycle = {"weekly": 7, "monthly": 30, "quarterly": 90, "yearly": 365}.get(plan["billing_cycle"], 30)
        trial_days = int(txn.get("trial_days") or plan.get("trial_days") or 0)
        is_trialing = txn.get("stripe_subscription_status") == "trialing"
        now = datetime.fromisoformat(paid_at.replace("Z", "+00:00"))
        # For trialing subs, end_date = now + trial; otherwise = now + full billing cycle.
        period_days = trial_days if is_trialing else days_per_cycle
        end_date = now + timedelta(days=period_days)
        # Referral reward (only when actual money has moved → skip if still in trial)
        if not is_trialing:
            user = await db.users.find_one({"id": user_id})
            if user and user.get("referred_by"):
                ref = await db.referrals.find_one({
                    "referrer_id": user["referred_by"], "referred_user_id": user_id, "reward_granted": False,
                })
                if ref:
                    referrer_sub = await db.subscriptions.find_one({"user_id": user["referred_by"], "status": "active", "source": {"$ne": "apple_iap"}})
                    if referrer_sub:
                        end = datetime.fromisoformat(referrer_sub["end_date"]) + timedelta(days=30)
                        next_bill = datetime.fromisoformat(referrer_sub["next_billing_date"]) + timedelta(days=30)
                        await db.subscriptions.update_one(
                            {"id": referrer_sub["id"]},
                            {"$set": {"end_date": end.isoformat(), "next_billing_date": next_bill.isoformat()}},
                        )
                    else:
                        await db.referral_credits.insert_one({
                            "id": gen_id(), "user_id": user["referred_by"],
                            "days": 30, "active": True, "created_at": now_utc().isoformat(),
                        })
                    await db.referrals.update_one(
                        {"id": ref["id"]},
                        {"$set": {"status": "converted", "reward_granted": True, "converted_at": now_utc().isoformat()}},
                    )
        await db.subscriptions.update_one(
            {"_id": delivery_id},
            {"$set": {
                "id": delivery_id, "user_id": user_id, "plan_id": item_id,
                "status": "trialing" if is_trialing else "active",
                "stripe_subscription_id": txn.get("stripe_subscription_id"),
                "start_date": now.isoformat(),
                "end_date": end_date.isoformat(),
                "next_billing_date": end_date.isoformat(),
                "trial_end_date": (now + timedelta(days=trial_days)).isoformat() if trial_days > 0 else None,
            }},
            upsert=True,
        )
    elif item_type == "program":
        await db.program_purchases.update_one({"_id": delivery_id}, {"$setOnInsert": {
            "id": delivery_id, "user_id": user_id, "program_id": item_id,
            "purchased_at": paid_at,
        }}, upsert=True)
        # Enrollment record drives access checks + drip start date.
        await db.program_enrollments.update_one(
            {"user_id": user_id, "program_id": item_id},
            {"$setOnInsert": {"id": gen_id(), "user_id": user_id, "program_id": item_id,
                              "source": "purchase", "created_at": now_utc().isoformat()}},
            upsert=True,
        )
    elif item_type == "bundle":
        bundle = await db.bundles.find_one({"id": item_id}, {"_id": 0})
        for pid in (bundle or {}).get("program_ids", []):
            await db.program_enrollments.update_one(
                {"user_id": user_id, "program_id": pid},
                {"$setOnInsert": {"id": gen_id(), "user_id": user_id, "program_id": pid,
                                  "source": "bundle", "bundle_id": item_id, "created_at": now_utc().isoformat()}},
                upsert=True,
            )
    elif item_type == "product":
        # Decrement stock (physical only) and create a paid order.
        prod = await db.products.find_one({"id": item_id}, {"_id": 0})
        if prod and prod.get("type") != "ebook":
            await db.products.update_one({"id": item_id, "fulfilled_order_markers": {"$ne": delivery_id}},
                {"$inc": {"stock_qty": -int(txn.get("quantity", 1))}, "$addToSet": {"fulfilled_order_markers": delivery_id}})
        await db.orders.update_one({"_id": delivery_id}, {"$setOnInsert": {
            "id": delivery_id, "user_id": user_id,
            "items": [{"product_id": item_id, "quantity": txn.get("quantity", 1),
                       "title": (prod or {}).get("title")}],
            "total": txn["amount"], "currency": txn["currency"],
            "status": "paid", "created_at": paid_at,
        }}, upsert=True)
    elif item_type == "cart":
        # Mark the existing order as paid + decrement inventory for each line item.
        order_id = txn.get("metadata", {}).get("order_id") or txn.get("item_id")
        if order_id:
            order = await db.orders.find_one({"id": order_id})
            if order:
                for line in order.get("items", []):
                    pid = line.get("product_id"); qty = int(line.get("quantity", 1))
                    if pid:
                        prod = await db.products.find_one({"id": pid}, {"_id": 0, "type": 1})
                        if not prod or prod.get("type") != "ebook":
                            marker = f"cart:{order_id}:{pid}"
                            # Aggregate variants of the same product; the product write is atomic.
                            product_qty = sum(int(x.get("quantity", 1)) for x in order.get("items", []) if x.get("product_id") == pid)
                            await db.products.update_one(
                                {"id": pid, "fulfilled_order_markers": {"$ne": marker}},
                                {"$inc": {"stock_qty": -product_qty}, "$addToSet": {"fulfilled_order_markers": marker}})
                await db.orders.update_one(
                    {"id": order_id},
                    {"$set": {"status": "paid", "paid_at": now_utc().isoformat()}},
                )
                # Part B: push paid cart order to Printful for POD fulfillment (best-effort).
                try:
                    from routers.printful import try_auto_fulfill_order
                    await try_auto_fulfill_order(order_id)
                except Exception as e:
                    logger.warning(f"printful auto-fulfill hook failed for {order_id}: {e}")
    elif item_type == "workshop_deposit":
        reservation_id = txn.get("metadata", {}).get("reservation_id") or txn.get("item_id")
        if reservation_id:
            await db.workshop_registrations.update_one(
                {"id": reservation_id, "status": {"$nin": ["paid_in_full", "cancelled"]}},
                {"$set": {"status": "deposit_paid", "deposit_paid_at": now_utc().isoformat()}},
            )
            try:
                reg = await db.workshop_registrations.find_one({"id": reservation_id}, {"_id": 0})
                if reg:
                    from email_service import send_retreat_booking
                    await send_retreat_booking(reg, "deposit")
            except Exception as e:
                logger.warning(f"retreat deposit email failed for {reservation_id}: {e}")
    elif item_type == "workshop_balance":
        reservation_id = txn.get("metadata", {}).get("reservation_id") or txn.get("item_id")
        if reservation_id:
            await db.workshop_registrations.update_one(
                {"id": reservation_id},
                {"$set": {"status": "paid_in_full", "balance_paid_at": now_utc().isoformat()}},
            )
            try:
                reg = await db.workshop_registrations.find_one({"id": reservation_id}, {"_id": 0})
                if reg:
                    from email_service import send_retreat_booking
                    await send_retreat_booking(reg, "balance")
            except Exception as e:
                logger.warning(f"retreat balance email failed for {reservation_id}: {e}")
    elif item_type == "teacher_training":
        t = TEACHER_TRAINING_CATALOG.get(item_id, {})
        await db.teacher_training_registrations.update_one({"_id": delivery_id}, {"$setOnInsert": {
            "id": delivery_id, "user_id": user_id, "user_email": txn.get("user_email"),
            "training_id": item_id, "training_name": t.get("name"),
            "dates": t.get("dates"), "amount": txn.get("amount"), "currency": txn.get("currency", "eur"),
            "status": "confirmed", "created_at": paid_at,
        }}, upsert=True)
    elif item_type in ("drop_in", "class_pack"):
        credits = 1 if item_type == "drop_in" else 5
        await db.class_passes.update_one(
            {"_id": delivery_id},
            {"$setOnInsert": {"id": delivery_id, "user_id": user_id, "active": True,
                "remaining": credits, "created_at": paid_at}},
            upsert=True,
        )
    elif item_type == "private_session":
        qty = int(txn.get("quantity", 1))
        now_iso = now_utc().isoformat()
        req = await db.private_session_requests.find_one({"id": item_id, "user_id": user_id}, {"_id": 0})
        if not req:
            raise HTTPException(409, "Private session booking could not be matched.")
        if req.get("paid_transaction_id") not in (None, txn["id"]):
            raise HTTPException(409, "This request already has a different payment. Contact support.")
        if req.get("selected_slots"):
            from routers.availability import confirm_request_slots
            await confirm_request_slots(req)
        if req.get("status") in ("pending_payment", "cancelled") and not req.get("paid_transaction_id"):
            await db.private_session_requests.update_one({"id": item_id, "user_id": user_id, "status": {"$in": ["pending_payment", "cancelled"]}}, {"$set": {
                "status": "paid", "sessions_total": qty, "sessions_paid": qty,
                "amount": txn.get("amount"), "currency": txn.get("currency", "eur"),
                "paid_at": now_iso, "paid_transaction_id": txn["id"],
            }})
        req = await db.private_session_requests.find_one({"id": item_id}, {"_id": 0})
        if req.get("paid_transaction_id") != txn["id"]:
            raise HTTPException(409, "This request already has a payment. Contact support.")
        try:
            from routers.notifications import push_admins, push_notification
            u = await db.users.find_one({"id": user_id}, {"name": 1, "email": 1})
            who = (u or {}).get("name") or txn.get("user_email") or "A member"
            plural = "s" if qty > 1 else ""
            await push_admins("New private session booked",
                              f"{who} booked {qty} private session{plural}. Schedule it now.",
                              "/admin?tab=private", dedupe_key=f"private-paid-{item_id}")
            await push_notification(user_id, "Private session confirmed",
                                    f"You booked {qty} private session{plural} with Tony. He'll follow up with times shortly.",
                                    "/private-sessions", dedupe_key=f"private-paid-{item_id}-{user_id}")
        except Exception as e:
            logger.warning(f"private session notify failed: {e}")
            raise
        await db.payment_transactions.update_one({"id": txn["id"]}, {"$set": {"fulfilled_at": now_iso}})
        return

    # Branded receipt (best-effort, respects the SMTP enable toggle).
    await _send_receipt(txn)


@api.post("/admin/stripe/connect")
async def stripe_connect(payload: dict, request: Request):
    """Save & Verify Stripe in one step. Accepts {secret_key, publishable_key?, webhook_secret?, enabled?}.
    Blank fields keep the currently-saved value. Verifies the key with a read-only Balance call
    and AUTO-DETECTS test vs live, so the admin never has to pick a mode."""
    from core import require_role
    admin = await require_role(request, ["admin"])
    from routers.settings import save_settings
    update = {}
    for field in ("secret_key", "publishable_key", "webhook_secret"):
        value = payload.get(field)
        if isinstance(value, str) and value.strip() and not value.startswith("•"):
            update[f"stripe_{field}"] = value.strip()
    # Include the effective key so re-verification works even with blank inputs.
    update.setdefault("stripe_secret_key", await _stripe_api_key())
    update["stripe_enabled"] = payload.get("enabled") is True
    await save_settings(update, admin)
    mode = await get_setting("stripe_mode")
    return {"ok": True, "mode": mode, "connected": True,
            "message": f"Stripe verified ({mode}). " + ("Card payments enabled; confirm webhook delivery below." if update["stripe_enabled"] else "Card payments are off.")}


def _validate_paid_session(txn, session):
    if session.get("amount_total") != _to_minor_units(txn["amount"], txn["currency"]) or session.get("currency") != txn["currency"]:
        raise HTTPException(409, "Payment amount or currency does not match the booking.")
    metadata = session.get("metadata") or {}
    if any(metadata.get(k) != txn.get(k) for k in ("user_id", "item_id", "item_type")):
        raise HTTPException(409, "Payment details do not match the booking.")


@api.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    """Official Stripe webhook. Verifies the signature when a webhook secret is configured,
    fulfills one-time payments (checkout.session.completed), and keeps subscriptions in sync.
    Idempotent: fulfillment only runs when the transaction is not already marked paid."""
    body = await request.body()
    sig = request.headers.get("Stripe-Signature")
    stripe.api_key = await _stripe_api_key()
    webhook_secret = await get_setting("stripe_webhook_secret") or os.environ.get("STRIPE_WEBHOOK_SECRET", "")

    if webhook_secret:
        try:
            event = stripe.Webhook.construct_event(body, sig, webhook_secret)
        except Exception:
            logger.warning("Stripe webhook signature verification failed")
            raise HTTPException(400, "Invalid webhook signature")
    else:
        raise HTTPException(503, "Stripe webhook signing secret is not configured.")

    mode = await get_setting("stripe_mode")
    if bool(event.get("livemode")) != (mode == "live"):
        raise HTTPException(400, "Webhook mode does not match configured Stripe mode.")
    await db.app_settings.update_one({"_id": "global"}, {"$set": {"stripe_webhook_received_at": now_utc().isoformat()}})

    etype = event.get("type") if isinstance(event, dict) else event["type"]
    obj = (event.get("data", {}) or {}).get("object", {}) if isinstance(event, dict) else event["data"]["object"]

    try:
        # One-time payment completion (idempotent fulfillment).
        if etype in ("checkout.session.completed", "checkout.session.async_payment_succeeded"):
            session_id = obj.get("id")
            paid = obj.get("payment_status") == "paid"
            if session_id and paid:
                txn = await db.payment_transactions.find_one({"session_id": session_id})
                if txn and (txn.get("payment_status") != "paid" or ((txn.get("access_snapshot") or txn.get("item_type") == "private_session") and not txn.get("fulfilled_at"))):
                    _validate_paid_session(txn, obj)
                    await db.payment_transactions.update_one(
                        {"session_id": session_id},
                        {"$set": {"payment_status": "paid", "status": "complete", "completed_at": now_utc().isoformat()}},
                    )
                    await _fulfill_payment(txn)
                    await db.app_settings.update_one({"_id": "global"}, {"$set": {"stripe_webhook_verified_at": now_utc().isoformat()}})

        # Subscription lifecycle sync (trial → active, renewals, cancellations).
        elif etype in ("customer.subscription.updated", "customer.subscription.created", "customer.subscription.deleted"):
            sub = obj
            sub_id = sub.get("id")
            sub_status = sub.get("status")  # trialing | active | past_due | canceled | unpaid
            current_period_end = sub.get("current_period_end")  # unix ts
            update = {"status": sub_status if sub_status in ("trialing", "active") else "cancelled"}
            if current_period_end:
                end_iso = datetime.fromtimestamp(current_period_end).isoformat()
                update["end_date"] = end_iso
                update["next_billing_date"] = end_iso
            await db.subscriptions.update_many({"stripe_subscription_id": sub_id}, {"$set": update})
            logger.info(f"Subscription {sub_id} synced → {sub_status}")
    except Exception as e:
        logger.exception(f"Webhook handling error for {etype}: {e}")
        raise HTTPException(400, "Webhook handling failed")

    return {"received": True}
