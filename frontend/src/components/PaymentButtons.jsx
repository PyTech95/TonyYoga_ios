import { useEffect, useState } from "react";
import { isIOSApp } from "@/lib/iosPlatform";
import IOSPaymentButtons from "./IOSPaymentButtons";
import { toast } from "sonner";
import { CreditCard, ShieldCheck, Gift } from "lucide-react";
import { api } from "@/lib/api";
import { usePaymentProviders } from "@/lib/providers";
import { useAuth } from "@/lib/auth";

/**
 * Twin checkout buttons — PayPal (primary) + Stripe card, with optional
 * gift-card store-credit application.
 *
 * Props:
 *   itemType, itemId, stripeLabel, onBeforeCheckout, disabled, size, variant, testIdPrefix
 *   allowCredit: when true (default), shows an "apply my credit" toggle for logged-in users
 */
export default function PaymentButtons(props) {
  return isIOSApp() ? <IOSPaymentButtons {...props} /> : <WebPaymentButtons {...props} />;
}

function WebPaymentButtons({
  itemType,
  itemId,
  stripeLabel = "Pay with card",
  onBeforeCheckout,
  disabled = false,
  size = "md",
  variant = "vertical",
  testIdPrefix = "pay",
  allowCredit = true,
  quantity = 1,
  metadata = null,
}) {
  const { paypal: paypalAvailable } = usePaymentProviders();
  const { user } = useAuth();
  const isStaff = user?.role === "admin" || user?.role === "instructor";
  const [busy, setBusy] = useState(null); // "stripe" | "paypal" | null
  const [credit, setCredit] = useState(0);
  const [useCredit, setUseCredit] = useState(true);

  useEffect(() => {
    if (!user || isStaff || !allowCredit) { setCredit(0); return; }
    api.get("/me/store-credit")
      .then(({ data }) => setCredit(Number(data?.store_credit || 0)))
      .catch(() => setCredit(0));
  }, [user, isStaff, allowCredit]);

  const applyCredit = allowCredit && credit > 0 && useCredit;

  const handleCreditOnly = (data) => {
    if (data?.credit_only) {
      toast.success("Paid with your gift-card credit.");
      window.location.href = `${window.location.origin}/checkout/success?credit=1`;
      return true;
    }
    return false;
  };

  const start = async (provider) => {
    if (disabled || busy) return;
    let resolvedItemId = itemId;
    if (onBeforeCheckout) {
      const cont = await onBeforeCheckout();
      if (cont === false) return;
      if (cont?.itemId) resolvedItemId = cont.itemId;
    }
    setBusy(provider);
    try {
      const path = provider === "paypal" ? "/paypal/create-order" : "/checkout/session";
      const { data } = await api.post(path, {
        item_type: itemType,
        item_id: resolvedItemId,
        quantity,
        metadata: metadata || undefined,
        origin_url: window.location.origin,
        apply_credit: applyCredit,
      });
      if (handleCreditOnly(data)) return;
      if (data?.url) window.location.href = data.url;
      else toast.error(`Could not start ${provider === "paypal" ? "PayPal" : "Stripe"} checkout`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || (provider === "paypal" ? "PayPal not available yet" : "Checkout failed"));
    } finally { setBusy(null); }
  };

  const pillPad = size === "lg" ? "!py-3.5" : "";
  const wrap = variant === "horizontal" ? "flex gap-2" : "space-y-2";

  if (isStaff) {
    return (
      <div data-testid={`${testIdPrefix}-staff-note`} className="flex items-center gap-2 rounded-2xl bg-[#F2F2EC] border border-[#E5E6DF] px-4 py-3 text-[13px] text-[#6B7269]">
        <ShieldCheck className="h-4 w-4 text-[#839682] shrink-0" />
        <span>Staff preview — checkout is disabled for admin & instructor accounts.</span>
      </div>
    );
  }

  return (
    <div className="space-y-2.5" data-testid={`${testIdPrefix}-wrapper`}>
      {credit > 0 && allowCredit && (
        <label
          data-testid={`${testIdPrefix}-credit-toggle`}
          className="flex items-center gap-3 rounded-2xl border border-[#E0D3B8] bg-[#FBF6EC] px-4 py-3 cursor-pointer"
        >
          <input
            type="checkbox"
            checked={useCredit}
            onChange={(e) => setUseCredit(e.target.checked)}
            className="h-4 w-4 accent-[#B25A45]"
            data-testid={`${testIdPrefix}-credit-checkbox`}
          />
          <Gift className="h-4 w-4 text-[#B25A45] shrink-0" />
          <span className="text-[13px] text-[#5C5346]">
            Apply my gift-card credit <span className="font-semibold text-[#1C221F]">€{credit.toFixed(2)}</span>
          </span>
        </label>
      )}

      <div className={wrap} data-testid={`${testIdPrefix}-buttons`}>
        {paypalAvailable && (
          <button
            onClick={() => start("paypal")}
            disabled={disabled || !!busy}
            data-testid={`${testIdPrefix}-paypal`}
            className={`pill w-full ${pillPad} !bg-[#FFC439] !text-[#003087] hover:!bg-[#F5B800]`}
          >
            <span className="font-bold italic">PayPal</span> {busy === "paypal" ? "· Redirecting…" : "· Pay securely"}
          </button>
        )}
        <button
          onClick={() => start("stripe")}
          disabled={disabled || !!busy}
          data-testid={`${testIdPrefix}-stripe`}
          className={`pill w-full ${pillPad} ${paypalAvailable ? "pill-ghost" : "pill-primary"}`}
        >
          <CreditCard className="h-4 w-4" /> {busy === "stripe" ? "Redirecting…" : (paypalAvailable ? "Or pay with card" : stripeLabel)}
        </button>
      </div>
    </div>
  );
}
