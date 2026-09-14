"""SMTP email service for Tony Yoga (Gmail SMTP via app password)."""
import os
import asyncio
import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.utils import formataddr
from datetime import datetime
from typing import Optional

logger = logging.getLogger("tony-yoga.email")


async def _get_smtp_config() -> dict:
    """Resolve SMTP config from admin settings (DB) with .env fallback."""
    from routers.settings import get_setting
    user = (await get_setting("smtp_user")) or ""
    try:
        port = int(await get_setting("smtp_port") or 587)
    except (TypeError, ValueError):
        port = 587
    return {
        "host": (await get_setting("smtp_host")) or "smtp.gmail.com",
        "port": port,
        "user": user,
        "password": ((await get_setting("smtp_password")) or "").replace(" ", ""),
        "sender_email": (await get_setting("sender_email")) or user,
        "sender_name": (await get_setting("sender_name")) or "Tony Yoga",
        "enabled": bool(await get_setting("email_enabled")),
    }


def _send_sync(to: str, subject: str, html: str, text: Optional[str], cfg: dict) -> bool:
    if not cfg.get("user") or not cfg.get("password"):
        logger.warning(f"[EMAIL skipped — no SMTP creds] to={to} subject={subject}")
        return False
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = formataddr((cfg["sender_name"], cfg["sender_email"]))
    msg["To"] = to
    if text:
        msg.attach(MIMEText(text, "plain"))
    msg.attach(MIMEText(html, "html"))
    try:
        with smtplib.SMTP(cfg["host"], cfg["port"], timeout=15) as server:
            server.starttls()
            server.login(cfg["user"], cfg["password"])
            server.send_message(msg)
        logger.info(f"[EMAIL sent] to={to} subject={subject!r}")
        return True
    except Exception as e:
        logger.exception(f"[EMAIL FAILED] to={to} subject={subject!r}: {e}")
        return False


async def send_email(to: str, subject: str, html: str, text: Optional[str] = None) -> bool:
    cfg = await _get_smtp_config()
    if not cfg["enabled"]:
        logger.info(f"[EMAIL skipped — disabled in admin settings] to={to} subject={subject!r}")
        return False
    return await asyncio.to_thread(_send_sync, to, subject, html, text, cfg)


async def send_test_email(to: str) -> bool:
    """Send a verification email, bypassing the enabled toggle (used by admin 'Send test')."""
    cfg = await _get_smtp_config()
    html = _wrap(
        "SMTP is working.",
        "This is a test email from your Tony Yoga admin console. If you're reading this, "
        "booking confirmations and reminders will reach your students.",
    )
    return await asyncio.to_thread(_send_sync, to, "Tony Yoga — SMTP test", html,
                                   "Your Tony Yoga SMTP settings are working.", cfg)


def _wrap(title: str, body_html: str, cta_label: Optional[str] = None, cta_url: Optional[str] = None) -> str:
    cta = ""
    if cta_label and cta_url:
        cta = f"""
        <tr><td align="center" style="padding: 24px 0;">
          <a href="{cta_url}" style="display:inline-block;background:#B25A45;color:#FAFAF7;text-decoration:none;padding:14px 28px;border-radius:999px;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;letter-spacing:0.02em;">{cta_label}</a>
        </td></tr>
        """
    return f"""
    <!doctype html>
    <html><body style="margin:0;padding:0;background:#FAFAF7;font-family:Helvetica,Arial,sans-serif;color:#1C221F;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#FAFAF7;padding:48px 16px;">
        <tr><td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="background:#FFFFFF;border:1px solid #E5E6DF;border-radius:16px;padding:40px;">
            <tr><td style="font-family:Georgia,'Cormorant Garamond',serif;font-size:14px;letter-spacing:0.2em;text-transform:uppercase;color:#839682;">Tony Yoga</td></tr>
            <tr><td style="padding-top:8px;font-family:Georgia,'Cormorant Garamond',serif;font-size:32px;line-height:1.15;color:#1C221F;letter-spacing:-0.01em;">{title}</td></tr>
            <tr><td style="padding-top:20px;font-size:15px;line-height:1.7;color:#545E56;">{body_html}</td></tr>
            {cta}
            <tr><td style="padding-top:24px;border-top:1px solid #E5E6DF;font-size:12px;color:#839682;">Slow down. Breathe in. Begin again.<br/>— Tony</td></tr>
          </table>
        </td></tr>
      </table>
    </body></html>
    """


