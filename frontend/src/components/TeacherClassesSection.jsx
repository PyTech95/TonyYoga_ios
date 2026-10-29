import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { BadgeCheck, Video, MapPin, PlayCircle, Ticket } from "lucide-react";
import { api } from "@/lib/api";

function fmtWhen(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) + " · " +
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** My Yoga: classes, courses and class credits with Tony-certified teachers.
 *  Renders nothing when the member has none (or the list can't load). */
export default function TeacherClassesSection() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [teachers, setTeachers] = useState([]);

  const load = useCallback(() => {
    api.get("/me/teacher-classes").then(({ data: d }) => setData(d || null)).catch(() => setData(null));
    api.get("/me/teachers").then(({ data: d }) => setTeachers(Array.isArray(d) ? d : [])).catch(() => setTeachers([]));
  }, []);

  const leave = async (teacher) => {
    if (!window.confirm(t("teachers.leave_confirm", "Remove {{name}} from your teachers? You won't get their messages any more.", { name: teacher.display_name }))) return;
    setBusy(teacher.id);
    try {
      await api.post(`/me/teachers/${teacher.id}/leave`);
      toast.success(t("teachers.left", "Removed."));
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || t("teachers.leave_failed", "Could not remove.")); }
    finally { setBusy(null); }
  };
  useEffect(() => { load(); }, [load]);

  const cancel = async (e) => {
    if (!window.confirm(t("teachers.cancel_confirm", "Cancel this booking?"))) return;
    setBusy(e.id);
    try {
      const { data: r } = await api.post(`/teacher-enrollments/${e.id}/cancel`);
      toast.success([t("teachers.cancelled", "Booking cancelled."), r?.note].filter(Boolean).join(" "));
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || t("teachers.cancel_failed", "Could not cancel.")); }
    finally { setBusy(null); }
  };

  const items = (data?.items || []).filter((i) => i.active !== false);
  const classes = items.filter((i) => i.kind === "class");
  const courses = items.filter((i) => i.kind === "course");
  const credits = data?.credits || [];
  if (!classes.length && !courses.length && !credits.length && !teachers.length) return null;

  return (
    <section data-testid="my-yoga-teachers" className="scroll-mt-24">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BadgeCheck className="h-4 w-4 text-[#B25A45]" />
          <h2 className="eyebrow !text-[11px]">{t("teachers.my_section", "With my teachers")}</h2>
        </div>
        <Link to="/teachers" className="text-xs font-semibold text-[#B25A45]">{t("teachers.all", "All teachers")} →</Link>
      </div>
      <div className="space-y-2">
        {classes.map((e) => (
          <div key={e.id} className="rounded-2xl bg-white border border-[#E5E6DF] p-4" data-testid={`my-teacher-class-${e.id}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[14px] font-semibold truncate">{e.offering_title}</div>
                <div className="text-xs text-[#6B7269]">
                  {fmtWhen(e.start_time)} · {e.teacher?.slug ? <Link to={`/teachers/${e.teacher.slug}`} className="underline-offset-2 hover:underline">{e.teacher.name}</Link> : e.teacher?.name}
                </div>
                <div className="text-[11px] text-[#6B7269] mt-1 inline-flex items-center gap-1">
                  {e.location_type === "online" ? <><Video className="h-3.5 w-3.5" />{t("teachers.online_short", "Online")}</> : <><MapPin className="h-3.5 w-3.5" />{e.location || t("teachers.in_person_short", "In person")}</>}
                  {e.payment === "offline" && !e.paid && <span className="text-[#8A6D3B] font-semibold"> · {t("teachers.pay_at_class", "Pay at class")}</span>}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                {e.join_url && <a href={e.join_url} target="_blank" rel="noopener noreferrer" data-testid={`my-teacher-join-${e.id}`} className="pill pill-primary !py-1.5 !px-3 !text-xs"><Video className="h-3.5 w-3.5" />{t("teachers.join", "Join")}</a>}
                {e.status === "booked" && <button type="button" disabled={busy === e.id} onClick={() => cancel(e)} data-testid={`my-teacher-cancel-${e.id}`} className="text-[11px] text-[#B25A45] hover:underline">{t("common.cancel", "Cancel")}</button>}
              </div>
            </div>
          </div>
        ))}
        {courses.map((e) => (
          <Link key={e.id} to={`/teacher-course/${e.offering_id}`} data-testid={`my-teacher-course-${e.offering_id}`}
            className="rounded-2xl bg-white border border-[#E5E6DF] p-4 flex items-center justify-between gap-3 hover:border-[#B25A45]">
            <div className="min-w-0">
              <div className="text-[14px] font-semibold truncate">{e.offering_title}</div>
              <div className="text-xs text-[#6B7269]">{e.teacher?.name} · {t("teachers.n_lessons", "{{n}} lessons", { n: e.lesson_count })}</div>
            </div>
            <PlayCircle className="h-6 w-6 text-[#B25A45] shrink-0" />
          </Link>
        ))}
        {credits.map((c) => (
          <div key={c.teacher_id} className="rounded-2xl bg-white border border-[#E5E6DF] p-4 flex items-center gap-3" data-testid={`my-teacher-credits-${c.teacher_id}`}>
            <Ticket className="h-5 w-5 text-[#B25A45]" />
            <div className="text-sm">
              <span className="font-semibold">{c.remaining}</span> {t("teachers.credits_with", "class credit(s) with")}{" "}
              {c.teacher?.slug ? <Link to={`/teachers/${c.teacher.slug}`} className="font-semibold text-[#B25A45]">{c.teacher.name}</Link> : c.teacher?.name}
            </div>
          </div>
        ))}
        {teachers.length > 0 && (
          <div className="rounded-2xl bg-white border border-[#E5E6DF] p-4" data-testid="my-teachers-list">
            <div className="text-[11px] uppercase tracking-widest font-semibold text-[#839682] mb-2">{t("teachers.my_teachers", "My teachers")}</div>
            <ul className="space-y-2">
              {teachers.map((tc) => (
                <li key={tc.id} className="flex items-center justify-between gap-3 text-sm">
                  {tc.slug ? <Link to={`/teachers/${tc.slug}`} className="font-semibold text-[#1C221F] hover:text-[#B25A45]">{tc.display_name}</Link> : <span className="font-semibold">{tc.display_name}</span>}
                  <button disabled={busy === tc.id} onClick={() => leave(tc)} data-testid={`my-teacher-leave-${tc.id}`} className="text-xs text-[#6B7269] hover:text-[#B25A45]">
                    {t("teachers.leave", "Remove")}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
