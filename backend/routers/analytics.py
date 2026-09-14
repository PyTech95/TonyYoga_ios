"""First-party page views. No IP, query string, user identity or cross-site ID stored."""
from datetime import timedelta
from fastapi import Request, Query, HTTPException
from pymongo.errors import DuplicateKeyError
from core import api, db, now_utc, get_optional_user, require_role
from analytics_models import UsageEvent, EventResult, TrackingConfig, UsageReport


async def tracking_enabled():
    config = await db.analytics_config.find_one({"key": "tracking"}, {"_id": 0, "enabled": 1})
    return config.get("enabled", True) if config else True


async def create_analytics_indexes():
    await db.analytics_events.create_index("event_id", unique=True)
    await db.analytics_events.create_index("created_at", expireAfterSeconds=90 * 86400)
    await db.analytics_events.create_index([("session_id", 1), ("created_at", -1)])
    await db.analytics_config.create_index("key", unique=True)


@api.get("/analytics/config", response_model=TrackingConfig)
async def usage_config():
    return {"enabled": await tracking_enabled()}


@api.patch("/admin/analytics/config", response_model=TrackingConfig)
async def update_usage_config(payload: TrackingConfig, request: Request):
    await require_role(request, ["admin"])
    await db.analytics_config.update_one({"key": "tracking"}, {"$set": {"enabled": payload.enabled}}, upsert=True)
    return {"enabled": payload.enabled}


@api.post("/analytics/events", response_model=EventResult)
async def record_usage(payload: UsageEvent, request: Request):
    if not await tracking_enabled():
        return {"accepted": False}
    user = await get_optional_user(request)
    if user and user.get("role") in ("admin", "instructor", "support"):
        return {"accepted": False}
    session_id = str(payload.session_id)
    now = now_utc()
    # Bound a session's ingestion, and deduplicate retries/React strict-mode effects.
    if await db.analytics_events.count_documents({"session_id": session_id, "created_at": {"$gte": now - timedelta(minutes=1)}}) >= 60:
        raise HTTPException(429, "Too many page events")
    doc = {**payload.model_dump(mode="json"), "path": payload.path,
           "created_at": now, "day": now.date().isoformat()}
    try:
        await db.analytics_events.insert_one(doc)
    except DuplicateKeyError:
        return {"accepted": False}
    return {"accepted": True}


@api.get("/admin/analytics", response_model=UsageReport)
async def usage_report(request: Request, days: int = Query(default=30, ge=1, le=90)):
    await require_role(request, ["admin"])
    now = now_utc()
    start = (now - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
    rows = await db.analytics_events.aggregate([
        {"$match": {"created_at": {"$gte": start, "$lte": now}}},
        {"$facet": {
            "summary": [{"$group": {"_id": None, "views": {"$sum": 1},
                "website_views": {"$sum": {"$cond": [{"$eq": ["$platform", "website"]}, 1, 0]}},
                "app_views": {"$sum": {"$cond": [{"$ne": ["$platform", "website"]}, 1, 0]}},
                "avg_load_ms": {"$avg": "$load_ms"},
                "load_samples": {"$sum": {"$cond": [{"$ne": ["$load_ms", None]}, 1, 0]}}}}],
            "sessions": [{"$group": {"_id": "$session_id"}}, {"$count": "count"}],
            "daily": [{"$group": {"_id": {"day": "$day", "platform": "$platform"},
                "views": {"$sum": 1}, "load_total": {"$sum": "$load_ms"},
                "samples": {"$sum": {"$cond": [{"$ne": ["$load_ms", None]}, 1, 0]}}}}],
            "pages": [{"$group": {"_id": "$path", "views": {"$sum": 1}}},
                      {"$sort": {"views": -1, "_id": 1}}, {"$limit": 8}],
        }},
    ]).to_list(1)
    data = rows[0] if rows else {}
    raw = (data.get("summary") or [{}])[0]
    summary = {key: raw.get(key, 0) for key in ("views", "website_views", "app_views", "load_samples")}
    summary["sessions"] = (data.get("sessions") or [{"count": 0}])[0]["count"]
    summary["avg_load_ms"] = round(raw["avg_load_ms"]) if raw.get("avg_load_ms") is not None else None
    series = {(start + timedelta(days=i)).date().isoformat(): {
        "date": (start + timedelta(days=i)).date().isoformat(), "website": 0, "app": 0,
        "website_load_ms": None, "app_load_ms": None,
    } for i in range(days)}
    loads = {}
    for row in data.get("daily", []):
        day, platform = row["_id"]["day"], row["_id"]["platform"]
        if day not in series:
            continue
        channel = "website" if platform == "website" else "app"
        series[day][channel] += row["views"]
        total, samples = loads.get((day, channel), (0, 0))
        loads[(day, channel)] = (total + row["load_total"], samples + row["samples"])
    for (day, channel), (total, samples) in loads.items():
        series[day][f"{channel}_load_ms"] = round(total / samples) if samples else None
    first = await db.analytics_events.find_one({}, {"_id": 0, "created_at": 1}, sort=[("created_at", 1)])
    return {"enabled": await tracking_enabled(), "days": days, "summary": summary,
            "series": list(series.values()),
            "collected_since": first["created_at"].isoformat() if first else None,
            "top_pages": [{"path": r["_id"], "views": r["views"]} for r in data.get("pages", [])]}