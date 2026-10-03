"""iOS-only commerce policy. No network/database side effects in these helpers."""
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

DIGITAL_TYPES = {"program", "bundle", "membership", "class_one_time", "class_subscription", "drop_in", "class_pack", "product", "workshop_deposit", "workshop_balance"}
APPLE_TYPES = {
    "consumable": "Consumable", "nonConsumable": "Non-Consumable",
    "nonRenewable": "Non-Renewing Subscription", "autoRenewable": "Auto-Renewable Subscription",
}
ALLOWED_TYPES = {
    "program": {"nonRenewable", "autoRenewable"},
    "bundle": {"nonRenewable"},
    "membership": {"autoRenewable", "nonRenewable"},
    "class_subscription": {"autoRenewable", "nonRenewable"},
    "class_one_time": {"consumable"}, "drop_in": {"consumable"}, "class_pack": {"consumable"},
    "product": {"nonConsumable"},
    "workshop_deposit": {"consumable"}, "workshop_balance": {"consumable"},
}

def utc_ms(value):
    if not isinstance(value, (int, float)) or value <= 0:
        raise ValueError("Apple transaction timestamp is missing")
    return datetime.fromtimestamp(value / 1000, timezone.utc)


def validate_product_entry(entry):
    required = ("product_id", "item_type", "item_id", "apple_type", "description")
    if any(not isinstance(entry.get(k), str) or not entry[k].strip() for k in required):
        raise ValueError("An enabled Apple catalog entry is incomplete")
    if entry["item_type"] not in ALLOWED_TYPES or entry["apple_type"] not in ALLOWED_TYPES[entry["item_type"]]:
        raise ValueError("Unsupported Apple product type for this TonYoga item")
    if any("REPLACE" in entry[k].upper() for k in required):
        raise ValueError("Replace all example identifiers before enabling an Apple catalog entry")
    if not entry["product_id"].startswith("com.tonyoga.app."):
        raise ValueError("Apple product IDs must use the TonYoga namespace")
    if entry["apple_type"] == "nonRenewable" and not (1 <= int(entry.get("duration_days", 0)) <= 3650):
        raise ValueError("A non-renewing product requires duration_days (1–3650)")
    if entry["apple_type"] == "autoRenewable" and not str(entry.get("subscription_group_id", "")).isdigit():
        raise ValueError("Auto-renewing products need the actual Apple subscription_group_id")
    return entry


def approved_amazon_print_url(raw):
    try:
        u = urlparse(raw)
        markets = {"amazon.com", "amazon.co.uk", "amazon.de", "amazon.fr", "amazon.es", "amazon.it", "amazon.in", "amazon.ca", "amazon.com.au", "amazon.co.jp", "amazon.nl", "amazon.se", "amazon.pl", "amazon.com.be"}
        host = (u.hostname or "").lower().removeprefix("www.")
        return (u.scheme == "https" and not u.username and not u.password and host in markets
                and ("/dp/" in u.path or "/gp/product/" in u.path)
                and not any(x in (u.path + u.query).lower() for x in ("ebook", "kindle", "audible", "digital")))
    except (TypeError, ValueError):
        return False


def snapshot_window(grant, purchased_at, expires_at=None):
    """Apple dates anchor access; restore/retry never extends a fixed purchase."""
    if expires_at is not None:
        return purchased_at, expires_at
    if grant.get("duration_seconds"):
        return purchased_at, purchased_at + timedelta(seconds=grant["duration_seconds"])
    start = datetime.fromisoformat(grant["starts_at"].replace("Z", "+00:00"))
    end = datetime.fromisoformat(grant["ends_at"].replace("Z", "+00:00"))
    return start, end
