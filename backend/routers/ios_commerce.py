"""Additive Apple StoreKit 2 / approved external-checkout API on the SAME TonYoga VPS.

No .p8 is accepted from an app. No client success flag grants access. Transactions are
verified using Apple's server library + Apple root certificates; delivery is replay-safe.
All new Apple collections are separate; existing PayPal/Printful routes stay in place.
"""
import asyncio
import json
import os
import uuid
from datetime import timedelta
from functools import lru_cache
from pathlib import Path

from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel, Field
from core import api, db, get_current_user, now_utc
from commerce_lock import delivery_lock
from ios_commerce_policy import APPLE_TYPES, approved_amazon_print_url, snapshot_window, utc_ms, validate_product_entry

BUNDLE_ID = "com.tonyoga.app"
WEB_ORIGIN = "https://tonyoga.com"


def config():
    if os.environ.get("IOS_COMMERCE_ENABLED", "false").lower() != "true":
        raise HTTPException(503, "iOS purchases are not configured yet. Please contact TonYoga support.")
    path = os.environ.get("IOS_COMMERCE_CATALOG_FILE", "")
    try:
        data = json.loads(Path(path).read_text())
        seen = set()
        items = set()
        for entry in data.get("digital_products", []):
            if not entry.get("enabled", False):
                continue
            validate_product_entry(entry)
            if entry["product_id"] in seen:
                raise ValueError("Duplicate App Store product ID")
            seen.add(entry["product_id"])
            item = (entry["item_type"], entry["item_id"])
            if item in items:
                raise ValueError("Use a separate TonYoga plan for each App Store offering")
            items.add(item)
        return data
    except (OSError, ValueError, TypeError) as exc:
        raise HTTPException(503, "iOS purchase configuration needs attention.") from exc


class ItemRequest(BaseModel):
    item_type: str = Field(min_length=1, max_length=50)
    item_id: str = Field(min_length=1, max_length=150)
    quantity: int = Field(default=1, ge=1, le=100)


class VerificationRequest(BaseModel):
    signed_transaction: str = Field(min_length=30, max_length=40000)


class NotificationRequest(BaseModel):
    signedPayload: str = Field(min_length=30, max_length=100000)


def unavailable(message="This offering is not available for purchase in the iPhone/iPad app."):
    return {"route": "unavailable", "message": message}


async def _catalog_match(item_type, item_id, cfg):
    target = item_id
    if item_type == "class_one_time":
        item = await db.class_instances.find_one({"id": item_id}, {"_id": 0})
        target = (item or {}).get("template_id", item_id)
    elif item_type in ("workshop_deposit", "workshop_balance"):
        reg = await db.workshop_registrations.find_one({"id": item_id}, {"_id": 0})
        target = (reg or {}).get("workshop_id", item_id)
    return next((e for e in cfg.get("digital_products", []) if e.get("enabled") and e["item_type"] == item_type and e["item_id"] == target), None)


async def _external_allowed(item_type, item_id, cfg, user=None, quote_only=False):
    if item_type == "private_session":
        if quote_only:
            return True
        row = await db.private_session_requests.find_one({"id": item_id, "user_id": user["id"]}, {"_id": 0})
        if not row:
            raise HTTPException(404, "Private booking not found.")
        # The existing private-session endpoint represents one instructor + one customer.
        return True
    if item_type == "cart":
        if quote_only and item_id == "pending":
            return True
        query = {"id": item_id}
        if user:
            query["user_id"] = user["id"]
        order = await db.orders.find_one(query, {"_id": 0})
        if not order or (not quote_only and order.get("status") != "pending"):
            return False
        for line in order.get("items", []):
            p = await db.products.find_one({"id": line.get("product_id")}, {"_id": 0})
            if not p or p.get("type") not in ("physical", "book", "printful") or p.get("ebook_file_url"):
                return False
        return bool(order.get("items"))
    if item_type in ("workshop_deposit", "workshop_balance"):
        query = {"id": item_id}
        if user:
            query["user_id"] = user["id"]
        reg = await db.workshop_registrations.find_one(query, {"_id": 0})
        if not reg:
            return quote_only and item_id in cfg.get("in_person_workshop_ids", [])
        if reg.get("wants_teacher_training"):
            return False
        return reg.get("workshop_id") in cfg.get("in_person_workshop_ids", [])
    if item_type == "teacher_training":
        from routers.payments import TEACHER_TRAINING_CATALOG
        entry = TEACHER_TRAINING_CATALOG.get(item_id, {})
        # Uploaded catalog bundles many online hours with residential training. Do NOT
        # re-label that hybrid package as an in-person exception.
        has_online = any("online" in str(x).lower() for x in entry.get("includes", []))
        return bool(entry) and not has_online and item_id in cfg.get("in_person_training_ids", [])
    return False


