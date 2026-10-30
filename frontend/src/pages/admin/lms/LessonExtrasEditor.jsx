import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, ChevronUp, ChevronDown, Save, FileText, HelpCircle, Layers, Check } from "lucide-react";
import { api } from "@/lib/api";
import { Field, inputCls } from "../shared";

const emptyQuestion = () => ({ q: "", options: ["", ""], answer: 0, explain: "" });

/** Learning extras for one lesson: section, resources and a knowledge-check quiz. */
export default function LessonExtrasEditor({ lessonId, lessonTitle, onClose, onSaved }) {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    let live = true;
    api.get(`/admin/lms/lessons/${lessonId}`).then(({ data }) => {
      if (!live) return;
      setForm({
        section: data.section || "",
        resources: (data.resources || []).map((r) => ({ ...r })),
        quizOn: !!(data.quiz && data.quiz.questions?.length),
        pass_percent: data.quiz?.pass_percent ?? 70,
        questions: (data.quiz?.questions || []).map((q) => ({ q: q.q, options: [...q.options], answer: q.answer, explain: q.explain || "" })),
      });
    }).catch(() => { if (live) { toast.error("Couldn't load this lesson."); closeRef.current?.(); } });
    return () => { live = false; };
  }, [lessonId]);

  if (!form) return <div className="h-40 rounded-2xl bg-[#F2F2EC] animate-pulse" />;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setRes = (i, k, v) => set("resources", form.resources.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const setQ = (i, patch) => set("questions", form.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const moveQ = (i, dir) => {
    const arr = [...form.questions];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    set("questions", arr);
  };

  const save = async () => {
    const resources = form.resources.filter((r) => r.title.trim() || r.url.trim());
    for (const r of resources) {
      if (!r.title.trim()) return toast.error("Every resource needs a title.");
      if (!/^https:\/\//.test(r.url.trim()) && !r.url.trim().startsWith("/")) return toast.error(`"${r.title}": the link must start with https://`);
    }
    let quiz = { pass_percent: Number(form.pass_percent) || 70, questions: [] };
    if (form.quizOn) {
      for (const [i, q] of form.questions.entries()) {
        const opts = q.options.map((o) => o.trim());
        if (q.q.trim().length < 3) return toast.error(`Question ${i + 1}: write the question.`);
        if (opts.length < 2 || opts.some((o) => !o)) return toast.error(`Question ${i + 1}: fill in every option (2–6).`);
        if (q.answer >= opts.length) return toast.error(`Question ${i + 1}: choose the right answer.`);
      }
      if (!form.questions.length) return toast.error("Add at least one question, or switch the quiz off.");
      quiz = { pass_percent: Number(form.pass_percent) || 70, questions: form.questions.map((q) => ({ q: q.q.trim(), options: q.options.map((o) => o.trim()), answer: q.answer, explain: (q.explain || "").trim() || null })) };
    }
    setBusy(true);
    try {
      await api.patch(`/admin/lms/lessons/${lessonId}`, { section: form.section.trim(), resources: resources.map((r) => ({ title: r.title.trim(), url: r.url.trim() })), quiz });
      toast.success("Lesson learning settings saved.");
      onSaved?.();
      onClose?.();
    } catch (e) { toast.error(typeof e?.response?.data?.detail === "string" ? e.response.data.detail : "Save failed — check the links and questions."); }
    finally { setBusy(false); }
  };

  return (
    <div className="rounded-2xl bg-white border border-[#E5E6DF] p-5 space-y-5" data-testid="lms-lesson-editor">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="eyebrow">Learning settings</div>
          <div className="text-[14px] font-semibold truncate">{lessonTitle || "Lesson"}</div>
        </div>
        <button onClick={onClose} data-testid="lms-lesson-cancel" className="text-sm text-[#6B7269] hover:text-[#1C221F] shrink-0">Close</button>
      </div>

      <Field label="Section (module)" hint="Lessons with the same section name are grouped together on the course page, in order.">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-[#839682] shrink-0" />
          <input data-testid="lms-lesson-section" className={inputCls} value={form.section} onChange={(e) => set("section", e.target.value)} placeholder="e.g. Week 1 · Foundations" maxLength={80} />
        </div>
      </Field>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-[11px] uppercase tracking-widest font-semibold text-[#839682] flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> Resources (PDFs, links)</div>
          <button type="button" onClick={() => set("resources", [...form.resources, { title: "", url: "" }])} disabled={form.resources.length >= 20}
            data-testid="lms-resource-add" className="pill pill-ghost !py-1 !px-3 !text-xs"><Plus className="h-3.5 w-3.5" /> Add</button>
        </div>
        {form.resources.length === 0 && <p className="text-xs text-[#6B7269]">No resources. Add a posture guide, a breathing sheet or a playlist link.</p>}
        {form.resources.map((r, i) => (
          <div key={i} className="flex flex-col sm:flex-row gap-2" data-testid={`lms-resource-${i}`}>
            <input data-testid={`lms-resource-title-${i}`} className={inputCls} value={r.title} onChange={(e) => setRes(i, "title", e.target.value)} placeholder="Title" maxLength={120} />
            <input data-testid={`lms-resource-url-${i}`} className={inputCls} value={r.url} onChange={(e) => setRes(i, "url", e.target.value)} placeholder="https://…" />
            <button type="button" onClick={() => set("resources", form.resources.filter((_, j) => j !== i))} aria-label="Remove resource" className="text-[#B25A45] self-center"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>

      <div className="rounded-2xl bg-[#F7F7F2] border border-[#E5E6DF] p-4 space-y-4">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" data-testid="lms-quiz-on" checked={form.quizOn} onChange={(e) => { set("quizOn", e.target.checked); if (e.target.checked && !form.questions.length) set("questions", [emptyQuestion()]); }} className="h-4 w-4 accent-[#B25A45]" />
          <HelpCircle className="h-4 w-4 text-[#B25A45]" /> <span className="font-semibold">Knowledge-check quiz</span>
          <span className="text-xs text-[#6B7269]">— passing it completes the lesson</span>
        </label>
        {form.quizOn && (
          <>
            <Field label="Pass mark (%)">
              <input data-testid="lms-quiz-pass" type="number" min={0} max={100} className={inputCls + " !w-32"} value={form.pass_percent} onChange={(e) => set("pass_percent", e.target.value)} />
            </Field>
            {form.questions.map((q, i) => (
              <div key={i} data-testid={`lms-quiz-q-${i}`} className="rounded-2xl bg-white border border-[#E5E6DF] p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-[#839682]">Question {i + 1}</div>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => moveQ(i, -1)} disabled={i === 0} aria-label="Move up" className="text-[#9AA29B] hover:text-[#1C221F] disabled:opacity-30"><ChevronUp className="h-4 w-4" /></button>
                    <button type="button" onClick={() => moveQ(i, 1)} disabled={i === form.questions.length - 1} aria-label="Move down" className="text-[#9AA29B] hover:text-[#1C221F] disabled:opacity-30"><ChevronDown className="h-4 w-4" /></button>
                    <button type="button" onClick={() => set("questions", form.questions.filter((_, j) => j !== i))} aria-label="Remove question" data-testid={`lms-quiz-q-remove-${i}`} className="text-[#B25A45] ml-1"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
                <input data-testid={`lms-quiz-q-text-${i}`} className={inputCls} value={q.q} onChange={(e) => setQ(i, { q: e.target.value })} placeholder="e.g. How many postures are in Core 26?" maxLength={500} />
                <div className="space-y-1.5">
                  {q.options.map((o, j) => (
                    <div key={j} className="flex items-center gap-2">
                      <button type="button" onClick={() => setQ(i, { answer: j })} data-testid={`lms-quiz-q-${i}-right-${j}`} aria-label={`Option ${j + 1} is right`}
                        className={`h-7 w-7 rounded-full border flex items-center justify-center shrink-0 ${q.answer === j ? "bg-[#3E7C57] border-[#3E7C57] text-white" : "border-[#D8D9D1] text-transparent hover:border-[#3E7C57]"}`}>
                        <Check className="h-4 w-4" />
                      </button>
                      <input data-testid={`lms-quiz-q-${i}-opt-${j}`} className={inputCls + " !py-2"} value={o} placeholder={`Option ${j + 1}`} maxLength={200}
                        onChange={(e) => setQ(i, { options: q.options.map((x, k) => (k === j ? e.target.value : x)) })} />
                      {q.options.length > 2 && (
                        <button type="button" aria-label="Remove option" className="text-[#9AA096] hover:text-[#B25A45]"
                          onClick={() => setQ(i, { options: q.options.filter((_, k) => k !== j), answer: q.answer === j ? 0 : q.answer > j ? q.answer - 1 : q.answer })}><Trash2 className="h-3.5 w-3.5" /></button>
                      )}
                    </div>
                  ))}
                  {q.options.length < 6 && (
                    <button type="button" onClick={() => setQ(i, { options: [...q.options, ""] })} data-testid={`lms-quiz-q-${i}-add-opt`} className="text-xs font-semibold text-[#B25A45]">+ Add option</button>
                  )}
                </div>
                <input data-testid={`lms-quiz-q-explain-${i}`} className={inputCls + " !py-2"} value={q.explain} onChange={(e) => setQ(i, { explain: e.target.value })} placeholder="Explanation shown after answering (optional)" maxLength={500} />
                <p className="text-[11px] text-[#6B7269]">Tap the circle next to the right answer.</p>
              </div>
            ))}
            {form.questions.length < 30 && (
              <button type="button" onClick={() => set("questions", [...form.questions, emptyQuestion()])} data-testid="lms-quiz-add-q" className="pill pill-ghost !py-2 !px-4 !text-xs"><Plus className="h-3.5 w-3.5" /> Add question</button>
            )}
          </>
        )}
      </div>

      <button onClick={save} disabled={busy} data-testid="lms-lesson-save" className="pill pill-primary w-full"><Save className="h-4 w-4" /> {busy ? "Saving…" : "Save learning settings"}</button>
    </div>
  );
}

/** Course-level outline: set every lesson's section in one go. */
export function SectionsEditor({ programId, lessons: initialLessons, onClose, onSaved }) {
  const [lessons, setLessons] = useState(initialLessons || []);
  const [map, setMap] = useState(() => Object.fromEntries((initialLessons || []).map((l) => [l.id, l.section || ""])));
  const [busy, setBusy] = useState(false);
  const touched = useRef(false);
  // Load the latest outline (a lesson may have just been saved with a new section).
  useEffect(() => {
    let live = true;
    api.get(`/admin/programs/${programId}/lessons`).then(({ data }) => {
      if (!live || !Array.isArray(data)) return;
      setLessons(data);
      if (!touched.current) setMap(Object.fromEntries(data.map((l) => [l.id, l.section || ""])));
    }).catch(() => {});
    return () => { live = false; };
  }, [programId]);
  const names = Array.from(new Set(Object.values(map).map((v) => v.trim()).filter(Boolean)));

  const save = async () => {
    setBusy(true);
    try {
      await api.put(`/admin/lms/programs/${programId}/sections`, { lessons: map });
      toast.success("Sections saved.");
      onSaved?.();
      onClose?.();
    } catch (e) { toast.error(e?.response?.data?.detail || "Couldn't save sections."); }
    finally { setBusy(false); }
  };
  // Give every lesson from here down the same section (quick way to build modules).
  const fillDown = (idx) => {
    touched.current = true;
    const value = map[lessons[idx].id] || "";
    setMap((m) => {
      const next = { ...m };
      for (let k = idx + 1; k < lessons.length; k += 1) { if ((next[lessons[k].id] || "").trim()) break; next[lessons[k].id] = value; }
      return next;
    });
  };

  return (
    <div className="rounded-2xl bg-white border border-[#E5E6DF] p-5 space-y-4" data-testid="lms-sections-editor">
      <div className="flex items-center justify-between">
        <div className="eyebrow">Course outline · sections</div>
        <button onClick={onClose} className="text-sm text-[#6B7269] hover:text-[#1C221F]">Close</button>
      </div>
      <p className="text-xs text-[#6B7269]">Name the section for each lesson (e.g. "Week 1 · Foundations"). Lessons keep their order; use "fill down" to give the following lessons the same section.</p>
      <datalist id={`sections-${programId}`}>{names.map((n) => <option key={n} value={n} />)}</datalist>
      <ol className="space-y-2">
        {(lessons || []).map((l, idx) => (
          <li key={l.id} className="flex items-center gap-2" data-testid={`lms-section-row-${idx}`}>
            <span className="h-6 w-6 rounded-full bg-[#F2F2EC] text-[11px] font-semibold flex items-center justify-center shrink-0">{idx + 1}</span>
            <span className="text-[13px] font-semibold truncate w-28 sm:w-56 shrink-0" title={l.video?.title}>{l.video?.title || "Lesson"}</span>
            <input list={`sections-${programId}`} data-testid={`lms-section-input-${idx}`} className={inputCls + " !py-2"} value={map[l.id] || ""} maxLength={80}
              onChange={(e) => { touched.current = true; setMap((m) => ({ ...m, [l.id]: e.target.value })); }} placeholder="Section" />
            <button type="button" onClick={() => fillDown(idx)} className="text-[11px] font-semibold text-[#B25A45] shrink-0 whitespace-nowrap">fill down</button>
          </li>
        ))}
      </ol>
      <button onClick={save} disabled={busy} data-testid="lms-sections-save" className="pill pill-primary w-full"><Save className="h-4 w-4" /> {busy ? "Saving…" : "Save sections"}</button>
    </div>
  );
}