# ---------- Templated helpers ----------
async def send_magic_link(to: str, magic_url: str, link_type: str = "login") -> bool:
    titles = {
        "legacy_reactivation": "Welcome back to the practice.",
        "instructor_onboarding": "Welcome to Tony Yoga.",
        "login": "Your sign-in link.",
    }
    bodies = {
        "legacy_reactivation": "We've built a new home for the practice — live classes, on-demand programs, and a quieter place to come back to. Click below to claim your account.",
        "instructor_onboarding": "Your application has been approved. Click below to set up your teacher profile and start scheduling classes.",
        "login": "Click the button below to sign in. This link expires in 24 hours.",
    }
    html = _wrap(titles.get(link_type, "Sign in"), bodies.get(link_type, ""), "Open Tony Yoga", magic_url)
    return await send_email(to, titles.get(link_type, "Your sign-in link"), html, f"Open this link to continue: {magic_url}")


async def send_password_reset(to: str, reset_url: str) -> bool:
    html = _wrap(
        "Reset your password.",
        "Someone (hopefully you) asked to reset your Tony Yoga password. This link expires in one hour. If you didn't request this, you can safely ignore.",
        "Reset password", reset_url,
    )
    return await send_email(to, "Reset your Tony Yoga password", html, f"Reset link: {reset_url}")


async def send_welcome_email(to: str, name: Optional[str] = None) -> bool:
    """Registration confirmation sent to the new member's email."""
    first = (name or "").split(" ")[0] if name else "there"
    app_url = os.environ.get("FRONTEND_URL", "").rstrip("/") or None
    body = (
        f"Welcome, {first} — your Tony Yoga account is ready. "
        "You now have a home for live classes, on-demand programs (Core 20, Core 40, Core 84) "
        "and everything you need to keep your practice steady.<br/><br/>"
        "Take a breath, and begin whenever you're ready."
    )
    html = _wrap("Welcome to the practice.", body,
                 "Open Tony Yoga" if app_url else None, app_url)
    return await send_email(to, "Welcome to Tony Yoga 🌿", html,
                            f"Welcome {first} — your Tony Yoga account is ready.")


async def send_enquiry_ack(to: str, name: Optional[str] = None, interest: Optional[str] = None) -> bool:
    """Acknowledge an enquiry / lead, sent to the enquirer's email."""
    first = (name or "").split(" ")[0] if name else "there"
    focus = f" about <strong>{interest}</strong>" if interest else ""
    body = (
        f"Thank you for reaching out, {first}. We've received your enquiry{focus} and "
        "Tony's team will get back to you shortly.<br/><br/>"
        "In the meantime, feel free to explore the programs and live class schedule."
    )
    html = _wrap("We've got your message.", body)
    return await send_email(to, "Thanks for your enquiry · Tony Yoga", html,
                            f"Thanks {first} — we've received your enquiry and will reply shortly.")


# Where retreat booking notifications are sent (Tony's team inboxes).
RETREAT_ADMIN_EMAILS = ["tony@tonysanchezyoga.com", "tonyoga.online@gmail.com"]


async def send_retreat_booking(reg: dict, kind: str = "deposit") -> None:
    """Send a booking-confirmation email to the guest + a copy to Tony's team.
    kind = 'deposit' (seat reserved) or 'balance' (paid in full). Best-effort."""
    title = reg.get("workshop_title") or "your retreat"
    start = str(reg.get("workshop_start_date", ""))[:10]
    guest_email = reg.get("email")
    first = (reg.get("name") or "").split(" ")[0] or "there"
    if kind == "balance":
        subject = f"Payment complete · {title}"
        body = (f"Thank you, {first} — your balance for <strong>{title}</strong> is paid in full and "
                f"your seat is fully confirmed. We can't wait to practice with you.")
    else:
        deposit = int(reg.get("deposit_eur", 0) or 0)
        balance = int(reg.get("balance_eur", 0) or 0)
        due = str(reg.get("balance_due_date", ""))[:10]
        subject = f"Booking confirmed · {title}"
        body = (f"You're booked, {first}! Your €{deposit} deposit for <strong>{title}</strong> is received "
                f"and your seat is reserved.")
        if balance > 0:
            body += f"<br/><br/>Your remaining balance of €{balance} is due by {due}."
    html = _wrap("Your retreat booking.",
                 body + (f"<br/><br/><span style='color:#839682'>Retreat starts {start}.</span>" if start else ""))
    if guest_email:
        await send_email(guest_email, subject, html, f"{subject}" + (f" — starts {start}" if start else ""))
    # Copy to Tony's team.
    admin_html = _wrap(
        "Retreat booking update",
        f"<strong>{reg.get('name')}</strong> ({guest_email or '—'})<br/>"
        f"Retreat: <strong>{title}</strong>{f' · starts {start}' if start else ''}<br/>"
        f"Status: <strong>{'PAID IN FULL' if kind == 'balance' else 'Deposit paid — seat reserved'}</strong><br/>"
        f"Phone: {reg.get('phone') or '—'}",
    )
    for admin_to in RETREAT_ADMIN_EMAILS:
        await send_email(admin_to, f"[Booking] {title} · {reg.get('name')}", admin_html)



