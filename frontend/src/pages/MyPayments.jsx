import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Receipt as ReceiptIcon, Loader2, Gift, ArrowRight, CreditCard, Undo2 } from "lucide-react";
import { api } from "@/lib/api";
import PageHeader from "@/components/PageHeader";

function money(amount, currency) {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency: String(currency || "eur").toUpperCase() }).format(Number(amount || 0)); }
  catch { return `${Number(amount || 0).toFixed(2)} ${String(currency || "").toUpperCase()}`; }
}
function fmtDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
const PROVIDER = { stripe: "Card", paypal: "PayPal", credit: "Store credit", apple_iap: "Apple", crypto: "Crypto" };

/** /my-payments — everything the member paid, with refunds and printable receipts. */
export default function MyPayments() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const load = useCallback(() => {
    api.get("/me/payments").then(({ data: d }) => { setData(d); setError(false); }).catch(() => setError(true));
  }, []);
  useEffect(() => { load(); }, [load]);

  const statusLabel = (p) => p.status === "refunded" ? t("pay.refunded", "Refunded")
    : p.status === "partially_refunded" ? t("pay.partial", "Partly refunded ({{amount}})", { amount: money(p.refunded_amount, p.currency) })
    : t("pay.paid", "Paid");

  return (
    <div data-testid="my-payments-page" className="pb-24">
      <PageHeader eyebrow={t("pay.eyebrow", "Your account")} title={t("pay.title", "Payments & receipts")} back testId="my-payments-header" />
      <div className="mx-auto max-w-2xl px-5 space-y-6">
        {error && (
          <div className="rounded-2xl bg-[#FBEFEA] border border-[#EED9D2] p-4 text-sm text-[#8A3B2A]">
            {t("pay.load_error", "We couldn't load your payments right now.")}{" "}
            <button onClick={load} className="underline font-semibold">{t("common.retry", "Try again")}</button>
          </div>
        )}
        {!data && !error && <div className="space-y-3" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="h-16 rounded-2xl bg-[#F2F2EC] animate-pulse" />)}</div>}

        {data && (
          <div className="grid grid-cols-2 gap-3" data-testid="my-payments-summary">
            <div className="rounded-3xl bg-white border border-[#E5E6DF] p-4">
              <div className="text-[11px] uppercase tracking-widest font-semibold text-[#839682]">{t("pay.total", "Total paid")}</div>
              <div className="serif text-2xl mt-1" data-testid="my-payments-total">
                {Object.keys(data.totals || {}).length ? Object.entries(data.totals).map(([cur, v]) => <div key={cur}>{money(v, cur)}</div>) : money(0, "eur")}
              </div>
            </div>
            <div className="rounded-3xl bg-white border border-[#E5E6DF] p-4">
              <div className="text-[11px] uppercase tracking-widest font-semibold text-[#839682] flex items-center gap-1"><Gift className="h-3.5 w-3.5" /> {t("pay.credit", "Store credit")}</div>
              <div className="serif text-2xl mt-1" data-testid="my-payments-credit">{money(data.store_credit, "eur")}</div>
            </div>
          </div>
        )}

        {data?.pending > 0 && (
          <div data-testid="my-payments-pending" className="rounded-2xl bg-[#FBF6EC] border border-[#E0D3B8] p-4 flex gap-3 text-[13px] text-[#5C5346]">
            <Loader2 className="h-5 w-5 text-[#B25A45] animate-spin shrink-0" />
            {t("pay.pending", "We're still confirming {{n}} payment(s). They appear here automatically, usually within a few minutes.", { n: data.pending })}
          </div>
        )}

        {data && data.payments.length === 0 && (
          <div data-testid="my-payments-empty" className="rounded-3xl bg-white border border-[#E5E6DF] p-8 text-center">
            <CreditCard className="h-8 w-8 text-[#839682] mx-auto" />
            <div className="serif text-2xl mt-3">{t("pay.none", "No payments yet")}</div>
            <p className="text-sm text-[#6B7269] mt-2">{t("pay.none_body", "When you buy a membership, course, class or something from the shop, the receipt appears here.")}</p>
          </div>
        )}

        {data?.payments?.length > 0 && (
          <ul className="rounded-3xl bg-white border border-[#E5E6DF] divide-y divide-[#EFEFE9] overflow-hidden" data-testid="my-payments-list">
            {data.payments.map((p) => (
              <li key={p.id} data-testid={`my-payment-${p.id}`} className="px-4 py-4 flex items-center gap-3">
                <span className="h-10 w-10 rounded-full bg-[#FBF1EE] flex items-center justify-center shrink-0">
                  {p.status === "paid" ? <ReceiptIcon className="h-4 w-4 text-[#B25A45]" /> : <Undo2 className="h-4 w-4 text-[#8A6D3B]" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold leading-snug truncate">{p.description}</div>
                  <div className="text-[12px] text-[#6B7269]">
                    {fmtDate(p.paid_at)} · {PROVIDER[p.provider] || p.provider}
                    {p.credit_applied > 0 && <span> · {t("pay.credit_used", "{{amount}} credit used", { amount: money(p.credit_applied, p.currency) })}</span>}
                  </div>
                  <div className={`text-[10px] uppercase tracking-widest font-bold mt-0.5 ${p.status === "paid" ? "text-[#3E7C57]" : "text-[#8A6D3B]"}`}>{statusLabel(p)}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[14px] font-semibold">{money(p.amount, p.currency)}</div>
                  <Link to={`/receipt/${p.id}`} data-testid={`my-payment-receipt-${p.id}`} className="text-[12px] font-semibold text-[#B25A45] hover:underline">{t("pay.receipt", "Receipt")}</Link>
                </div>
              </li>
            ))}
          </ul>
        )}

        <Link to="/withdraw" data-testid="my-payments-withdraw" className="flex items-center justify-between rounded-2xl bg-white border border-[#E5E6DF] px-4 py-3.5 text-[13px] hover:border-[#B25A45] transition">
          <span>
            <span className="block font-semibold text-[#1C221F]">{t("pay.withdraw", "Changed your mind?")}</span>
            <span className="block text-[#6B7269]">{t("pay.withdraw_body", "Withdraw from a purchase within 14 days (EU).")}</span>
          </span>
          <ArrowRight className="h-4 w-4 text-[#B25A45] shrink-0" />
        </Link>
      </div>
    </div>
  );
}
