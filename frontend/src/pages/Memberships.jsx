import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
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

  useEffect(() => {
    api.get("/membership-plans").then(({ data }) => setPlans(data)).catch(() => setPlans([]));
  }, []);

  const guardSignedIn = async () => {
    if (!user) { toast("Please sign in first."); nav("/login"); return false; }
    return true;
  };

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
                      <span className="serif text-4xl">€{Math.round(p.price)}</span>
                      <span className={`text-sm ${highlight ? "text-white/60" : "text-[#6B7269]"}`}>/ {p.billing_cycle === "yearly" ? tr("memb.per_year") : tr("memb.per_month")}</span>
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

                    <div className="mt-6">
                      <PaymentButtons
                        itemType="membership"
                        itemId={p.id}
                        stripeLabel={`${tr("memb.choose")} ${t(p.name)}`}
                        onBeforeCheckout={guardSignedIn}
                        testIdPrefix={`plan-${p.id}`}
                      />
                    </div>
                    {p.trial_days > 0 && (
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
