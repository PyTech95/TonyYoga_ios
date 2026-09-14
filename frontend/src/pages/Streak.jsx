import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Flame, Sparkles, Snowflake } from "lucide-react";
import { api } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import Spinner from "@/components/Spinner";

const MILESTONES = [7, 30, 100, 365];
const MILESTONE_LABELS = {
  7: "One week",
  30: "One month",
  100: "100 days",
  365: "One year",
};

export default function Streak() {
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  const [celebrate, setCelebrate] = useState(null);

  const load = async () => {
    try { const { data } = await api.get("/practice/streak"); setS(data); }
    catch { setS(false); }
  };
  useEffect(() => { load(); }, []);

  const log = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/practice/log", { source: "manual" });
      await load();
      if (data.milestone_unlocked) {
        setCelebrate(data.milestone_unlocked);
        setTimeout(() => setCelebrate(null), 3500);
      } else if (data.freeze_used) {
        toast.success("Freeze used · streak saved ❄");
      } else {
        toast.success(`Day ${data.current_streak} · well done.`);
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not log");
    } finally { setBusy(false); }
  };

  if (s === null) return <><PageHeader back /><Spinner /></>;
  if (s === false) return <><PageHeader back title="Sign in first" /></>;

  const progress = s.next_milestone ? Math.min(100, Math.round((s.current_streak / s.next_milestone) * 100)) : 100;

  return (
    <div data-testid="streak-page" className="pb-6">
      <PageHeader eyebrow="Consistency" title="Your practice streak" back testId="streak-header" />

      <div className="mx-auto max-w-2xl px-5 space-y-6">
        {/* Big streak card */}
        <div className="rounded-3xl bg-[#1C221F] text-[#FAFAF7] p-8 text-center relative overflow-hidden">
          <Flame className={`h-10 w-10 mx-auto mb-2 ${s.current_streak > 0 ? "text-[#B25A45]" : "text-white/30"}`} />
          <div className="serif text-7xl leading-none" data-testid="streak-count">{s.current_streak}</div>
          <div className="eyebrow mt-2 !text-[#B25A45]">day{s.current_streak === 1 ? "" : "s"} in a row</div>
          {s.next_milestone && (
            <>
              <div className="mt-6 h-2 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full bg-[#B25A45] transition-all duration-700" style={{ width: `${progress}%` }} data-testid="streak-progress" />
              </div>
              <div className="text-xs text-white/60 mt-2">
                {s.next_milestone - s.current_streak} more to {MILESTONE_LABELS[s.next_milestone] || s.next_milestone}
              </div>
            </>
          )}
        </div>

        <button
          onClick={log}
          disabled={busy || s.practiced_today}
          data-testid="streak-log"
          className="pill pill-primary w-full disabled:!bg-[#F2F2EC] disabled:!text-[#6B7269]"
        >
          {s.practiced_today ? "Practice logged today ✓" : busy ? "Logging…" : "I practiced today"}
        </button>

        {/* Milestones */}
        <section>
          <div className="eyebrow mb-3">Milestones</div>
          <ul className="grid grid-cols-4 gap-2">
            {MILESTONES.map((m) => {
              const unlocked = (s.milestones_unlocked || []).includes(m) || s.current_streak >= m;
              return (
                <li key={m} className={`rounded-2xl p-3 text-center border ${unlocked ? "bg-[#B25A45] text-white border-[#B25A45]" : "bg-white border-[#E5E6DF] text-[#6B7269]"}`} data-testid={`milestone-${m}`}>
                  <div className="serif text-lg">{m}</div>
                  <div className="text-[10px] uppercase tracking-widest mt-1">{unlocked ? "Unlocked" : "Locked"}</div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Calendar */}
        <section>
          <div className="eyebrow mb-3">Last 30 days</div>
          <div className="grid grid-cols-10 gap-1.5" data-testid="streak-calendar">
            {s.calendar.map((c) => (
              <div
                key={c.date}
                title={c.date}
                className={`aspect-square rounded-md ${c.practiced ? "bg-[#B25A45]" : "bg-[#F2F2EC]"}`}
              />
            ))}
          </div>
        </section>

        {/* Long-streak record */}
        <div className="rounded-2xl bg-[#F2F2EC] p-4 flex items-center justify-between">
          <div className="eyebrow">Longest streak</div>
          <div className="serif text-2xl" data-testid="streak-longest">{s.longest_streak}</div>
        </div>

        {/* Freezes */}
        <div className="rounded-2xl bg-white border border-[#E5E6DF] p-4 flex items-center gap-3" data-testid="freeze-card">
          <div className="h-10 w-10 rounded-full bg-[#F2F2EC] flex items-center justify-center shrink-0">
            <Snowflake className="h-4 w-4 text-[#839682]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold">Streak freezes</div>
            <div className="text-[11px] text-[#6B7269] mt-0.5">Miss a day? We'll auto-freeze so your streak stays intact.</div>
          </div>
          <div className="serif text-2xl shrink-0" data-testid="freeze-remaining">
            {s.freezes_remaining_this_month ?? 2}
            <span className="text-xs text-[#6B7269] ml-1">/ {s.freezes_per_month ?? 2}</span>
          </div>
        </div>
      </div>

      {/* Milestone celebration overlay */}
      {celebrate && (
        <div className="fixed inset-0 z-50 bg-[#1C221F]/80 flex items-center justify-center p-6 animate-fade-up" onClick={() => setCelebrate(null)} data-testid="milestone-celebrate">
          <div className="rounded-3xl bg-[#FAFAF7] p-10 text-center max-w-sm w-full">
            <Sparkles className="h-12 w-12 mx-auto text-[#B25A45] mb-3" />
            <div className="eyebrow mb-2">{MILESTONE_LABELS[celebrate]}</div>
            <div className="serif text-4xl mb-2">{celebrate} days</div>
            <p className="text-sm text-[#6B7269] mt-2">unbroken. Slow down. Breathe in. Begin again.</p>
            <button onClick={() => setCelebrate(null)} className="pill pill-primary mt-6">Continue</button>
          </div>
        </div>
      )}
    </div>
  );
}
