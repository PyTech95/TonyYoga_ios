"""FIX #1b — verify release_stranded_credit_tick imports and runs without error,
and actually releases credit for an aged 'initiated' txn (we backdate created_at)."""
import asyncio
import os
import sys

sys.path.insert(0, "/app/backend")


async def main():
    from routers.payments import release_stranded_credit_tick, db
    from datetime import datetime, timezone, timedelta

    # 1. Plain run: must not raise.
    await release_stranded_credit_tick()
    print("PASS: release_stranded_credit_tick() ran with no error")

    # 2. Functional: seed a fake aged initiated txn with credit_applied.
    uid = "TEST_it48_sweeper_user"
    await db.users.delete_many({"id": uid})
    await db.users.insert_one({"id": uid, "email": "TEST_sweeper@demo.test", "store_credit": 10.0})
    old = (datetime.now(timezone.utc) - timedelta(minutes=60)).isoformat()
    txn_id = "TEST_it48_sweeper_txn"
    await db.payment_transactions.delete_many({"id": txn_id})
    await db.payment_transactions.insert_one({
        "id": txn_id, "session_id": "TEST_it48_sweeper_sess", "user_id": uid,
        "payment_status": "initiated", "status": "open", "credit_applied": 25.0,
        "created_at": old,
    })
    await release_stranded_credit_tick()
    u = await db.users.find_one({"id": uid}, {"_id": 0, "store_credit": 1})
    t = await db.payment_transactions.find_one({"id": txn_id}, {"_id": 0})
    ok = round(u["store_credit"], 2) == 35.0 and t.get("credit_released") is True and t.get("status") == "expired"
    print(f"{'PASS' if ok else 'FAIL'}: sweeper released credit -> balance={u['store_credit']}, "
          f"credit_released={t.get('credit_released')}, status={t.get('status')}")

    # 3. Idempotency: second run must not double-credit.
    await release_stranded_credit_tick()
    u2 = await db.users.find_one({"id": uid}, {"_id": 0, "store_credit": 1})
    print(f"{'PASS' if round(u2['store_credit'],2) == 35.0 else 'FAIL'}: sweeper idempotent -> {u2['store_credit']}")

    # cleanup
    await db.users.delete_many({"id": uid})
    await db.payment_transactions.delete_many({"id": txn_id})
    print("cleanup done")


asyncio.run(main())
