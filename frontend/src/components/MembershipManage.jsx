import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { PauseCircle, PlayCircle, XCircle, CreditCard, Gift, Undo2, Apple, RotateCcw } from "lucide-react";
import { api } from "@/lib/api";
import { publicOrigin } from "@/lib/platform";
import { isIOSApp } from "@/lib/iosPlatform";

let optionsPromise = null;
function loadOptions() {
  if (!optionsPromise) optionsPromise = api.get("/me/memberships/options").then(({ data }) => data).catch(() => { optionsPromise = null; return null; });
  return optionsPromise;
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso).slice(0, 10) : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

const err = (e, f) => e?.response?.data?.detail || f;

/** Opens Stripe's page where the member updates their card (members with automatic card payments). */
export async function openBillingPortal() {
  try {
    const { data } = await api.post("/me/billing-portal", { origin_url: publicOrigin(), client: isIOSApp() ? "app" : undefined });
    if (data?.url) window.location.href = data.url;
  } catch (e) { toast.error(err(e, "The card page is unavailable right now.")); }
}

/** Self-service actions under a membership on My Yoga: pause / resume, cancel with a reason
 *  (and Tony's stay offer), keep, update card, withdraw. */
export default function MembershipManage({ membership: m, onChanged }) {
  const { t } = useTranslation();
  const [opts, setOpts] = useState(null);
  const [panel, setPanel] = useState(null); // "pause" | "cancel" | "offer"
  const [months, setMonths] = useState(1);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { let live = true; loadOptions().then((o) => { if (live) setOpts(o); }); return () => { live = false; }; }, []);

  if (!m || ["cancelled", "expired", "replaced"].includes(m.state)) return null;

  const apple = m.managed_by === "apple";
  const stripe = m.managed_by === "stripe";
  const lifetime = String(m.end_date || "").startsWith("2099");
  const canPause = opts?.pause_enabled && !apple && !lifetime && m.state === "active" && !m.cancel_at_period_end;
  const canCancel = !apple && !m.cancel_at_period_end && ["active", "paused", "past_due"].includes(m.state);

  const post = async (path, body, ok) => {
    setBusy(true);
    try {
      const { data } = await api.post(path, body);
      if (ok) toast.success(typeof ok === "function" ? ok(data) : ok);
      setPanel(null);
      onChanged?.();
      return data;
    } catch (e) { toast.error(err(e, t("manage.failed", "That didn't work. Please try again."))); return null; }
    finally { setBusy(false); }
  };

  const pause = () => post(`/me/memberships/${m.id}/pause`, { months: Number(months) },
    (d) => t("manage.paused", "Paused until {{date}}. Your unused days are kept.", { date: fmtDate(d?.resume_at) }));
  const resume = () => post(`/me/memberships/${m.id}/resume`, {}, t("manage.resumed", "Welcome back! Your membership is active again."));
  const keep = () => post(`/me/memberships/${m.id}/keep`, {}, t("manage.kept", "Great — your membership continues."));
  const cancel = (acceptOffer) => post(`/me/memberships/${m.id}/cancel`, { reason, details: details.trim() || undefined, accept_offer: acceptOffer },
    (d) => (d?.stayed ? t("manage.stayed", "Thank you for staying! {{credit}} credit was added to your account.", { credit: Number(d.credit || 0).toFixed(2) })
      : t("manage.cancelled", "Cancelled. You keep full access until {{date}}.", { date: fmtDate(d?.access_until || m.end_date) })));

  const continueCancel = () => {
    if (!reason) { toast.error(t("manage.pick_reason", "Please tell us why — it helps Tony improve.")); return; }
    if (opts?.stay_offer?.percent > 0) setPanel("offer"); else cancel(false);
  };

  const maxMonths = Math.max(1, Number(opts?.pause_max_months || 3));
  const btn = "inline-flex items-center gap-1.5 rounded-full border border-[#E5E6DF] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#1C221F] hover:border-[#B25A45] disabled:opacity-50";

  return (
    <div className="mt-4 border-t border-[#EFEFE9] pt-3 space-y-3" data-testid={`membership-manage-${m.id}`}>
      {m.state === "paused" && (
        <div data-testid="membership-paused-note" className="rounded-2xl bg-[#F3E7C9]/60 border border-[#E9D9B0] p-3 text-[13px] text-[#5C5346]">
          {t("manage.paused_note", "Paused until {{date}}. Resume any time — your remaining days come back.", { date: fmtDate(m.resume_at) })}
        </div>
      )}
      {m.cancel_at_period_end && (
        <div data-testid="membership-wont-renew" className="rounded-2xl bg-[#FBEFEA] border border-[#EED9D2] p-3 text-[13px] text-[#8A3B2A]">
          {t("manage.wont_renew", "Won't renew — you keep access until {{date}}.", { date: fmtDate(m.end_date) })}
        </div>
      )}
      {stripe && isIOSApp() && (
        <p className="text-[12px] text-[#6B7269]">{t("manage.card_web", "Your card and invoices are managed on tonyoga.com (My Yoga).")}</p>
      )}
      {apple && (
        <p data-testid="membership-apple-note" className="text-[12px] text-[#6B7269] flex items-start gap-1.5">
          <Apple className="h-4 w-4 shrink-0" />
          {t("manage.apple", "Bought through Apple. Pause, cancel or change it in Settings → your name → Subscriptions on your iPhone.")}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {m.state === "paused" && <button disabled={busy} onClick={resume} className={btn} data-testid="membership-resume"><PlayCircle className="h-3.5 w-3.5" />{t("manage.resume", "Resume now")}</button>}
        {canPause && <button disabled={busy} onClick={() => setPanel(panel === "pause" ? null : "pause")} className={btn} data-testid="membership-pause"><PauseCircle className="h-3.5 w-3.5" />{t("manage.pause", "Pause")}</button>}
        {m.cancel_at_period_end && <button disabled={busy} onClick={keep} className={btn} data-testid="membership-keep"><RotateCcw className="h-3.5 w-3.5" />{t("manage.keep", "Keep my membership")}</button>}
        {stripe && !isIOSApp() && <button disabled={busy} onClick={openBillingPortal} className={btn} data-testid="membership-update-card"><CreditCard className="h-3.5 w-3.5" />{t("manage.card", "Update card & invoices")}</button>}
        {canCancel && <button disabled={busy} onClick={() => setPanel(panel === "cancel" ? null : "cancel")} className={`${btn} !text-[#8A3B2A]`} data-testid="membership-cancel"><XCircle className="h-3.5 w-3.5" />{stripe ? t("manage.cancel_renewal", "Cancel renewal") : t("manage.cancel", "Cancel membership")}</button>}
        {!apple && <Link to="/withdraw" className={`${btn} !border-transparent !bg-transparent !px-1 text-[#6B7269]`} data-testid="membership-withdraw"><Undo2 className="h-3.5 w-3.5" />{t("manage.withdraw", "Withdraw within 14 days (EU)")}</Link>}
      </div>

      {panel === "pause" && (
        <div data-testid="membership-pause-panel" className="rounded-2xl bg-[#FAFAF7] border border-[#E5E6DF] p-4 space-y-3">
          <div className="text-[14px] font-semibold">{t("manage.pause_title", "Take a break")}</div>
          <p className="text-[13px] text-[#6B7269]">{t("manage.pause_body", "Your access stops while paused and the days you haven't used are added back when you resume. You can pause once every 6 months.")}</p>
          <div className="flex flex-wrap gap-2" role="radiogroup">
            {Array.from({ length: maxMonths }, (_, i) => i + 1).map((n) => (
              <button key={n} type="button" onClick={() => setMonths(n)} role="radio" aria-checked={months === n} data-testid={`membership-pause-${n}`}
                className={`rounded-full px-4 py-2 text-[13px] font-semibold border ${months === n ? "bg-[#1C221F] text-white border-[#1C221F]" : "bg-white border-[#E5E6DF]"}`}>
                {n === 1 ? t("manage.one_month", "1 month") : t("manage.n_months", "{{n}} months", { n })}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button disabled={busy} onClick={pause} className="pill pill-primary !py-2 !px-4 !text-xs" data-testid="membership-pause-confirm">{busy ? "…" : t("manage.pause_confirm", "Pause membership")}</button>
            <button onClick={() => setPanel(null)} className="text-[12px] text-[#6B7269] px-2">{t("common.cancel", "Cancel")}</button>
          </div>
        </div>
      )}

      {panel === "cancel" && (
        <div data-testid="membership-cancel-panel" className="rounded-2xl bg-[#FAFAF7] border border-[#E5E6DF] p-4 space-y-3">
          <div className="text-[14px] font-semibold">{t("manage.why", "Before you go — why are you cancelling?")}</div>
          <div className="space-y-1.5" role="radiogroup">
            {(opts?.reasons || []).map((r) => (
              <label key={r.id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-[13px] cursor-pointer ${reason === r.id ? "border-[#B25A45] bg-[#FBF1EE]" : "border-[#E5E6DF] bg-white"}`}>
                <input type="radio" name={`reason-${m.id}`} className="accent-[#B25A45]" checked={reason === r.id} onChange={() => setReason(r.id)} data-testid={`membership-reason-${r.id}`} />
                {r.label}
              </label>
            ))}
          </div>
          <textarea rows={2} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000}
            placeholder={t("manage.details", "Anything else Tony should know? (optional)")}
            className="w-full rounded-2xl border border-[#E5E6DF] bg-white px-4 py-2.5 text-[14px] focus:outline-none focus:ring-2 focus:ring-[#B25A45]" data-testid="membership-cancel-details" />
          {m.state === "active" && opts?.pause_enabled && canPause && (
            <button type="button" onClick={() => setPanel("pause")} className="text-[13px] font-semibold text-[#B25A45] underline" data-testid="membership-cancel-pause-instead">
              {t("manage.pause_instead", "Need a break? Pause instead and keep your days.")}
            </button>
          )}
          <div className="flex gap-2">
            <button disabled={busy} onClick={continueCancel} className="pill !py-2 !px-4 !text-xs !bg-[#8A3B2A] !text-white" data-testid="membership-cancel-continue">{t("manage.continue", "Continue")}</button>
            <button onClick={() => setPanel(null)} className="text-[12px] text-[#6B7269] px-2">{t("manage.never_mind", "Never mind")}</button>
          </div>
        </div>
      )}

      {panel === "offer" && opts?.stay_offer && (
        <div data-testid="membership-offer-panel" className="rounded-2xl bg-[#1C221F] text-[#FAFAF7] p-4 space-y-3">
          <div className="flex items-center gap-2 text-[#E8B8A8]"><Gift className="h-4 w-4" /><span className="text-[11px] uppercase tracking-[0.2em] font-semibold">{t("manage.offer_eyebrow", "A thank-you from Tony")}</span></div>
          <div className="serif text-xl leading-snug">{opts.stay_offer.text || t("manage.offer_default", "Stay with us and get {{p}}% of your plan back as credit.", { p: opts.stay_offer.percent })}</div>
          <div className="flex flex-wrap gap-2">
            <button disabled={busy} onClick={() => cancel(true)} className="pill !py-2 !px-4 !text-xs bg-[#B25A45] text-white" data-testid="membership-offer-accept">
              {t("manage.offer_accept", "Stay and get {{p}}% credit", { p: opts.stay_offer.percent })}
            </button>
            <button disabled={busy} onClick={() => cancel(false)} className="pill !py-2 !px-4 !text-xs bg-white/10 text-white border border-white/30" data-testid="membership-offer-decline">
              {t("manage.offer_decline", "No thanks, cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
