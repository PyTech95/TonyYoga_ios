import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Undo2, CheckCircle2, ArrowLeft, ShieldCheck, Mail } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import PageHeader from "@/components/PageHeader";

const inputCls = "w-full rounded-2xl border border-[#E5E6DF] bg-white px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#B25A45]";

function money(amount, currency) {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency: String(currency || "EUR").toUpperCase() }).format(Number(amount || 0)); }
  catch { return `${Number(amount || 0).toFixed(2)} ${String(currency || "").toUpperCase()}`; }
}
function fmtDateTime(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(undefined, { day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/** EU online withdrawal ("withdraw from contract"): two steps, then an emailed confirmation. */
export default function Withdraw() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [items, setItems] = useState(null);
  const [f, setF] = useState({ name: "", email: "", transaction_id: "", order_reference: "", details: "" });
  const [step, setStep] = useState("form"); // form | confirm | done
  const [summary, setSummary] = useState(null);
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    if (!user) { setItems(null); return; }
    setF((x) => ({ ...x, name: x.name || user.name || "", email: x.email || user.email || "" }));
    api.get("/me/withdrawable").then(({ data }) => setItems(data || [])).catch(() => setItems([]));
  }, [user]);

  const body = (confirm) => ({
    name: f.name.trim(), email: f.email.trim(),
    transaction_id: f.transaction_id || undefined,
    order_reference: f.transaction_id ? undefined : (f.order_reference.trim() || undefined),
    details: f.details.trim() || undefined, confirm,
  });

  const review = async (e) => {
    e?.preventDefault?.();
    if (!f.name.trim() || !f.email.trim()) { toast.error(t("withdraw.need_name", "Please enter your name and email.")); return; }
    setBusy(true);
    try {
      const { data } = await api.post("/withdrawals", body(false));
      setSummary(data.summary);
      setStep("confirm");
      window.scrollTo?.(0, 0);
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(Array.isArray(d) ? t("withdraw.check_fields", "Please check your name and email.") : d || t("withdraw.failed", "Could not send. Please try again."));
    } finally { setBusy(false); }
  };

  const confirm = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/withdrawals", body(true));
      setDone(data);
      setStep("done");
      window.scrollTo?.(0, 0);
    } catch (err) {
      toast.error(err?.response?.data?.detail || t("withdraw.failed", "Could not send. Please try again."));
    } finally { setBusy(false); }
  };

  const chosen = (items || []).find((i) => i.id === f.transaction_id);

  return (
    <div data-testid="withdraw-page" className="pb-24">
      <PageHeader back eyebrow={t("withdraw.eyebrow", "Your right to withdraw")} title={t("withdraw.title", "Withdraw from a purchase")} testId="withdraw-header" />
      <div className="mx-auto max-w-xl px-5 space-y-5">
        {step === "done" && done && (
          <div data-testid="withdraw-done" className="rounded-3xl bg-[#E4F0E8] border border-[#CFE3D6] p-6 space-y-2">
            <CheckCircle2 className="h-8 w-8 text-[#3E7C57]" />
            <div className="serif text-2xl">{t("withdraw.done_title", "We received your withdrawal")}</div>
            <p className="text-[14px] text-[#1C221F]">{t("withdraw.received", "Received on {{date}}.", { date: fmtDateTime(done.received_at) })}</p>
            <p className="text-[14px] text-[#1C221F]">{t("withdraw.reference", "Your reference:")} <span className="font-mono font-semibold" data-testid="withdraw-reference">{done.reference}</span></p>
            <p className="text-[13px] text-[#545E56] flex items-start gap-1.5"><Mail className="h-4 w-4 shrink-0 mt-0.5" />{t("withdraw.emailed", "We emailed you a confirmation. We'll reply within 14 days and refund any money owed the same way you paid.")}</p>
            <Link to={user ? "/my-yoga" : "/"} className="pill pill-ghost mt-2">{t("withdraw.back", "Back to Tony Yoga")}</Link>
          </div>
        )}

        {step === "confirm" && summary && (
          <div data-testid="withdraw-confirm" className="rounded-3xl bg-white border border-[#E5E6DF] p-5 space-y-4">
            <div className="text-[14px] font-semibold">{t("withdraw.check", "Please check and confirm")}</div>
            <dl className="text-[14px] space-y-2">
              <div className="flex justify-between gap-3"><dt className="text-[#6B7269]">{t("withdraw.name", "Name")}</dt><dd className="font-semibold text-right">{summary.name}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-[#6B7269]">{t("withdraw.email", "Email")}</dt><dd className="font-semibold text-right break-all">{summary.email}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-[#6B7269]">{t("withdraw.purchase", "Purchase")}</dt>
                <dd className="font-semibold text-right" data-testid="withdraw-summary-purchase">{chosen ? `${chosen.description} · ${money(chosen.amount, chosen.currency)}` : summary.purchase}</dd></div>
              {summary.details && <div><dt className="text-[#6B7269]">{t("withdraw.details", "Your note")}</dt><dd className="mt-1">{summary.details}</dd></div>}
            </dl>
            <p className="text-[13px] text-[#545E56]">{t("withdraw.statement", "By confirming, you withdraw from the contract for this purchase.")}</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={confirm} disabled={busy} className="pill pill-primary" data-testid="withdraw-confirm-btn"><Undo2 className="h-4 w-4" />{busy ? "…" : t("withdraw.confirm", "Confirm withdrawal")}</button>
              <button onClick={() => setStep("form")} className="pill pill-ghost" data-testid="withdraw-edit"><ArrowLeft className="h-4 w-4" />{t("withdraw.edit", "Change")}</button>
            </div>
          </div>
        )}

        {step === "form" && (
          <>
            <div className="rounded-3xl bg-[#FBF6EC] border border-[#E0D3B8] p-5 text-[14px] text-[#5C5346] leading-relaxed space-y-2" data-testid="withdraw-info">
              <div className="flex items-center gap-2 font-semibold text-[#1C221F]"><ShieldCheck className="h-4 w-4 text-[#B25A45]" />{t("withdraw.info_title", "14 days to change your mind")}</div>
              <p>{t("withdraw.info_1", "If you live in the EU, you can withdraw from an online purchase within 14 days without giving a reason. Use this form — it takes a minute.")}</p>
              <p className="text-[13px]">{t("withdraw.info_2", "For digital content you already started (for example a course you watched), the right of withdrawal may no longer apply. Tony Yoga will tell you within 14 days and refund any money owed the same way you paid.")}</p>
            </div>
            <form onSubmit={review} className="space-y-3" data-testid="withdraw-form">
              <input className={inputCls} placeholder={t("withdraw.name", "Name")} value={f.name} onChange={(e) => set("name", e.target.value)} maxLength={120} required data-testid="withdraw-name" />
              <input className={inputCls} type="email" placeholder={t("withdraw.email", "Email")} value={f.email} onChange={(e) => set("email", e.target.value)} required data-testid="withdraw-email" />
              {user && items && items.length > 0 && (
                <div className="space-y-2" data-testid="withdraw-purchases">
                  <div className="text-[12px] font-semibold text-[#6B7269]">{t("withdraw.which", "Which purchase?")}</div>
                  {items.map((i) => (
                    <label key={i.id} className={`flex items-center gap-3 rounded-2xl border p-3 cursor-pointer ${f.transaction_id === i.id ? "border-[#B25A45] bg-[#FBF1EE]" : "border-[#E5E6DF] bg-white"}`}>
                      <input type="radio" name="purchase" className="accent-[#B25A45]" checked={f.transaction_id === i.id} onChange={() => set("transaction_id", i.id)} data-testid={`withdraw-purchase-${i.id}`} />
                      <span className="min-w-0 flex-1 text-[14px]"><span className="font-semibold">{i.description}</span><span className="block text-[12px] text-[#6B7269]">{money(i.amount, i.currency)} · {fmtDateTime(i.completed_at)}</span></span>
                    </label>
                  ))}
                  <label className={`flex items-center gap-3 rounded-2xl border p-3 cursor-pointer ${!f.transaction_id ? "border-[#B25A45] bg-[#FBF1EE]" : "border-[#E5E6DF] bg-white"}`}>
                    <input type="radio" name="purchase" className="accent-[#B25A45]" checked={!f.transaction_id} onChange={() => set("transaction_id", "")} data-testid="withdraw-purchase-other" />
                    <span className="text-[14px]">{t("withdraw.other", "Something else")}</span>
                  </label>
                </div>
              )}
              {user && items && items.length === 0 && <p className="text-[12px] text-[#6B7269]" data-testid="withdraw-none">{t("withdraw.no_recent", "We found no purchases in the last 14 days on this account. Describe the purchase below.")}</p>}
              {!f.transaction_id && (
                <input className={inputCls} placeholder={t("withdraw.order", "Order or receipt number, or what you bought")} value={f.order_reference} onChange={(e) => set("order_reference", e.target.value)} maxLength={120} data-testid="withdraw-reference-input" />
              )}
              <textarea rows={3} className={inputCls} placeholder={t("withdraw.note", "Anything you'd like to add (optional)")} value={f.details} onChange={(e) => set("details", e.target.value)} maxLength={1500} data-testid="withdraw-details" />
              <button type="submit" disabled={busy} className="pill pill-primary w-full !py-3.5" data-testid="withdraw-review">{busy ? "…" : t("withdraw.continue", "Continue")}</button>
              {!user && <p className="text-[12px] text-[#6B7269] text-center">{t("withdraw.signin_hint", "Have an account?")} <Link to="/login?next=%2Fwithdraw" className="font-semibold text-[#B25A45] underline">{t("withdraw.signin", "Sign in to pick the purchase")}</Link></p>}
            </form>
          </>
        )}
      </div>
    </div>
  );
}
