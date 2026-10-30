"""Stripe checkout + fulfillment + webhook."""
import os
import asyncio
from datetime import datetime, timedelta, timezone
from typing import Dict
from fastapi import Depends, HTTPException, Request

from core import api, db, logger, now_utc, gen_id, get_current_user, checkout_return_base
from models import CheckoutRequest
from routers.settings import get_setting
from access_terms import make_grant, fulfill_access, class_pricing, parse_dt, term_window, LIFETIME_END
from labels import plain, plan_name
import stripe  # official Stripe Python SDK

if os.environ.get("STRIPE_API_BASE"):  # local tests only: point the SDK at a Stripe stand-in
    stripe.api_base = os.environ["STRIPE_API_BASE"]

# Currencies Stripe treats as zero-decimal (amount is NOT multiplied by 100).
_ZERO_DECIMAL = {"bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf"}


def _to_minor_units(amount: float, currency: str) -> int:
    if (currency or "").lower() in _ZERO_DECIMAL:
        return int(round(float(amount)))
    return int(round(float(amount) * 100))


async def _create_onetime_session(*, amount, currency, success_url, cancel_url, metadata, customer_email, product_name,
                                  payee=None):
    """One-time Checkout session via the official Stripe SDK. `payee` sends the money to a
    teacher's connected Stripe account (direct charge) with an optional platform fee."""
    key = await _require_stripe_key()
    extra = {}
    if payee and payee.get("stripe_account"):
        extra["stripe_account"] = payee["stripe_account"]
        fee = float(payee.get("application_fee") or 0)
        if fee > 0:
            extra["payment_intent_data"] = {"application_fee_amount": _to_minor_units(fee, currency)}
    try:
        return await asyncio.to_thread(stripe.checkout.Session.create,
            api_key=key, **extra,
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


async def _create_subscription_session(*, user: dict, plan: dict, origin_url: str, return_query: str = "") -> dict:
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
            "plan_name": plan_name(plan),
        },
    }
    if trial_days > 0:
        subscription_data["trial_period_days"] = trial_days

    metadata = {
        "user_id": user["id"], "user_email": user["email"],
        "item_type": "membership", "item_id": plan["id"],
        "quantity": "1", "plan_name": plan_name(plan),
        "trial_days": str(trial_days),
    }
    session = stripe.checkout.Session.create(
        mode="subscription",
        customer_email=user["email"],
        line_items=[{
            "price_data": {
                "currency": currency,
                "product_data": {"name": f"{plan_name(plan)} membership — Tony Yoga"},
                "unit_amount": unit_amount,
                "recurring": recurring,
            },
            "quantity": 1,
        }],
        success_url=f"{origin_url}/checkout/success?session_id={{CHECKOUT_SESSION_ID}}{return_query}",
        cancel_url=f"{origin_url}/checkout/cancel" + (f"?{return_query.lstrip('&')}" if return_query else ""),
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
    """Public: the teacher-training tiers rendered on the /teacher-training page
    (editable in Admin → Packages & prices)."""
    from routers.cms import get_tt_catalog
    return [t for t in (await get_tt_catalog()).values() if t.get("active", True)]


async def _resolve_price(item_type: str, item_id: str, quantity: int, user_id: str = None, extra: dict = None):
    from payment_items import ITEMS, allowed_extra
    if item_type in ITEMS:
        return await ITEMS[item_type]["price"](item_id, quantity, user_id, allowed_extra(item_type, extra))
    if item_type == "teacher_training":
        from routers.cms import get_tt_catalog
        t = (await get_tt_catalog()).get(item_id)
        if not t or not t.get("active", True):
            raise HTTPException(404, "Training not found")
        return t["price"], (t.get("currency") or "eur").lower(), {"training_name": t["name"], "training_dates": t.get("dates", "")}
    if item_type == "membership":
        plan = await db.membership_plans.find_one({"id": item_id})
        if not plan or plan.get("is_active") is False: raise HTTPException(404, "Plan not found")
        return plan["price"], plan["currency"], {"plan_name": plan_name(plan), "product_name": f"{plan_name(plan)} membership — Tony Yoga"}
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
    if item_type in ("drop_in", "class_pack"):
        # Price, currency and credits come from Admin → Packages & prices (charged in
        # the currency shown to the buyer).
        from routers.cms import get_pass_catalog
        p = (await get_pass_catalog()).get(item_type)
        if not p or not p.get("active", True):
            raise HTTPException(404, "This pass is not available.")
        return p["price"], (p.get("currency") or "eur").lower(), {
            "description": p.get("title") or ("Drop-in class" if item_type == "drop_in" else "5-class pack"),
            "pass_type": item_type, "credits": str(int(p.get("credits") or (1 if item_type == "drop_in" else 5)))}
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


async def membership_switch_price(item_type: str, item_id: str, user_id: str, amount: float, meta: dict) -> float:
    """Upgrading to a pricier plan deducts the unused part of the current one; any other plan
    bought while one is running starts when it ends (recorded in the checkout metadata)."""
    if item_type != "membership" or not user_id:
        return amount
    plan = await db.membership_plans.find_one({"id": item_id}, {"_id": 0})
    if not plan:
        return amount
    from routers.selfservice import membership_switch
    sw = await membership_switch(user_id, plan)
    if sw["mode"] == "upgrade" and sw["credit"] > 0:
        meta.update(switch_mode="upgrade", switch_credit=f"{sw['credit']:.2f}", replaces_subscription_id=sw["replaces_subscription_id"])
        return round(float(sw["charge"]), 2)
    if sw["mode"] == "queued" and sw.get("starts_at"):
        meta.update(switch_mode="queued", switch_starts_at=str(sw["starts_at"]))
    return amount


def _credit_eligible(item_type: str) -> bool:
    from payment_items import ITEMS
    if item_type in ITEMS:
        return bool(ITEMS[item_type].get("credit"))
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
    return_base, return_query = checkout_return_base(payload.origin_url, payload.client)
    subs_enabled = bool(await get_setting("stripe_subscriptions_enabled"))
    if payload.item_type == "membership" and subs_enabled:
        plan = await db.membership_plans.find_one({"id": payload.item_id})
        if not plan:
            raise HTTPException(404, "Plan not found")
        try:
            session = await _create_subscription_session(user=user, plan=plan, origin_url=return_base, return_query=return_query)
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

    amount, currency, meta = await _resolve_price(payload.item_type, payload.item_id, payload.quantity, user["id"], payload.metadata)
    access_snapshot = meta.pop("_access_snapshot", None)
    payee = meta.pop("_payee", None)
    amount = await membership_switch_price(payload.item_type, payload.item_id, user["id"], amount, meta)
    if payee:
        payload.apply_credit = False  # money goes to the teacher, not to Tony Yoga

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

    success_url = f"{return_base}/checkout/success?session_id={{CHECKOUT_SESSION_ID}}{return_query}"
    cancel_url = f"{return_base}/checkout/cancel?session_id={{CHECKOUT_SESSION_ID}}{return_query}"
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
            payee=payee,
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
        **({"stripe_account": payee["stripe_account"], "application_fee": float(payee.get("application_fee") or 0),
            "payee_teacher_id": payee.get("teacher_id")} if payee and payee.get("stripe_account") else {}),
        "created_at": now_utc().isoformat(),
    })
    return {"url": session.url, "session_id": session.id}


