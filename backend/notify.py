"""Tell a member something in every place they look: the notification bell, browser push,
phone push (Android/iPhone app) and email. One call, best-effort, never blocks the request.

    await notify_member(user_id, "Your course is ready", "Core 26+ is now in My Yoga.",
                        "/my-yoga", dedupe_key="grant:abc")
"""
import asyncio
import html
import os
from typing import Optional

from core import db, logger


def site_url(path: str = "/") -> str:
    base = (os.environ.get("FRONTEND_URL") or "").strip().rstrip("/") or "https://tonyoga.com"
    if path.startswith("http"):
        return path
    return base + (path if path.startswith("/") else "/" + path)


_background: set = set()


def _spawn(coro):
    """Fire-and-forget that keeps a reference (so the task isn't garbage-collected) and logs errors."""
    task = asyncio.create_task(coro)
    _background.add(task)
    task.add_done_callback(_background.discard)
    return task


async def _phone_and_browser_push(user_id: str, title: str, body: str, url: str):
    try:
        from routers.push import notify_user
        await notify_user(user_id, title, body, url)
    except Exception as exc:  # browser push is optional
        logger.info("browser push skipped (%s)", type(exc).__name__)
    try:
        from native_push import send_to_user
        await send_to_user(user_id, title, body, url)
    except Exception as exc:  # phone push is optional
        logger.info("phone push skipped (%s)", type(exc).__name__)


async def _email(to: str, subject: str, title: str, body_html: str, cta_label: Optional[str], cta_url: Optional[str]):
    try:
        from email_service import send_email, _wrap
        await send_email(to, subject, _wrap(html.escape(title), body_html, cta_label, cta_url),
                         f"{title}\n\n{_plain(body_html)}\n\n{cta_url or ''}")
    except Exception as exc:
        logger.warning("member email failed (%s)", type(exc).__name__)


def _plain(body_html: str) -> str:
    import re
    return re.sub(r"<[^>]+>", "", body_html.replace("<br/>", "\n").replace("<br>", "\n"))


async def notify_member(user_id: str, title: str, body: str, url: str = "/", *,
                        email: bool = True, push: bool = True, email_subject: Optional[str] = None,
                        email_html: Optional[str] = None, cta_label: Optional[str] = "Open Tony Yoga",
                        dedupe_key: Optional[str] = None, ntype: str = "personal", wait: bool = False) -> bool:
    """In-app notification + push + email. Returns False when `dedupe_key` was already used."""
    if not user_id:
        return False
    from routers.notifications import push_notification
    created = await push_notification(user_id, title, body, url, ntype, dedupe_key)
    if dedupe_key and not created:
        return False
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "email": 1, "notify_email": 1, "notify_push": 1})
    jobs = []
    if push and (user or {}).get("notify_push", True) is not False:
        jobs.append(_phone_and_browser_push(user_id, title, body, url))
    if email and user and user.get("email") and user.get("notify_email", True) is not False:
        jobs.append(_email(user["email"], email_subject or title, title,
                           email_html or html.escape(body).replace("\n", "<br/>"), cta_label, site_url(url)))
    if wait:
        await asyncio.gather(*jobs, return_exceptions=True)
    else:
        for job in jobs:
            _spawn(job)
    return True
