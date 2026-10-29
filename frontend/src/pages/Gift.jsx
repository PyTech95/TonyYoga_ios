import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Gift as GiftIcon, Copy, CheckCircle2, Mail, Heart, Share2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { t as tPlan } from "@/lib/i18n";
import { useFeatures } from "@/lib/features";
import { loginPath } from "@/lib/authRouting";
import { publicOrigin } from "@/lib/platform";
import PageHeader from "@/components/PageHeader";
import PaymentButtons from "@/components/PaymentButtons";

const EMAIL_RX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const CYCLE_DAYS = { weekly: 7, monthly: 30, quarterly: 90, yearly: 365 };

function money(amount, currency) {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency: String(currency || "EUR").toUpperCase() }).format(Number(amount || 0)); }
  catch { return `${Number(amount || 0).toFixed(2)} ${String(currency || "").toUpperCase()}`; }
}
function fmtDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function MyGifts({ highlight }) {
  const { t } = useTranslation();
  const [gifts, setGifts] = useState(null);
  useEffect(() => {
    let tries = 0;
    let timer;
    const load = () => api.get("/me/gifts").then(({ data }) => {
      setGifts(data || []);
      // Right after paying, the code can take a few seconds to be created.
      if (highlight && !(data || []).length && tries < 8) { tries += 1; timer = setTimeout(load, 3000); }
    }).catch(() => setGifts([]));
    load();
    return () => clearTimeout(timer);
  }, [highlight]);
  const copy = async (text, msg) => {
    try { await navigator.clipboard.writeText(text); toast.success(msg); } catch { window.prompt("Copy:", text); }
  };
  if (gifts === null) return <div className="h-24 rounded-3xl bg-[#F2F2EC] animate-pulse" />;
  if (!gifts.length) return highlight ? <p className="text-sm text-[#6B7269]" data-testid="gift-waiting">{t("gift.waiting", "We're preparing your gift code — it appears here in a moment and is also emailed to you.")}</p> : null;
  return (
    <section data-testid="gift-list" className="space-y-3">
      <h2 className="eyebrow !text-[11px]">{t("gift.your_gifts", "Your gifts")}</h2>
      {gifts.map((g) => {
        const link = `${publicOrigin()}/redeem?code=${encodeURIComponent(g.code)}`;
        return (
          <div key={g.id} className="rounded-3xl bg-white border border-[#E5E6DF] p-5" data-testid={`gift-${g.code}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-widest font-semibold text-[#839682]">{g.plan_name} · {t("gift.days", "{{n}} days", { n: g.days })}</div>
                <div className="font-mono text-xl tracking-wider mt-1" data-testid="gift-code">{g.code}</div>
                <div className="text-[12px] text-[#6B7269] mt-1">
                  {g.recipient_name || g.recipient_email ? t("gift.for", "For {{who}}", { who: g.recipient_name || g.recipient_email }) : t("gift.no_recipient", "Share the code with the lucky person")}
                  {" · "}{g.status === "redeemed" ? t("gift.used", "Opened {{date}}", { date: fmtDate(g.redeemed_at) }) : t("gift.valid", "Valid until {{date}}", { date: fmtDate(g.expires_at) })}
                </div>
              </div>
              <span className={`text-[10px] uppercase tracking-widest font-bold rounded-full px-2.5 py-1 shrink-0 ${g.status === "redeemed" ? "bg-[#E4F0E8] text-[#3E7C57]" : "bg-[#F3E7C9] text-[#8A6D3B]"}`}>
                {g.status === "redeemed" ? t("gift.status_used", "Opened") : t("gift.status_new", "Not used yet")}
              </span>
            </div>
            {g.status !== "redeemed" && (
              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={() => copy(g.code, t("gift.code_copied", "Code copied"))} className="pill pill-ghost !py-2 !px-4 !text-xs" data-testid="gift-copy-code"><Copy className="h-3.5 w-3.5" />{t("gift.copy_code", "Copy code")}</button>
                <button onClick={() => copy(link, t("gift.link_copied", "Link copied — send it by WhatsApp or email"))} className="pill pill-ghost !py-2 !px-4 !text-xs" data-testid="gift-copy-link"><Share2 className="h-3.5 w-3.5" />{t("gift.copy_link", "Copy gift link")}</button>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

/** Buy a membership for someone else. They get a code to open it on /redeem. */
export default function Gift() {
  const { t } = useTranslation();
  const { user, ready } = useAuth();
  const features = useFeatures();
  const [params] = useSearchParams();
  const sent = params.get("sent") === "1";
  const [plans, setPlans] = useState(null);
  const [planId, setPlanId] = useState(params.get("plan") || "");
  const [f, setF] = useState({ recipient_name: "", recipient_email: "", gift_message: "" });

  useEffect(() => {
    api.get("/membership-plans").then(({ data }) => {
      const list = (data || []).filter((p) => p.is_active !== false);
      setPlans(list);
      setPlanId((cur) => (list.some((p) => p.id === cur) ? cur : list[0]?.id || ""));
    }).catch(() => setPlans([]));
  }, []);

  const plan = useMemo(() => (plans || []).find((p) => p.id === planId), [plans, planId]);
  const metadata = useMemo(() => {
    const m = {};
    Object.entries(f).forEach(([k, v]) => { if (v.trim()) m[k] = v.trim(); });
    return m;
  }, [f]);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const check = async () => {
    if (!planId) { toast.error(t("gift.pick_plan", "Choose a membership.")); return false; }
    if (f.recipient_email.trim() && !EMAIL_RX.test(f.recipient_email.trim())) { toast.error(t("gift.bad_email", "The recipient's email doesn't look right.")); return false; }
    return true;
  };

  if (features.ready && !features.gifts) {
    return (
      <div data-testid="gift-page" className="pb-24">
        <PageHeader back eyebrow={t("gift.eyebrow", "Give the gift of practice")} title={t("gift.title", "Gift a membership")} testId="gift-header" />
        <div className="mx-auto max-w-2xl px-5">
          <div data-testid="gift-unavailable" className="rounded-3xl bg-white border border-[#E5E6DF] p-8 text-center">
            <GiftIcon className="h-8 w-8 text-[#B25A45] mx-auto" />
            <p className="text-sm text-[#6B7269] mt-3">{t("gift.unavailable", "Gift memberships aren't available here right now. You can buy one on tonyoga.com.")}</p>
            <Link to="/memberships" className="pill pill-primary mt-5">{t("gift.see_plans", "See memberships")}</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="gift-page" className="pb-24">
      <PageHeader back eyebrow={t("gift.eyebrow", "Give the gift of practice")} title={t("gift.title", "Gift a membership")} testId="gift-header" />
      <div className="mx-auto max-w-2xl px-5 space-y-6">
        {sent && (
          <div data-testid="gift-sent" className="rounded-3xl bg-[#E4F0E8] border border-[#CFE3D6] p-5 flex gap-3">
            <CheckCircle2 className="h-5 w-5 text-[#3E7C57] shrink-0 mt-0.5" />
            <div className="text-[14px]">
              <div className="font-semibold">{t("gift.thanks", "Thank you! Your gift is ready.")}</div>
              <div className="text-[#545E56]">{t("gift.thanks_body", "We emailed you the code (and the recipient, if you added their email).")}</div>
            </div>
          </div>
        )}
        {user && <MyGifts highlight={sent} />}

        {!sent && (
          <>
            <p className="text-[15px] text-[#545E56] leading-relaxed">{t("gift.intro", "Live classes with Tony, guided courses and the on-demand library — for someone you love. They open it with a code whenever they're ready (valid for a year).")}</p>

            <section className="space-y-2" data-testid="gift-plans">
              <h2 className="eyebrow !text-[11px]">{t("gift.choose", "1 · Choose the membership")}</h2>
              {plans === null ? <div className="h-20 rounded-3xl bg-[#F2F2EC] animate-pulse" /> : plans.map((p) => (
                <label key={p.id} className={`flex items-center gap-3 rounded-3xl border p-4 cursor-pointer ${planId === p.id ? "border-[#B25A45] bg-[#FBF1EE]" : "border-[#E5E6DF] bg-white"}`} data-testid={`gift-plan-${p.id}`}>
                  <input type="radio" name="gift-plan" className="accent-[#B25A45]" checked={planId === p.id} onChange={() => setPlanId(p.id)} />
                  <span className="min-w-0 flex-1">
                    <span className="block serif text-xl">{tPlan(p.name)}</span>
                    <span className="block text-[12px] text-[#6B7269]">{t("gift.days", "{{n}} days", { n: CYCLE_DAYS[p.billing_cycle] || 30 })}</span>
                  </span>
                  <span className="serif text-xl shrink-0">{money(p.price, p.currency)}</span>
                </label>
              ))}
            </section>

            <section className="space-y-2" data-testid="gift-recipient">
              <h2 className="eyebrow !text-[11px]">{t("gift.who", "2 · Who is it for? (optional)")}</h2>
              <input value={f.recipient_name} onChange={(e) => set("recipient_name", e.target.value)} maxLength={120} placeholder={t("gift.name", "Their name")}
                className="w-full rounded-2xl border border-[#E5E6DF] bg-white px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#B25A45]" data-testid="gift-recipient-name" />
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9AA096]" />
                <input type="email" value={f.recipient_email} onChange={(e) => set("recipient_email", e.target.value)} maxLength={200} placeholder={t("gift.email", "Their email — we'll send them the code")}
                  className="w-full rounded-2xl border border-[#E5E6DF] bg-white pl-10 pr-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#B25A45]" data-testid="gift-recipient-email" />
              </div>
              <div className="relative">
                <Heart className="absolute left-4 top-3.5 h-4 w-4 text-[#9AA096]" />
                <textarea rows={3} value={f.gift_message} onChange={(e) => set("gift_message", e.target.value)} maxLength={480} placeholder={t("gift.message", "A message for them (optional)")}
                  className="w-full rounded-2xl border border-[#E5E6DF] bg-white pl-10 pr-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#B25A45]" data-testid="gift-message" />
              </div>
              <p className="text-[12px] text-[#6B7269]">{t("gift.no_email_note", "Leave the email empty to give the code yourself — you'll find it here and in your email.")}</p>
            </section>

            <section className="space-y-3" data-testid="gift-pay">
              <h2 className="eyebrow !text-[11px]">{t("gift.pay", "3 · Pay")}</h2>
              {plan && <div className="text-[14px]">{tPlan(plan.name)} · <span className="font-semibold">{money(plan.price, plan.currency)}</span></div>}
              {!ready ? null : user ? (
                <PaymentButtons itemType="gift_membership" itemId={planId} metadata={metadata} onBeforeCheckout={check} disabled={!planId}
                  stripeLabel={t("gift.pay_card", "Pay with card")} testIdPrefix="gift" />
              ) : (
                <div className="rounded-3xl bg-[#FBF6EC] border border-[#E0D3B8] p-5" data-testid="gift-signin">
                  <p className="text-[14px] text-[#5C5346]">{t("gift.signin_body", "Sign in or create a free account so we can send you the gift code and receipt.")}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link to={loginPath(`/gift${planId ? `?plan=${planId}` : ""}`, "register")} className="pill pill-primary" data-testid="gift-register">{t("gift.create_account", "Create free account")}</Link>
                    <Link to={loginPath(`/gift${planId ? `?plan=${planId}` : ""}`)} className="pill pill-ghost" data-testid="gift-login">{t("gift.sign_in", "Sign in")}</Link>
                  </div>
                </div>
              )}
            </section>

            <p className="text-[13px] text-[#6B7269]">{t("gift.have_code", "Received a gift?")} <Link to="/redeem" className="font-semibold text-[#B25A45] underline" data-testid="gift-to-redeem">{t("gift.redeem", "Open it here")}</Link></p>
          </>
        )}
        {sent && <Link to="/gift" className="pill pill-ghost" data-testid="gift-another"><GiftIcon className="h-4 w-4" />{t("gift.another", "Give another gift")}</Link>}
      </div>
    </div>
  );
}