@api.get("/checkout/status/{session_id}")
async def checkout_status(session_id: str, request: Request):
    txn = await db.payment_transactions.find_one({"session_id": session_id})
    if not txn:
        raise HTTPException(404, "Transaction not found")
    return await confirm_stripe_txn(txn)


REFUNDED = ("refunded", "partially_refunded")
SETTLED = ("paid",) + REFUNDED


async def confirm_stripe_txn(txn: dict) -> dict:
    """Ask Stripe about a checkout and fulfil it if it is paid. Safe to call many times
    (from the success page, the webhook, the automatic re-check and the admin button)."""
    session_id = txn["session_id"]
    if txn.get("payment_status") in REFUNDED:
        # Refunded by the studio: never deliver it again, whatever the checkout says.
        return {"status": "complete", "payment_status": txn["payment_status"], "amount_total": None, "currency": txn.get("currency"),
                "metadata": {}, "return_path": await purchase_link(txn)}
    # Subscription-mode sessions: query Stripe directly (retrieve + expand subscription)
    # so we can reflect trial/active status accurately.
    if txn.get("mode") == "subscription":
        stripe.api_key = await _stripe_api_key()
        try:
            s = await asyncio.to_thread(stripe.checkout.Session.retrieve, session_id, expand=["subscription"])
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
                    "stripe_customer_id": s.get("customer") if isinstance(s.get("customer"), str) else (s.get("customer") or {}).get("id"),
                    "completed_at": now_utc().isoformat(),
                }},
            )
            await _fulfill_payment(await db.payment_transactions.find_one({"session_id": session_id}))
        elif s.get("status") == "expired":
            await db.payment_transactions.update_one({"session_id": session_id, "payment_status": {"$nin": list(SETTLED)}}, {"$set": {"status": "expired"}})
        return {
            "status": s.get("status", "open"),
            "payment_status": "paid" if (session_complete and is_active) else "pending",
            "subscription_status": sub_status,
            "amount_total": s.get("amount_total", 0),
            "currency": s.get("currency", txn.get("currency", "usd")),
            "metadata": s.get("metadata", {}) or {},
            "return_path": await purchase_link(txn),
        }

    try:
        kw = {"stripe_account": txn["stripe_account"]} if txn.get("stripe_account") else {}
        status = await asyncio.to_thread(stripe.checkout.Session.retrieve, session_id, api_key=await _stripe_api_key(), **kw)
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
        await _fulfill_payment(await db.payment_transactions.find_one({"session_id": session_id}))
    else:
        await db.payment_transactions.update_one(
            {"session_id": session_id, "payment_status": {"$nin": list(SETTLED)}}, {"$set": {"payment_status": status.payment_status, "status": status.status}},
        )
    return {
        "status": status.status, "payment_status": status.payment_status,
        "amount_total": status.amount_total, "currency": status.currency, "metadata": dict(status.metadata or {}),
        "return_path": await purchase_link(txn),
    }


