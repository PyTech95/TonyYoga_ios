"""Gift cards — admin issues codes, students redeem them into store credit.

Store credit lives on the user document (`store_credit`) and is shown in the
profile. Redemption is one-shot: a card's whole balance converts to credit and
the card is marked redeemed. (Gateway-side application of credit at checkout is
intentionally out of scope for V1 — credit is tracked and visible.)
"""
import secrets
from typing import Optional
from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel

from core import api, db, now_utc, gen_id, get_current_user, require_role


def _gen_code() -> str:
    return "GIFT-" + secrets.token_hex(4).upper()


class GiftCardCreate(BaseModel):
    amount: float
    currency: str = "eur"
    recipient_email: Optional[str] = None
    note: Optional[str] = None
    expires_at: Optional[str] = None


class RedeemIn(BaseModel):
    code: str


@api.post("/admin/gift-cards")
async def create_gift_card(payload: GiftCardCreate, request: Request):
    admin = await require_role(request, ["admin"])
    if payload.amount <= 0:
        raise HTTPException(400, "Amount must be positive")
    code = _gen_code()
    while await db.gift_cards.find_one({"code": code}):
        code = _gen_code()
    doc = {
        "id": gen_id(), "code": code,
        "amount": round(float(payload.amount), 2),
        "balance": round(float(payload.amount), 2),
        "currency": (payload.currency or "eur").lower(),
        "recipient_email": (payload.recipient_email or "").lower() or None,
        "note": payload.note, "status": "active",
        "expires_at": payload.expires_at,
        "issued_by": admin["id"], "redeemed_by": None,
        "created_at": now_utc().isoformat(),
    }
    await db.gift_cards.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/admin/gift-cards")
async def list_gift_cards(request: Request):
    await require_role(request, ["admin"])
    return await db.gift_cards.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)


@api.post("/admin/gift-cards/{code}/deactivate")
async def deactivate_gift_card(code: str, request: Request):
    await require_role(request, ["admin"])
    r = await db.gift_cards.update_one(
        {"code": code.upper(), "status": "active"}, {"$set": {"status": "disabled"}})
    if r.matched_count == 0:
        raise HTTPException(404, "No active gift card with that code")
    return {"ok": True}


@api.get("/gift-cards/check/{code}")
async def check_gift_card(code: str):
    gc = await db.gift_cards.find_one({"code": code.upper()}, {"_id": 0, "issued_by": 0, "redeemed_by": 0})
    if not gc:
        raise HTTPException(404, "Invalid gift card code")
    valid = gc.get("status") == "active" and gc.get("balance", 0) > 0
    return {"code": gc["code"], "balance": gc.get("balance", 0), "currency": gc.get("currency", "eur"),
            "valid": valid, "status": gc.get("status")}


@api.post("/gift-cards/redeem")
async def redeem_gift_card(payload: RedeemIn, user: dict = Depends(get_current_user)):
    code = payload.code.strip().upper()
    # Atomic claim: flip active->redeemed in one op so a card can't be double-spent.
    gc = await db.gift_cards.find_one_and_update(
        {"code": code, "status": "active", "balance": {"$gt": 0}},
        {"$set": {"status": "redeemed", "redeemed_by": user["id"], "redeemed_at": now_utc().isoformat()}},
    )
    if not gc:
        exists = await db.gift_cards.find_one({"code": code}, {"_id": 0, "status": 1})
        if not exists:
            raise HTTPException(404, "Invalid gift card code")
        raise HTTPException(400, "This gift card has already been used or is inactive")
    amount = round(float(gc["balance"]), 2)  # pre-update doc holds the original balance
    await db.users.update_one({"id": user["id"]}, {"$inc": {"store_credit": amount}})
    await db.gift_cards.update_one({"id": gc["id"]}, {"$set": {"balance": 0.0}})
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0, "store_credit": 1})
    return {"ok": True, "redeemed": amount, "currency": gc.get("currency", "eur"),
            "store_credit": round((fresh or {}).get("store_credit", 0) or 0, 2)}


@api.get("/me/store-credit")
async def my_store_credit(user: dict = Depends(get_current_user)):
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "store_credit": 1})
    return {"store_credit": round((u or {}).get("store_credit", 0) or 0, 2)}
