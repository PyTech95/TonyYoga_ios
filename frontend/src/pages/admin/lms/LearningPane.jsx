import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, BookOpenCheck, MessageCircle, Award, Users, HelpCircle, ClipboardCheck, EyeOff, Send, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";

function pct(v) { return v == null ? "—" : `${v}%`; }
function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function Stat({ label, value, tid }) {
  return (
    <div className="rounded-2xl bg-white border border-[#E5E6DF] p-3" data-testid={tid}>
      <div className="text-[10px] uppercase tracking-widest font-semibold text-[#839682]">{label}</div>
      <div className="serif text-2xl mt-1">{value}</div>
    </div>
  );
}

/** Admin → Learning (LMS): course completion, lesson drop-off, quiz results, students' progress
 *  and the queue of questions students asked in lessons. */
export default function LearningPane() {
  const [tab, setTab] = useState("courses");
  const [course, setCourse] = useState(null); // program id opened for the report
  return (
    <div className="space-y-4" data-testid="admin-learning">
      <div className="flex gap-2">
        {[["courses", "Courses & progress", BookOpenCheck], ["questions", "Questions", MessageCircle]].map(([k, label, Icon]) => (
          <button key={k} onClick={() => { setTab(k); setCourse(null); }} data-testid={`learning-tab-${k}`}
            className={`pill !py-2 !px-4 !text-[13px] ${tab === k ? "pill-primary" : "pill-ghost"}`}><Icon className="h-4 w-4" /> {label}</button>
        ))}
      </div>
      {tab === "courses" && (course ? <CourseReport programId={course} onBack={() => setCourse(null)} /> : <Overview onOpen={setCourse} />)}
      {tab === "questions" && <Questions />}
    </div>
  );
}

