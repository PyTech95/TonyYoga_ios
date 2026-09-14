"""Short, database-backed leases for cross-worker scheduling operations."""
from contextlib import asynccontextmanager
from datetime import timedelta
from pymongo.errors import DuplicateKeyError
from fastapi import HTTPException
from core import db, gen_id, now_utc


@asynccontextmanager
async def operation_lock(name, minutes=1):
    owner = gen_id()
    try:
        claimed = await db.operation_locks.update_one(
            {"_id": name, "$or": [{"until": {"$lte": now_utc().isoformat()}}, {"until": {"$exists": False}}]},
            {"$set": {"owner": owner, "until": (now_utc() + timedelta(minutes=minutes)).isoformat()}}, upsert=True)
    except DuplicateKeyError:
        raise HTTPException(409, "Another update is in progress. Please try again shortly.")
    if not (claimed.modified_count or claimed.upserted_id):
        raise HTTPException(409, "Another update is in progress. Please try again shortly.")
    try:
        yield
    finally:
        await db.operation_locks.delete_one({"_id": name, "owner": owner})
