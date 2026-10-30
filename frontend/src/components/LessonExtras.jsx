import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  FileText, ExternalLink, CheckCircle2, Circle, HelpCircle, StickyNote, MessageCircle, Award, Loader2, RotateCcw, Trash2, Send, Check, X,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/** Everything around a course lesson video: resources, mark as done, quiz, my note and Q&A.
 *  Props: videoId (the /library/:id video), lessonId (optional), programId (optional).
 *  Renders nothing for guests, videos that aren't course lessons, or courses the viewer doesn't have. */
export default function LessonExtras({ videoId, lessonId: lessonIdProp, programId: programIdProp }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [lessonId, setLessonId] = useState(lessonIdProp || null);
  const [data, setData] = useState(null); // null loading, false hidden
  const [cert, setCert] = useState(null);

  // Find the lesson for this video when only the video id is known.
  useEffect(() => {
    let live = true;
    if (!user) { setData(false); return undefined; }
    if (lessonIdProp) { setLessonId(lessonIdProp); return undefined; }
    (async () => {
      try {
        let pid = programIdProp;
        if (!pid && videoId) {
          const { data: v } = await api.get(`/videos/${videoId}`);
          pid = v?.program_id;
        }
        if (!pid) { if (live) setData(false); return; }
        const { data: course } = await api.get(`/lms/programs/${pid}/me`);
        const lesson = (course?.sections || []).flatMap((s) => s.lessons).find((l) => l.video_id === videoId);
        if (!live) return;
        if (!lesson || !course.has_access) { setData(false); return; }
        setLessonId(lesson.id);
      } catch { if (live) setData(false); }
    })();
    return () => { live = false; };
  }, [user, videoId, lessonIdProp, programIdProp]);

  const load = useCallback(async () => {
    if (!lessonId) return;
    try {
      const { data: d } = await api.get(`/lms/lessons/${lessonId}`);
      setData(d);
    } catch { setData(false); }
  }, [lessonId]);
  useEffect(() => { load(); }, [load]);

  if (!data) return null;

  const onCertificate = (c) => { if (c?.code) setCert(c); };

  return (
    <div data-testid="lesson-extras" className="space-y-4">
      {cert && (
        <Link to={`/certificate/${cert.code}`} data-testid="lesson-certificate-banner"
          className="flex items-center gap-4 rounded-3xl bg-[#1C221F] text-[#FAFAF7] p-5 hover:opacity-95 transition">
          <span className="h-11 w-11 rounded-full bg-[#B25A45] flex items-center justify-center shrink-0"><Award className="h-5 w-5" /></span>
          <span className="min-w-0">
            <span className="block serif text-lg leading-tight">{t("lms.cert_title", "Course completed!")}</span>
            <span className="block text-xs text-white/70 mt-0.5">{t("lms.cert_body", "Your certificate for {{title}} is ready →", { title: cert.program_title })}</span>
          </span>
        </Link>
      )}

      <DoneToggle lessonId={lessonId} done={data.done} hasQuiz={!!data.quiz} onChange={(done, c) => { setData((d) => ({ ...d, done })); onCertificate(c); }} t={t} />

      {data.resources?.length > 0 && (
        <section data-testid="lesson-resources" className="rounded-3xl bg-white border border-[#E5E6DF] p-5">
          <Heading icon={FileText} title={t("lms.resources", "Resources")} />
          <ul className="mt-3 space-y-2">
            {data.resources.map((r, i) => (
              <li key={`${r.url}-${i}`}>
                <a href={r.url} target="_blank" rel="noopener noreferrer" data-testid={`lesson-resource-${i}`}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-[#F7F7F2] border border-[#E5E6DF] px-4 py-3 text-[14px] hover:border-[#B25A45] transition">
                  <span className="truncate font-semibold">{r.title}</span>
                  <ExternalLink className="h-4 w-4 text-[#B25A45] shrink-0" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.quiz && <QuizCard lessonId={lessonId} quiz={data.quiz} best={data.best_attempt} t={t}
        onPassed={(c) => { setData((d) => ({ ...d, done: true })); onCertificate(c); load(); }} />}

      <NoteCard lessonId={lessonId} initial={data.note?.text || ""} t={t} />

      <QuestionsCard lessonId={lessonId} t={t} />
    </div>
  );
}

function Heading({ icon: Icon, title, right }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-[#B25A45]" />
        <h3 className="eyebrow !text-[11px]">{title}</h3>
      </div>
      {right}
    </div>
  );
}

function DoneToggle({ lessonId, done, hasQuiz, onChange, t }) {
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/lms/lessons/${lessonId}/complete`, { done: !done });
      onChange(!!data.done, data.certificate);
      toast.success(data.done ? t("lms.marked_done", "Lesson marked as done.") : t("lms.marked_undone", "Lesson marked as not done."));
    } catch (e) {
      if (e?.response?.status === 409) toast.error(t("lms.pass_quiz_first", "Pass the lesson quiz below to complete this lesson."));
      else toast.error(e?.response?.data?.detail || t("lms.save_failed", "Couldn't save. Please try again."));
    } finally { setBusy(false); }
  };
  return (
    <button onClick={toggle} disabled={busy} data-testid="lesson-done-toggle" aria-pressed={done}
      className={`w-full flex items-center justify-between gap-3 rounded-3xl border p-4 text-left transition ${done ? "bg-[#E4F0E8] border-[#C7DDCC]" : "bg-white border-[#E5E6DF] hover:border-[#B25A45]"}`}>
      <span className="flex items-center gap-3">
        {busy ? <Loader2 className="h-6 w-6 animate-spin text-[#B25A45]" /> : done ? <CheckCircle2 className="h-6 w-6 text-[#3E7C57]" /> : <Circle className="h-6 w-6 text-[#9AA096]" />}
        <span>
          <span className="block text-[15px] font-semibold">{done ? t("lms.done", "Lesson done") : t("lms.mark_done", "Mark lesson as done")}</span>
          <span className="block text-xs text-[#6B7269]">{done ? t("lms.done_hint", "Tap to undo.") : hasQuiz ? t("lms.quiz_hint", "This lesson has a short quiz — passing it completes the lesson.") : t("lms.done_hint2", "Counts towards your course progress and certificate.")}</span>
        </span>
      </span>
    </button>
  );
}

function QuizCard({ lessonId, quiz, best, onPassed, t }) {
  const [answers, setAnswers] = useState(() => quiz.questions.map(() => null));
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const ready = answers.every((a) => a !== null);

  const submit = async () => {
    if (!ready) return toast.error(t("lms.answer_all", "Answer every question first."));
    setBusy(true);
    try {
      const { data } = await api.post(`/lms/lessons/${lessonId}/quiz`, { answers });
      setResult(data);
      if (data.passed) { toast.success(t("lms.quiz_passed", "Passed — well done!")); onPassed(data.certificate); }
      else toast(t("lms.quiz_failed", "Not quite — check the answers and try again."));
    } catch (e) { toast.error(e?.response?.data?.detail || t("lms.quiz_error", "Couldn't check your answers.")); }
    finally { setBusy(false); }
  };
  const retry = () => { setResult(null); setAnswers(quiz.questions.map(() => null)); };
  const resultFor = (i) => result?.results?.find((r) => r.index === i);

  return (
    <section data-testid="lesson-quiz" className="rounded-3xl bg-white border border-[#E5E6DF] p-5">
      <Heading icon={HelpCircle} title={t("lms.quiz", "Quiz")}
        right={best ? <span data-testid="lesson-quiz-best" className={`text-[11px] font-semibold ${best.passed ? "text-[#3E7C57]" : "text-[#B25A45]"}`}>
          {t("lms.best", "Best: {{score}}%", { score: best.score })}{best.passed ? " ✓" : ""}</span> : null} />
      <p className="text-xs text-[#6B7269] mt-1">{t("lms.pass_mark", "Pass mark {{p}}%", { p: quiz.pass_percent })}</p>
      <ol className="mt-4 space-y-5">
        {quiz.questions.map((q, i) => {
          const r = resultFor(i);
          return (
            <li key={i} data-testid={`quiz-q-${i}`}>
              <div className="text-[14px] font-semibold leading-snug">{i + 1}. {q.q}</div>
              <div className="mt-2 space-y-1.5" role="radiogroup">
                {q.options.map((opt, j) => {
                  const chosen = answers[i] === j;
                  const isRight = r && (r.answer === j || (r.correct && chosen));
                  const isWrongPick = r && chosen && !r.correct;
                  return (
                    <label key={j} data-testid={`quiz-q-${i}-opt-${j}`}
                      className={`flex items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-[14px] cursor-pointer transition ${
                        isRight ? "border-[#3E7C57] bg-[#E4F0E8]" : isWrongPick ? "border-[#B25A45] bg-[#FBEFEA]" : chosen ? "border-[#B25A45] bg-[#FBF1EE]" : "border-[#E5E6DF] hover:border-[#B25A45]"}`}>
                      <input type="radio" name={`q-${lessonId}-${i}`} checked={chosen} disabled={!!result}
                        onChange={() => setAnswers((a) => a.map((x, k) => (k === i ? j : x)))} className="accent-[#B25A45]" />
                      <span className="flex-1">{opt}</span>
                      {isRight && <Check className="h-4 w-4 text-[#3E7C57]" />}
                      {isWrongPick && <X className="h-4 w-4 text-[#B25A45]" />}
                    </label>
                  );
                })}
              </div>
              {r && r.explain && <p data-testid={`quiz-explain-${i}`} className="mt-2 text-xs text-[#545E56] bg-[#F7F7F2] rounded-xl px-3 py-2">{r.explain}</p>}
            </li>
          );
        })}
      </ol>
      {result ? (
        <div data-testid="quiz-result" className={`mt-5 rounded-2xl p-4 flex items-center justify-between gap-3 ${result.passed ? "bg-[#E4F0E8]" : "bg-[#FBEFEA]"}`}>
          <div>
            <div className={`serif text-2xl ${result.passed ? "text-[#3E7C57]" : "text-[#B25A45]"}`}>{result.score}%</div>
            <div className="text-xs text-[#545E56]">{result.passed ? t("lms.passed_short", "Passed — lesson complete.") : t("lms.need", "You need {{p}}% to pass.", { p: result.pass_percent })}</div>
          </div>
          <button onClick={retry} data-testid="quiz-retry" className="pill pill-ghost !py-2 !px-4 !text-xs shrink-0"><RotateCcw className="h-3.5 w-3.5" /> {t("lms.retry", "Try again")}</button>
        </div>
      ) : (
        <button onClick={submit} disabled={busy || !ready} data-testid="quiz-submit" className="pill pill-primary w-full mt-5">
          {busy ? t("lms.checking", "Checking…") : t("lms.check", "Check my answers")}
        </button>
      )}
    </section>
  );
}

function NoteCard({ lessonId, initial, t }) {
  const [text, setText] = useState(initial);
  const [state, setState] = useState("idle"); // idle | saving | saved | error
  const dirty = useRef(false);
  useEffect(() => { setText(initial); dirty.current = false; }, [initial, lessonId]);
  useEffect(() => {
    if (!dirty.current) return undefined;
    setState("saving");
    const id = setTimeout(async () => {
      try { await api.put(`/lms/lessons/${lessonId}/note`, { text }); setState("saved"); }
      catch { setState("error"); }
    }, 900);
    return () => clearTimeout(id);
  }, [text, lessonId]);
  return (
    <section data-testid="lesson-note" className="rounded-3xl bg-white border border-[#E5E6DF] p-5">
      <Heading icon={StickyNote} title={t("lms.my_note", "My note")}
        right={<span data-testid="lesson-note-state" className="text-[11px] text-[#6B7269]">
          {state === "saving" ? t("lms.saving", "Saving…") : state === "saved" ? t("lms.saved", "Saved") : state === "error" ? t("lms.not_saved", "Not saved — check your connection") : t("lms.private", "Only you can see this")}
        </span>} />
      <textarea data-testid="lesson-note-text" rows={4} value={text} maxLength={10000}
        onChange={(e) => { dirty.current = true; setText(e.target.value); }}
        placeholder={t("lms.note_ph", "Cues to remember, how your body felt, what to work on next time…")}
        className="mt-3 w-full rounded-2xl border border-[#E5E6DF] px-4 py-3 text-[14px] focus:outline-none focus:ring-2 focus:ring-[#B25A45]" />
    </section>
  );
}

function when(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function QuestionsCard({ lessonId, t }) {
  const [rows, setRows] = useState(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [replyFor, setReplyFor] = useState(null);
  const [reply, setReply] = useState("");
  const load = useCallback(() => {
    api.get(`/lms/lessons/${lessonId}/questions`).then(({ data }) => setRows(data || [])).catch(() => setRows([]));
  }, [lessonId]);
  useEffect(() => { load(); }, [load]);

  const ask = async () => {
    if (text.trim().length < 3) return toast.error(t("lms.q_short", "Write your question first."));
    setBusy(true);
    try {
      await api.post(`/lms/lessons/${lessonId}/questions`, { text: text.trim() });
      setText(""); toast.success(t("lms.q_sent", "Question sent — Tony's team will reply here.")); load();
    } catch (e) { toast.error(e?.response?.data?.detail || t("lms.q_failed", "Couldn't send your question.")); }
    finally { setBusy(false); }
  };
  const sendReply = async (qid) => {
    if (reply.trim().length < 3) return;
    try { await api.post(`/lms/questions/${qid}/reply`, { text: reply.trim() }); setReply(""); setReplyFor(null); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || t("lms.reply_failed", "Couldn't send.")); }
  };
  const remove = async (qid) => {
    try { await api.delete(`/lms/questions/${qid}`); load(); } catch { toast.error(t("lms.q_del_failed", "Couldn't remove it.")); }
  };

  return (
    <section data-testid="lesson-questions" className="rounded-3xl bg-white border border-[#E5E6DF] p-5">
      <Heading icon={MessageCircle} title={t("lms.questions", "Questions about this lesson")} />
      <div className="mt-3 flex items-start gap-2">
        <textarea data-testid="lesson-question-text" rows={2} value={text} onChange={(e) => setText(e.target.value)} maxLength={3000}
          placeholder={t("lms.q_ph", "Ask Tony's team about this lesson…")}
          className="flex-1 rounded-2xl border border-[#E5E6DF] px-4 py-2.5 text-[14px] focus:outline-none focus:ring-2 focus:ring-[#B25A45]" />
        <button onClick={ask} disabled={busy} data-testid="lesson-question-send" aria-label={t("lms.send", "Send")} className="pill pill-primary !p-3 shrink-0"><Send className="h-4 w-4" /></button>
      </div>
      {rows === null ? <div className="h-10 mt-3 rounded-2xl bg-[#F2F2EC] animate-pulse" /> : rows.length === 0 ? (
        <p className="text-xs text-[#6B7269] mt-3">{t("lms.no_q", "No questions yet. Be the first to ask.")}</p>
      ) : (
        <ul className="mt-4 space-y-3" data-testid="lesson-question-list">
          {rows.map((q) => (
            <li key={q.id} data-testid={`lesson-question-${q.id}`} className="rounded-2xl bg-[#F7F7F2] border border-[#E5E6DF] p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="text-[11px] text-[#6B7269]"><span className="font-semibold text-[#1C221F]">{q.mine ? t("lms.you", "You") : q.author}</span> · {when(q.created_at)}</div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] uppercase tracking-widest font-bold ${q.status === "answered" ? "text-[#3E7C57]" : "text-[#8A6D3B]"}`}>{q.status === "answered" ? t("lms.answered", "Answered") : t("lms.open", "Waiting")}</span>
                  {q.mine && <button onClick={() => remove(q.id)} data-testid={`lesson-question-delete-${q.id}`} aria-label={t("lms.remove", "Remove")} className="text-[#9AA096] hover:text-[#B25A45]"><Trash2 className="h-3.5 w-3.5" /></button>}
                </div>
              </div>
              <p className="text-[14px] mt-1 whitespace-pre-wrap">{q.text}</p>
              {q.replies?.length > 0 && (
                <ul className="mt-2 space-y-2 border-l-2 border-[#E8B8A8] pl-3">
                  {q.replies.map((r, i) => (
                    <li key={i} className="text-[13px]">
                      <div className="text-[11px] text-[#6B7269]"><span className={`font-semibold ${r.staff ? "text-[#B25A45]" : "text-[#1C221F]"}`}>{r.staff ? `${r.author} · ${t("lms.teacher", "Teacher")}` : r.author}</span> · {when(r.at)}</div>
                      <p className="whitespace-pre-wrap">{r.text}</p>
                    </li>
                  ))}
                </ul>
              )}
              {q.mine && (replyFor === q.id ? (
                <div className="mt-2 flex items-start gap-2">
                  <textarea rows={2} value={reply} onChange={(e) => setReply(e.target.value)} data-testid={`lesson-question-reply-${q.id}`}
                    className="flex-1 rounded-xl border border-[#E5E6DF] px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#B25A45]" />
                  <button onClick={() => sendReply(q.id)} className="pill pill-primary !py-2 !px-3 !text-xs shrink-0">{t("lms.send", "Send")}</button>
                </div>
              ) : (
                <button onClick={() => { setReplyFor(q.id); setReply(""); }} className="mt-2 text-xs font-semibold text-[#B25A45]">{t("lms.follow_up", "Add a follow-up")}</button>
              ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
