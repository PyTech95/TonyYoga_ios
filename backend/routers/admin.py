"""Admin: users, stats, legacy imports (with SHA-256 magic-link tokens), coupons, revenue share."""
import os
import io
import csv
import secrets
from datetime import timedelta
from typing import Optional
from fastapi import HTTPException, Request, UploadFile, File, Form

from core import api, db, now_utc, gen_id, sha256_hex, require_role
from models import (
    LegacyImportRequest, LegacyImportRow, CouponCreate, RevenueShareRuleCreate,
)


# ---------- Users overview ----------
@api.get("/admin/users")
async def list_users(request: Request, role: Optional[str] = None):
    await require_role(request, ["admin", "support"])
    q = {}
    if role: q["role"] = role
    return await db.users.find(q, {"_id": 0, "password_hash": 0}).to_list(1000)


@api.get("/admin/stats")
async def admin_stats(request: Request):
    await require_role(request, ["admin"])
    user_count = await db.users.count_documents({})
    student_count = await db.users.count_documents({"role": "student"})
    instructor_count = await db.users.count_documents({"role": "instructor"})
    booking_count = await db.bookings.count_documents({"status": "confirmed"})
    active_subs = await db.subscriptions.count_documents({"status": "active"})
    paid_totals = await db.payment_transactions.aggregate([
        {"$match": {"payment_status": "paid"}},
        {"$group": {"_id": {"$toUpper": {"$ifNull": ["$currency", "eur"]}},
                    "revenue": {"$sum": "$amount"}, "transactions": {"$sum": 1}}},
    ]).to_list(None)
    revenue = sum(row["revenue"] for row in paid_totals)
    revenue_by_currency = {row["_id"]: round(row["revenue"], 2) for row in paid_totals}
    return {
        "users": user_count, "students": student_count, "instructors": instructor_count,
        "bookings": booking_count, "active_subscriptions": active_subs,
        "revenue": round(revenue, 2), "transactions": sum(row["transactions"] for row in paid_totals),
        "revenue_by_currency": revenue_by_currency,
    }


@api.get("/admin/stats/trend")
async def admin_stats_trend(request: Request):
    """Last 6 months of revenue + new members for the Admin overview chart."""
    from datetime import datetime
    await require_role(request, ["admin"])
    now = now_utc()
    y, m = now.year, now.month
    buckets = {}
    order = []
    for i in range(5, -1, -1):
        mm, yy = m - i, y
        while mm <= 0:
            mm += 12; yy -= 1
        key = f"{yy:04d}-{mm:02d}"
        order.append(key)
        buckets[key] = {"month": datetime(yy, mm, 1).strftime("%b"), "revenue": 0.0, "members": 0, "by_currency": {}}
    txns = await db.payment_transactions.find(
        {"payment_status": "paid"}, {"_id": 0, "amount": 1, "currency": 1, "completed_at": 1, "created_at": 1}
    ).to_list(None)
    for t in txns:
        ts = t.get("completed_at") or t.get("created_at") or ""
        key = ts[:7]
        if key in buckets:
            buckets[key]["revenue"] += float(t.get("amount", 0) or 0)
            currency = (t.get("currency") or "eur").upper()
            amounts = buckets[key]["by_currency"]
            amounts[currency] = round(amounts.get(currency, 0) + float(t.get("amount") or 0), 2)
    users = await db.users.find({}, {"_id": 0, "created_at": 1}).to_list(None)
    for u in users:
        key = (u.get("created_at") or "")[:7]
        if key in buckets:
            buckets[key]["members"] += 1
    trend = [{"month": buckets[k]["month"], "revenue": round(buckets[k]["revenue"], 2), "members": buckets[k]["members"], "by_currency": buckets[k]["by_currency"]} for k in order]
    return {"trend": trend}


