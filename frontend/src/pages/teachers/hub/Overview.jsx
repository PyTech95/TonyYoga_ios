import { useTranslation } from "react-i18next";
import { AlertTriangle, Users, CalendarDays, Wallet, BadgeCheck, ArrowRight, Info } from "lucide-react";
import { CertBadge, Section, fmtDate, fmtWhen, moneyMap } from "../teacherShared";

function Stat({ icon: Icon, label, value, testId }) {
  return (
    <div className="rounded-3xl bg-white border border-[#E5E6DF] p-4" data-testid={testId}>
      <Icon className="h-4 w-4 text-[#B25A45]" />
      <div className="serif text-2xl mt-2 leading-tight break-words">{value}</div>
      <div className="text-[11px] uppercase tracking-widest text-[#839682] font-semibold mt-1">{label}</div>
    </div>
  );
}

export default function Overview({ me, go }) {
  const { t } = useTranslation();
  const warnings = [];
  if (me.status === "paused") warnings.push({ kind: "warn", text: t("hub.w_paused", "Your profile is paused and hidden from students. Please contact Tony Yoga."), tab: null });
  if (me.status === "approved" && !me.fee_ok) warnings.push({ kind: "warn", text: t("hub.w_fee", "Start your monthly plan to appear in the directory and take bookings."), tab: "billing", cta: t("hub.start_plan", "Start plan") });
  if (!me.can_take_online) warnings.push({ kind: "info", text: me.stripe_account_id ? t("hub.w_stripe_unfinished", "Finish your Stripe setup to take card payments.") : t("hub.w_stripe", "Connect Stripe to take card payments online. Until then students pay you in person."), tab: "payments", cta: t("hub.connect", "Set up payouts") });
  if (!me.tax) warnings.push({ kind: "info", text: t("hub.w_tax", "Add your tax details. EU rules (DAC7) require them when you're paid through the platform."), tab: "profile", cta: t("hub.add_tax", "Add details") });
  if (!me.stats?.offerings) warnings.push({ kind: "info", text: t("hub.w_offer", "Publish your first class, course or class pack."), tab: "classes", cta: t("hub.add_class", "Add a class") });
  const cert = me.certificate || {};
  const ceLeft = Math.max(0, Number(me.ce_hours_required || 0) - Number(me.ce_hours_year || 0));

  return (
    <div className="space-y-6" data-testid="hub-overview">
      <div className="flex flex-wrap items-center gap-2">
        {me.listed ? <span className="rounded-full bg-[#E4F0E8] text-[#3E7C57] px-3 py-1 text-[11px] font-bold uppercase tracking-widest" data-testid="hub-listed">{t("hub.listed", "Listed in the directory")}</span>
          : <span className="rounded-full bg-[#F3E7C9] text-[#8A6D3B] px-3 py-1 text-[11px] font-bold uppercase tracking-widest" data-testid="hub-not-listed">{t("hub.not_listed", "Not listed yet")}</span>}
        {me.tier && <span className="rounded-full bg-white border border-[#E5E6DF] px-3 py-1 text-[11px] font-semibold">{me.tier.name}</span>}
        {cert.id && <CertBadge label={me.label} compact />}
      </div>

      {warnings.length > 0 && (
        <ul className="space-y-2" data-testid="hub-warnings">
          {warnings.map((w, i) => (
            <li key={i} className={`rounded-2xl border p-3 flex items-start gap-3 ${w.kind === "warn" ? "bg-[#FBEFEA] border-[#EED9D2]" : "bg-[#FBF6EC] border-[#E0D3B8]"}`}>
              {w.kind === "warn" ? <AlertTriangle className="h-4 w-4 text-[#B25A45] shrink-0 mt-0.5" /> : <Info className="h-4 w-4 text-[#8A6D3B] shrink-0 mt-0.5" />}
              <span className="text-[13px] text-[#1C221F] flex-1">{w.text}</span>
              {w.tab && <button type="button" onClick={() => go(w.tab)} className="text-[12px] font-semibold text-[#B25A45] shrink-0">{w.cta} →</button>}
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat icon={Users} label={t("hub.students", "Students")} value={me.stats?.students ?? 0} testId="hub-stat-students" />
        <Stat icon={CalendarDays} label={t("hub.active_offerings", "Active classes")} value={me.stats?.offerings ?? 0} testId="hub-stat-offerings" />
        <Stat icon={Wallet} label={t("hub.this_month", "This month")} value={moneyMap(me.stats?.income_month)} testId="hub-stat-month" />
        <Stat icon={Wallet} label={t("hub.this_year", "This year")} value={moneyMap(me.stats?.income_year)} testId="hub-stat-year" />
      </div>

      <Section icon={CalendarDays} title={t("hub.upcoming", "Coming up")} action={<button type="button" onClick={() => go("classes")} className="text-xs font-semibold text-[#B25A45]">{t("hub.manage", "Manage")} →</button>}>
        {me.upcoming?.length ? (
          <ul className="space-y-2" data-testid="hub-upcoming">
            {me.upcoming.map((s) => (
              <li key={s.id} className="rounded-2xl bg-white border border-[#E5E6DF] p-3 flex items-center justify-between gap-3">
                <div className="min-w-0"><div className="text-[14px] font-semibold truncate">{s.title}</div><div className="text-xs text-[#6B7269]">{fmtWhen(s.start_time)}</div></div>
                <span className="text-[12px] font-semibold shrink-0">{t("hub.n_booked", "{{n}} booked", { n: s.booked || 0 })}{s.spots_left != null ? ` · ${t("teachers.spots", "{{n}} spots left", { n: s.spots_left })}` : ""}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-[13px] text-[#6B7269]">{t("hub.no_upcoming", "No upcoming class dates.")}</p>}
      </Section>

      <Section icon={BadgeCheck} title={t("hub.certificate", "Certificate")}>
        <button type="button" onClick={() => go("certificate")} className="w-full text-left rounded-2xl bg-white border border-[#E5E6DF] p-4 flex items-center justify-between gap-3 hover:border-[#B25A45]">
          <div className="text-[13px]">
            {cert.id ? <><span className="font-semibold">{cert.id}</span> · {t("teachers.renews", "Renews")} {fmtDate(cert.renews_at)}</> : t("hub.no_cert", "Issued when you're approved.")}
            <div className="text-[12px] text-[#6B7269] mt-0.5">{t("hub.ce_progress", "{{done}} of {{need}} continuing-education hours this year", { done: me.ce_hours_year || 0, need: me.ce_hours_required || 0 })}{ceLeft > 0 ? "" : " ✓"}</div>
          </div>
          <ArrowRight className="h-4 w-4 text-[#B25A45] shrink-0" />
        </button>
      </Section>
    </div>
  );
}
