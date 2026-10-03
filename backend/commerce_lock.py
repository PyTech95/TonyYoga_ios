"""Bounded cross-worker delivery serialization on standalone MongoDB.
The lease is not a payment proof; use it only after gateway verification. Idempotent
individual writes make recovery safe if a worker dies between operations.
"""
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException

@asynccontextmanager
async def delivery_lock(db, key):
    from pymongo import ReturnDocument
    from pymongo.errors import DuplicateKeyError
    token = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    try:
        await db.commerce_delivery_locks.update_one({"_id": key}, {"$setOnInsert": {"lease_until": now}}, upsert=True)
    except DuplicateKeyError:
        pass
    row = await db.commerce_delivery_locks.find_one_and_update(
        {"_id": key, "lease_until": {"$lte": now}},
        {"$set": {"lease_token": token, "lease_until": now + timedelta(minutes=5)}},
        return_document=ReturnDocument.AFTER)
    if not row:
        raise HTTPException(503, "Payment verification is already running. Retry in a few seconds; do not pay again.")
    try:
        yield
    finally:
        await db.commerce_delivery_locks.update_one(
            {"_id": key, "lease_token": token},
            {"$set": {"lease_until": datetime.now(timezone.utc)}, "$unset": {"lease_token": ""}})