function Overview({ onOpen }) {
  const [data, setData] = useState(null);
  const load = useCallback(() => { api.get("/admin/lms/overview").then(({ data: d }) => setData(d)).catch(() => setData(false)); }, []);
  useEffect(() => { load(); }, [load]);
  if (data === null) return <div className="h-40 rounded-2xl bg-[#F2F2EC] animate-pulse" />;
  if (data === false) return <p className="text-sm text-[#B25A45]">Couldn't load learning data. <button onClick={load} className="underline">Try again</button></p>;
  const totals = data.courses.reduce((a, c) => ({ learners: a.learners + c.enrolled, completed: a.completed + c.completed, certs: a.certs + c.certificates }), { learners: 0, completed: 0, certs: 0 });
  return (
    <div className="space-y-4" data-testid="learning-overview">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Enrolled (all courses)" value={totals.learners} tid="learning-total-enrolled" />
        <Stat label="Completed" value={totals.completed} tid="learning-total-completed" />
        <Stat label="Open questions" value={data.open_questions} tid="learning-total-questions" />
        <Stat label="Assignments to review" value={data.pending_reviews} tid="learning-total-reviews" />
      </div>
      <div className="rounded-2xl bg-white border border-[#E5E6DF] overflow-x-auto">
        <table className="w-full text-[13px] min-w-[860px]" data-testid="learning-courses-table">
          <thead className="text-left text-[10px] uppercase tracking-widest text-[#839682] bg-[#FAFAF7]">
            <tr>
              {["Course", "Lessons", "Sections", "Quizzes", "Files", "Enrolled", "Started", "Completed", "Completion", "Avg progress", "Quiz avg", "Questions", "Reviews", "Certificates"].map((h) => <th key={h} className="px-3 py-2.5 font-semibold whitespace-nowrap">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFEFE9]">
            {data.courses.map((c) => (
              <tr key={c.id} className="hover:bg-[#FBFBF8] cursor-pointer" onClick={() => onOpen(c.id)} data-testid={`learning-course-${c.id}`}>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2 min-w-[180px]">
                    {c.cover_image && <img src={c.cover_image} alt="" className="h-8 w-8 rounded-lg object-cover shrink-0" />}
                    <span className="font-semibold text-[#1C221F]">{c.title}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5">{c.lessons}</td>
                <td className="px-3 py-2.5">{c.sections}</td>
                <td className="px-3 py-2.5">{c.quizzes}</td>
                <td className="px-3 py-2.5">{c.resources}</td>
                <td className="px-3 py-2.5">{c.enrolled}</td>
                <td className="px-3 py-2.5">{c.started}</td>
                <td className="px-3 py-2.5">{c.completed}</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2"><div className="h-1.5 w-16 rounded-full bg-[#EEF1EC] overflow-hidden"><div className="h-full bg-[#B25A45]" style={{ width: `${c.completion_rate}%` }} /></div>{c.completion_rate}%</div>
                </td>
                <td className="px-3 py-2.5">{pct(c.avg_progress)}</td>
                <td className="px-3 py-2.5">{pct(c.quiz_avg)}</td>
                <td className={`px-3 py-2.5 ${c.open_questions ? "text-[#B25A45] font-semibold" : ""}`}>{c.open_questions}</td>
                <td className={`px-3 py-2.5 ${c.pending_reviews ? "text-[#B25A45] font-semibold" : ""}`}>{c.pending_reviews}</td>
                <td className="px-3 py-2.5">{c.certificates}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-[#6B7269]">Tap a course for lesson-by-lesson drop-off, quiz results and each student's progress. Add sections, resources and quizzes in Courses & videos → a course → Lessons → Learning.</p>
    </div>
  );
}

function CourseReport({ programId, onBack }) {
  const [r, setR] = useState(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    let live = true;
    api.get(`/admin/lms/programs/${programId}`).then(({ data }) => { if (live) setR(data); }).catch(() => { if (live) setR(false); });
    return () => { live = false; };
  }, [programId]);
  if (r === null) return <div className="h-40 rounded-2xl bg-[#F2F2EC] animate-pulse" />;
  if (r === false) return <div><button onClick={onBack} className="text-sm text-[#6B7269]">← Back</button><p className="text-sm text-[#B25A45] mt-3">Couldn't load this course.</p></div>;
  const students = r.students.filter((s) => !q.trim() || `${s.name || ""} ${s.email || ""}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="space-y-4" data-testid="learning-course-report">
      <button onClick={onBack} data-testid="learning-report-back" className="flex items-center gap-1 text-sm text-[#6B7269] hover:text-[#1C221F]"><ArrowLeft className="h-4 w-4" /> All courses</button>
      <div className="serif text-2xl">{r.program.title}</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Enrolled" value={r.enrolled} tid="learning-report-enrolled" />
        <Stat label="Started" value={r.started} tid="learning-report-started" />
        <Stat label="Completed" value={`${r.completed} · ${r.completion_rate}%`} tid="learning-report-completed" />
        <Stat label="Quiz average" value={pct(r.quiz_avg)} tid="learning-report-quiz" />
      </div>

      <section className="rounded-2xl bg-white border border-[#E5E6DF] p-4">
        <div className="eyebrow mb-3">Lesson by lesson</div>
        <ol className="space-y-2.5" data-testid="learning-report-lessons">
          {r.lessons.map((l, i) => (
            <li key={l.id} data-testid={`learning-report-lesson-${i}`}>
              <div className="flex items-center justify-between gap-3 text-[13px]">
                <div className="min-w-0">
                  <span className="text-[#9AA096] mr-1.5">{i + 1}.</span>
                  <span className="font-semibold">{l.title || "Lesson"}</span>
                  {l.section && <span className="ml-2 text-[11px] text-[#6B7269]">{l.section}</span>}
                </div>
                <span className="text-[12px] text-[#6B7269] shrink-0">{l.completed} · {l.completed_pct}%</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-[#EEF1EC] overflow-hidden"><div className="h-full bg-[#B25A45]" style={{ width: `${l.completed_pct}%` }} /></div>
              <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-[#6B7269]">
                {l.quiz && <span className="inline-flex items-center gap-1"><HelpCircle className="h-3 w-3" /> quiz pass rate {pct(l.quiz_pass_rate)} ({l.quiz_attempts} tries)</span>}
                {l.resources > 0 && <span>{l.resources} file(s)</span>}
                {l.questions > 0 && <span className="inline-flex items-center gap-1"><MessageCircle className="h-3 w-3" /> {l.questions}</span>}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-2xl bg-white border border-[#E5E6DF] p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="eyebrow flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Students ({r.students.length})</div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" data-testid="learning-report-search"
            className="rounded-full border border-[#E5E6DF] px-3 py-1.5 text-[13px] w-44 focus:outline-none focus:ring-2 focus:ring-[#B25A45]" />
        </div>
        {students.length === 0 ? <p className="text-xs text-[#6B7269]">No students yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] min-w-[520px]" data-testid="learning-report-students">
              <thead className="text-left text-[10px] uppercase tracking-widest text-[#839682]">
                <tr><th className="py-2 pr-3">Student</th><th className="py-2 pr-3">Progress</th><th className="py-2 pr-3">Last activity</th><th className="py-2">Certificate</th></tr>
              </thead>
              <tbody className="divide-y divide-[#EFEFE9]">
                {students.map((s) => (
                  <tr key={s.user_id} data-testid={`learning-student-${s.user_id}`}>
                    <td className="py-2 pr-3">
                      <a href={`/admin?tab=students&member=${s.user_id}`} className="font-semibold text-[#1C221F] hover:text-[#B25A45]">{s.name || s.email}</a>
                      <div className="text-[11px] text-[#6B7269]">{s.email}</div>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2"><div className="h-1.5 w-20 rounded-full bg-[#EEF1EC] overflow-hidden"><div className="h-full bg-[#B25A45]" style={{ width: `${s.percent}%` }} /></div>{s.done}/{r.lessons.length} · {s.percent}%</div>
                    </td>
                    <td className="py-2 pr-3 text-[#6B7269]">{fmtDate(s.last_activity)}</td>
                    <td className="py-2">{s.certificate ? <Award className="h-4 w-4 text-[#3E7C57]" /> : <span className="text-[#C3C6BE]">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {r.pending_reviews > 0 && (
        <p className="text-xs text-[#8A6D3B] flex items-center gap-1.5"><ClipboardCheck className="h-3.5 w-3.5" /> {r.pending_reviews} posture assignment(s) are waiting for review.</p>
      )}
    </div>
  );
}

function Questions() {
  const [status, setStatus] = useState("open");
  const [rows, setRows] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [busy, setBusy] = useState(null);
  const load = useCallback(() => {
    setRows(null);
    api.get(`/admin/lms/questions?status=${status}`).then(({ data }) => setRows(data || [])).catch(() => setRows([]));
  }, [status]);
  useEffect(() => { load(); }, [load]);

  const reply = async (id) => {
    const text = (drafts[id] || "").trim();
    if (text.length < 3) return toast.error("Write a reply first.");
    setBusy(id);
    try {
      await api.post(`/lms/questions/${id}/reply`, { text });
      toast.success("Reply sent — the student gets a notification.");
      setDrafts((d) => ({ ...d, [id]: "" }));
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Couldn't send the reply."); }
    finally { setBusy(null); }
  };
  const hide = async (id) => {
    if (!window.confirm("Hide this question from students?")) return;
    try { await api.delete(`/lms/questions/${id}`); toast.success("Question hidden."); load(); }
    catch { toast.error("Couldn't hide it."); }
  };

  return (
    <div className="space-y-3" data-testid="learning-questions">
      <div className="flex items-center gap-2">
        {[["open", "Waiting for a reply"], ["answered", "Answered"], ["all", "All"]].map(([k, label]) => (
          <button key={k} onClick={() => setStatus(k)} data-testid={`learning-q-filter-${k}`} className={`pill !py-1.5 !px-3 !text-xs ${status === k ? "pill-primary" : "pill-ghost"}`}>{label}</button>
        ))}
        <button onClick={load} aria-label="Refresh" className="ml-auto text-[#6B7269] hover:text-[#1C221F]"><RefreshCw className="h-4 w-4" /></button>
      </div>
      {rows === null ? <div className="h-24 rounded-2xl bg-[#F2F2EC] animate-pulse" /> : rows.length === 0 ? (
        <p className="text-sm text-[#6B7269] rounded-2xl bg-[#F7F7F2] p-5 text-center" data-testid="learning-q-empty">{status === "open" ? "No questions waiting. 🎉" : "No questions here yet."}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((q) => (
            <li key={q.id} data-testid={`learning-q-${q.id}`} className="rounded-2xl bg-white border border-[#E5E6DF] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] text-[#839682] uppercase tracking-widest font-semibold truncate">{q.program_title} · {q.lesson_title || "Lesson"}</div>
                  <div className="text-[12px] text-[#6B7269] mt-0.5">{q.author} {q.user_email ? `· ${q.user_email}` : ""} · {fmtDate(q.created_at)}</div>
                </div>
                <button onClick={() => hide(q.id)} data-testid={`learning-q-hide-${q.id}`} className="text-[#9AA096] hover:text-[#B25A45] shrink-0" title="Hide"><EyeOff className="h-4 w-4" /></button>
              </div>
              <p className="text-[14px] mt-2 whitespace-pre-wrap">{q.text}</p>
              {q.replies?.length > 0 && (
                <ul className="mt-2 space-y-1.5 border-l-2 border-[#E8B8A8] pl-3">
                  {q.replies.map((r, i) => <li key={i} className="text-[13px]"><span className={`font-semibold ${r.staff ? "text-[#B25A45]" : ""}`}>{r.author}:</span> {r.text}</li>)}
                </ul>
              )}
              <div className="mt-3 flex items-start gap-2">
                <textarea rows={2} value={drafts[q.id] || ""} onChange={(e) => setDrafts((d) => ({ ...d, [q.id]: e.target.value }))} data-testid={`learning-q-reply-${q.id}`}
                  placeholder="Reply as Tony Yoga…" className="flex-1 rounded-xl border border-[#E5E6DF] px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#B25A45]" />
                <button onClick={() => reply(q.id)} disabled={busy === q.id} data-testid={`learning-q-send-${q.id}`} className="pill pill-primary !py-2 !px-3 !text-xs shrink-0"><Send className="h-3.5 w-3.5" /> {busy === q.id ? "…" : "Reply"}</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
