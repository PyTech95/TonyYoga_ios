import { useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { CheckCircle2, CreditCard, Gift, AlertTriangle, Settings2 } from "lucide-react";
import { api } from "@/lib/api";
import { publicOrigin } from "@/lib/platform";
import { Section, errText, fmtDate, money } from "../teacherShared";

export default function Billing({ me, reload }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(null);
  const b = me.billing || {};
  const tier = me.tier || {};
  const running = b.mode === "stripe" && ["active", "trialing", "past_due"].includes(b.status);

  const start = async (tierId) => {
    setBusy(tierId);
    try {
      const { data } = await api.post("/teacher/billing/checkout", { origin_url: publicOrigin(), tier_id: tierId });
      if (data?.free) { toast.success(t("hub.free_active", "Your free plan is active.")); reload(); setBusy(null); return; }
      if (data?.url) { window.location.href = data.url; return; }
      setBusy(null);
    } catch (e) { toast.error(errText(e)); setBusy(null); }
  };
  const portal = async () => {
    setBusy("portal");
    try { const { data } = await api.post("/teacher/billing/portal", { origin_url: publicOrigin() }); if (data?.url) { window.location.href = data.url; return; } }
    catch (e) { toast.error(errText(e)); }
    setBusy(null);
  };

  let state;
  if (b.mode === "comped") state = { icon: Gift, tone: "ok", text: b.paid_until ? t("hub.comped_until", "Tony Yoga waived your monthly fee until {{date}}.", { date: fmtDate(b.paid_until) }) : t("hub.comped", "Tony Yoga waived your monthly fee.") };
  else if (b.mode === "free" || Number(tier.price || 0) <= 0) state = { icon: CheckCircle2, tone: "ok", text: t("hub.free_plan", "You're on a free plan.") };
  else if (b.status === "past_due") state = { icon: AlertTriangle, tone: "warn", text: t("hub.past_due", "Your last card payment failed. Update your card within 7 days to stay listed.") };
  else if (b.mode === "stripe" && ["active", "trialing"].includes(b.status)) state = { icon: CheckCircle2, tone: "ok", text: b.paid_until ? t("hub.active_until", "Active — renews on {{date}}.", { date: fmtDate(b.paid_until) }) : t("hub.active", "Active.") };
  else if (b.status === "cancelled") state = { icon: AlertTriangle, tone: "warn", text: t("hub.cancelled_plan", "Your plan was cancelled. Start it again to be listed.") };
  else state = { icon: CreditCard, tone: "info", text: t("hub.not_started", "Not started. Your profile appears in the directory once your plan is active.") };
  const Icon = state.icon;

  return (
    <div className="space-y-6" data-testid="hub-billing">
      <div className={`rounded-3xl border p-5 flex gap-3 ${state.tone === "ok" ? "bg-[#F1F7F2] border-[#CFE3D5]" : state.tone === "warn" ? "bg-[#FBEFEA] border-[#EED9D2]" : "bg-white border-[#E5E6DF]"}`} data-testid="billing-state">
        <Icon className={`h-5 w-5 shrink-0 ${state.tone === "ok" ? "text-[#3E7C57]" : "text-[#B25A45]"}`} />
        <div>
          <div className="text-[15px] font-semibold">{tier.name ? t("hub.plan_name", "{{name}} plan", { name: tier.name }) : t("hub.your_plan", "Your plan")}{Number(tier.price) > 0 ? ` · ${money(tier.price, tier.currency)} / ${t("teachers.month", "month")}` : ""}</div>
          <p className="text-[13px] text-[#545E56] mt-0.5">{state.text}</p>
          {(running || b.stripe_customer_id) && b.mode === "stripe" && (
            <button type="button" onClick={portal} disabled={!!busy} className="pill pill-ghost !py-2 !px-4 !text-xs mt-3" data-testid="billing-portal"><Settings2 className="h-3.5 w-3.5" />{t("hub.manage_billing", "Card, invoices and cancelling")}</button>
          )}
        </div>
      </div>

      <Section icon={CreditCard} title={t("hub.plans", "Plans")}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="billing-tiers">
          {(me.tiers || []).map((x) => {
            const current = x.id === me.tier_id;
            return (
              <div key={x.id} className={`rounded-3xl border p-4 flex flex-col ${current ? "border-[#B25A45] bg-[#FBF1EE]" : "border-[#E5E6DF] bg-white"}`} data-testid={`billing-tier-${x.id}`}>
                <div className="flex items-center justify-between"><span className="serif text-xl">{x.name}</span>{current && <span className="text-[10px] uppercase tracking-widest font-bold text-[#B25A45]">{t("hub.current", "Current")}</span>}</div>
                <div className="text-[14px] font-semibold mt-1">{Number(x.price) > 0 ? `${money(x.price, x.currency)} / ${t("teachers.month", "month")}` : t("teachers.free", "Free")}</div>
                <ul className="mt-2 space-y-1 flex-1">{(x.features || []).map((f) => <li key={f} className="text-[12px] text-[#545E56] flex gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-[#839682] shrink-0 mt-0.5" />{f}</li>)}</ul>
                <div className="text-[11px] text-[#9AA096] mt-2">{x.max_offerings ? t("hub.tier_limits", "Up to {{o}} classes · {{s}} students", { o: x.max_offerings, s: x.max_students || "∞" }) : ""}{Number(x.platform_fee_percent) > 0 ? ` · ${x.platform_fee_percent}% ${t("hub.per_sale", "per sale")}` : ""}</div>
                {!running && b.mode !== "comped" && (
                  <button type="button" onClick={() => start(x.id)} disabled={!!busy || me.status !== "approved"} className={`pill mt-3 !py-2 !text-xs ${current ? "pill-primary" : "pill-ghost"}`} data-testid={`billing-start-${x.id}`}>
                    {busy === x.id ? t("teachers.redirecting", "Redirecting…") : t("hub.start_this", "Start this plan")}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {running && <p className="text-[12px] text-[#6B7269] mt-3">{t("hub.change_plan", "To change plan, cancel the current one in billing or ask Tony Yoga to switch it for you.")}</p>}
      </Section>
    </div>
  );
}
