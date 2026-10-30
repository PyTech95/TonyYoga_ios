"""Help requests: problems students report (mostly through Tony's AI assistant) that need a person.

The assistant writes the request; the team gets a bell notification, an email and (when set up) a
WhatsApp message; the admin answers from Admin → Help requests and the student gets the answer by
email + notification and sees it in My Yoga.
"""
import asyncio
import html
import re
import secrets
from datetime import timedelta
from typing import List, Optional

from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel, Field

from core import api, db, gen_id, get_current_user, is_local_ip, logger, now_utc, require_role

CATEGORIES = {"access": "Access to a course or class", "payment": "Payment / refund", "login": "Signing in",
              "order": "Shop order", "class": "Live class", "other": "Other"}
STATUSES = ("new", "in_progress", "resolved")
# Plain addresses only: no ?, &, % or quotes that could change a mailto: link or an email header.
EMAIL_RE = re.compile(r"^[A-Za-z0-9._+-]{1,64}@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,24}$")
UNKNOWN_IP_DAILY_CAP = 40      # when nginx passes no visitor IP: all such visitors share this
_tasks: set = set()


def _spawn(coro):
    task = asyncio.create_task(coro)
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return task


def _clean(text, limit):
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", str(text or ""))
    return " ".join(text.split())[:limit].strip()


async def _new_ref() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    for _ in range(8):
        ref = "H-" + "".join(secrets.choice(alphabet) for _ in range(5))
        if not await db.help_requests.find_one({"ref": ref}, {"_id": 1}):
            return ref
    return "H-" + gen_id()[:8].upper()


async def create_help_request(*, category: str, summary: str, user: Optional[dict], email: str = "", name: str = "",
                              session_id: Optional[str] = None, transcript: Optional[List[dict]] = None,
                              ip: str = "", source: str = "assistant", language: str = "") -> dict:
    """Returns {ok, ref, updated?} or {ok: False, reason, message}. Never raises for normal problems."""
    from routers.settings import get_setting
    if await get_setting("help_requests_enabled") is False:
        return {"ok": False, "reason": "disabled", "message": "Messages to the team are switched off. Please use the Support page."}
    category = category if category in CATEGORIES else "other"
    summary = _clean(summary, 700)
    if len(summary) < 5:
        last = next((m.get("text") for m in reversed(transcript or []) if m.get("role") in ("visitor", "user")), "")
        summary = _clean(last, 300) or "The student asked the assistant to contact the team."
    if user:
        email = user.get("email") or ""
        name = user.get("name") or name
    email = _clean(email, 254).lower()
    if not EMAIL_RE.match(email):
        return {"ok": False, "reason": "need_email",
                "message": "Please share the email address you used, so the team can answer you."}
    now = now_utc()
    day_ago = (now - timedelta(days=1)).isoformat()
    who = {"user_id": user["id"]} if user else {"user_id": None, "email": email}
    # One open request per conversation and person: later messages are added to it.
    if session_id:
        existing = await db.help_requests.find_one({"session_id": session_id, "status": {"$ne": "resolved"}, **who}, {"_id": 0})
        if existing:
            if summary and summary not in [u.get("text") for u in existing.get("updates", [])] and summary != existing.get("summary"):
                await db.help_requests.update_one({"id": existing["id"]}, {
                    "$push": {"updates": {"$each": [{"at": now.isoformat(), "text": summary}], "$slice": -20}},
                    "$set": {"updated_at": now.isoformat(), "transcript": (transcript or existing.get("transcript") or [])[-24:]}})
            return {"ok": True, "ref": existing["ref"], "id": existing["id"], "updated": True}
    if await db.help_requests.count_documents({**who, "created_at": {"$gte": day_ago}}) >= 5:
        return {"ok": False, "reason": "limit", "message": "You've already sent several messages today. The team will answer them soon."}
    if ip and not is_local_ip(ip) and await db.help_requests.count_documents({"ip": ip, "created_at": {"$gte": day_ago}}) >= 10:
        return {"ok": False, "reason": "limit", "message": "Too many messages from this connection today. Please use the Support page."}
    if (not ip or is_local_ip(ip)) and not user and await db.help_requests.count_documents(
            {"ip_unknown": True, "user_id": None, "created_at": {"$gte": day_ago}}) >= UNKNOWN_IP_DAILY_CAP:
        return {"ok": False, "reason": "limit", "message": "Please use the Support page to reach the team today."}
    ref = await _new_ref()
    doc = {"id": gen_id(), "ref": ref, "source": source, "category": category, "summary": summary,
           "user_id": (user or {}).get("id"), "name": _clean(name, 120), "email": email, "session_id": session_id,
           "transcript": [{"role": m.get("role"), "text": _clean(m.get("text"), 2000), "at": m.get("at")} for m in (transcript or [])][-24:],
           "language": _clean(language, 12), "ip": ip, "ip_unknown": (not ip or is_local_ip(ip)), "status": "new", "updates": [], "replies": [], "notes": [],
           "history": [{"at": now.isoformat(), "action": "created", "by": source}],
           "created_at": now.isoformat(), "updated_at": now.isoformat()}
    await db.help_requests.insert_one(dict(doc))
    _spawn(_alert_team(doc))
    _spawn(_ack_student(doc))
    return {"ok": True, "ref": ref, "id": doc["id"]}