@api.get("/admin/dashboard")
async def admin_dashboard(request: Request):
    """At-a-glance console home: today's classes, recent signups, month revenue, recent payments."""
    await require_role(request, ["admin"])
    now = now_utc()
    today = now.date().isoformat()          # YYYY-MM-DD
    month_key = now.strftime("%Y-%m")       # YYYY-MM

    # ---- Today's classes (with booked counts) ----
    instances = await db.class_instances.find(
        {"status": {"$ne": "cancelled"}},
        {"_id": 0, "id": 1, "title": 1, "start_time": 1, "capacity": 1, "location_type": 1},
    ).to_list(2000)
    todays = [c for c in instances if str(c.get("start_time", ""))[:10] == today]
    todays.sort(key=lambda c: c.get("start_time", ""))
    # Single aggregation for booked counts (avoids per-class N+1 queries)
    todays_ids = [c["id"] for c in todays]
    booked_map: dict = {}
    if todays_ids:
        agg = await db.bookings.aggregate([
            {"$match": {"class_instance_id": {"$in": todays_ids}, "status": "confirmed"}},
            {"$group": {"_id": "$class_instance_id", "n": {"$sum": 1}}},
        ]).to_list(len(todays_ids))
        booked_map = {r["_id"]: r["n"] for r in agg}
    todays_out = []
    for c in todays:
        todays_out.append({
            "id": c["id"], "title": c.get("title"), "start_time": c.get("start_time"),
            "capacity": c.get("capacity", 0), "booked": booked_map.get(c["id"], 0),
            "location_type": c.get("location_type"),
        })

    # ---- Recent signups (last 7 days) ----
    week_ago = (now - timedelta(days=7)).isoformat()
    recent_users = await db.users.find(
        {"created_at": {"$gte": week_ago}},
        {"_id": 0, "name": 1, "email": 1, "role": 1, "created_at": 1},
    ).sort("created_at", -1).to_list(50)
    signups_7d = len(recent_users)

    # ---- Revenue (this month) + recent payments ----
    paid = await db.payment_transactions.find(
        {"payment_status": "paid"},
        {"_id": 0, "amount": 1, "currency": 1, "completed_at": 1, "created_at": 1,
         "user_email": 1, "item_type": 1, "provider": 1},
    ).to_list(5000)
    month_revenue = 0.0
    for t in paid:
        ts = t.get("completed_at") or t.get("created_at") or ""
        if ts[:7] == month_key:
            month_revenue += float(t.get("amount", 0) or 0)
    paid.sort(key=lambda t: (t.get("completed_at") or t.get("created_at") or ""), reverse=True)
    recent_payments = [{
        "amount": round(float(t.get("amount", 0) or 0), 2),
        "currency": (t.get("currency") or "eur").upper(),
        "user_email": t.get("user_email"),
        "item_type": t.get("item_type"),
        "provider": t.get("provider") or "stripe",
        "at": t.get("completed_at") or t.get("created_at"),
    } for t in paid[:8]]

    return {
        "today": todays_out,
        "today_count": len(todays_out),
        "signups_7d": signups_7d,
        "recent_signups": recent_users[:8],
        "month_revenue": round(month_revenue, 2),
        "month_label": now.strftime("%B"),
        "recent_payments": recent_payments,
    }


@api.get("/admin/students/progress")
async def admin_students_progress(request: Request):
    """Per-student view: what they're enrolled in, how far they've watched, certificates."""
    await require_role(request, ["admin"])

    programs = await db.programs.find({}, {"_id": 0, "id": 1, "title": 1, "price_model": 1}).to_list(500)
    prog_by_id = {p["id"]: p for p in programs}
    membership_prog_ids = [p["id"] for p in programs if p.get("price_model") == "membership"]

    # program_id -> [video_ids]
    lessons = await db.program_lessons.find({}, {"_id": 0, "program_id": 1, "video_id": 1}).to_list(5000)
    prog_videos: dict = {}
    for l in lessons:
        prog_videos.setdefault(l["program_id"], []).append(l["video_id"])

    active_sub_users = set(
        s["user_id"] for s in await db.subscriptions.find({"status": "active"}, {"_id": 0, "user_id": 1}).to_list(5000)
    )

    # user_id -> set(program_ids) owned via enrollment or paid program txn
    owned: dict = {}
    for e in await db.program_enrollments.find({}, {"_id": 0, "user_id": 1, "program_id": 1}).to_list(20000):
        owned.setdefault(e["user_id"], set()).add(e["program_id"])
    for t in await db.payment_transactions.find(
        {"item_type": "program", "payment_status": "paid"}, {"_id": 0, "user_id": 1, "item_id": 1}).to_list(20000):
        owned.setdefault(t["user_id"], set()).add(t["item_id"])

    # user_id -> set(completed video_ids)
    completed_videos: dict = {}
    for w in await db.watch_progress.find({"completed": True}, {"_id": 0, "user_id": 1, "video_id": 1}).to_list(50000):
        completed_videos.setdefault(w["user_id"], set()).add(w["video_id"])

    # user_id -> [program_ids with certificate]
    certs: dict = {}
    for c in await db.certificates.find({}, {"_id": 0, "user_id": 1, "program_id": 1}).to_list(20000):
        certs.setdefault(c["user_id"], []).append(c["program_id"])

    users = await db.users.find(
        {"role": {"$nin": ["admin", "instructor"]}},
        {"_id": 0, "id": 1, "name": 1, "email": 1, "created_at": 1},
    ).sort("created_at", -1).to_list(1000)

    out = []
    for u in users:
        uid = u["id"]
        is_member = uid in active_sub_users
        access_ids = set(owned.get(uid, set()))
        if is_member:
            access_ids.update(membership_prog_ids)
        done_vids = completed_videos.get(uid, set())
        user_certs = set(certs.get(uid, []))
        enrollments = []
        for pid in access_ids:
            vids = prog_videos.get(pid, [])
            total = len(vids)
            done = sum(1 for v in vids if v in done_vids)
            enrollments.append({
                "program_id": pid,
                "program_title": (prog_by_id.get(pid) or {}).get("title", "—"),
                "completed": done,
                "total": total,
                "pct": round((done / total) * 100) if total else 0,
                "certified": pid in user_certs,
            })
        enrollments.sort(key=lambda e: e["program_title"])
        out.append({
            "user_id": uid,
            "name": u.get("name"),
            "email": u.get("email"),
            "joined": u.get("created_at"),
            "active_member": is_member,
            "enrollments": enrollments,
            "enrolled_count": len(enrollments),
            "certificates": len(user_certs),
        })
    # Most engaged first
    out.sort(key=lambda s: (s["certificates"], s["enrolled_count"]), reverse=True)
    return {"students": out, "total": len(out)}



