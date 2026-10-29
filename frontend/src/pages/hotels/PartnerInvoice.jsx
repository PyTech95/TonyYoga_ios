import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Printer, ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import Logo from "@/components/Logo";
import { fmtDate, money, errText } from "./hotelShared";

/** Printable quote / deposit / balance invoice for a hotel stay (no app chrome). */
export default function PartnerInvoice() {
  const { t } = useTranslation();
  const { stayId, kind } = useParams();
  const [inv, setInv] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get(`/partner/stays/${stayId}/invoice/${kind}`).then(({ data }) => setInv(data)).catch((e) => setError(errText(e, t("invoice.error", "This invoice isn't available."))));
  }, [stayId, kind, t]);

  const titles = { quote: t("invoice.quote", "Quote"), deposit: t("invoice.deposit", "Deposit invoice"), balance: t("invoice.balance", "Balance invoice") };

  return (
    <div className="min-h-screen bg-[#F2F2EC] print:bg-white py-6 print:py-0" data-testid="partner-invoice-page">
      <style>{"@media print { @page { margin: 16mm; } .ty-no-print { display: none !important; } .ty-sheet { box-shadow: none !important; border: none !important; } }"}</style>
      <div className="ty-no-print mx-auto max-w-3xl px-4 mb-4 flex items-center justify-between gap-3">
        <Link to={`/partner?stay=${stayId}`} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#6B7269]" data-testid="partner-invoice-back"><ArrowLeft className="h-4 w-4" />{t("invoice.back", "Back to the stay")}</Link>
        {inv && <button onClick={() => window.print()} className="pill pill-primary !py-2 !px-4 !text-xs" data-testid="partner-invoice-print"><Printer className="h-3.5 w-3.5" />{t("invoice.print", "Print or save as PDF")}</button>}
      </div>
      {error && <div className="mx-auto max-w-3xl px-4"><div className="rounded-2xl bg-[#FBEFEA] border border-[#EED9D2] p-4 text-sm text-[#8A3B2A]" data-testid="partner-invoice-error">{error}</div></div>}
      {!inv && !error && <div className="mx-auto max-w-3xl px-4"><div className="h-[600px] rounded-3xl bg-white animate-pulse" /></div>}
      {inv && (
        <article className="ty-sheet mx-auto max-w-3xl bg-white rounded-3xl border border-[#E5E6DF] shadow-sm p-8 sm:p-12 text-[#1C221F]" data-testid="partner-invoice">
          <header className="flex items-start justify-between gap-6">
            <div className="flex items-center gap-3">
              <Logo className="h-12 w-12" />
              <div>
                <div className="font-semibold">{inv.seller.name}</div>
                {inv.seller.address && <div className="text-[12px] text-[#545E56] whitespace-pre-wrap">{inv.seller.address}</div>}
                {inv.seller.tax_id && <div className="text-[12px] text-[#545E56]">{t("invoice.tax_id", "Tax ID")}: {inv.seller.tax_id}</div>}
              </div>
            </div>
            <div className="text-right">
              <div className="serif text-3xl" data-testid="partner-invoice-title">{titles[inv.kind] || inv.kind}</div>
              <div className="text-[13px] text-[#545E56] mt-1">{t("invoice.number", "No.")} <span className="font-semibold" data-testid="partner-invoice-number">{inv.number}</span></div>
              <div className="text-[13px] text-[#545E56]">{t("invoice.date", "Date")}: {fmtDate(inv.date)}</div>
            </div>
          </header>

          <section className="mt-10">
            <div className="text-[11px] uppercase tracking-widest font-semibold text-[#839682]">{t("invoice.bill_to", "Bill to")}</div>
            <div className="mt-1 font-semibold">{inv.buyer.name}</div>
            {inv.buyer.address && <div className="text-[13px] text-[#545E56] whitespace-pre-wrap">{inv.buyer.address}</div>}
            {inv.buyer.vat_number && <div className="text-[13px] text-[#545E56]">{t("invoice.vat", "VAT")}: {inv.buyer.vat_number}</div>}
          </section>

          <table className="w-full mt-8 text-[14px]">
            <thead>
              <tr className="border-b-2 border-[#1C221F] text-left text-[11px] uppercase tracking-widest"><th className="py-2">{t("invoice.description", "Description")}</th><th className="py-2 text-right">{t("invoice.amount", "Amount")}</th></tr>
            </thead>
            <tbody className="divide-y divide-[#E5E6DF]">
              {inv.lines.map((l, i) => (
                <tr key={i} data-testid="partner-invoice-line"><td className="py-3 pr-4">{l.label}</td><td className="py-3 text-right whitespace-nowrap">{money(l.amount, inv.currency)}</td></tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[#1C221F]"><td className="pt-3 font-semibold">{t("invoice.total", "Programme total")}</td><td className="pt-3 text-right font-semibold" data-testid="partner-invoice-total">{money(inv.total, inv.currency)}</td></tr>
              <tr><td className="pt-2 text-[#545E56]">{t("invoice.deposit_row", "Deposit")}</td><td className="pt-2 text-right text-[#545E56]">{money(inv.deposit, inv.currency)}</td></tr>
              <tr><td className="pt-1 text-[#545E56]">{t("invoice.balance_row", "Balance due by {{date}}", { date: fmtDate(inv.balance_due) })}</td><td className="pt-1 text-right text-[#545E56]">{money(inv.balance, inv.currency)}</td></tr>
            </tfoot>
          </table>

          {inv.kind !== "quote" && (
            <div className="mt-8 rounded-2xl bg-[#E4F0E8] text-[#2E6A47] p-4 text-[14px]" data-testid="partner-invoice-paid">
              <span className="font-semibold">{t("invoice.paid", "Paid")} {money(inv.paid_amount, inv.currency)}</span> · {fmtDate(inv.paid_at)}{inv.provider ? ` · ${String(inv.provider).replace(/^./, (c) => c.toUpperCase())}` : ""}
            </div>
          )}
          {inv.kind === "quote" && (
            <p className="mt-8 text-[13px] text-[#545E56]">{t("invoice.quote_note", "This quote covers the yoga programme only. Rooms, meals and transfers are sold by the hotel to its guests.")}</p>
          )}
          {inv.terms && (
            <section className="mt-8">
              <div className="text-[11px] uppercase tracking-widest font-semibold text-[#839682]">{t("invoice.terms", "Cancellation terms")}</div>
              <p className="mt-1 text-[12px] text-[#545E56] leading-relaxed whitespace-pre-wrap">{inv.terms}</p>
            </section>
          )}
          {inv.seller.footer && <footer className="mt-10 pt-4 border-t border-[#E5E6DF] text-[11px] text-[#6B7269] whitespace-pre-wrap">{inv.seller.footer}</footer>}
        </article>
      )}
    </div>
  );
}
