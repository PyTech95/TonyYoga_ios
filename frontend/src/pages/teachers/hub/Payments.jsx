import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { CreditCard, ExternalLink, Wallet, CheckCircle2, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import { publicOrigin } from "@/lib/platform";
import { Label, LabelText, Section, errText, inputCls, money, moneyMap } from "../teacherShared";

export default function Payments({ me, reload }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState(me.payment_mode || "offline");
  const [note, setNote] = useState(me.offline_payment_note || "");
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [income, setIncome] = useState(null);

  useEffect(() => {
    if (!me.stripe_account_id) { setStatus({ connected: false }); return; }
    api.get("/teacher/stripe/status").then(({ data }) => setStatus(data)).catch(() => setStatus({ connected: true, error: true }));
  }, [me.stripe_account_id]);
  const loadIncome = useCallback(() => {
    api.get(`/teacher/income?year=${year}`).then(({ data }) => setIncome(data)).catch(() => setIncome(null));
  }, [year]);
  useEffect(() => { loadIncome(); }, [loadIncome]);

  const connect = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/teacher/stripe/connect", { origin_url: publicOrigin() });
      if (data?.url) window.location.href = data.url;
    } catch (e) { toast.error(errText(e)); setBusy(false); }
  };
  const dashboard = async () => {
    setBusy(true);
    try { const { data } = await api.post("/teacher/stripe/dashboard"); if (data?.url) window.open(data.url, "_blank", "noopener"); }
    catch (e) { toast.error(errText(e)); }
    finally { setBusy(false); }
  };
  const saveMode = async () => {
    setBusy(true);
    try { await api.patch("/teacher/me", { payment_mode: mode, offline_payment_note: note }); toast.success(t("hub.saved", "Saved.")); reload(); }
    catch (e) { toast.error(errText(e)); }
    finally { setBusy(false); }
  };

  const ready = !!(status?.charges_enabled || me.charges_enabled);
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);

  return (
    <div className="space-y-6" data-testid="hub-payments">
      <Section icon={CreditCard} title={t("hub.payouts", "Card payments and payouts")}>
        <div className="rounded-3xl bg-white border border-[#E5E6DF] p-5 space-y-3" data-testid="stripe-card">
          <p className="text-[13px] text-[#545E56]">{t("hub.stripe_intro", "Students pay you directly through your own Stripe account and Stripe pays out to your bank. You are the seller; Tony Yoga never holds your money.")}</p>
          {status === null ? <div className="h-8 rounded-xl bg-[#F2F2EC] animate-pulse" /> : ready ? (
            <div className="flex items-center gap-2 text-[14px] font-semibold text-[#3E7C57]" data-testid="stripe-ready"><CheckCircle2 className="h-5 w-5" />{t("hub.stripe_ok", "Stripe connected — card payments on")}</div>
          ) : status.connected ? (
            <div className="flex items-center gap-2 text-[13px] text-[#8A6D3B]" data-testid="stripe-unfinished"><AlertTriangle className="h-4 w-4" />{t("hub.stripe_needs", "Stripe needs a few more details before you can take payments.")}</div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {!ready && <button type="button" onClick={connect} disabled={busy} className="pill pill-primary" data-testid="stripe-connect">{status?.connected ? t("hub.stripe_finish", "Finish Stripe setup") : t("hub.stripe_connect", "Connect Stripe")}</button>}
            {status?.connected && <button type="button" onClick={dashboard} disabled={busy} className="pill pill-ghost" data-testid="stripe-dashboard"><ExternalLink className="h-4 w-4" />{t("hub.stripe_dash", "Stripe dashboard")}</button>}
          </div>
        </div>
      </Section>

      <Section icon={Wallet} title={t("hub.how_paid", "How students pay you")}>
        <div className="rounded-3xl bg-white border border-[#E5E6DF] p-5 space-y-3" data-testid="payment-mode">
          {[["online", t("hub.mode_online", "Online by card (through my Stripe)")], ["offline", t("hub.mode_offline", "In person or by bank transfer")]].map(([v, label]) => (
            <label key={v} className={`flex items-center gap-3 rounded-2xl border p-3 ${mode === v ? "border-[#B25A45] bg-[#FBF1EE]" : "border-[#E5E6DF]"} ${v === "online" && !ready ? "opacity-50" : ""}`}>
              <input type="radio" name="paymode" value={v} checked={mode === v} disabled={v === "online" && !ready} onChange={() => setMode(v)} className="accent-[#B25A45]" data-testid={`payment-mode-${v}`} />
              <span className="text-[14px]">{label}</span>
            </label>
          ))}
          {mode === "offline" && (
            <Label hint={t("hub.offline_note_hint", "Shown on your profile, e.g. “Pay by Bizum or cash at the studio.”")}><LabelText>{t("hub.offline_note", "Payment instructions")}</LabelText>
              <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className={inputCls} data-testid="payment-note" /></Label>
          )}
          <button type="button" onClick={saveMode} disabled={busy} className="pill pill-primary" data-testid="payment-mode-save">{t("hub.save", "Save")}</button>
        </div>
      </Section>

      <Section icon={Wallet} title={t("hub.income", "Income")} action={
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-full border border-[#E5E6DF] bg-white px-3 py-1 text-[12px] font-semibold" data-testid="income-year">
          {[thisYear, thisYear - 1, thisYear - 2].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>}>
        <div className="rounded-3xl bg-white border border-[#E5E6DF] p-5" data-testid="income-card">
          {!income ? <div className="h-20 rounded-xl bg-[#F2F2EC] animate-pulse" /> : (
            <>
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div><div className="serif text-3xl" data-testid="income-total">{moneyMap(income.total)}</div><div className="text-[12px] text-[#6B7269]">{t("hub.n_sales", "{{n}} paid bookings", { n: income.sales })}</div></div>
                {Object.keys(income.platform_fees || {}).length > 0 && <div className="text-[12px] text-[#6B7269]">{t("hub.platform_fees", "Platform fees")}: {moneyMap(income.platform_fees)}</div>}
              </div>
              <table className="mt-4 w-full text-[13px]">
                <tbody>
                  {months.map((m) => {
                    const v = income.months?.[m];
                    return (
                      <tr key={m} className="border-t border-[#F0F0EA]">
                        <td className="py-1.5 text-[#6B7269]">{new Date(`${m}-15T12:00:00`).toLocaleDateString(undefined, { month: "long" })}</td>
                        <td className="py-1.5 text-right font-semibold">{v ? Object.entries(v).map(([c, a]) => money(a, c)).join(" · ") : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-[11px] text-[#9AA096] mt-3">{t("hub.income_note", "Card payments and payments you marked as received. Refunds are made from your Stripe dashboard.")}</p>
            </>
          )}
        </div>
      </Section>
    </div>
  );
}