# ---------- Legacy import ----------
@api.post("/admin/legacy/import")
async def legacy_import(payload: LegacyImportRequest, request: Request):
    admin = await require_role(request, ["admin"])
    batch = {
        "id": gen_id(), "name": payload.batch_name,
        "created_by_admin_id": admin["id"], "created_at": now_utc().isoformat(),
        "total_records": len(payload.rows), "valid_records": 0,
        "offer_config": payload.offer_config or {},
    }
    valid = 0
    invite_urls = []
    for row in payload.rows:
        email = row.email.lower()
        existing = await db.users.find_one({"email": email})
        if not existing:
            await db.users.insert_one({
                "id": gen_id(), "email": email, "name": row.name or email.split("@")[0],
                "role": "student", "source": "legacy_squarespace",
                "import_batch_id": batch["id"], "legacy_status": "invited",
                "active": True, "created_at": now_utc().isoformat(),
            })
        token_plain = secrets.token_urlsafe(32)
        await db.magic_link_tokens.insert_one({
            "id": gen_id(), "email": email,
            "token_sha": sha256_hex(token_plain),
            "type": "legacy_reactivation",
            "expires_at": (now_utc() + timedelta(days=30)).isoformat(),
            "used_at": None, "created_at": now_utc().isoformat(),
        })
        frontend_url = os.environ.get("FRONTEND_URL", "")
        invite_urls.append({"email": email, "url": f"{frontend_url}/magic-link?token={token_plain}"})
        valid += 1
    batch["valid_records"] = valid
    await db.import_batches.insert_one(batch)
    batch.pop("_id", None)
    return {"batch": batch, "invites": invite_urls[:50]}


@api.get("/admin/legacy/batches")
async def list_batches(request: Request):
    await require_role(request, ["admin"])
    return await db.import_batches.find({}, {"_id": 0}).to_list(200)


@api.post("/admin/legacy/import-csv")
async def import_csv(request: Request, batch_name: str = Form(...), file: UploadFile = File(...)):
    await require_role(request, ["admin"])
    content = await file.read()
    text = content.decode("utf-8", errors="ignore")
    reader = csv.DictReader(io.StringIO(text))
    rows = []
    skipped = []
    for i, r in enumerate(reader, start=2):
        email = (r.get("email") or r.get("Email") or "").strip()
        if not email or "@" not in email:
            skipped.append(f"Row {i}: missing/invalid email")
            continue
        try:
            rows.append(LegacyImportRow(email=email, name=r.get("name") or r.get("Name")))
        except Exception:
            skipped.append(f"Row {i}: invalid email '{email}'")
    res = await legacy_import(LegacyImportRequest(batch_name=batch_name, rows=rows), request)
    if isinstance(res, dict):
        res["skipped"] = skipped
    return res


