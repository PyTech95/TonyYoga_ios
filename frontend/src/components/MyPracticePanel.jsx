import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Crown, BookOpen, CalendarCheck, Ticket, Play, ArrowRight, Sparkles, Loader2, Award, Library } from "lucide-react";
import { api } from "@/lib/api";
import { useCommerceRefresh } from "@/lib/useCommerceRefresh";

function fmtDate(iso) {
  if (!iso || String(iso).startsWith("2099") || String(iso).startsWith("9999")) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function Stat({ to, icon: Icon, value, label, sub, testId }) {
  return (
    <Link to={to} data-testid={testId}
      className="group rounded-2xl bg-white/[0.07] ring-1 ring-white/10 px-3.5 py-3 hover:bg-white/[0.12] transition min-w-0">
      <div className="flex items-center gap-2 text-[#E8B8A8]">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="serif text-2xl leading-none text-white">{value}</span>
      </div>
      <div className="mt-1.5 text-[12px] font-semibold text-white/90 truncate">{label}</div>
      {sub && <div className="text-[11px] text-white/60 truncate">{sub}</div>}
    </Link>
  );
}

/**
 * Top of Home for a signed-in student: what they have (memberships, courses, booked classes,
 * credits) and one clear next step — start or continue the next lesson, or choose the course
 * their membership includes — so nobody has to look for what they bought.
 */
export default function MyPracticePanel() {
  const { t } = useTranslation();
  const [lib, setLib] = useState(null);
  const [cont, setCont] = useState([]);
  const load = useCallback(() => {
    api.get("/me/library").then(({ data }) => setLib(data)).catch(() => setLib(false));
    api.get("/me/continue").then(({ data }) => setCont(Array.isArray(data) ? data : [])).catch(() => setCont([]));
  }, []);
  useEffect(() => { load(); }, [load]);
  useCommerceRefresh(load);

  if (lib === false) return null;
  if (lib === null) return <div data-testid="my-practice-loading" className="h-48 rounded-3xl bg-[#1C221F]/90 animate-pulse" />;

  const memberships = (lib.memberships || []).filter((m) => ["active", "paused", "past_due"].includes(m.state));
  const membership = memberships[0];
  const courses = (lib.courses || []).filter((c) => c.has_access);
  const booked = lib.upcoming_bookings || [];
  const credits = lib.credits || 0;
  const toChoose = lib.choose_courses?.[0];
  const pending = (lib.pending_payments || []).length > 0;
  const nextById = Object.fromEntries((cont || []).map((r) => [r.program_id, r]));
  // The course to continue: most recently practised with a lesson left, else the first with lessons left.
  const ordered = [...(cont || [])].sort((a, b) => String(b.last_activity || "").localeCompare(String(a.last_activity || "")));
  const focus = ordered.find((r) => r.next_lesson) || ordered.find((r) => r.has_main_video);
  const nothing = !membership && !courses.length && !booked.length && !credits && !pending && !toChoose;

  if (nothing) {
    return (
      <section data-testid="my-practice" className="rounded-3xl bg-[#1C221F] text-[#FAFAF7] p-5 sm:p-6">
        <div className="eyebrow !text-[#E8B8A8] mb-1">{t("practice.eyebrow", "Your practice")}</div>
        <h2 className="serif text-2xl leading-tight" data-testid="my-practice-title">{t("practice.empty_title", "Start your practice with Tony")}</h2>
        <p className="text-sm text-white/70 mt-1.5">{t("practice.empty_text", "Pick a course or a membership — everything you get shows up right here.")}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/programs" data-testid="my-practice-explore" className="pill pill-primary">{t("practice.explore", "Explore courses")} <ArrowRight className="h-4 w-4" /></Link>
          <Link to="/memberships" className="pill !bg-white/10 !text-white hover:!bg-white/20">{t("practice.memberships", "See memberships")}</Link>
        </div>
      </section>
    );
  }

  const parts = [];
  if (memberships.length) parts.push(t("practice.n_memberships", { count: memberships.length, defaultValue: memberships.length === 1 ? "1 membership" : "{{count}} memberships" }));
  if (courses.length) parts.push(t("practice.n_courses", { count: courses.length, defaultValue: courses.length === 1 ? "1 course" : "{{count}} courses" }));
  const title = parts.length ? t("practice.you_have", { list: parts.join(t("practice.and", " and ")), defaultValue: "You have {{list}}" }) : t("practice.ready", "Your practice is ready");

  let action = null;
  if (toChoose) {
    action = (
      <Link to="/my-yoga#choose" data-testid="my-practice-choose" className="flex items-center gap-3 rounded-2xl bg-[#B25A45] p-4 hover:bg-[#9d4d3b] transition">
        <Sparkles className="h-6 w-6 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">{t("practice.choose_title", "Choose the course included in your membership")}</span>
          <span className="block text-[12px] text-white/80">{toChoose.plan_name} · {t("practice.choose_text", { count: toChoose.remaining, defaultValue: "{{count}} to choose — it opens right away" })}</span>
        </span>
        <ArrowRight className="h-5 w-5 shrink-0" />
      </Link>
    );
  } else if (pending && !courses.length && !membership) {
    action = (
      <div data-testid="my-practice-pending" className="flex items-center gap-3 rounded-2xl bg-white/[0.07] ring-1 ring-white/10 p-4">
        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[#E8B8A8]" />
        <span className="text-[14px] text-white/85">{t("practice.pending", "We're confirming your payment. Your purchase appears here in a few minutes — no need to pay again.")}</span>
      </div>
    );
  } else if (focus) {
    const nl = focus.next_lesson;
    const fresh = !focus.completed;
    const to = nl ? `/library/${nl.video_id}` : `/programs/${focus.program_id}`;
    action = (
      <Link to={to} data-testid="my-practice-continue" className="group flex items-center gap-3.5 rounded-2xl bg-[#FAFAF7] p-3 pr-4 text-[#1C221F] hover:shadow-lg transition">
        <span className="relative h-16 w-24 shrink-0 overflow-hidden rounded-xl bg-[#E5E6DF]">
          {(nl?.cover_image || focus.cover_image) && <img src={nl?.cover_image || focus.cover_image} alt="" className="h-full w-full object-cover" />}
          <span className="absolute inset-0 flex items-center justify-center bg-black/25">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#B25A45] text-white shadow-md group-hover:scale-105 transition"><Play className="h-4 w-4 translate-x-px" fill="currentColor" /></span>
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-bold uppercase tracking-widest text-[#B25A45]">{fresh ? t("practice.start", "Start learning") : t("practice.continue", "Continue")}</span>
          <span className="block text-[15px] font-semibold leading-snug truncate">{focus.program_title}</span>
          <span className="block text-[12px] text-[#6B7269] truncate">{nl ? nl.title : t("practice.full_video", "Full course video")}</span>
          {focus.total > 0 && (
            <span className="mt-1.5 flex items-center gap-2">
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#E5E6DF]"><span className="block h-full rounded-full bg-[#839682]" style={{ width: `${focus.percent || 0}%` }} /></span>
              <span className="text-[11px] font-semibold text-[#545E56]">{focus.completed}/{focus.total}</span>
            </span>
          )}
        </span>
        <ArrowRight className="h-5 w-5 shrink-0 text-[#B25A45]" />
      </Link>
    );
  } else if (membership && membership.includes?.some((x) => /library/i.test(x))) {
    action = (
      <Link to="/library" data-testid="my-practice-library" className="flex items-center gap-3 rounded-2xl bg-[#FAFAF7] p-4 text-[#1C221F] hover:shadow-lg transition">
        <Library className="h-6 w-6 shrink-0 text-[#B25A45]" />
        <span className="min-w-0 flex-1 text-[15px] font-semibold">{t("practice.library", "Open the class library")}</span>
        <ArrowRight className="h-5 w-5 shrink-0 text-[#B25A45]" />
      </Link>
    );
  }

  const others = courses.filter((c) => !focus || c.program_id !== focus.program_id).slice(0, 4);

  return (
    <section data-testid="my-practice" className="relative overflow-hidden rounded-3xl bg-[#1C221F] text-[#FAFAF7] p-5 sm:p-6">
      <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[#B25A45]/25 blur-3xl" />
      <div className="relative">
        <div className="eyebrow !text-[#E8B8A8] mb-1">{t("practice.eyebrow", "Your practice")}</div>
        <h2 className="serif text-[26px] leading-tight" data-testid="my-practice-title">{title}</h2>

        {/* The next step first, so it is on screen right after signing in. */}
        {action && <div className="mt-4">{action}</div>}

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2" data-testid="my-practice-stats">
          <Stat to="/my-yoga" icon={Crown} testId="my-practice-membership" value={memberships.length}
            label={membership ? membership.plan_name : t("practice.no_membership", "No membership")}
            sub={membership ? (membership.state === "paused" ? t("practice.paused", "Paused") : fmtDate(membership.end_date) ? t("practice.until", { date: fmtDate(membership.end_date), defaultValue: "Until {{date}}" }) : "") : t("practice.see_plans", "See plans")} />
          <Stat to="/my-learning" icon={BookOpen} testId="my-practice-courses" value={courses.length}
            label={t("practice.courses_label", { count: courses.length, defaultValue: courses.length === 1 ? "Course" : "Courses" })}
            sub={courses.length ? t("practice.open_now", "Open now") : t("practice.none_yet", "None yet")} />
          <Stat to="/my-classes" icon={CalendarCheck} testId="my-practice-classes" value={booked.length}
            label={t("practice.classes_label", "Classes booked")}
            sub={booked[0] ? fmtDate(booked[0].start_time) : t("practice.book", "Book a class")} />
          <Stat to="/passes" icon={Ticket} testId="my-practice-credits" value={credits}
            label={t("practice.credits_label", "Class credits")} sub={credits ? t("practice.ready_to_use", "Ready to use") : t("practice.get_credits", "Get credits")} />
        </div>


        {others.length > 0 && (
          <div className="mt-4">
            <div className="text-[11px] uppercase tracking-[0.2em] font-semibold text-white/55 mb-2">{t("practice.your_courses", "Your courses")}</div>
            <div className="flex gap-2.5 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1" data-testid="my-practice-courses-list">
              {others.map((c) => {
                const r = nextById[c.program_id];
                const to = r?.next_lesson ? `/library/${r.next_lesson.video_id}` : `/programs/${c.program_id}`;
                const pct = c.percent ?? r?.percent ?? 0;
                return (
                  <Link key={c.program_id} to={to} data-testid={`my-practice-course-${c.program_id}`}
                    className="w-40 shrink-0 overflow-hidden rounded-2xl bg-white/[0.07] ring-1 ring-white/10 hover:bg-white/[0.12] transition">
                    <div className="relative aspect-[16/9] bg-white/10">
                      {c.cover_image && <img src={c.cover_image} alt="" className="h-full w-full object-cover" />}
                      {pct >= 100 && <Award className="absolute right-1.5 top-1.5 h-5 w-5 text-[#E8B8A8]" />}
                    </div>
                    <div className="p-2.5">
                      <div className="text-[12px] font-semibold leading-snug line-clamp-2">{c.title}</div>
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-[#E8B8A8]" style={{ width: `${pct}%` }} /></div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        <Link to="/my-yoga" data-testid="my-practice-all" className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#E8B8A8] hover:text-white">
          {t("practice.all", "Everything in My Yoga")} <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}