async def send_referral_invite(to: str, inviter_name: str, share_url: str, personal_note: Optional[str] = None) -> bool:
    note_html = f'<p style="margin:16px 0;padding:16px;background:#F2F2EC;border-radius:12px;font-style:italic;color:#1C221F;">"{personal_note}"</p>' if personal_note else ""
    body = (
        f"<strong>{inviter_name}</strong> thinks you'd enjoy practicing with Tony. "
        "Tony has been teaching for 40+ years — live online and in studio, plus on-demand programs you can return to whenever. "
        "Your first class is free, and if you become a member, your friend gets a free month too."
        f"{note_html}"
    )
    html = _wrap(f"{inviter_name} invited you to Tony Yoga.", body, "Try a free class", share_url)
    return await send_email(to, f"{inviter_name} invited you to Tony Yoga", html, f"Join: {share_url}")


async def send_booking_confirmation(to: str, class_title: str, when: str, location: str, join_url: Optional[str] = None) -> bool:
    body = (
        f"You're booked into <strong>{class_title}</strong><br/>"
        f"<strong>When:</strong> {when}<br/>"
        f"<strong>Where:</strong> {location}<br/><br/>"
        "Arrive a few minutes early. Bring a mat and water."
    )
    html = _wrap("You're booked.", body, "View booking" if join_url else None, join_url)
    return await send_email(to, f"Booked: {class_title}", html, f"You're booked for {class_title} at {when}.")


async def send_waitlist_promoted(to: str, class_title: str, when: str, location: str, join_url: Optional[str] = None) -> bool:
    body = (
        f"Good news — a spot opened up and you're now <strong>confirmed</strong> for {class_title}.<br/><br/>"
        f"<strong>When:</strong> {when}<br/>"
        f"<strong>Where:</strong> {location}<br/><br/>"
        "See you on the mat. Arrive a few minutes early with a mat and water."
    )
    html = _wrap("You're off the waitlist.", body, "View booking" if join_url else None, join_url)
    return await send_email(to, f"You're in — {class_title}", html, f"A spot opened. You're confirmed for {class_title} at {when}.")


async def send_payment_receipt(to: str, description: str, amount: float, currency: str = "usd", receipt_id: Optional[str] = None) -> bool:
    cur = (currency or "usd").upper()
    amt = f"{cur} {float(amount or 0):,.2f}"
    ref = f'<br/><span style="color:#839682;font-size:12px;">Reference: {receipt_id}</span>' if receipt_id else ""
    body = (
        "Thank you for your purchase — here is your receipt.<br/><br/>"
        f"<strong>{description}</strong><br/>"
        f"<strong>Amount paid:</strong> {amt}{ref}<br/><br/>"
        "This email confirms your payment was received successfully. Namaste."
    )
    html = _wrap("Payment received.", body)
    return await send_email(to, f"Your Tony Yoga receipt — {amt}", html, f"Payment received: {description} — {amt}")


