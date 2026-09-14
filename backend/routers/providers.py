"""Which payment providers are configured and usable right now?"""
import os
from core import api
from routers.settings import get_setting


@api.get("/checkout/providers")
async def checkout_providers():
    """Public — returns which payment options are enabled + configured.
    Frontend uses this to show/hide the PayPal button next to Stripe."""
    # Stripe: relies on STRIPE_API_KEY env (always set to sk_test_emergent in this env)
    from routers.payments import _is_valid_stripe_key
    stripe_ok = bool(await get_setting("stripe_enabled") and await get_setting("stripe_verified_at")
                     and await get_setting("stripe_webhook_secret")
                     and _is_valid_stripe_key(await get_setting("stripe_secret_key")))
    # PayPal: requires either DB settings or env vars for both client_id + client_secret,
    # AND the admin PayPal toggle must be on.
    pp_id = (await get_setting("paypal_client_id")) or os.environ.get("PAYPAL_CLIENT_ID", "")
    pp_secret = (await get_setting("paypal_client_secret")) or os.environ.get("PAYPAL_CLIENT_SECRET", "")
    pp_enabled = bool(await get_setting("paypal_enabled"))
    paypal_ok = bool(pp_enabled and pp_id and pp_secret)
    return {
        "stripe": stripe_ok,
        "stripe_mode": await get_setting("stripe_mode"),
        "paypal": paypal_ok,
        "primary": "paypal" if paypal_ok else "stripe" if stripe_ok else None,
        "paypal_mode": (await get_setting("paypal_mode")) or os.environ.get("PAYPAL_MODE", "sandbox"),
    }
