import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { isIOSApp } from "@/lib/iosPlatform";
import { restoreApplePurchases, openIOSExternal } from "@/lib/iosCommerce";
import { paymentError } from "@/lib/commercePolicy";

export default function IOSPurchaseSettings() {
  const [busy, setBusy] = useState(false);
  if (!isIOSApp()) return null;
  const restore = async () => {
    setBusy(true);
    try {
      const result = await restoreApplePurchases(true);
      if (result.failed || result.truncated) toast("Some purchases could not be verified for this TonYoga account. Sign in to the account used for purchase or contact support.");
      else toast.success(result.restored ? "Purchases restored and account access refreshed." : "Your purchase history has been checked. Existing access remains on your account.");
    } catch(e) { toast.error(paymentError(e)); } finally { setBusy(false); }
  };
  return <section className="rounded-3xl bg-white border border-[#E5E6DF] p-5 space-y-3" data-testid="ios-purchase-settings">
    <h3 className="serif text-xl">Apple purchases</h3>
    <button disabled={busy} onClick={restore} className="pill pill-primary w-full">{busy ? "Restoring…" : "Restore purchases"}</button>
    <button onClick={() => openIOSExternal("https://apps.apple.com/account/subscriptions").catch(e => toast.error(paymentError(e)))} className="pill pill-ghost w-full">Manage Apple subscriptions</button>
    <p className="text-xs text-[#6B7269]">Restore using the same Apple account and TonYoga account. Deleting your TonYoga account does not cancel Apple subscriptions.</p>
    <p className="text-xs"><Link className="underline" to="/privacy">Privacy</Link> · <Link className="underline" to="/terms">Terms of use</Link></p>
  </section>;
}