@api.get("/ios-commerce/offer")
async def offer(item_type: str, item_id: str):
    cfg = config()
    if await _external_allowed(item_type, item_id, cfg, quote_only=True):
        explanations = {
            "private_session": "A real-time private session with one instructor and one customer.",
            "cart": "Physical products delivered to your shipping address.",
            "teacher_training": "In-person training at a physical venue, without a digital-content bundle.",
        }
        return {"route": "external", "explanation": explanations.get(item_type, "An in-person workshop/retreat at a physical venue.")}
    entry = await _catalog_match(item_type, item_id, cfg)
    if not entry:
        return unavailable()
    return {"route": "iap", **{k: entry[k] for k in ("product_id", "apple_type", "description")}}


@api.get("/ios-commerce/amazon/{product_id}")
async def amazon_print_link(product_id: str):
    cfg = config()
    item = await db.products.find_one({"id": product_id, "type": "book"}, {"_id": 0})
    if not item or product_id not in cfg.get("amazon_print_product_ids", []):
        raise HTTPException(409, "A verified physical-book destination has not been configured.")
    url = item.get("external_amazon_link", "")
    if not approved_amazon_print_url(url):
        raise HTTPException(409, "This link is not a verified physical-book destination.")
    return {"url": url}


async def _snapshot(item, entry, user):
    from routers.payments import _resolve_price
    amount, currency, meta = await _resolve_price(item.item_type, item.item_id, 1, user["id"])
    snap = {"item_type": item.item_type, "item_id": item.item_id, "apple_type": entry["apple_type"],
            "description": entry["description"], "duration_days": entry.get("duration_days"),
            "amount": amount, "currency": currency, "subscription_group_id": entry.get("subscription_group_id")}
    if item.item_type == "product":
        product = await db.products.find_one({"id": item.item_id, "type": "ebook"}, {"_id": 0})
        if not product:
            raise HTTPException(409, "Only digital books use this App Store product.")
        snap["title"] = product["title"]
    if item.item_type == "membership":
        plan = await db.membership_plans.find_one({"id": item.item_id}, {"_id": 0})
        snap["plan"] = {k: plan.get(k) for k in ("name", "billing_cycle", "tier")}
    if item.item_type in ("drop_in", "class_pack"):
        from routers.passes import PASS_CATALOG
        snap["credits"] = PASS_CATALOG[item.item_type]["credits"]
    if item.item_type in ("workshop_deposit", "workshop_balance"):
        reg = await db.workshop_registrations.find_one({"id": item.item_id, "user_id": user["id"]}, {"_id": 0})
        if not reg:
            raise HTTPException(403, "Reservation is not owned by this account.")
    grants = (meta.get("_access_snapshot") or {}).get("grants", [])
    for grant in grants:
        source_term = {}
        if grant["kind"] == "program":
            source = await db.programs.find_one({"id": grant["target_id"]}, {"_id": 0}) or {}
            source_term = source.get("access_term") or {"mode": "rolling", "duration_days": 30}
        elif grant["kind"] == "class_template":
            source = await db.class_templates.find_one({"id": grant["target_id"]}, {"_id": 0}) or {}
            source_term = (source.get("purchase_options") or {}).get("term") or {"mode": "rolling", "duration_days": 30}
        if source_term.get("mode", "rolling") == "rolling" and grant["kind"] != "class_instance":
            days = int(source_term.get("duration_days", 30))
            if entry["apple_type"] == "nonRenewable" and days != int(entry["duration_days"]):
                raise HTTPException(409, "Course duration and App Store catalog do not match. Contact support.")
            grant["duration_seconds"] = days * 86400
        if entry["apple_type"] == "autoRenewable" and source_term.get("mode") == "fixed":
            raise HTTPException(409, "A dated class/course window cannot be sold as an auto-renewing subscription.")
    snap["grants"] = grants
    return snap


