import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, LockKeyhole, Clock, Trophy, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import PageHeader from "@/components/PageHeader";
import Spinner from "@/components/Spinner";
import { Progress } from "@/components/ui/progress";

export default function Challenges() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(1);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => {
    try { const { data } = await api.get("/challenges/current"); setData(data); setError(""); setSelected(data.progress?.unlocked_day || 1); }
    catch { setError("The practice challenge could not be loaded."); }
  };
  useEffect(() => { load(); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps
  const join = async () => {
    setBusy(true);
    try { const { data: progress } = await api.post("/challenges/enroll", { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }); setData(d => ({ ...d, progress })); toast.success("Your first day starts now."); }
    catch (e) { toast.error(e?.response?.data?.detail || "Could not join the challenge."); }
    finally { setBusy(false); }
  };
  const complete = async () => {
    setBusy(true);
    try { const { data: progress } = await api.put(`/challenges/days/${selected}`, { completed: !data.progress.completed_days.includes(selected) }); setData(d => ({ ...d, progress })); }
    catch (e) { toast.error(e?.response?.data?.detail || "Could not save your progress."); }
    finally { setBusy(false); }
  };
  const progress = data?.progress;
  const day = data?.challenge?.days[selected - 1];
  const done = progress?.completed_days.includes(selected);
  return <div data-testid="challenges-page" className="pb-12">
    <PageHeader eyebrow="A daily return" title="Practice challenge" back testId="challenges-header" />
    <main className="mx-auto max-w-4xl px-5 space-y-8 min-w-0">
      {error ? <p role="alert" data-testid="challenge-error">{error} <button onClick={load} data-testid="challenge-retry" className="underline">Retry</button></p> : !data ? <Spinner /> : !data.enabled ?
        <section className="py-10 space-y-4"><h2 data-testid="challenge-paused" className="text-lg font-semibold">The challenge is taking a pause.</h2><p className="text-sm text-[#6B7269]" data-testid="challenge-paused-progress">{progress ? `Your ${progress.completed_count} completed days are saved.` : "Check back for the next practice challenge."}</p><Link to="/schedule" data-testid="challenge-browse-classes" className="pill pill-primary">Explore classes <ArrowRight className="h-4 w-4" /></Link></section> : <>
        <section className="border-b border-[#E5E6DF] pb-8 space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-xs text-[#545E56]"><span data-testid="challenge-duration">30 days</span><span>·</span><span data-testid="challenge-price">Free practice</span></div>
          <h2 className="serif text-lg font-medium break-words" data-testid="challenge-title">{data.challenge.title}</h2>
          <p className="text-sm sm:text-base text-[#545E56] max-w-2xl break-words" data-testid="challenge-description">{data.challenge.description}</p>
          {!progress && (user ? <button data-testid="challenge-enroll" disabled={busy} onClick={join} className="pill pill-primary">{busy ? "Joining…" : "Begin my 30 days"}<ArrowRight className="h-4 w-4" /></button> : <Link data-testid="challenge-sign-in" to="/login" className="pill pill-primary">Sign in to begin <ArrowRight className="h-4 w-4" /></Link>)}
          {progress && <div className="space-y-3 max-w-xl">
            <div className="flex items-center justify-between text-sm"><span data-testid="challenge-progress-count">{progress.completed_count} / 30 days complete</span><span data-testid="challenge-progress-percent">{Math.round(progress.completed_count / 30 * 100)}%</span></div>
            <Progress data-testid="challenge-progress-bar" value={progress.completed_count / 30 * 100} aria-label="Challenge completion" />
            <p data-testid="challenge-next-unlock" className="text-xs text-[#6B7269]">{progress.next_unlock_date ? `Next practice opens ${progress.next_unlock_date} · ${progress.timezone}` : "All 30 practices are open."}</p>
          </div>}
        </section>
        {progress?.finished && <div data-testid="challenge-completed" role="status" className="flex items-center gap-4 py-5 border-y border-[#839682]"><Trophy className="h-8 w-8 text-[#B25A45] shrink-0" /><div><h2 className="text-lg font-semibold">Thirty days. A practice of your own.</h2><p className="text-sm text-[#545E56]">Your challenge is complete. Keep coming back to what feels good.</p></div></div>}
        <section className="space-y-5" aria-label="Daily practices">
          <div className="grid grid-cols-6 sm:grid-cols-10 gap-2" data-testid="challenge-days">
            {data.challenge.days.map(d => {
              const locked = d.day > (progress?.unlocked_day || 1);
              const completed = progress?.completed_days.includes(d.day);
              return <button data-testid={`challenge-day-${d.day}`} key={d.day} disabled={locked} aria-label={`Day ${d.day}${locked ? ', locked' : completed ? ', completed' : ''}`} aria-pressed={selected === d.day} onClick={() => setSelected(d.day)} className={`aspect-square min-w-0 rounded-lg border flex flex-col items-center justify-center gap-1 text-sm transition-colors ${selected === d.day ? "bg-[#1C221F] text-white border-[#1C221F]" : completed ? "bg-[#EAF3EC] border-[#839682] text-[#2F6B44]" : "border-[#E5E6DF] bg-white text-[#545E56]"} disabled:opacity-45 hover:border-[#B25A45]`}><span>{d.day}</span>{completed ? <Check className="h-3 w-3" /> : locked ? <LockKeyhole className="h-3 w-3" /> : <span className="h-3" />}</button>;
            })}
          </div>
          {day && <article className="border-l-2 border-[#B25A45] pl-5 sm:pl-8 py-2 space-y-4" data-testid="challenge-practice">
            <div className="flex items-center gap-4 text-xs text-[#6B7269]"><span data-testid="challenge-selected-day">Day {selected}</span><span data-testid="challenge-practice-duration" className="flex gap-1 items-center"><Clock className="h-3.5 w-3.5" />{day.duration_minutes} min</span></div>
            <h2 className="text-base sm:text-lg font-semibold break-words" data-testid="challenge-practice-title">{day.title}</h2>
            <p className="text-sm sm:text-base leading-relaxed text-[#545E56] whitespace-pre-wrap break-words" data-testid="challenge-practice-instructions">{day.instructions}</p>
            {progress && <button data-testid="challenge-complete-day" disabled={busy} onClick={complete} className={`pill ${done ? "pill-ghost" : "pill-primary"}`}><Check className="h-4 w-4" />{busy ? "Saving…" : done ? "Completed · Undo" : "Mark practice complete"}</button>}
          </article>}
        </section>
        <p className="text-xs text-[#6B7269] border-t border-[#E5E6DF] pt-5" data-testid="challenge-safety-note">Move within a comfortable range and use support when needed. Stop if you feel pain or dizziness; seek qualified advice if you have an injury or medical condition.</p>
      </>}
    </main>
  </div>;
}