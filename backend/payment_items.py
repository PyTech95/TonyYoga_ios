"""Extra things that can be paid for through the normal Stripe / PayPal checkout.

Each feature module registers its item types here, so checkout, delivery, receipts and
refunds work the same way for gift memberships, hotel stays and teacher classes.

register("gift_membership",
         price=async (item_id, quantity, user_id, extra) -> (amount, currency, meta),
         fulfill=async (txn) -> None,
         describe=async (txn) -> str,                # receipt / admin wording
         message=async (txn) -> (title, body),       # optional "it's ready" notification
         link=async (txn) -> str,                     # optional page after paying
         meta_keys=("recipient_email", ...),          # values the buyer may send with checkout
         credit=False,                                # can store credit pay for it?
         payee=async (txn_meta) -> {"stripe_account": "acct_…", "application_fee": 1.5} | None)
"""
ITEMS: dict = {}


def register(item_type: str, **spec):
    ITEMS[item_type] = spec


def allowed_extra(item_type: str, metadata) -> dict:
    keys = (ITEMS.get(item_type) or {}).get("meta_keys") or ()
    out = {}
    for k in keys:
        v = (metadata or {}).get(k)
        if v is not None and str(v).strip():
            out[k] = str(v).strip()[:480]
    return out


# Called by the Stripe webhook for subscriptions that are not student memberships (teacher fees):
# async fn(event_type: str, obj: dict) -> None
STRIPE_HOOKS: list = []
