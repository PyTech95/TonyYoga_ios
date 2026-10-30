import { isIOSApp } from "@/lib/iosPlatform";
import IOSPrice from "@/components/IOSPrice";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Sparkles, Gift, ArrowUpCircle, CalendarClock } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useFeatures } from "@/lib/features";
import { loginPath } from "@/lib/authRouting";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { useTranslation } from "react-i18next";
import PageHeader from "@/components/PageHeader";
import Spinner from "@/components/Spinner";
import PaymentButtons from "@/components/PaymentButtons";

export default function Memberships() {
  const [plans, setPlans] = useState(null);
  const { user } = useAuth();
  const { t: tr } = useTranslation();
  const nav = useNavigate();
  const features = useFeatures();
  const [quotes, setQuotes] = useState({});

  useEffect(() => {
    api.get("/membership-plans").then(({ data }) => setPlans(data)).catch(() => setPlans([]));
  }, []);

  // What buying each plan means for someone who already has a membership:
  // an upgrade (unused days are deducted) or a plan that starts when the current one ends.
  useEffect(() => {
    if (!user || !plans?.length || isIOSApp() || ["admin", "instructor"].includes(user.role)) { setQuotes({}); return undefined; }
    let live = true;
    Promise.all(plans.map((p) => api.get(`/me/membership-quote/${p.id}`).then(({ data }) => [p.id, data]).catch(() => [p.id, null])))
      .then((rows) => { if (live) setQuotes(Object.fromEntries(rows.filter(([, q]) => q))); });
    return () => { live = false; };
  }, [user, plans]);

  const guardSignedIn = async () => {
    if (!user) { toast("Please sign in first."); nav(loginPath("/memberships")); return false; }
    return true;
  };

  const fmtMoney = (amount, currency) => {
    try { return new Intl.NumberFormat(undefined, { style: "currency", currency: String(currency || "EUR").toUpperCase() }).format(Number(amount || 0)); }
    catch { return `${Number(amount || 0).toFixed(2)} ${String(currency || "").toUpperCase()}`; }
  };
  const fmtDay = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? String(iso).slice(0, 10) : d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }); };

  return (
    <div data-testid="memberships-page">
      <PageHeader eyebrow={tr("memb.eyebrow")} title={tr("memb.title")} testId="memb-header" />

      <div className="mx-auto max-w-2xl px-5">
        {plans === null ? <Spinner /> : (
          <ul className="space-y-4" data-testid="memberships-list">
            {plans.map((p, idx) => {
              const highlight = idx === 1;
              return (
                <li key={p.id}>
                  <div
                    data-testid={`plan-${p.id}`}
                    className={`rounded-3xl p-6 relative ${highlight ? "bg-[#1C221F] text-[#FAFAF7]" : "bg-white border border-[#E5E6DF]"}`}
                  >
                    {highlight && (
                      <div className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-[#B25A45] text-white text-[10px] uppercase tracking-widest font-bold px-3 py-1">
                        <Sparkles className="h-3 w-3" /> {tr("memb.most_popular")}
                      </div>
                    )}
                    <div className="eyebrow" style={{ color: highlight ? "#B25A45" : undefined }}>{tr(`memb.cycle_${p.billing_cycle}`)}</div>
                    <div className="serif text-3xl mt-1">{t(p.name)}</div>
                    <div className="mt-2 flex items-baseline gap-1">
                      <span className="serif text-3xl"><IOSPrice itemType="membership" itemId={p.id} fallback={<>€{Math.round(p.price)}</>} /></span>
                      {!isIOSApp() && <span className={`text-sm ${highlight ? "text-white/60" : "text-[#6B7269]"}`}>/ {p.billing_cycle === "yearly" ? tr("memb.per_year") : tr("memb.per_month")}</span>}
                    </div>
                    <p className={`text-sm mt-3 leading-relaxed ${highlight ? "text-white/70" : "text-[#545E56]"}`}>{t(p.description)}</p>

                    <ul className="mt-5 space-y-2">
                      {p.features?.map((f) => (
                        <li key={f} className="flex items-center gap-2 text-sm">
                          <Check className="h-4 w-4 shrink-0" style={{ color: highlight ? "#B25A45" : "#839682" }} />
                          <span className={highlight ? "text-white/85" : "text-[#1C221F]"}>{t(f)}</span>
                        </li>
                      ))}
                    </ul>

                    {quotes[p.id]?.mode === "upgrade" && (
                      <div data-testid={`plan-quote-upgrade-${p.id}`} className={`mt-5 rounded-2xl p-3 text-[13px] flex items-start gap-2 ${highlight ? "bg-white/10 text-white" : "bg-[#E4F0E8] text-[#1C221F]"}`}>
                        <ArrowUpCircle className="h-4 w-4 shrink-0 mt-0.5 text-[#3E7C57]" />
                        <span>{tr("memb.quote_upgrade", "Upgrade: pay {{charge}} today ({{credit}} credit for the unused days of your {{plan}}).", {
                          charge: fmtMoney(quotes[p.id].charge, quotes[p.id].currency), credit: fmtMoney(quotes[p.id].credit, quotes[p.id].currency), plan: quotes[p.id].current_plan,
                        })}</span>
                      </div>
                    )}
                    {quotes[p.id]?.mode === "queued" && quotes[p.id].starts_at && (
                      <div data-testid={`plan-quote-queued-${p.id}`} className={`mt-5 rounded-2xl p-3 text-[13px] flex items-start gap-2 ${highlight ? "bg-white/10 text-white" : "bg-[#F3E7C9]/60 text-[#1C221F]"}`}>
                        <CalendarClock className="h-4 w-4 shrink-0 mt-0.5 text-[#8A6D3B]" />
                        <span>{tr("memb.quote_queued", "Starts on {{date}}, when your current membership ends — no days are lost.", { date: fmtDay(quotes[p.id].starts_at) })}</span>
                      </div>
                    )}
                    {quotes[p.id]?.mode === "lifetime" && (
                      <div data-testid={`plan-quote-lifetime-${p.id}`} className={`mt-5 rounded-2xl p-3 text-[13px] ${highlight ? "bg-white/10 text-white" : "bg-[#F2F2EC] text-[#545E56]"}`}>
                        {tr("memb.quote_lifetime", "You already have lifetime access with {{plan}}.", { plan: quotes[p.id].current_plan })}
                      </div>
                    )}

                    <div className="mt-6">
                      <PaymentButtons
                        itemType="membership"
                        itemId={p.id}
                        stripeLabel={`${tr("memb.choose")} ${t(p.name)}`}
                        onBeforeCheckout={guardSignedIn}
                        testIdPrefix={`plan-${p.id}`}
                      />
                    </div>
                    {features.gifts && (
                      <div className="mt-3 text-center">
                        <Link to={`/gift?plan=${p.id}`} data-testid={`plan-gift-${p.id}`} className={`inline-flex items-center gap-1.5 text-[13px] font-semibold ${highlight ? "text-[#F2C1B3]" : "text-[#B25A45]"} hover:underline`}>
                          <Gift className="h-4 w-4" />{tr("memb.give_gift", "Give as a gift")}
                        </Link>
                      </div>
                    )}
                    {!isIOSApp() && p.trial_days > 0 && (
                      <div className={`text-[11px] text-center mt-3 uppercase tracking-widest ${highlight ? "text-white/50" : "text-[#839682]"}`}>
                        {p.trial_days} {tr("memb.free_trial")}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
