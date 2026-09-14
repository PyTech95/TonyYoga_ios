"""One-time admin endpoint to wipe demo classes and load Tony Sanchez's real weekly
schedule.

Weekly Zoom schedule (Málaga/Madrid time = Europe/Madrid):
- Sun 16:30–18:00  Core 40 · Yoga Mudras
- Tue 16:30–17:30  Core 26+ · Beg/Inter
- Thu 16:30–17:30  Core 26+ · Beg/Inter
- Fri 16:30–18:00  Core 40 · Tree of Yoga

Endpoint POST /api/admin/seed/tony-classes wipes class_templates + class_instances
and recreates the canonical set + 12 weeks of upcoming instances.
"""
from datetime import datetime, timedelta, timezone
from fastapi import Request

from core import api, db, now_utc, gen_id, require_role


TONY_WEEKLY = [
    # (weekday 0=Mon, start_h, start_m, end_h, end_m, title, style, level, duration_min)
    (1, 16, 30, 17, 30, "Core 26+ · Beg/Inter",    "Core 26+", "beginner",     60),
    (3, 16, 30, 17, 30, "Core 26+ · Beg/Inter",    "Core 26+", "beginner",     60),
    (4, 16, 30, 18, 0,  "Core 40 · Tree of Yoga",  "Core 40",  "intermediate", 90),
    (6, 16, 30, 18, 0,  "Core 40 · Yoga Mudras",   "Core 40",  "all",          90),
]


def _next_weekday(after: datetime, weekday: int, hour: int, minute: int) -> datetime:
    """Smallest datetime >= `after` on the given weekday at the given local time."""
    days_ahead = (weekday - after.weekday()) % 7
    candidate = (after + timedelta(days=days_ahead)).replace(
        hour=hour, minute=minute, second=0, microsecond=0
    )
    if candidate < after:
        candidate += timedelta(days=7)
    return candidate


@api.post("/admin/seed/tony-classes")
async def seed_tony_classes(request: Request, weeks: int = 12):
    """Replace class_templates + future class_instances with Tony's real schedule.

    Past instances are preserved (we filter by start_time >= now).
    Returns counts of what was wiped and created.
    """
    user = await require_role(request, ["admin"])

    # 1) Wipe templates (and any test garbage from prior runs)
    templates_deleted = (await db.class_templates.delete_many({})).deleted_count

    # 2) Wipe ONLY upcoming instances — keep past instances for history/bookings.
    now_iso = now_utc().isoformat()
    instances_deleted = (await db.class_instances.delete_many(
        {"start_time": {"$gte": now_iso}}
    )).deleted_count

    # 3) Create the 6 canonical templates
    templates_to_insert = []
    for weekday, sh, sm, _eh, _em, title, style, level, duration_min in TONY_WEEKLY:
        templates_to_insert.append({
            "id": gen_id(),
            "title": title,
            "description": f"Live Zoom class with Tony — {title}. Málaga/Madrid time.",
            "instructor_id": user["id"],
            "location_type": "online",
            "location_detail": "Zoom",
            "style": style,
            "level": level,
            "duration_minutes": duration_min,
            "capacity": 50,
            "props_needed": ["mat"],
            "created_by": user["id"],
            "created_at": now_utc().isoformat(),
            # Pin canonical metadata so future re-seeds can reuse the same template
            "weekly_slot": {"weekday": weekday, "hour": sh, "minute": sm},
        })
    await db.class_templates.insert_many(templates_to_insert)

    # 4) Generate `weeks` weeks of instances for each template, starting from
    #    the next occurrence of each slot >= now.
    instances_to_insert = []
    base_dt = now_utc()
    for tpl, slot_def in zip(templates_to_insert, TONY_WEEKLY):
        weekday, sh, sm = tpl["weekly_slot"]["weekday"], tpl["weekly_slot"]["hour"], tpl["weekly_slot"]["minute"]
        first = _next_weekday(base_dt, weekday, sh, sm)
        for w in range(weeks):
            start = first + timedelta(weeks=w)
            instances_to_insert.append({
                "id": gen_id(),
                "template_id": tpl["id"],
                "title": tpl["title"],
                "instructor_id": tpl["instructor_id"],
                "location_type": tpl["location_type"],
                "location_detail": tpl["location_detail"],
                "style": tpl["style"],
                "level": tpl["level"],
                "duration_minutes": tpl["duration_minutes"],
                "start_time": start.isoformat(),
                "end_time": (start + timedelta(minutes=tpl["duration_minutes"])).isoformat(),
                "capacity": tpl["capacity"],
                "is_recorded": True,
                "status": "scheduled",
                "bookings_count": 0,
                "created_at": now_utc().isoformat(),
            })
    if instances_to_insert:
        await db.class_instances.insert_many(instances_to_insert)

    return {
        "templates_wiped": templates_deleted,
        "instances_wiped_upcoming": instances_deleted,
        "templates_created": len(templates_to_insert),
        "instances_created": len(instances_to_insert),
        "weekly_slots": [
            {"day": ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][t["weekly_slot"]["weekday"]],
             "time": f"{t['weekly_slot']['hour']:02d}:{t['weekly_slot']['minute']:02d}",
             "title": t["title"]}
            for t in templates_to_insert
        ],
    }