async def _alert_team(doc: dict):
    from routers.settings import get_setting
    from notify import notify_member, site_url
    title = f"Help request {doc['ref']} · {CATEGORIES.get(doc['category'], 'Other')}"
    who = f"{doc.get('name') or 'A visitor'} ({doc.get('email')})"
    body = f"{who}: {doc['summary']}"
    url = f"/admin?tab=help&id={doc['id']}"
    try:
        if await get_setting("help_alerts_enabled") is False:
            return
        admins = await db.users.find({"role": "admin"}, {"_id": 0, "id": 1, "email": 1}).to_list(20)
        email_html = (f"<p><strong>{html.escape(who)}</strong> asked Tony's assistant for help.</p>"
                      f"<p><strong>Topic:</strong> {html.escape(CATEGORIES.get(doc['category'], 'Other'))}<br/>"
                      f"<strong>Summary:</strong> {html.escape(doc['summary'])}</p>"
                      f"<p>Reference {html.escape(doc['ref'])}. Open it in Admin → Help requests to read the conversation and reply.</p>")
        for a in admins:
            await notify_member(a["id"], title, body[:300], url, email_subject=f"[Tony Yoga] {title}", email_html=email_html,
                                cta_label="Open help request", dedupe_key=f"help:{doc['id']}:{a['id']}", ntype="admin")
        extra = [e.strip() for e in str(await get_setting("help_alert_emails") or "").split(",") if EMAIL_RE.match(e.strip())]
        admin_emails = {a.get("email") for a in admins}
        if extra:
            from email_service import send_email, _wrap
            for e in extra:
                if e not in admin_emails:
                    await send_email(e, f"[Tony Yoga] {title}", _wrap(html.escape(title), email_html, "Open help request", site_url(url)),
                                     f"{title}\n\n{body}\n\n{site_url(url)}")
        to = (await get_setting("help_alert_whatsapp") or await get_setting("lead_alert_whatsapp")
              or await get_setting("social_whatsapp") or "")
        if to:
            from whatsapp_service import send_whatsapp
            await send_whatsapp(to, f"Tony Yoga — help request {doc['ref']}\nFrom: {who}\nTopic: "
                                    f"{CATEGORIES.get(doc['category'], 'Other')}\n{doc['summary'][:600]}\nReply: {site_url(url)}")
    except Exception as exc:
        logger.warning("help request alert failed (%s)", type(exc).__name__)


async def _ack_student(doc: dict):
    try:
        from email_service import send_email, _wrap
        from notify import site_url
        if doc.get("user_id"):
            first = (doc.get("name") or "").split(" ")[0]
            body = (f"<p>Hi {html.escape(first) if first else 'there'},</p>"
                    f"<p>Tony's team has your message and will answer you by email. Your reference is "
                    f"<strong>{html.escape(doc['ref'])}</strong>.</p><p><em>{html.escape(doc['summary'])}</em></p>")
            text = f"Tony's team has your message ({doc['ref']}) and will answer by email.\n\n{doc['summary']}"
        else:
            # A visitor who isn't signed in typed this address: send a fixed text only (no visitor
            # words), so the form can't be used to send messages to other people.
            body = (f"<p>Hello,</p><p>Tony's team received a message through the Tony Yoga assistant with this "
                    f"email address and will answer soon. Reference <strong>{html.escape(doc['ref'])}</strong>.</p>"
                    f"<p>If you didn't write to us, you can ignore this email.</p>")
            text = f"Tony's team received a message with this email address ({doc['ref']}) and will answer soon. If you didn't write to us, ignore this email."
        await send_email(doc["email"], f"We got your message ({doc['ref']})", _wrap("We got your message", body, "Visit Tony Yoga", site_url("/")), text)
    except Exception as exc:
        logger.info("help request acknowledgement skipped (%s)", type(exc).__name__)


# ---------------------------------------------------------------------------
# Admin

def _row(d: dict) -> dict:
    return {k: d.get(k) for k in ("id", "ref", "source", "category", "summary", "user_id", "name", "email", "status",
                                  "created_at", "updated_at", "language")} | {
        "replies": len(d.get("replies") or []), "updates": len(d.get("updates") or []),
        "category_label": CATEGORIES.get(d.get("category"), "Other")}


@api.get("/admin/help-requests")
async def admin_help_requests(request: Request, status: str = "open", q: str = ""):
    await require_role(request, ["admin"])
    query: dict = {}
    if status == "open":
        query["status"] = {"$in": ["new", "in_progress"]}
    elif status in STATUSES:
        query["status"] = status
    rows = await db.help_requests.find(query, {"_id": 0, "transcript": 0}).sort("created_at", -1).to_list(500)
    if q.strip():
        needle = q.strip().lower()
        rows = [r for r in rows if needle in " ".join(str(r.get(k) or "") for k in ("ref", "name", "email", "summary")).lower()]
    counts = {s: await db.help_requests.count_documents({"status": s}) for s in STATUSES}
    return {"requests": [_row(r) for r in rows], "counts": counts}