async def _receipt_description(txn: dict) -> str:
    it = txn.get("item_type"); iid = txn.get("item_id")
    from payment_items import ITEMS
    if it in ITEMS and ITEMS[it].get("describe"):
        return await ITEMS[it]["describe"](txn)
    if it == "membership":
        plan = await db.membership_plans.find_one({"id": iid})
        return f"{plan_name(plan)} membership"
    if it == "program":
        prog = await db.programs.find_one({"id": iid})
        return f"Course — {(prog or {}).get('title', 'Course')}"
    if it == "bundle":
        return f"Course bundle — {(txn.get('metadata') or {}).get('bundle_title') or 'Bundle'}"
    if it in ("class_one_time", "class_subscription"):
        return (txn.get("metadata") or {}).get("product_name") or "Live class"
    if it == "teacher_training":
        return (txn.get("metadata") or {}).get("training_name") or "Teacher training"
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


# Purchases whose whole delivery is the access window recorded at checkout.
_SNAPSHOT_ONLY = {"program", "bundle", "class_one_time", "class_subscription"}


async def _fulfill_payment(txn: dict):
    if txn.get("access_snapshot"):
        # Retry-safe even if a previous webhook marked paid before fulfillment failed.
        await fulfill_access(txn)
        if txn.get("item_type") in _SNAPSHOT_ONLY or not txn.get("item_type"):
            await after_payment(txn)
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
    from payment_items import ITEMS
    if item_type in ITEMS:
        await ITEMS[item_type]["fulfill"](txn)
        await after_payment(txn)
        return
    if item_type == "membership":
        plan = await db.membership_plans.find_one({"id": item_id})
        if not plan: return
        days_per_cycle = {"weekly": 7, "monthly": 30, "quarterly": 90, "yearly": 365}.get(plan["billing_cycle"], 30)
        trial_days = int(txn.get("trial_days") or plan.get("trial_days") or 0)
        is_trialing = txn.get("stripe_subscription_status") == "trialing"
        now = datetime.fromisoformat(paid_at.replace("Z", "+00:00"))
        # For trialing subs, end_date = now + trial; otherwise = now + full billing cycle.
        period_days = trial_days if is_trialing else days_per_cycle
        meta = txn.get("metadata") or {}
        existing = await db.subscriptions.find_one({"_id": delivery_id}, {"_id": 0, "start_date": 1})
        start_at = now
        if existing and existing.get("start_date"):
            start_at = parse_dt(existing["start_date"]) or now  # re-delivery keeps the original dates
        elif meta.get("switch_mode") == "queued":
            # Starts when the membership they already have ends, so no paid days are lost.
            others = await db.subscriptions.find({"user_id": user_id, "status": {"$in": ["active", "trialing"]}, "_id": {"$ne": delivery_id}},
                                                 {"_id": 0, "end_date": 1}).to_list(50)
            ends = [parse_dt(o.get("end_date")) for o in others if not str(o.get("end_date")).startswith("2099")]
            ends = [e for e in ends if e and e > now]
            if ends:
                start_at = max(ends)
        end_date = start_at + timedelta(days=period_days)
        if meta.get("switch_mode") == "upgrade" and meta.get("replaces_subscription_id"):
            old = await db.subscriptions.find_one({"id": meta["replaces_subscription_id"], "user_id": user_id, "status": {"$in": ["active", "trialing"]}},
                                                  {"_id": 0, "end_date": 1})
            if old:
                await db.subscriptions.update_one(
                    {"id": meta["replaces_subscription_id"], "user_id": user_id, "status": {"$in": ["active", "trialing"]}},
                    {"$set": {"status": "replaced", "replaced_by": delivery_id, "replaced_at": now.isoformat(), "end_date": now.isoformat(),
                              "original_end_date": old.get("end_date")}})
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
                "stripe_customer_id": txn.get("stripe_customer_id"),
                "transaction_id": txn.get("id"),
                "start_date": start_at.isoformat(),
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
                if order.get("status") in (None, "pending"):
                    await db.orders.update_one(
                        {"id": order_id},
                        {"$set": {"status": "paid", "paid_at": now_utc().isoformat()},
                         "$push": {"status_history": {"status": "paid", "at": now_utc().isoformat(), "by": "payment"}}},
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
        from routers.cms import get_tt_catalog
        t = (await get_tt_catalog()).get(item_id) or TEACHER_TRAINING_CATALOG.get(item_id, {})
        await db.teacher_training_registrations.update_one({"_id": delivery_id}, {"$setOnInsert": {
            "id": delivery_id, "user_id": user_id, "user_email": txn.get("user_email"),
            "training_id": item_id, "training_name": t.get("name"),
            "dates": t.get("dates"), "amount": txn.get("amount"), "currency": txn.get("currency", "eur"),
            "status": "confirmed", "created_at": paid_at,
        }}, upsert=True)
        await grant_training_courses(txn, t)
    elif item_type in ("drop_in", "class_pack"):
        # Credits bought are recorded on the transaction when checkout starts.
        try:
            credits = int((txn.get("metadata") or {}).get("credits") or 0)
        except (TypeError, ValueError):
            credits = 0
        credits = credits or (1 if item_type == "drop_in" else 5)
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

    # Branded receipt + "it's ready" notification (once per payment).
    await after_payment(txn)


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


async def subscription_invoice_event(sub_id: str, failed: bool, attempt: int = 1, invoice_id: str = None):
    rows = await db.subscriptions.find({"stripe_subscription_id": sub_id}, {"_id": 0}).to_list(20)
    from notify import notify_member
    for sub in rows:
        if failed:
            await db.subscriptions.update_one({"id": sub["id"], "past_due_since": {"$exists": False}},
                                              {"$set": {"past_due_since": now_utc().isoformat()}})
            await db.subscriptions.update_one({"id": sub["id"], "status": {"$in": ["active", "trialing"]}}, {"$set": {"status": "past_due"}})
            grace = int(await get_setting("past_due_grace_days") or 7)
            await notify_member(sub["user_id"], "Your card payment didn't go through",
                                f"We couldn't renew your membership. Please update your card in My Yoga within {grace} days to keep your classes and courses.",
                                "/my-yoga?fix=card", dedupe_key=f"payfail:{invoice_id or sub_id}:{attempt}",
                                email_subject="Please update your card — Tony Yoga", cta_label="Update my card")
            if attempt <= 1:
                from routers.notifications import push_admins
                plan = await db.membership_plans.find_one({"id": sub.get("plan_id")}, {"_id": 0}) or {}
                user = await db.users.find_one({"id": sub["user_id"]}, {"_id": 0, "email": 1}) or {}
                await push_admins("Card payment failed", f"{user.get('email') or 'A member'}: {plan_name(plan)} renewal failed.",
                                  "/admin?tab=students", dedupe_key=f"admin-payfail:{invoice_id or sub_id}")
        elif sub.get("status") == "past_due":
            await db.subscriptions.update_one({"id": sub["id"]}, {"$set": {"status": "active"}, "$unset": {"past_due_since": ""}})
            await notify_member(sub["user_id"], "Payment received", "Thank you, your membership is active again.", "/my-yoga",
                                email=False, dedupe_key=f"payok:{invoice_id or sub_id}")


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
                if txn and txn.get("payment_status") not in REFUNDED and (txn.get("payment_status") != "paid" or ((txn.get("access_snapshot") or txn.get("item_type") == "private_session") and not txn.get("fulfilled_at"))):
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
            current_period_end = sub.get("current_period_end") or ((sub.get("items") or {}).get("data") or [{}])[0].get("current_period_end")
            if etype == "customer.subscription.deleted" or sub_status in ("canceled", "incomplete_expired"):
                status = "cancelled"
            elif sub_status in ("past_due", "unpaid"):
                status = "past_due"
            else:
                status = sub_status if sub_status in ("trialing", "active") else "cancelled"
            update = {"status": status, "cancel_at_period_end": bool(sub.get("cancel_at_period_end"))}
            if current_period_end and status != "cancelled":
                end_iso = datetime.fromtimestamp(current_period_end, tz=timezone.utc).isoformat()
                update["end_date"] = end_iso
                update["next_billing_date"] = end_iso
            if isinstance(sub.get("customer"), str):
                update["stripe_customer_id"] = sub["customer"]
            query = {"stripe_subscription_id": sub_id}
            if sub.get("pause_collection") and status == "active":
                query["status"] = {"$ne": "paused"}  # paused by the member here; keep it paused
            if status == "past_due":
                await db.subscriptions.update_many({**query, "past_due_since": {"$exists": False}}, {"$set": {"past_due_since": now_utc().isoformat()}})
            else:
                update_unset = {"past_due_since": ""}
                await db.subscriptions.update_many(query, {"$unset": update_unset})
            await db.subscriptions.update_many(query, {"$set": update})
            logger.info(f"Subscription {sub_id} synced → {sub_status}")

        # Renewal payments: a failed card keeps access for a grace period and tells the member.
        if etype in ("invoice.payment_failed", "invoice.paid", "invoice.payment_succeeded"):
            sub_id = obj.get("subscription") or ((obj.get("parent") or {}).get("subscription_details") or {}).get("subscription")
            if sub_id:
                await subscription_invoice_event(sub_id, failed=etype == "invoice.payment_failed",
                                                 attempt=int(obj.get("attempt_count") or 1), invoice_id=obj.get("id"))
        from payment_items import STRIPE_HOOKS
        for hook in STRIPE_HOOKS:
            await hook(etype, obj)
    except Exception as e:
        logger.exception(f"Webhook handling error for {etype}: {e}")
        raise HTTPException(400, "Webhook handling failed")

    return {"received": True}


# ---------------------------------------------------------------------------
# After a payment: receipt, member notification, admin alert (exactly once)

async def training_course_ids(training: dict) -> list:
    """Courses a teacher-training package opens. Until the admin chooses, a package opens the
    course with the same Core number (core26 -> "Core 26+")."""
    if "program_ids" in (training or {}):
        return [p for p in training.get("program_ids") or [] if p]
    import re
    m = re.search(r"(\d+)", str((training or {}).get("id") or ""))
    if not m:
        return []
    rows = await db.programs.find({"title": {"$regex": rf"^\s*core\s*{m.group(1)}\b", "$options": "i"}}, {"_id": 0, "id": 1}).to_list(5)
    return [r["id"] for r in rows]


async def grant_training_courses(txn: dict, training: dict):
    ids = await training_course_ids(training)
    if not ids:
        return
    days = int((training or {}).get("access_days") or 0)
    start = now_utc()
    end = (start + timedelta(days=days)).isoformat() if days > 0 else LIFETIME_END
    for pid in ids:
        program = await db.programs.find_one({"id": pid}, {"_id": 0, "title": 1})
        if not program:
            continue
        gid = f"{txn['id']}:tt:{pid}"
        await db.access_grants.update_one({"_id": gid}, {"$setOnInsert": {
            "id": gid, "user_id": txn["user_id"], "transaction_id": txn["id"], "kind": "program",
            "target_id": pid, "title": program["title"], "starts_at": start.isoformat(), "ends_at": end,
            "source": "teacher_training", "return_path": f"/programs/{pid}", "created_at": start.isoformat(),
        }}, upsert=True)


async def purchase_link(txn: dict) -> str:
    """Where the member should land after paying for this purchase."""
    it, iid = txn.get("item_type"), txn.get("item_id")
    from payment_items import ITEMS
    if it in ITEMS and ITEMS[it].get("link"):
        return await ITEMS[it]["link"](txn)
    grants = ((txn.get("access_snapshot") or {}).get("grants") or [])
    if it == "program":
        return f"/programs/{iid}"
    if len(grants) == 1 and grants[0].get("return_path"):
        return grants[0]["return_path"]
    if it in ("product", "cart"):
        return "/my-yoga?tab=orders"
    if it in ("drop_in", "class_pack"):
        return "/schedule"
    if it == "private_session":
        return "/private-sessions"
    return "/my-yoga"


async def _paid_message(txn: dict):
    it = txn.get("item_type")
    desc = await _receipt_description(txn)
    from payment_items import ITEMS
    if it in ITEMS and ITEMS[it].get("message"):
        return await ITEMS[it]["message"](txn)
    if it == "membership":
        plan = await db.membership_plans.find_one({"id": txn.get("item_id")}, {"_id": 0}) or {}
        sub = await db.subscriptions.find_one({"user_id": txn["user_id"], "plan_id": txn.get("item_id")}, {"_id": 0}, sort=[("end_date", -1)])
        until = f" until {str((sub or {}).get('end_date') or '')[:10]}" if sub else ""
        extra = " Choose your included course in My Yoga." if int(plan.get("choose_courses") or 0) > 0 else " Everything it includes is in My Yoga."
        if (txn.get("metadata") or {}).get("switch_mode") == "queued" and sub:
            return (f"Your {plan_name(plan)} membership is booked",
                    f"Thank you! It starts on {str(sub.get('start_date'))[:10]}, when your current membership ends, and runs{until}.")
        return f"Your {plan_name(plan)} membership is active", f"Thank you! Your membership is active{until}.{extra}"
    if it in ("product", "cart"):
        return "Order received", "Thank you! We received your payment and will let you know when your order ships."
    if it == "teacher_training":
        return "You're registered", f"{desc}: your place is confirmed. Your online course is ready in My Yoga."
    if it in ("drop_in", "class_pack"):
        credits = (txn.get("metadata") or {}).get("credits") or ""
        return "Class credits added", f"{credits} class credit(s) are on your account. Book a class whenever you like."
    if it in ("workshop_deposit", "workshop_balance"):
        return "Payment received", f"{desc}: your payment is confirmed."
    return "It's ready", f"{desc} is now in your account. Enjoy your practice!"


async def after_payment(txn: dict):
    """Receipt email + bell/push notification for the member + alert for admins. Runs once per payment."""
    if not txn or not txn.get("id"):
        return
    claimed = await db.payment_transactions.update_one(
        {"id": txn["id"], "after_payment_at": {"$exists": False}}, {"$set": {"after_payment_at": now_utc().isoformat()}})
    if not claimed.modified_count:
        return
    await _send_receipt(txn)
    try:
        from notify import notify_member
        title, body = await _paid_message(txn)
        await notify_member(txn["user_id"], title, body, await purchase_link(txn), email=False,
                            dedupe_key=f"paid:{txn['id']}")
        from routers.notifications import push_admins
        amount = f"{float(txn.get('amount') or 0):.2f} {str(txn.get('currency') or '').upper()}"
        await push_admins("New payment", f"{txn.get('user_email') or 'A member'} paid {amount} — {await _receipt_description(txn)}",
                          "/admin?tab=students", dedupe_key=f"admin-paid:{txn['id']}")
    except Exception as e:
        logger.warning(f"after-payment notification failed: {e}")


# ---------------------------------------------------------------------------
# Automatic re-check of payments that were started but never confirmed
# (customer closed the page, the app didn't come back, a webhook was missed…)

_last_reconcile = {"at": 0.0}


async def reconcile_transaction(txn: dict) -> dict:
    """Check one unconfirmed card/PayPal payment with the provider and deliver it if it was paid."""
    provider = txn.get("provider") or "stripe"
    if txn.get("payment_status") in REFUNDED:
        return {"result": "refunded", "detail": "This payment was refunded."}
    if txn.get("payment_status") == "paid":
        if not txn.get("after_payment_at") and not txn.get("fulfilled_at"):
            await _fulfill_payment(txn)
            return {"result": "paid", "detail": "Payment was already confirmed; delivery repeated."}
        return {"result": "paid", "detail": "Already confirmed."}
    if provider == "stripe":
        if not _is_valid_stripe_key(await _stripe_api_key()):
            return {"result": "skipped", "detail": "Stripe is not configured."}
        res = await confirm_stripe_txn(txn)
        if res.get("payment_status") == "paid":
            return {"result": "paid", "detail": "Stripe confirms the payment; access delivered."}
        if res.get("status") == "expired":
            return {"result": "expired", "detail": "The customer never finished paying (Stripe checkout expired)."}
        return {"result": "pending", "detail": f"Stripe says: {res.get('status')} / {res.get('payment_status')}."}
    if provider == "paypal":
        from routers.paypal import reconcile_paypal_txn
        return await reconcile_paypal_txn(txn)
    return {"result": "skipped", "detail": f"{provider} payments are checked by their own system."}


async def reconcile_payments_tick(force: bool = False):
    """Every 5 minutes: re-check payments started in the last 3 days that never got confirmed."""
    import time
    if not force and time.time() - _last_reconcile["at"] < 300:
        return
    _last_reconcile["at"] = time.time()
    if await get_setting("auto_reconcile_payments") is False:
        return
    now = now_utc()
    rows = await db.payment_transactions.find({
        "payment_status": {"$nin": list(SETTLED)},
        "status": {"$nin": ["expired", "cancelled", "failed"]},
        "provider": {"$in": [None, "stripe", "paypal"]},
        "created_at": {"$gte": (now - timedelta(days=3)).isoformat(), "$lte": (now - timedelta(minutes=3)).isoformat()},
    }, {"_id": 0}).sort("created_at", -1).to_list(60)
    for txn in rows:
        try:
            result = await reconcile_transaction(txn)
            await db.payment_transactions.update_one({"id": txn["id"]}, {"$set": {
                "last_checked_at": now_utc().isoformat(), "last_check_result": result.get("detail")}})
        except Exception as e:
            logger.warning(f"payment re-check failed for {txn.get('id')}: {str(getattr(e, 'detail', e))[:200]}")
    # Older than 3 days and still unpaid: the customer abandoned it.
    await db.payment_transactions.update_many({
        "payment_status": {"$nin": list(SETTLED)}, "status": {"$nin": ["expired", "cancelled", "failed"]},
        "provider": {"$in": [None, "stripe", "paypal"]}, "created_at": {"$lt": (now - timedelta(days=3)).isoformat()},
    }, {"$set": {"status": "expired"}})