@api.post("/ios-commerce/prepare")
async def prepare(item: ItemRequest, user=Depends(get_current_user)):
    cfg = config()
    if user.get("role") in ("admin", "instructor"):
        raise HTTPException(403, "Staff accounts cannot make purchases.")
    if item.quantity != 1:
        raise HTTPException(422, "Choose one App Store purchase at a time.")
    entry = await _catalog_match(item.item_type, item.item_id, cfg)
    if not entry:
        raise HTTPException(409, "No App Store product is available for this item.")
    snap = await _snapshot(item, entry, user)
    token = str(uuid.uuid4())
    # This random Apple account token maps only to the signed-in user and this exact
    # server-snapshotted purchase. No bearer token/email is given to Apple.
    await db.ios_purchase_intents.insert_one({"_id": token, "user_id": user["id"],
        "product_id": entry["product_id"], "snapshot": snap, "created_at": now_utc().isoformat()})
    return {"product_id": entry["product_id"], "apple_type": entry["apple_type"], "app_account_token": token}


@lru_cache(maxsize=1)
def _verifiers():
    # Dependency is loaded lazily: missing Apple setup must never stop the existing API.
    try:
        from appstoreserverlibrary.signed_data_verifier import SignedDataVerifier
        from appstoreserverlibrary.models.Environment import Environment
        directory = Path(os.environ["IOS_APPLE_ROOT_CERTS_DIR"])
        roots = [p.read_bytes() for p in directory.glob("*.cer")]
        if not roots:
            raise ValueError("No Apple roots installed")
        app_id = int(os.environ["IOS_APPLE_APP_ID"])
        result = [("Production", SignedDataVerifier(roots, True, Environment.PRODUCTION, BUNDLE_ID, app_id))]
        if os.environ.get("IOS_IAP_ALLOW_SANDBOX", "false").lower() == "true":
            result.append(("Sandbox", SignedDataVerifier(roots, True, Environment.SANDBOX, BUNDLE_ID, app_id)))
        return result
    except (ImportError, KeyError, ValueError, OSError) as exc:
        raise HTTPException(503, "Apple purchase verification is not configured. Your transaction remains pending.") from exc


async def verified_payload(jws, notification=False):
    config()
    for environment, verifier in _verifiers():
        try:
            method = verifier.verify_and_decode_notification if notification else verifier.verify_and_decode_signed_transaction
            return environment, await asyncio.to_thread(method, jws)
        except Exception:
            continue
    raise HTTPException(400, "Apple's signed transaction could not be verified.")


def _value(value):
    return getattr(value, "value", value)


async def _deliver(environment, tx, requested_user=None, refund_reversed=False):
    if not str(getattr(tx, "transactionId", "") or "").isdigit():
        raise HTTPException(400, "Invalid Apple transaction identifier.")
    async with delivery_lock(db, f"apple:{environment}:{tx.transactionId}"):
        return await _deliver_locked(environment, tx, requested_user, refund_reversed)


