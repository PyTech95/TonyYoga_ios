"""Plain English names for values the website stores as translation keys (e.g. membership
plans seeded as "i18n:memb.plan.essential.name"). Used wherever text leaves the website:
PayPal/Stripe order descriptions, receipts, emails and admin screens."""

I18N_EN = {
    "i18n:memb.plan.essential.name": "Essential",
    "i18n:memb.plan.essential.desc": "Online-only membership. Two live classes a week + full on-demand library + one program included.",
    "i18n:memb.plan.unlimited.name": "Unlimited",
    "i18n:memb.plan.unlimited.desc": "Everything Essential plus unlimited live classes (online + in-studio), all programs and workshops.",
    "i18n:memb.plan.annual.name": "Annual VIP",
    "i18n:memb.plan.annual.desc": "One year, everything included, plus offline downloads and priority support.",
    "i18n:memb.feat.live_2pw": "2 live classes / week",
    "i18n:memb.feat.live_unlimited": "Unlimited live classes",
    "i18n:memb.feat.library_full": "Full on-demand library",
    "i18n:memb.feat.programs_one": "1 program included",
    "i18n:memb.feat.programs_all": "All programs included",
    "i18n:memb.feat.workshops_10": "10 workshops / year",
    "i18n:memb.feat.workshops_20": "20 workshops / year",
    "i18n:memb.feat.private_disc": "Private session discount",
    "i18n:memb.feat.community": "Community access",
    "i18n:memb.feat.cancel_any": "Cancel anytime",
    "i18n:memb.feat.priority_support": "Priority support",
    "i18n:memb.feat.offline_downloads": "Offline downloads",
}


def plain(value) -> str:
    """'i18n:memb.plan.essential.name' -> 'Essential'; any other text is returned unchanged."""
    if not isinstance(value, str):
        return "" if value is None else str(value)
    if not value.startswith("i18n:"):
        return value
    if value in I18N_EN:
        return I18N_EN[value]
    parts = value[5:].split(".")
    word = parts[-2] if len(parts) >= 2 and parts[-1] in ("name", "title", "desc") else parts[-1]
    return word.replace("_", " ").strip().title()


def plan_name(plan) -> str:
    return plain((plan or {}).get("name")) or "Membership"
