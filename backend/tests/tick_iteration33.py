"""Direct invocation test for send_balance_reminders_tick + playbook auth checks + cleanup."""
import asyncio
import sys
from datetime import timedelta

sys.path.insert(0, "/app/backend")

from core import db, now_utc, gen_id  # noqa
import routers.retreats as retreats  # noqa


async def main():
    results = []

    # ---- cleanup leftovers from HTTP tests ----
    r = await db.workshop_registrations.delete_many({"name": {"$regex": "^TEST QA"}})
    r2 = await db.workshops.delete_many({"title": {"$regex": "^TEST_Retreat"}})
    la = await db.login_attempts.delete_many({"identifier": {"$regex": "locktest_"}})
    print(f"cleanup: regs={r.deleted_count} workshops={r2.deleted_count} login_attempts={la.deleted_count}")

    # ---- seed a deposit_paid registration with past balance_due_date ----
    rid = gen_id()
    doc = {
        "id": rid,
        "user_id": "TEST_QA_USER",
        "workshop_id": "TEST_QA_WS",
        "workshop_title": "TEST_QA Retreat",
        "name": "TEST QA Guest",
        "email": "qa-tick@example.test",
        "total_eur": 1200.0,
        "deposit_eur": 400.0,
        "balance_eur": 800.0,
        "balance_due_date": (now_utc() - timedelta(days=2)).isoformat(),
        "status": "deposit_paid",
        "created_at": now_utc().isoformat(),
    }
    await db.workshop_registrations.insert_one(doc)

    n1 = await retreats.send_balance_reminders_tick()
    after1 = await db.workshop_registrations.find_one({"id": rid}, {"_id": 0})
    ok1 = n1 >= 1 and bool(after1.get("balance_due_now_sent_at"))
    print(f"due-now tick #1: count={n1} flag={after1.get('balance_due_now_sent_at')} -> {'PASS' if ok1 else 'FAIL'}")
    results.append(("due_now_first_run", ok1))

    n2 = await retreats.send_balance_reminders_tick()
    ok2 = n2 == 0
    print(f"due-now tick #2 (idempotency): count={n2} -> {'PASS' if ok2 else 'FAIL'}")
    results.append(("due_now_idempotent", ok2))

    await db.workshop_registrations.delete_one({"id": rid})

    # ---- 7-day-before reminder ----
    rid2 = gen_id()
    doc2 = dict(doc)
    doc2["id"] = rid2
    doc2["balance_due_date"] = (now_utc() + timedelta(days=7)).isoformat()
    await db.workshop_registrations.insert_one(doc2)
    n3 = await retreats.send_balance_reminders_tick()
    after3 = await db.workshop_registrations.find_one({"id": rid2}, {"_id": 0})
    ok3 = n3 >= 1 and bool(after3.get("balance_reminder_sent_at"))
    print(f"7-day tick #1: count={n3} flag={after3.get('balance_reminder_sent_at')} -> {'PASS' if ok3 else 'FAIL'}")
    results.append(("seven_day_first_run", ok3))
    n4 = await retreats.send_balance_reminders_tick()
    ok4 = n4 == 0
    print(f"7-day tick #2 (idempotency): count={n4} -> {'PASS' if ok4 else 'FAIL'}")
    results.append(("seven_day_idempotent", ok4))
    await db.workshop_registrations.delete_one({"id": rid2})

    # ---- playbook: bcrypt hash format ----
    admin = await db.users.find_one({"email": "tony@tonyyoga.com"})
    h = (admin or {}).get("password_hash", "")
    okb = h.startswith("$2b$")
    print(f"admin bcrypt prefix: {h[:7]} -> {'PASS' if okb else 'FAIL'}")
    results.append(("bcrypt_2b_prefix", okb))

    # ---- final leftover check ----
    left_ws = await db.workshops.count_documents({"title": {"$regex": "^TEST_"}})
    left_reg = await db.workshop_registrations.count_documents({"name": {"$regex": "^TEST QA"}})
    left_la = await db.login_attempts.count_documents({"identifier": {"$regex": "locktest_"}})
    print(f"leftovers: workshops={left_ws} regs={left_reg} login_attempts={left_la}")

    print("\nSUMMARY:", results)
    print("ALL PASS" if all(v for _, v in results) else "SOME FAILED")


asyncio.run(main())