async def send_quiz_result(to: str, program: Optional[dict], membership: Optional[dict],
                           reasons: list, program_url: Optional[str] = None,
                           signup_url: Optional[str] = None) -> bool:
    """Email a visitor their Find Your Path result and gently invite them to sign up."""
    parts = ["Here's the path we mapped for you from your answers:"]
    if program:
        parts.append(
            f"<br/><br/><strong>Your program:</strong> {program.get('title')}"
            + (f" <span style='color:#839682'>· {program.get('level')}</span>" if program.get('level') else "")
        )
    if membership:
        name = membership.get("name") or "membership"
        price = membership.get("price")
        cur = (membership.get("currency") or "usd").upper()
        sym = "€" if cur == "EUR" else "$"
        price_str = f" — {sym}{int(price)}/{membership.get('billing_cycle', 'month')}" if price is not None else ""
        parts.append(f"<br/><strong>Best membership:</strong> {name}{price_str}")
    if reasons:
        parts.append("<br/><br/><span style='color:#839682'>Why:</span><ul style='margin:8px 0;padding-left:18px;color:#545E56;'>"
                     + "".join(f"<li style='margin:4px 0;'>{r}</li>" for r in reasons) + "</ul>")
    parts.append("<br/>Create your free account to save this plan and start practising whenever you're ready.")
    body = "".join(parts)
    html = _wrap("Your path is ready.", body,
                 "Create your free account" if signup_url else None, signup_url)
    text = "Your Find Your Path result — " + (program.get("title") if program else "your plan")
    return await send_email(to, "Your Find Your Path result · Tony Yoga", html, text)



async def send_account_deletion_scheduled(to: str, name: Optional[str], purge_at: str) -> bool:
    """Confirm to a user that their account is scheduled for deletion (30-day grace)."""
    if not to:
        return False
    first = (name or "").split(" ")[0] if name else "there"
    app_url = os.environ.get("FRONTEND_URL", "").rstrip("/") or None
    try:
        when = datetime.fromisoformat(purge_at).strftime("%d %B %Y")
    except Exception:
        when = purge_at
    body = (
        f"Hi {first}, we've received your request to delete your TonYoga account.<br/><br/>"
        f"Your account has been deactivated now and will be <strong>permanently deleted on {when}</strong>. "
        "If you change your mind before then, simply sign back in and choose "
        "<strong>Cancel deletion</strong> in your profile to restore everything.<br/><br/>"
        "After the 30-day window your personal data is erased and cannot be recovered."
    )
    html = _wrap("Your account is scheduled for deletion.", body,
                 "Sign in to cancel" if app_url else None, app_url)
    return await send_email(to, "Your TonYoga account deletion request", html,
                            f"Your TonYoga account will be permanently deleted on {when}. Sign in before then to cancel.")


async def send_deletion_request_ack(to: str) -> bool:
    """Acknowledge a public (no-login) data-deletion request."""
    if not to:
        return False
    body = (
        "We've received your request to delete your TonYoga account and personal data.<br/><br/>"
        "Our team will process it within 30 days. If you can still sign in, you can also delete "
        "your account instantly from your profile.<br/><br/>"
        "If you didn't make this request, you can safely ignore this email."
    )
    html = _wrap("We received your deletion request.", body)
    return await send_email(to, "Your TonYoga data-deletion request", html,
                            "We received your TonYoga data-deletion request and will process it within 30 days.")


async def send_enquiry_admin(enquiry: dict) -> None:
    """Notify the team of a new website enquiry (e.g. Teacher Training lead)."""
    body = (
        f"A new enquiry was submitted from the website.<br/><br/>"
        f"<strong>Name:</strong> {enquiry.get('name') or '—'}<br/>"
        f"<strong>Email:</strong> {enquiry.get('email')}<br/>"
        f"<strong>Phone:</strong> {enquiry.get('phone') or '—'}<br/>"
        f"<strong>Interest:</strong> {enquiry.get('interest') or '—'}<br/>"
        f"<strong>Source:</strong> {enquiry.get('source') or '—'}<br/><br/>"
        f"<strong>Message:</strong><br/>{enquiry.get('message') or ''}"
    )
    html = _wrap("New website enquiry", body)
    for admin_to in RETREAT_ADMIN_EMAILS:
        try:
            await send_email(admin_to, f"New enquiry · {enquiry.get('name') or enquiry.get('email')}", html,
                             f"New enquiry from {enquiry.get('email')}: {(enquiry.get('message') or '')[:200]}")
        except Exception:
            pass


async def send_deletion_request_admin(email: str, reason: str) -> None:
    """Notify the team of a public deletion request so they can action it."""
    body = (
        f"A data-deletion request was submitted via the public form.<br/><br/>"
        f"<strong>Email:</strong> {email}<br/>"
        f"<strong>Reason:</strong> {reason or '—'}<br/><br/>"
        "Please locate and delete this account/data within 30 days to stay compliant."
    )
    html = _wrap("New data-deletion request", body)
    for admin_to in RETREAT_ADMIN_EMAILS:
        try:
            await send_email(admin_to, f"Data-deletion request · {email}", html,
                             f"Data-deletion request for {email}. Reason: {reason or '—'}")
        except Exception:
            pass