async def _replacement_subscription_snapshot(entry):
    """Apple Settings may switch a subscription within its configured group.
    Rebuild a snapshot only for supported recurring offerings, never arbitrary products.
    """
    kind, ident = entry["item_type"], entry["item_id"]
    snap = {"item_type": kind, "item_id": ident, "apple_type": "autoRenewable", "grants": [],
            "description": entry["description"], "subscription_group_id": entry["subscription_group_id"]}
    if kind == "membership":
        if not await db.membership_plans.find_one({"id": ident}):
            raise HTTPException(409, "Subscription plan was not found. Contact support.")
    elif kind in ("program", "class_subscription"):
        coll = db.programs if kind == "program" else db.class_templates
        row = await coll.find_one({"id": ident}, {"_id": 0})
        if not row:
            raise HTTPException(409, "Subscribed content was not found. Contact support.")
        term = row.get("access_term") if kind == "program" else (row.get("purchase_options") or {}).get("term")
        if (term or {}).get("mode") == "fixed":
            raise HTTPException(409, "A fixed-date offer cannot use this recurring subscription.")
        snap["grants"] = [{"kind": "program" if kind == "program" else "class_template", "target_id": ident,
                          "title": row.get("title", entry["description"]),
                          "return_path": f"/programs/{ident}" if kind == "program" else "/schedule"}]
    else:
        raise HTTPException(400, "Unsupported subscription change.")
    return snap