@api.post("/admin/class-instances/import-csv")
async def import_classes_csv(request: Request, file: UploadFile = File(...)):
    """Bulk-create class instances from a CSV.
    Columns: title, start_time (ISO8601), duration_minutes, capacity,
    location_type (online|in-person), location_detail, style, level.
    """
    from datetime import datetime
    admin = await require_role(request, ["admin"])
    content = await file.read()
    reader = csv.DictReader(io.StringIO(content.decode("utf-8", errors="ignore")))
    created, errors = 0, []
    for i, r in enumerate(reader, start=2):
        title = (r.get("title") or "").strip()
        start = (r.get("start_time") or "").strip()
        if not title or not start:
            errors.append(f"Row {i}: missing title or start_time")
            continue
        try:
            start_dt = datetime.fromisoformat(start.replace("Z", "+00:00"))
        except ValueError:
            errors.append(f"Row {i}: bad start_time '{start}' (use ISO8601 e.g. 2026-09-01T08:00:00)")
            continue
        dur = int(r.get("duration_minutes") or 60)
        cap = int(r.get("capacity") or 20)
        doc = {
            "id": gen_id(), "template_id": None, "title": title,
            "instructor_id": admin["id"],
            "location_type": (r.get("location_type") or "online").strip(),
            "location_detail": (r.get("location_detail") or "").strip() or None,
            "style": (r.get("style") or "Vinyasa").strip(),
            "level": (r.get("level") or "all").strip(),
            "duration_minutes": dur,
            "start_time": start_dt.isoformat(),
            "end_time": (start_dt + timedelta(minutes=dur)).isoformat(),
            "capacity": cap, "is_recorded": True, "status": "scheduled",
            "bookings_count": 0, "created_at": now_utc().isoformat(),
        }
        await db.class_instances.insert_one(doc)
        created += 1
    return {"created": created, "errors": errors}


# ---------- Coupons ----------
@api.post("/admin/coupons")
async def create_coupon(payload: CouponCreate, request: Request):
    await require_role(request, ["admin"])
    doc = {**payload.model_dump(), "id": gen_id(), "used_count": 0, "active": True, "created_at": now_utc().isoformat()}
    if payload.valid_until:
        doc["valid_until"] = payload.valid_until.isoformat()
    await db.coupons.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/admin/coupons")
async def list_coupons(request: Request):
    await require_role(request, ["admin"])
    return await db.coupons.find({}, {"_id": 0}).to_list(200)


# ---------- Revenue share ----------
@api.post("/admin/revenue-share")
async def create_share_rule(payload: RevenueShareRuleCreate, request: Request):
    await require_role(request, ["admin"])
    doc = {**payload.model_dump(), "id": gen_id(), "created_at": now_utc().isoformat()}
    await db.revenue_share_rules.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/admin/revenue-share")
async def list_share_rules(request: Request):
    await require_role(request, ["admin"])
    return await db.revenue_share_rules.find({}, {"_id": 0}).to_list(200)


@api.get("/instructor/earnings")
async def instructor_earnings(request: Request):
    user = await require_role(request, ["instructor", "admin"])
    rules = await db.revenue_share_rules.find({"instructor_id": user["id"]}, {"_id": 0}).to_list(100)
    txns = await db.payment_transactions.find({"payment_status": "paid"}, {"_id": 0}).to_list(500)
    total = 0.0
    breakdown = []
    for t in txns:
        for r in rules:
            if r["type"] == "program" and t["item_type"] == "program" and t["item_id"] == r.get("target_id"):
                share = t["amount"] * (r["percentage"] / 100.0)
                total += share
                breakdown.append({"txn_id": t["id"], "item": t["item_type"], "amount": share})
    return {"rules": rules, "total_earnings": round(total, 2), "breakdown": breakdown[-50:]}


