import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { CalendarDays, CheckCircle2, Circle, Flame, Map as MapIcon, Sparkles, ArrowRight, Video, Flower2, PlayCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/** The member's own date (YYYY-MM-DD in their time zone) — the plan is built on it. */
export function localToday() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function fmtWhen(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) + " · " +
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function fmtDay(isoDate) {
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });
}

const KIND_ICON = { lesson: PlayCircle, video: PlayCircle, meditation: Flower2, live: Video };

export function PlanItem({ item, compact = false }) {
  const Icon = KIND_ICON[item.kind] || PlayCircle;
  return (
    <Link to={item.url || "/library"} data-testid={`plan-item-${item.kind}`}
      className={`flex items-center gap-3 rounded-2xl border border-[#E5E6DF] bg-white hover:border-[#B25A45] transition ${compact ? "p-3" : "p-3.5"}`}>
      <span className="h-9 w-9 rounded-full bg-[#FBF1EE] flex items-center justify-center shrink-0"><Icon className="h-4 w-4 text-[#B25A45]" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold text-[#1C221F] leading-snug truncate">{item.title}</span>
        <span className="block text-[12px] text-[#6B7269]">
          {item.kind === "live" && item.start_time ? fmtWhen(item.start_time) : `${item.minutes || ""} min`}
          {item.program_title ? ` · ${item.program_title}` : ""}
        </span>
      </span>
      <ArrowRight className="h-4 w-4 text-[#C3C6BE] shrink-0" />
    </Link>
  );
}

/** Home screen "Today": Tony's monthly theme, today's plan step, the next live class and the streak. */
export default function TodayCard() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [bookError, setBookError] = useState(null);

  const load = useCallback(() => {
    api.get(`/me/today?today=${localToday()}`).then(({ data: d }) => setData(d)).catch(() => setData(false));
  }, []);

  useEffect(() => { if (user) load(); }, [user, load]);

  if (!user || user.role === "admin" || user.role === "instructor") return null;
  if (data === null) return <div className="h-40 rounded-3xl bg-[#F2F2EC] animate-pulse" data-testid="today-loading" />;
  if (data === false) return null;

  const summary = data.plan?.summary;
  const step = summary?.today;
  const theme = data.theme;
  const streak = data.streak?.current_streak || 0;

  const toggleDone = async (day) => {
    setBusy(true);
    try {
      await api.post(`/me/plan/days/${day.index}`, { done: !day.done_at });
      if (!day.done_at) toast.success(t("today.done_toast", "Practice logged. Well done!"));
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || t("today.save_failed", "Could not save. Please try again."));
    } finally { setBusy(false); }
  };

  const book = async (cls) => {
    setBusy(true);
    setBookError(null);
    try {
      const { data: b } = await api.post("/bookings", { class_instance_id: cls.id });
      toast.success(b.status === "waitlist" ? t("today.waitlisted", "The class is full — you're on the waitlist.") : t("today.booked", "Booked! See you on the mat."));
      load();
    } catch (e) {
      const msg = e?.response?.data?.detail || t("today.book_failed", "Could not book this class.");
      setBookError({ id: cls.id, msg, payment: e?.response?.status === 402 });
      toast.error(msg);
    } finally { setBusy(false); }
  };

  return (
    <section data-testid="today-card" className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="eyebrow mb-1">{t("today.eyebrow", "Today")}</div>
          <h2 className="serif text-2xl">{t("today.title", "Your practice today")}</h2>
        </div>
        {streak > 0 && (
          <Link to="/streak" data-testid="today-streak" className="inline-flex items-center gap-1.5 rounded-full bg-[#FBF1EE] px-3 py-1.5 text-[13px] font-semibold text-[#B25A45]">
            <Flame className="h-4 w-4" /> {t("today.streak", "{{n}}-day streak", { n: streak })}
          </Link>
        )}
      </div>

      {theme && (
        <div data-testid="today-theme" className="relative overflow-hidden rounded-3xl bg-[#1C221F] text-[#FAFAF7] p-5">
          {theme.image && <img src={theme.image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-35" />}
          <div className="relative">
            <div className="flex items-center gap-2 text-[#E8B8A8]"><Sparkles className="h-4 w-4" /><span className="text-[11px] uppercase tracking-[0.2em] font-semibold">{t("today.theme_eyebrow", "This month with Tony")}</span></div>
            <div className="serif text-2xl mt-2 leading-tight" data-testid="today-theme-title">{theme.title}</div>
            {theme.text && <p className="text-[14px] text-white/80 mt-1.5 leading-relaxed">{theme.text}</p>}
            {theme.link_url && (
              <Link to={theme.link_url} data-testid="today-theme-link" className="pill mt-4 !py-2 !px-4 !text-xs bg-white text-[#1C221F]">
                {theme.link_label || t("today.theme_cta", "Practise")} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Personal plan */}
      {data.plan ? (
        <div data-testid="today-plan" className="rounded-3xl bg-white border border-[#E5E6DF] p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2"><MapIcon className="h-4 w-4 text-[#B25A45]" /><span className="text-[13px] font-semibold">{t("today.my_plan", "My plan")}</span></div>
            <Link to="/my-plan" data-testid="today-open-plan" className="text-xs font-semibold text-[#B25A45]">{summary.done}/{summary.total} · {t("today.see_plan", "See plan")} →</Link>
          </div>
          <div className="mt-3 h-1.5 rounded-full bg-[#EEF1EC] overflow-hidden"><div className="h-full bg-[#B25A45]" style={{ width: `${summary.percent}%` }} /></div>
          {summary.finished ? (
            <div className="mt-4 text-[14px] text-[#545E56]" data-testid="today-plan-finished">
              {t("today.plan_finished", "You finished your plan. Ready for the next four weeks?")}{" "}
              <Link to="/find-your-path" className="font-semibold text-[#B25A45] underline">{t("today.new_plan", "Make a new plan")}</Link>
            </div>
          ) : step ? (
            <div className="mt-4 space-y-2">
              {step.items.map((it, i) => <PlanItem key={`${it.kind}-${i}`} item={it} compact />)}
              <button disabled={busy} onClick={() => toggleDone(step)} data-testid="today-plan-done"
                className={`mt-1 w-full inline-flex items-center justify-center gap-2 rounded-full py-3 text-[14px] font-semibold transition ${step.done_at ? "bg-[#E4F0E8] text-[#3E7C57]" : "bg-[#1C221F] text-white"}`}>
                {step.done_at ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                {step.done_at ? t("today.done", "Done for today") : t("today.mark_done", "Mark today as done")}
              </button>
            </div>
          ) : (
            <div className="mt-4 text-[14px] text-[#545E56]" data-testid="today-rest-day">
              {t("today.rest_day", "Rest day — no practice planned today.")}
              {summary.next && <> {t("today.next_step", "Next: {{date}}", { date: fmtDay(summary.next.date) })}</>}
            </div>
          )}
        </div>
      ) : (
        <Link to="/find-your-path" data-testid="today-plan-cta" className="flex items-center gap-4 rounded-3xl bg-[#FBF6EC] border border-[#E0D3B8] p-5 hover:border-[#B25A45] transition">
          <span className="h-11 w-11 rounded-full bg-white flex items-center justify-center shrink-0"><MapIcon className="h-5 w-5 text-[#B25A45]" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-[#1C221F]">{t("today.plan_cta", "Get your personal 4-week plan")}</span>
            <span className="block text-[13px] text-[#6B7269] mt-0.5">{t("today.plan_cta_sub", "Five quick questions, then your practice for every day.")}</span>
          </span>
          <ArrowRight className="h-5 w-5 text-[#B25A45] shrink-0" />
        </Link>
      )}

      {/* Next live class */}
      {data.next_booked ? (
        <Link to={`/schedule/${data.next_booked.id}`} data-testid="today-next-class" className="flex items-center gap-3 rounded-3xl bg-white border border-[#E5E6DF] p-4 hover:border-[#B25A45] transition">
          <span className="h-11 w-11 rounded-full bg-[#E4F0E8] flex items-center justify-center shrink-0"><CalendarDays className="h-5 w-5 text-[#3E7C57]" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] uppercase tracking-widest font-semibold text-[#3E7C57]">
              {data.next_booked.booking_status === "waitlist" ? t("today.on_waitlist", "On the waitlist") : t("today.your_next_class", "Your next class")}
            </span>
            <span className="block text-[15px] font-semibold truncate">{data.next_booked.title}</span>
            <span className="block text-[12px] text-[#6B7269]">{fmtWhen(data.next_booked.start_time)}</span>
          </span>
          <ArrowRight className="h-4 w-4 text-[#C3C6BE] shrink-0" />
        </Link>
      ) : data.suggested_class ? (
        <div data-testid="today-suggested-class" className="rounded-3xl bg-white border border-[#E5E6DF] p-4">
          <div className="flex items-center gap-3">
            <span className="h-11 w-11 rounded-full bg-[#FBF1EE] flex items-center justify-center shrink-0"><Video className="h-5 w-5 text-[#B25A45]" /></span>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] uppercase tracking-widest font-semibold text-[#839682]">{t("today.next_live", "Next live class")}</div>
              <Link to={`/schedule/${data.suggested_class.id}`} className="block text-[15px] font-semibold truncate hover:text-[#B25A45]">{data.suggested_class.title}</Link>
              <div className="text-[12px] text-[#6B7269]">
                {fmtWhen(data.suggested_class.start_time)}
                {data.suggested_class.included && <> · <span className="text-[#3E7C57] font-semibold">{t("today.included", "Included")}</span></>}
              </div>
            </div>
            <button disabled={busy} onClick={() => book(data.suggested_class)} data-testid="today-book" className="pill pill-primary !py-2 !px-4 !text-xs shrink-0">
              {t("today.book", "Book")}
            </button>
          </div>
          {bookError?.id === data.suggested_class.id && (
            <div data-testid="today-book-error" className="mt-3 rounded-2xl bg-[#FBF6EC] border border-[#E0D3B8] p-3 text-[13px] text-[#5C5346]">
              {bookError.msg}{" "}
              {bookError.payment && <Link to={`/schedule/${data.suggested_class.id}`} data-testid="today-book-options" className="font-semibold text-[#B25A45] underline">{t("today.see_options", "See ways to join")}</Link>}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