async def _deliver_locked(environment, tx, requested_user=None, refund_reversed=False):
    cfg = config()
    token = str(getattr(tx, "appAccountToken", "") or "").lower()
    intent = await db.ios_purchase_intents.find_one({"_id": token})
    if not intent:
        raise HTTPException(409, "This purchase is not associated with a TonYoga checkout. Contact support.")
    if requested_user and requested_user["id"] != intent["user_id"]:
        raise HTTPException(403, "Sign in to the TonYoga account used for this purchase.")
    user = await db.users.find_one({"id": intent["user_id"]}, {"_id": 0})
    if not user or user.get("active") is False:
        raise HTTPException(409, "The account is inactive. Contact support before restoring purchases.")
    if environment == "Sandbox":
        approved = {x.lower() for x in cfg.get("sandbox_user_emails", [])}
        if user.get("email", "").lower() not in approved:
            raise HTTPException(403, "This account is not enabled for sandbox/TestFlight purchases.")
    snap = intent["snapshot"]
    if tx.productId != intent["product_id"]:
        entry = next((p for p in cfg.get("digital_products", []) if p.get("enabled") and p["product_id"] == tx.productId), None)
        expected_group = str(snap.get("subscription_group_id", ""))
        actual_group = str(getattr(tx, "subscriptionGroupIdentifier", "") or "")
        if not (entry and entry["apple_type"] == snap["apple_type"] == "autoRenewable"
                and expected_group and actual_group == expected_group == str(entry.get("subscription_group_id", ""))):
            raise HTTPException(400, "Apple product is not associated with this checkout or subscription group.")
        snap = await _replacement_subscription_snapshot(entry)
    if tx.bundleId != BUNDLE_ID or _value(tx.type) != APPLE_TYPES[snap["apple_type"]]:
        raise HTTPException(400, "Apple product, application, or purchase type does not match.")
    if getattr(tx, "quantity", 1) not in (None, 1):
        raise HTTPException(400, "Unsupported purchase quantity.")
    purchased = utc_ms(tx.purchaseDate)
    if purchased > now_utc() + timedelta(minutes=5):
        raise HTTPException(400, "Purchase timestamp is in the future.")
    expires = utc_ms(tx.expiresDate) if getattr(tx, "expiresDate", None) else None
    if snap["apple_type"] == "autoRenewable" and (not expires or expires <= purchased):
        raise HTTPException(400, "Subscription expiry is missing or invalid.")
    tid = f"apple:{environment}:{tx.transactionId}"
    previous = await db.ios_transactions.find_one({"_id": tid})
    if previous and previous["user_id"] != user["id"]:
        raise HTTPException(403, "Transaction already belongs to another account.")
    revoked = bool(getattr(tx, "revocationDate", None))
    if previous and previous.get("revoked") and not refund_reversed:
        revoked = True  # A stale JWS or Restore request must never undo a known refund.
    signed_date = int(getattr(tx, "signedDate", 0) or 0)
    if previous and previous.get("delivered_at") and previous.get("signed_date", 0) > signed_date:
        return {"finish": True, "transaction_id": str(tx.transactionId), "revoked": bool(previous.get("revoked")), "stale": True}
    superseded = bool(getattr(tx, "isUpgraded", False)) or bool((previous or {}).get("superseded"))
    inactive = revoked or superseded
    row = {"user_id": user["id"], "transaction_id": str(tx.transactionId),
           "original_transaction_id": str(tx.originalTransactionId), "product_id": tx.productId,
           "intent_id": token, "environment": environment, "revoked": revoked, "superseded": superseded,
           "purchased_at": purchased.isoformat(), "expires_at": expires.isoformat() if expires else None,
           "signed_date": max(signed_date, (previous or {}).get("signed_date", 0)), "updated_at": now_utc().isoformat()}
    # _id is a built-in unique index. Replayed transactions can never issue another purchase.
    await db.ios_transactions.update_one({"_id": tid}, {"$set": row}, upsert=True)
    it = snap["item_type"]
    end = expires or (purchased + timedelta(days=int(snap.get("duration_days") or 30)))
    if snap.get("grants"):
        for i, g in enumerate(snap["grants"]):
            start, grant_end = snapshot_window(g, purchased, expires)
            grant = {k: v for k, v in g.items() if k != "duration_seconds"}
            grant.update({"id": f"{tid}:{i}", "user_id": user["id"], "transaction_id": tid,
                          "source": "apple_iap", "auto_renewable": snap["apple_type"] == "autoRenewable", "created_at": purchased.isoformat(),
                          "starts_at": start.isoformat(), "ends_at": grant_end.isoformat(),
                          "revoked_at": now_utc().isoformat() if inactive else None})
            await db.access_grants.update_one({"_id": grant["id"]}, {"$set": grant}, upsert=True)
    elif it == "membership":
        row = {"id": tid, "user_id": user["id"], "plan_id": snap["item_id"], "source": "apple_iap",
               "status": "revoked" if inactive else ("active" if end > now_utc() else "expired"),
               "start_date": purchased.isoformat(), "end_date": end.isoformat(),
               "next_billing_date": end.isoformat() if snap["apple_type"] == "autoRenewable" else None,
               "auto_renewable": snap["apple_type"] == "autoRenewable",
               "apple_original_transaction_id": str(tx.originalTransactionId)}
        await db.subscriptions.update_one({"_id": tid}, {"$set": row}, upsert=True)
    elif it in ("drop_in", "class_pack"):
        await db.class_passes.update_one({"_id": tid}, {"$setOnInsert": {
            "id": tid, "user_id": user["id"], "type": it, "total": snap["credits"],
            "remaining": snap["credits"], "source": "apple_iap", "created_at": purchased.isoformat()},
            "$set": {"active": not revoked}}, upsert=True)
    elif it == "product":
        await db.orders.update_one({"_id": tid}, {"$set": {
            "id": tid, "user_id": user["id"], "source": "apple_iap",
            "items": [{"product_id": snap["item_id"], "quantity": 1, "title": snap["title"]}],
            "total": (getattr(tx, "price", 0) or 0) / 1000, "currency": getattr(tx, "currency", None) or snap["currency"],
            "status": "refunded" if revoked else "paid", "created_at": purchased.isoformat()}}, upsert=True)
    elif it in ("workshop_deposit", "workshop_balance"):
        reg_query = {"id": snap["item_id"], "user_id": user["id"]}
        if it == "workshop_deposit" and not revoked:
            reg_query["status"] = {"$nin": ["paid_in_full", "cancelled"]}
        await db.workshop_registrations.update_one(reg_query, {"$set": {
            "status": "cancelled" if revoked else ("deposit_paid" if it == "workshop_deposit" else "paid_in_full"),
            "apple_transaction_id": tid, "apple_paid_at": purchased.isoformat()}})
    else:
        raise HTTPException(409, "No fulfillment handler exists for this product.")
    await db.ios_transactions.update_one({"_id": tid}, {"$set": {"delivered_at": now_utc().isoformat()}})
    return {"finish": True, "transaction_id": str(tx.transactionId), "revoked": revoked}