# ---------- Instructor payout reports (admin) ----------
async def _build_payouts(period_from: Optional[str], period_to: Optional[str]):
    """Aggregate paid transactions into per-instructor payout rows.

    period_from / period_to are ISO8601 (YYYY-MM-DD or full datetime). Both optional.
    Returns: list of dicts with name, instructor_id, period, gross_bookings, gross_revenue,
    revenue_share_pct (avg, weighted), net_payout, per_class_breakdown, tax (NIF/IBAN if on profile).
    """
    txn_q = {"payment_status": "paid"}
    if period_from or period_to:
        rng = {}
        if period_from: rng["$gte"] = period_from
        if period_to: rng["$lte"] = period_to
        txn_q["completed_at"] = rng
    txns = await db.payment_transactions.find(txn_q, {"_id": 0}).to_list(5000)
    rules = await db.revenue_share_rules.find({}, {"_id": 0}).to_list(500)
    instructors = await db.users.find({"role": "instructor"}, {"_id": 0, "password_hash": 0}).to_list(500)

    by_instructor = {}
    for ins in instructors:
        by_instructor[ins["id"]] = {
            "instructor_id": ins["id"],
            "name": ins.get("name") or ins["email"],
            "email": ins["email"],
            "period_from": period_from or "all-time",
            "period_to": period_to or "all-time",
            "gross_bookings": 0,
            "gross_revenue": 0.0,
            "net_payout": 0.0,
            "weighted_pct_sum": 0.0,
            "weighted_revenue_sum": 0.0,
            "per_class": [],
            "tax_nif": ins.get("tax_nif", ""),
            "iban": ins.get("iban", ""),
            "currency": "usd",
        }

    for txn in txns:
        for rule in rules:
            iid = rule.get("instructor_id")
            if not iid or iid not in by_instructor:
                continue
            matches = (
                (rule["type"] == "program" and txn["item_type"] == "program" and txn["item_id"] == rule.get("target_id")) or
                (rule["type"] == "class" and txn["item_type"] in ("drop_in", "class_pack") and txn.get("metadata", {}).get("instructor_id") == iid)
            )
            if not matches:
                continue
            row = by_instructor[iid]
            amount = float(txn["amount"])
            pct = float(rule["percentage"])
            share = amount * (pct / 100.0)
            row["gross_bookings"] += 1
            row["gross_revenue"] += amount
            row["net_payout"] += share
            row["weighted_pct_sum"] += pct * amount
            row["weighted_revenue_sum"] += amount
            row["currency"] = txn.get("currency", "usd")
            row["per_class"].append({
                "txn_id": txn["id"],
                "completed_at": txn.get("completed_at"),
                "item_type": txn["item_type"],
                "item_id": txn["item_id"],
                "item_title": txn.get("metadata", {}).get("product_title") or txn.get("metadata", {}).get("program_title") or txn.get("metadata", {}).get("description", ""),
                "gross": round(amount, 2),
                "pct": pct,
                "share": round(share, 2),
            })

    rows = []
    for row in by_instructor.values():
        if row["gross_bookings"] == 0:
            continue
        row["revenue_share_pct"] = round(row["weighted_pct_sum"] / row["weighted_revenue_sum"], 2) if row["weighted_revenue_sum"] else 0.0
        row["gross_revenue"] = round(row["gross_revenue"], 2)
        row["net_payout"] = round(row["net_payout"], 2)
        row.pop("weighted_pct_sum", None)
        row.pop("weighted_revenue_sum", None)
        rows.append(row)
    rows.sort(key=lambda r: r["net_payout"], reverse=True)
    return rows


@api.get("/admin/payouts/report")
async def admin_payouts_report(
    request: Request,
    period_from: Optional[str] = None,
    period_to: Optional[str] = None,
):
    """JSON payout report. Pass period_from/period_to as ISO8601 (e.g. 2026-01-01)."""
    await require_role(request, ["admin"])
    rows = await _build_payouts(period_from, period_to)
    totals = {
        "instructors": len(rows),
        "gross_revenue": round(sum(r["gross_revenue"] for r in rows), 2),
        "net_payouts": round(sum(r["net_payout"] for r in rows), 2),
        "bookings": sum(r["gross_bookings"] for r in rows),
    }
    return {"period_from": period_from, "period_to": period_to, "totals": totals, "rows": rows}


@api.get("/admin/payouts/report.csv")
async def admin_payouts_report_csv(
    request: Request,
    period_from: Optional[str] = None,
    period_to: Optional[str] = None,
):
    """CSV payout report. Returns text/csv with one row per instructor."""
    from fastapi.responses import Response
    await require_role(request, ["admin"])
    rows = await _build_payouts(period_from, period_to)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "instructor_id", "name", "email",
        "period_from", "period_to",
        "gross_bookings", "gross_revenue", "currency",
        "revenue_share_pct", "net_payout",
        "tax_nif", "iban",
    ])
    for r in rows:
        writer.writerow([
            r["instructor_id"], r["name"], r["email"],
            r["period_from"], r["period_to"],
            r["gross_bookings"], r["gross_revenue"], r["currency"],
            r["revenue_share_pct"], r["net_payout"],
            r["tax_nif"], r["iban"],
        ])
    fname = f"payouts_{period_from or 'all'}_{period_to or 'all'}.csv"
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )
