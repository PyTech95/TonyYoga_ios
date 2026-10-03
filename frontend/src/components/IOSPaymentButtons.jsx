import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { paymentError } from "@/lib/commercePolicy";
import { buyWithApple, getIOSOffer, getAppleProduct, startIOSExternalCheckout, checkIOSExternalCheckout } from "@/lib/iosCommerce";

export default function IOSPaymentButtons({ itemType, itemId, quoteItemId, onBeforeCheckout, disabled = false, quantity = 1, testIdPrefix = "ios-pay" }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const [offer, setOffer] = useState(null), [product, setProduct] = useState(null);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [opened, setOpened] = useState(false);
  useEffect(() => {
    let active = true;
    setOffer(null); setProduct(null); setError("");
    getIOSOffer(itemType, quoteItemId || itemId).then(async data => {
      if (!active) return;
      setOffer(data);
      if (data.route === "iap") {
        const apple = await getAppleProduct(data.product_id);
        if (apple.type !== data.apple_type) throw new Error("This App Store item is not configured correctly.");
        if (active) setProduct(apple);
      }
    }).catch(e => { if (active) setError(paymentError(e)); });
    return () => { active = false; };
  }, [itemType, itemId, quoteItemId, retry]);
  if (user?.role === "admin" || user?.role === "instructor") return <p className="text-sm text-[#6B7269]">Staff preview — checkout is disabled.</p>;
  const purchase = async () => {
    if (disabled || busy) return;
    if (!user) { nav(`/login?next=${encodeURIComponent(window.location.pathname)}`); return; }
    setBusy(true); setError("");
    try {
      let resolvedId = itemId;
      if (onBeforeCheckout) {
        const prepared = await onBeforeCheckout();
        if (prepared === false) return;
        // Cart creates its order asynchronously; use the returned ID, not a stale React prop.
        if (prepared?.itemId) resolvedId = prepared.itemId;
      }
      if (offer?.route === "external") {
        await startIOSExternalCheckout(itemType, resolvedId, quantity);
        setOpened(true);
        toast("Finish PayPal checkout in your browser, then return here.");
      } else if (offer?.route === "iap") {
        const result = await buyWithApple(itemType, resolvedId);
        if (result.status === "pending") toast("Awaiting approval from Apple. Access appears after the payment is approved.");
        if (result.status === "success") toast.success("Purchase verified. Your account has been updated.");
      } else throw new Error(offer?.message || "This item is not available for purchase in the app.");
    } catch (e) { setError(paymentError(e)); }
    finally { setBusy(false); }
  };
  const confirm = async () => {
    setBusy(true); setError("");
    try {
      const result = await checkIOSExternalCheckout();
      if (result?.status === "paid") { toast.success("Payment confirmed. Your account is updated."); setOpened(false); }
      else toast("Payment is not confirmed yet. Finish checkout in the browser and try again.");
    } catch(e) { setError(paymentError(e)); } finally { setBusy(false); }
  };
  return <div className="space-y-3" data-testid={`${testIdPrefix}-ios-wrapper`}>
    {offer?.route === "unavailable" ? <p role="status" className="text-sm text-[#6B7269]">{offer.message}</p> :
      <button onClick={purchase} disabled={disabled || busy || !offer || (offer.route === "iap" && !product)} className="pill pill-primary w-full disabled:opacity-50" data-testid={`${testIdPrefix}-ios-buy`}>
        {busy ? "Please wait…" : !offer ? "Loading purchase options…" : offer.route === "external" ? "Continue with PayPal" : product ? `${product.type === "autoRenewable" ? "Subscribe" : "Buy"} · ${product.displayPrice}` : "Checking App Store…"}
      </button>}
    {offer?.route === "external" && <p className="text-xs text-[#6B7269]">{offer.explanation} Secure PayPal checkout opens in your browser. The purchase stays linked to this TonYoga account.</p>}
    {product && <div className="text-xs text-[#6B7269] space-y-1">
      <p>{offer?.description}</p>
      <p>{product.type === "autoRenewable" ? `Renews ${product.periodLabel || "each billing period"} unless cancelled at least 24 hours before renewal. Manage or cancel in your Apple account.` : product.type === "nonRenewable" ? "One payment for the stated access period. No automatic renewal." : "One-time purchase. Payment is charged to your Apple account."}</p>
      <p><Link to="/privacy" className="underline">Privacy</Link> · <Link to="/terms" className="underline">Terms</Link> · <Link to="/profile" className="underline">Restore purchases</Link></p>
    </div>}
    {opened && <button onClick={confirm} disabled={busy} className="pill pill-ghost w-full" data-testid={`${testIdPrefix}-confirm`}>I have returned — check payment</button>}
    {error && <div role="alert" className="text-sm text-[#B25A45]"><p>{error}</p><button className="underline mt-1" disabled={busy} onClick={() => setRetry(r => r + 1)}>Retry purchase options</button></div>}
  </div>;
}