@api.post("/ios-commerce/verify")
async def verify_purchase(payload: VerificationRequest, user=Depends(get_current_user)):
    environment, tx = await verified_payload(payload.signed_transaction)
    return await _deliver(environment, tx, user)


@api.post("/ios-commerce/notifications")
async def apple_notifications(payload: NotificationRequest):
    environment, note = await verified_payload(payload.signedPayload, notification=True)
    note_id = str(note.notificationUUID)
    if await db.ios_notifications.find_one({"_id": note_id, "processed": True}):
        return {"received": True}
    data = getattr(note, "data", None)
    signed = getattr(data, "signedTransactionInfo", None) if data else None
    handling_note = "no_transaction"
    if signed:
        handling_note = "delivered"
        tx_environment, tx = await verified_payload(signed)
        if environment != tx_environment:
            raise HTTPException(400, "Notification environment mismatch.")
        try:
            await _deliver(environment, tx, refund_reversed=_value(note.notificationType) == "REFUND_REVERSED")
        except HTTPException as exc:
            # Do not create accounts or grant purchases to an unknown/deleted user.
            if exc.status_code not in (403, 409):
                raise
            handling_note = "unmatched_or_inactive_account"
    await db.ios_notifications.update_one({"_id": note_id}, {"$set": {
        "processed": True, "type": str(_value(note.notificationType)), "environment": environment, "handling": handling_note,
        "processed_at": now_utc().isoformat()}}, upsert=True)
    return {"received": True}


@api.post("/ios-commerce/external-checkout")
async def external_checkout(item: ItemRequest, user=Depends(get_current_user)):
    cfg = config()
    if user.get("role") in ("admin", "instructor"):
        raise HTTPException(403, "Staff checkout is disabled.")
    if not await _external_allowed(item.item_type, item.item_id, cfg, user):
        raise HTTPException(409, "This item must use its App Store purchase option, not web checkout.")
    # Reuse working server payment and Printful fulfillment; no PayPal SDK/secret in iOS.
    from models import CheckoutRequest
    from routers.paypal import paypal_create_order
    result = await paypal_create_order(CheckoutRequest(item_type=item.item_type, item_id=item.item_id,
        quantity=item.quantity, origin_url=WEB_ORIGIN, apply_credit=False, metadata={"mobile_return": "ios"}), user)
    return {"url": result["url"], "order_id": result["order_id"]}


@api.get("/ios-commerce/external-status/{order_id}")
async def external_status(order_id: str, user=Depends(get_current_user)):
    row = await db.payment_transactions.find_one({"session_id": order_id, "provider": "paypal", "user_id": user["id"]}, {"_id": 0})
    if not row:
        raise HTTPException(404, "Checkout not found for this account.")
    status = row.get("payment_status", "pending")
    if status == "paid" and not row.get("fulfilled_at"):
        status = "processing"
    return {"status": status, "item_type": row.get("item_type")}


@api.get("/admin/ios-commerce/catalog-candidates")
async def catalog_candidates(user=Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(403, "Forbidden")
    # Read-only inventory. IDs/prices are proposals, not products registered with Apple.
    output = []
    for kind, coll in (("program", "programs"), ("membership", "membership_plans"), ("product", "products"), ("class_subscription", "class_templates")):
        for row in await db[coll].find({}, {"_id": 0}).to_list(500):
            if kind == "product" and row.get("type") != "ebook":
                continue
            output.append({"item_type": kind, "item_id": row["id"], "title": row.get("title") or row.get("name"),
                           "current_price": row.get("price"), "currency": row.get("currency"), "access_term": row.get("access_term")})
    return output


@api.get("/ios-commerce/readiness")
async def ios_readiness():
    cfg = config()
    _verifiers()
    count = sum(1 for p in cfg.get("digital_products", []) if p.get("enabled"))
    return {"ready": count > 0, "bundle_id": BUNDLE_ID, "enabled_product_count": count,
            "sandbox_enabled": os.environ.get("IOS_IAP_ALLOW_SANDBOX", "false").lower() == "true",
            "notice": "Configuration check only; physical-device StoreKit and payment tests are still required."}
