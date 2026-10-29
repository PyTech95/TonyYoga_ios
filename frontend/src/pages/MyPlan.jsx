import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Circle, Map as MapIcon, RotateCcw, XCircle, ArrowRight, AlertCircle } from "lucide-react";
import { api } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { localToday, PlanItem } from "@/components/TodayCard";

function fmtDay(isoDate) {
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

export default function MyPlan() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [plan, setPlan] = useState(undefined); // undefined = loading, null = none
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const today = localToday();

  const load = useCallback(() => {
    api.get(`/me/plan?today=${localToday()}`).then(({ data }) => { setPlan(data || null); setError(false); }).catch(() => setError(true));
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = async (day) => {
    setBusy(day.index);
    try {
      await api.post(`/me/plan/days/${day.index}`, { done: !day.done_at });
      if (!day.done_at) toast.success(t("plan.done_toast", "Practice logged. Well done!"));
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || t("plan.save_failed", "Could not save. Please try again."));
    } finally { setBusy(null); }
  };

  const endPlan = async () => {
    setBusy("end");
    try {
      await api.delete("/me/plan");
      toast.success(t("plan.ended", "Your plan has ended."));
      setConfirmEnd(false);
      load();
    } catch {
      toast.error(t("plan.end_failed", "Could not end the plan."));
    } finally { setBusy(null); }
  };

  const weeks = {};
  for (const d of plan?.days || []) (weeks[d.week] = weeks[d.week] || []).push(d);
  const s = plan?.summary;

  return (
    <div data-testid="my-plan-page" className="pb-24">
      <PageHeader back eyebrow={t("plan.eyebrow", "Your personal plan")} title={t("plan.title", "My plan")} testId="my-plan-header" />
      <div className="mx-auto max-w-2xl px-5 space-y-6">
        {error && (
          <div className="rounded-2xl bg-[#FBEFEA] border border-[#EED9D2] p-4 text-sm text-[#8A3B2A]">
            {t("plan.load_error", "We couldn't load your plan.")} <button onClick={load} className="underline font-semibold">{t("common.retry", "Try again")}</button>
          </div>
        )}
        {plan === undefined && !error && <div className="h-40 rounded-3xl bg-[#F2F2EC] animate-pulse" />}

        {plan === null && (
          <div data-testid="my-plan-empty" className="rounded-3xl bg-white border border-[#E5E6DF] p-8 text-center">
            <MapIcon className="h-8 w-8 text-[#B25A45] mx-auto" />
            <div className="serif text-2xl mt-3">{t("plan.empty_title", "No plan yet")}</div>
            <p className="text-sm text-[#6B7269] mt-2">{t("plan.empty_body", "Answer five quick questions and we'll plan your next four weeks, day by day.")}</p>
            <Link to="/find-your-path" data-testid="my-plan-start" className="pill pill-primary mt-5">{t("plan.start", "Build my plan")} <ArrowRight className="h-4 w-4" /></Link>
          </div>
        )}

        {plan && s && (
          <>
            <section data-testid="my-plan-summary" className="rounded-3xl bg-[#1C221F] text-[#FAFAF7] p-5">
              <div className="flex items-baseline justify-between gap-3">
                <div className="serif text-3xl" data-testid="my-plan-percent">{s.percent}%</div>
                <div className="text-[13px] text-white/70">{t("plan.progress", "{{done}} of {{total}} days done", { done: s.done, total: s.total })}</div>
              </div>
              <div className="mt-3 h-2 rounded-full bg-white/15 overflow-hidden"><div className="h-full bg-[#B25A45]" style={{ width: `${s.percent}%` }} /></div>
              <div className="mt-3 text-[13px] text-white/75">
                {fmtDay(plan.start_date)} – {fmtDay(plan.end_date)}
                {plan.program?.title && <> · {plan.program.owned ? t("plan.with_course", "with {{c}}", { c: plan.program.title }) : t("plan.suggested_course", "suggested course: {{c}}", { c: plan.program.title })}</>}
              </div>
              {s.missed > 0 && !s.finished && (
                <div data-testid="my-plan-missed" className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[12px]">
                  <AlertCircle className="h-3.5 w-3.5 text-[#E8B8A8]" /> {t("plan.missed", "{{n}} day(s) missed — that's fine, just keep going.", { n: s.missed })}
                </div>
              )}
              {s.finished && <div data-testid="my-plan-finished" className="mt-3 text-[14px]">{t("plan.finished", "Plan complete. Make a new one to keep your rhythm.")}</div>}
              {plan.program && !plan.program.owned && (
                <Link to={`/programs/${plan.program.id}`} className="pill mt-4 !py-2 !px-4 !text-xs bg-white text-[#1C221F]">{t("plan.see_course", "See the course")} <ArrowRight className="h-3.5 w-3.5" /></Link>
              )}
            </section>

            {Object.keys(weeks).sort((a, b) => a - b).map((w) => (
              <section key={w} data-testid={`my-plan-week-${w}`}>
                <h2 className="eyebrow !text-[11px] mb-3">{t("plan.week", "Week {{n}}", { n: w })}</h2>
                <ul className="space-y-3">
                  {weeks[w].map((d) => {
                    const isToday = d.date === today;
                    const past = d.date < today;
                    return (
                      <li key={d.index} data-testid={`my-plan-day-${d.index}`}
                        className={`rounded-3xl border p-4 ${isToday ? "bg-[#FBF1EE] border-[#EED9D2]" : "bg-white border-[#E5E6DF]"} ${past && !d.done_at ? "opacity-75" : ""}`}>
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <div className="text-[14px] font-semibold">
                            {fmtDay(d.date)}
                            {isToday && <span className="ml-2 text-[10px] uppercase tracking-widest font-bold text-[#B25A45]">{t("plan.today", "Today")}</span>}
                          </div>
                          <button disabled={busy === d.index} onClick={() => toggle(d)} data-testid={`my-plan-toggle-${d.index}`}
                            aria-pressed={!!d.done_at}
                            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition ${d.done_at ? "bg-[#E4F0E8] text-[#3E7C57]" : "bg-[#F2F2EC] text-[#545E56] hover:bg-[#E9E9E1]"}`}>
                            {d.done_at ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                            {d.done_at ? t("plan.done", "Done") : t("plan.mark_done", "Mark done")}
                          </button>
                        </div>
                        <div className="space-y-2">
                          {d.items.map((it, i) => <PlanItem key={`${it.kind}-${i}`} item={it} compact />)}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}

            <div className="flex flex-wrap gap-2 pt-2">
              <button onClick={() => nav("/find-your-path")} data-testid="my-plan-new" className="pill pill-ghost"><RotateCcw className="h-4 w-4" /> {t("plan.new", "Make a new plan")}</button>
              {confirmEnd ? (
                <span className="inline-flex items-center gap-2">
                  <button onClick={endPlan} disabled={busy === "end"} data-testid="my-plan-end-confirm" className="pill !bg-[#B25A45] !text-white">{t("plan.end_confirm", "Yes, end my plan")}</button>
                  <button onClick={() => setConfirmEnd(false)} className="text-sm text-[#6B7269] px-2">{t("common.cancel", "Cancel")}</button>
                </span>
              ) : (
                <button onClick={() => setConfirmEnd(true)} data-testid="my-plan-end" className="pill pill-ghost"><XCircle className="h-4 w-4" /> {t("plan.end", "End plan")}</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
