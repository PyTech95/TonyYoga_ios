import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Printer, ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import Logo from "@/components/Logo";

function money(amount, currency) {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency: String(currency || "eur").toUpperCase() }).format(Number(amount || 0)); }
  catch { return `${Number(amount || 0).toFixed(2)} ${String(currency || "").toUpperCase()}`; }
}
function fmtDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso || "").slice(0, 10) : d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}
const PROVIDER = { stripe: "Card (Stripe)", paypal: "PayPal", credit: "Store credit", apple_iap: "Apple", crypto: "Crypto" };

/** /receipt/:id — printable receipt (no app chrome). */
export default function Receipt() {
  const { id } = useParams();
  const { t } = useTranslation();
  const nav = useNavigate();
  const [r, setR] = useState(null);
  useEffect(() => {
    api.get(`/me/payments/${id}/receipt`).then(({ data }) => setR(data)).catch(() => setR(false));
  }, [id]);

  const back = () => { if (window.history.length > 1) nav(-1); else nav("/my-payments"); };

  return (
    <div data-testid="receipt-page" className="min-h-[100dvh] bg-[#FAFAF7] text-[#1C221F]">
      <style>{`@media print { .no-print { display: none !important; } body { background: #fff !important; } .receipt-sheet { box-shadow: none !important; border: none !important; margin: 0 !important; max-width: none !important; } }`}</style>
      <div className="no-print mx-auto max-w-2xl px-5 flex items-center justify-between gap-3" style={{ paddingTop: "calc(var(--sat, 0px) + 16px)" }}>
        <button onClick={back} data-testid="receipt-back" className="pill pill-ghost !py-2 !px-4 !text-sm"><ArrowLeft className="h-4 w-4" /> {t("receipt.back", "Back")}</button>
        {r && <button onClick={() => window.print()} data-testid="receipt-print" className="pill pill-primary !py-2 !px-4 !text-sm"><Printer className="h-4 w-4" /> {t("receipt.print", "Print or save as PDF")}</button>}
      </div>
      {r === null && <div className="mx-auto max-w-2xl px-5 mt-6"><div className="h-96 rounded-3xl bg-[#F2F2EC] animate-pulse" /></div>}
      {r === false && (
        <div className="mx-auto max-w-2xl px-5 mt-10 text-center" data-testid="receipt-missing">
          <div className="serif text-2xl">{t("receipt.missing", "Receipt not found")}</div>
          <p className="text-sm text-[#6B7269] mt-2">{t("receipt.missing_body", "It may belong to another account. Open it from Payments & receipts.")}</p>
        </div>
      )}
      {r && (
        <div className="px-5 sm:px-0 pb-10">
        <article className="receipt-sheet mx-auto max-w-2xl my-6 bg-white rounded-3xl border border-[#E5E6DF] shadow-sm p-6 sm:p-10" data-testid="receipt-sheet">
          <header className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <Logo className="h-12 w-12" />
              <div>
                <div className="serif text-2xl leading-tight">{r.seller.name}</div>
                {r.seller.address && <div className="text-xs text-[#6B7269] whitespace-pre-line">{r.seller.address}</div>}
                {r.seller.tax_id && <div className="text-xs text-[#6B7269]">{t("receipt.tax_id", "Tax ID")}: {r.seller.tax_id}</div>}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-[0.2em] font-semibold text-[#839682]">{t("receipt.title", "Receipt")}</div>
              <div className="text-sm font-semibold" data-testid="receipt-number">{r.number}</div>
              <div className="text-xs text-[#6B7269]">{fmtDate(r.date)}</div>
            </div>
          </header>

          <section className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-[11px] uppercase tracking-widest font-semibold text-[#839682]">{t("receipt.billed_to", "Billed to")}</div>
              <div className="font-semibold mt-1">{r.buyer.name}</div>
              <div className="text-[#6B7269]">{r.buyer.email}</div>
            </div>
            <div className="sm:text-right">
              <div className="text-[11px] uppercase tracking-widest font-semibold text-[#839682]">{t("receipt.paid_with", "Paid with")}</div>
              <div className="mt-1">{PROVIDER[r.provider] || r.provider}</div>
              <div className="text-[#6B7269] capitalize">{String(r.status || "").replace(/_/g, " ")}</div>
            </div>
          </section>

          <table className="mt-8 w-full text-sm" data-testid="receipt-lines">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-[#839682] border-b border-[#E5E6DF]">
                <th className="py-2 font-semibold">{t("receipt.item", "Item")}</th>
                <th className="py-2 font-semibold text-right">{t("receipt.qty", "Qty")}</th>
                <th className="py-2 font-semibold text-right">{t("receipt.amount", "Amount")}</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[#EFEFE9]">
                <td className="py-3 pr-3">{r.description}</td>
                <td className="py-3 text-right">{r.quantity}</td>
                <td className="py-3 text-right">{money(Number(r.amount || 0) + Number(r.credit_applied || 0), r.currency)}</td>
              </tr>
              {r.credit_applied > 0 && (
                <tr className="border-b border-[#EFEFE9] text-[#6B7269]">
                  <td className="py-2" colSpan={2}>{t("receipt.credit", "Store credit applied")}</td>
                  <td className="py-2 text-right">−{money(r.credit_applied, r.currency)}</td>
                </tr>
              )}
              {(r.refunds || []).map((x, i) => (
                <tr key={i} className="border-b border-[#EFEFE9] text-[#8A3B2A]">
                  <td className="py-2" colSpan={2}>{t("receipt.refund", "Refund")} · {fmtDate(x.at)}</td>
                  <td className="py-2 text-right">−{money(x.amount, r.currency)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="pt-4 font-semibold" colSpan={2}>{t("receipt.total_paid", "Total paid")}</td>
                <td className="pt-4 text-right serif text-2xl" data-testid="receipt-total">{money(r.amount, r.currency)}</td>
              </tr>
              {r.refunded_amount > 0 && (
                <tr>
                  <td className="pt-1 text-[#6B7269]" colSpan={2}>{t("receipt.net", "After refunds")}</td>
                  <td className="pt-1 text-right font-semibold">{money(Number(r.amount || 0) - Number(r.refunded_amount || 0), r.currency)}</td>
                </tr>
              )}
            </tfoot>
          </table>

          <footer className="mt-10 pt-6 border-t border-[#E5E6DF] text-xs text-[#6B7269] space-y-1">
            {r.seller.footer && <p className="whitespace-pre-line">{r.seller.footer}</p>}
            <p>{t("receipt.thanks", "Thank you for practising with Tony Yoga.")}</p>
          </footer>
        </article>
        </div>
      )}
    </div>
  );
}
