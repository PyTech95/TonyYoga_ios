import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { GraduationCap, Award, HelpCircle, ClipboardCheck, MessageCircle, StickyNote, ArrowRight, PlayCircle, BookOpen } from "lucide-react";
import { api } from "@/lib/api";
import PageHeader from "@/components/PageHeader";

function fmtDate(iso) {
  if (!iso) return "";
  if (String(iso).startsWith("2099")) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function Section({ icon: Icon, title, children, testId, action }) {
  return (
    <section data-testid={testId}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2"><Icon className="h-4 w-4 text-[#B25A45]" /><h2 className="eyebrow !text-[11px]">{title}</h2></div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** /my-learning — every course the student has, with progress, the next lesson, certificates,
 *  quiz results, assignment feedback and answered questions. */
export default function MyLearning() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [notes, setNotes] = useState(null);
  const [showNotes, setShowNotes] = useState(false);

  const load = useCallback(() => {
    api.get("/me/learning").then(({ data: d }) => { setData(d); setError(false); }).catch(() => setError(true));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!showNotes || notes !== null) return;
    api.get("/lms/notes").then(({ data: d }) => setNotes(d || [])).catch(() => setNotes([]));
  }, [showNotes, notes]);

  const quizzes = (data?.courses || []).flatMap((c) => (c.quizzes || []).map((q) => ({ ...q, course: c.title })));
  const empty = data && !data.courses.length && !data.certificates.length;

  return (
    <div data-testid="my-learning-page" className="pb-24">
      <PageHeader eyebrow={t("lms.eyebrow", "Your practice")} title={t("lms.title", "My learning")} back testId="my-learning-header" />
      <div className="mx-auto max-w-2xl px-5 space-y-8">
        {error && (
          <div className="rounded-2xl bg-[#FBEFEA] border border-[#EED9D2] p-4 text-sm text-[#8A3B2A]">
            {t("lms.load_error", "We couldn't load your courses right now.")}{" "}
            <button onClick={load} className="underline font-semibold">{t("common.retry", "Try again")}</button>
          </div>
        )}
        {!data && !error && <div className="space-y-3" aria-busy="true">{[0, 1].map((i) => <div key={i} className="h-28 rounded-3xl bg-[#F2F2EC] animate-pulse" />)}</div>}

        {empty && (
          <div data-testid="my-learning-empty" className="rounded-3xl bg-white border border-[#E5E6DF] p-8 text-center">
            <BookOpen className="h-8 w-8 text-[#839682] mx-auto" />
            <div className="serif text-2xl mt-3">{t("lms.empty_title", "No courses yet")}</div>
            <p className="text-sm text-[#6B7269] mt-2">{t("lms.empty_body", "Courses you join appear here with your progress, quizzes and certificates.")}</p>
            <Link to="/programs" className="pill pill-primary mt-5 inline-flex">{t("lms.browse", "Browse courses")}</Link>
          </div>
        )}

        {data?.courses?.length > 0 && (
          <Section icon={GraduationCap} title={t("lms.my_courses", "My courses")} testId="my-learning-courses">
            <ul className="space-y-3">
              {data.courses.map((c) => (
                <li key={c.program_id} data-testid={`my-learning-course-${c.program_id}`} className="rounded-3xl bg-white border border-[#E5E6DF] overflow-hidden">
                  <Link to={`/programs/${c.program_id}`} className="flex gap-4 p-4 hover:bg-[#FBFBF8] transition">
                    <div className="h-20 w-20 sm:h-24 sm:w-28 rounded-2xl bg-[#F2F2EC] overflow-hidden shrink-0 relative">
                      {c.cover_image && <img src={c.cover_image} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-semibold leading-snug">{c.title}</div>
                      <div className="mt-2 h-1.5 rounded-full bg-[#EEF1EC] overflow-hidden"><div className="h-full bg-[#B25A45]" style={{ width: `${c.percent}%` }} /></div>
                      <div className="text-[12px] text-[#6B7269] mt-1">
                        {t("lms.done_of", "{{done}} of {{total}} lessons done", { done: c.done, total: c.total })} · {c.percent}%
                        {fmtDate(c.ends_at) && <span> · {t("lms.until", "until {{date}}", { date: fmtDate(c.ends_at) })}</span>}
                      </div>
                      {c.certificate && <div className="text-[12px] font-semibold text-[#3E7C57] mt-1 inline-flex items-center gap-1"><Award className="h-3.5 w-3.5" /> {t("lms.completed", "Completed")}</div>}
                    </div>
                  </Link>
                  {c.next?.video_id && !c.certificate && (
                    <Link to={`/library/${c.next.video_id}`} data-testid={`my-learning-next-${c.program_id}`}
                      className="flex items-center justify-between gap-3 border-t border-[#EFEFE9] px-4 py-3 text-[13px] font-semibold text-[#B25A45] hover:bg-[#FBF1EE] transition">
                      <span className="flex items-center gap-2 min-w-0"><PlayCircle className="h-4 w-4 shrink-0" /><span className="truncate">{c.done > 0 ? t("lms.next", "Next: {{title}}", { title: c.next.title }) : t("lms.begin", "Begin: {{title}}", { title: c.next.title })}</span></span>
                      <ArrowRight className="h-4 w-4 shrink-0" />
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {data?.certificates?.length > 0 && (
          <Section icon={Award} title={t("lms.certificates", "Certificates")} testId="my-learning-certificates">
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {data.certificates.map((c) => (
                <li key={c.code}>
                  <Link to={`/certificate/${c.code}`} data-testid={`my-learning-cert-${c.code}`} className="block rounded-3xl bg-[#1C221F] text-[#FAFAF7] p-5 hover:opacity-95 transition">
                    <Award className="h-5 w-5 text-[#E8B8A8]" />
                    <div className="serif text-lg leading-tight mt-2">{c.program_title}</div>
                    <div className="text-[11px] text-white/60 mt-1">{fmtDate(c.issued_at)} · {c.code}</div>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {quizzes.length > 0 && (
          <Section icon={HelpCircle} title={t("lms.quiz_results", "Quiz results")} testId="my-learning-quizzes">
            <ul className="rounded-3xl bg-white border border-[#E5E6DF] divide-y divide-[#EFEFE9]">
              {quizzes.map((q, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold truncate">{q.lesson}</div>
                    <div className="text-[11px] text-[#6B7269] truncate">{q.course}</div>
                  </div>
                  <span className={`text-sm font-semibold shrink-0 ${q.passed ? "text-[#3E7C57]" : "text-[#B25A45]"}`}>{q.score}%{q.passed ? " ✓" : ""}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {data?.assignments?.length > 0 && (
          <Section icon={ClipboardCheck} title={t("lms.assignments", "Posture assignments")} testId="my-learning-assignments">
            <ul className="space-y-2">
              {data.assignments.map((a) => (
                <li key={a.id} className="rounded-2xl bg-white border border-[#E5E6DF] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <Link to={`/programs/${a.program_id}`} className="text-[14px] font-semibold text-[#1C221F] hover:text-[#B25A45]">{t("lms.assignment", "Assignment")} · {fmtDate(a.created_at)}</Link>
                    <span className="text-xs font-semibold text-[#6B7269]">{a.status === "scored" ? `${a.score}%` : a.status === "pending_review" ? t("lms.in_review", "In review") : t("lms.grading", "Grading…")}</span>
                  </div>
                  {a.feedback && <p className="text-[13px] text-[#545E56] mt-2">{a.feedback}</p>}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {data?.answered_questions?.length > 0 && (
          <Section icon={MessageCircle} title={t("lms.answers", "Answers from Tony's team")} testId="my-learning-answers">
            <ul className="space-y-2">
              {data.answered_questions.map((q) => (
                <li key={q.id} className="rounded-2xl bg-white border border-[#E5E6DF] p-4">
                  <p className="text-[14px] font-semibold">{q.text}</p>
                  {(q.replies || []).filter((r) => r.staff).slice(-1).map((r, i) => (
                    <p key={i} className="text-[13px] text-[#545E56] mt-2 border-l-2 border-[#E8B8A8] pl-3"><span className="font-semibold text-[#B25A45]">{r.author}:</span> {r.text}</p>
                  ))}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {data && data.notes > 0 && (
          <Section icon={StickyNote} title={t("lms.my_notes", "My notes")} testId="my-learning-notes"
            action={<button onClick={() => setShowNotes((v) => !v)} data-testid="my-learning-notes-toggle" className="text-xs font-semibold text-[#B25A45]">
              {showNotes ? t("lms.hide", "Hide") : t("lms.show_n", "Show {{n}}", { n: data.notes })}</button>}>
            {showNotes && (notes === null ? <div className="h-16 rounded-2xl bg-[#F2F2EC] animate-pulse" /> : (
              <ul className="space-y-2" data-testid="my-learning-notes-list">
                {notes.map((n) => (
                  <li key={n.id || n.lesson_id} className="rounded-2xl bg-white border border-[#E5E6DF] p-4">
                    <div className="flex items-center justify-between gap-3">
                      {n.video_id ? <Link to={`/library/${n.video_id}`} className="text-[13px] font-semibold text-[#B25A45] truncate">{n.lesson_title || t("lms.lesson", "Lesson")}</Link>
                        : <span className="text-[13px] font-semibold truncate">{n.lesson_title || t("lms.lesson", "Lesson")}</span>}
                      <span className="text-[11px] text-[#6B7269] shrink-0">{fmtDate(n.updated_at)}</span>
                    </div>
                    <p className="text-[13px] text-[#545E56] mt-1 whitespace-pre-wrap line-clamp-4">{n.text}</p>
                  </li>
                ))}
              </ul>
            ))}
          </Section>
        )}
      </div>
    </div>
  );
}