@api.get("/admin/help-requests/{rid}")
async def admin_help_request(rid: str, request: Request):
    await require_role(request, ["admin"])
    d = await db.help_requests.find_one({"id": rid}, {"_id": 0, "ip": 0})
    if not d:
        raise HTTPException(404, "Help request not found")
    d["category_label"] = CATEGORIES.get(d.get("category"), "Other")
    if d.get("user_id"):
        u = await db.users.find_one({"id": d["user_id"]}, {"_id": 0, "id": 1, "name": 1, "email": 1, "phone": 1})
        d["member"] = u
    return d


class HelpPatch(BaseModel):
    status: Optional[str] = None
    note: Optional[str] = Field(None, max_length=2000)


@api.patch("/admin/help-requests/{rid}")
async def admin_update_help_request(rid: str, payload: HelpPatch, request: Request):
    admin = await require_role(request, ["admin"])
    d = await db.help_requests.find_one({"id": rid}, {"_id": 0, "id": 1, "status": 1})
    if not d:
        raise HTTPException(404, "Help request not found")
    now = now_utc().isoformat()
    upd: dict = {"$set": {"updated_at": now}, "$push": {"history": {"$each": [], "$slice": -50}}}
    events = []
    if payload.status is not None:
        if payload.status not in STATUSES:
            raise HTTPException(422, "Status must be new, in_progress or resolved.")
        if payload.status != d.get("status"):
            upd["$set"]["status"] = payload.status
            if payload.status == "resolved":
                upd["$set"]["resolved_at"] = now
            events.append({"at": now, "action": f"status → {payload.status}", "by": admin.get("name") or admin.get("email")})
    if payload.note and payload.note.strip():
        upd.setdefault("$push", {})["notes"] = {"at": now, "by": admin.get("name") or admin.get("email"), "text": payload.note.strip()}
        events.append({"at": now, "action": "note added", "by": admin.get("name") or admin.get("email")})
    upd["$push"]["history"]["$each"] = events
    await db.help_requests.update_one({"id": rid}, upd)
    return await admin_help_request(rid, request)


class HelpReply(BaseModel):
    message: str = Field(min_length=2, max_length=5000)
    resolve: bool = True


@api.post("/admin/help-requests/{rid}/reply")
async def admin_reply_help_request(rid: str, payload: HelpReply, request: Request):
    admin = await require_role(request, ["admin"])
    d = await db.help_requests.find_one({"id": rid}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Help request not found")
    text = payload.message.strip()
    now = now_utc().isoformat()
    by = (admin.get("name") or "Tony's team").split(" ")[0]
    reply = {"id": gen_id(), "at": now, "by": by, "by_id": admin["id"], "text": text}
    status = "resolved" if payload.resolve else "in_progress"
    await db.help_requests.update_one({"id": rid}, {
        "$push": {"replies": reply, "history": {"at": now, "action": "replied" + (" and resolved" if payload.resolve else ""), "by": by}},
        "$set": {"status": status, "updated_at": now, **({"resolved_at": now} if payload.resolve else {})}})
    title = f"Tony's team answered ({d['ref']})"
    body_html = (f"<p>{html.escape(text).replace(chr(10), '<br/>')}</p>"
                 f"<p style=\"color:#6B7269\">Your message: <em>{html.escape(d.get('summary') or '')}</em></p>")
    delivered = False
    if d.get("user_id"):
        from notify import notify_member
        delivered = await notify_member(d["user_id"], title, text[:300], "/my-yoga#help", email_subject=title, email_html=body_html,
                                        cta_label="Open My Yoga", dedupe_key=f"help-reply:{reply['id']}", wait=True)
    else:
        from email_service import send_email, _wrap
        from notify import site_url
        delivered = await send_email(d["email"], title, _wrap(html.escape(title), body_html, "Visit Tony Yoga", site_url("/")),
                                     f"{title}\n\n{text}")
    return {"ok": True, "status": status, "delivered": bool(delivered), "request": await admin_help_request(rid, request)}


# ---------------------------------------------------------------------------
# Student

@api.get("/me/help-requests")
async def my_help_requests(user: dict = Depends(get_current_user)):
    rows = await db.help_requests.find({"user_id": user["id"]}, {"_id": 0, "id": 1, "ref": 1, "category": 1, "summary": 1,
                                                                 "status": 1, "created_at": 1, "replies": 1}).sort("created_at", -1).to_list(30)
    for r in rows:
        r["category_label"] = CATEGORIES.get(r.get("category"), "Other")
        r["replies"] = [{"at": x.get("at"), "by": x.get("by"), "text": x.get("text")} for x in r.get("replies") or []]
    return {"requests": rows}
