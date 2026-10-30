import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Users, Calendar, TrendingUp, Send, Check, X, CreditCard, Mail, Bell, Save, RefreshCw, History, BookOpen, Plus, ArrowLeft, Trash2, ChevronUp, ChevronDown, ChevronRight, Youtube, Play, Clock, Eye, EyeOff, ListPlus, Instagram, Wallet, ClipboardCheck, Package, GraduationCap, Award, MessageCircle, Video, Mic, LayoutDashboard, MountainSnow, Gift, Settings as SettingsIcon, Upload } from "lucide-react";
import { api, API_BASE } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import Spinner from "@/components/Spinner";
import { parseYouTubeId, isYouTube, secToMMSS, mmssToSec, youTubeThumb } from "@/lib/youtube";
import { Field, inputCls } from "./shared";
import { AccessTermFields, defaultTerm, termError } from "@/components/AccessTerm";
import { ContentImageInput } from "@/components/ContentImageInput";
import LessonExtrasEditor, { SectionsEditor } from "./lms/LessonExtrasEditor";

function LessonsEditor({ programId }) {
  const [lessons, setLessons] = useState(null);
  const [form, setForm] = useState(null); // single lesson { id?, title, youtube_url, start, end, is_free_preview, is_private }
  const [bulk, setBulk] = useState(null); // bulk mode { youtube_url, text, free_preview_first, is_private }
  const [busy, setBusy] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);
  const [lmsFor, setLmsFor] = useState(null); // lesson whose learning settings (section, resources, quiz) are open
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const lc = "w-full rounded-2xl border border-[#E5E6DF] px-4 py-2.5 text-[14px] focus:outline-none focus:ring-2 focus:ring-[#B25A45]";

  const uploadCover = async (file) => {
    if (!file) return;
    setCoverBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/admin/uploads", fd, { headers: { "Content-Type": "multipart/form-data" } });
      set("cover_image", `${API_BASE}/files/${data.path}`);
      toast.success("Cover photo uploaded");
    } catch (e) { toast.error(e?.response?.data?.detail || "Upload failed"); }
    finally { setCoverBusy(false); }
  };

  const load = async () => {
    try { const { data } = await api.get(`/admin/programs/${programId}/lessons`); setLessons(data); }
    catch { setLessons([]); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [programId]);

  const openNew = () => { setBulk(null); setForm({ title: "", description: "", cover_image: "", youtube_url: "", start: "0:00", end: "", is_free_preview: false, is_private: false, requires_submission: false, assignment_prompt: "", pass_threshold: 60, max_attempts: 0 }); };
  const openBulk = () => { setForm(null); setBulk({ youtube_url: "", text: "0:00 Intro & warm-up\n10:00 Standing series\n22:30 Floor series\n40:00 Final relaxation", free_preview_first: true, is_private: false }); };
  const openEdit = (l) => {
    setBulk(null);
    setForm({
      id: l.id,
      title: l.video?.title || "",
      description: l.video?.description || "",
      cover_image: l.video?.cover_image || "",
      youtube_url: l.video?.source_url || l.video?.video_url || "",
      start: secToMMSS(l.video?.start_seconds || 0),
      end: l.video?.end_seconds ? secToMMSS(l.video.end_seconds) : "",
      is_free_preview: !!l.is_free_preview,
      is_private: !!l.video?.is_private,
      requires_submission: !!l.requires_submission,
      assignment_prompt: l.assignment_prompt || "",
      pass_threshold: l.pass_threshold ?? 60,
      max_attempts: l.max_attempts ?? 0,
    });
  };
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setB = (k, v) => setBulk((b) => ({ ...b, [k]: v }));

  const save = async () => {
    if (!form.title.trim()) return toast.error("Lesson title is required.");
    if (!parseYouTubeId(form.youtube_url)) return toast.error("Enter a valid YouTube link.");
    const start = mmssToSec(form.start) || 0;
    const end = form.end ? mmssToSec(form.end) : null;
    if (end != null && end <= start) return toast.error("End time must be after start time.");
    setBusy(true);
    const body = { title: form.title.trim(), description: form.description || "", cover_image: form.cover_image || null, youtube_url: form.youtube_url.trim(), start_seconds: start, end_seconds: end, is_free_preview: form.is_free_preview, is_private: form.is_private, requires_submission: !!form.requires_submission, assignment_prompt: form.requires_submission ? (form.assignment_prompt || "") : "", pass_threshold: Number(form.pass_threshold) || 60, max_attempts: Math.max(0, Number(form.max_attempts) || 0) };
    try {
      if (form.id) { await api.patch(`/admin/lessons/${form.id}`, body); toast.success("Lesson updated."); }
      else { await api.post(`/admin/programs/${programId}/lessons`, body); toast.success("Lesson added."); }
      setForm(null); await load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
    finally { setBusy(false); }
  };

  const parseChapters = (text) => (text || "").split("\n").map((line) => {
    const raw = line.trim();
    if (!raw) return null;
    // Detect a timestamp token (mm:ss or h:mm:ss), possibly wrapped in ()/[]
    const tm = raw.match(/(?:^|[\s(\[])(\d{1,2}:\d{2}(?::\d{2})?)(?:[\s)\]]|$)/);
    if (!tm) return null;
    const ts = tm[1];
    const title = raw
      .replace(/[([]?\d{1,2}:\d{2}(?::\d{2})?[)\]]?/, "")
      .replace(/^[\s\-–—.·|:]+/, "")
      .replace(/[\s\-–—.·|:]+$/, "")
      .trim();
    if (!title) return null;
    return { start_seconds: mmssToSec(ts) || 0, title };
  }).filter(Boolean);

  const saveBulk = async () => {
    if (!parseYouTubeId(bulk.youtube_url)) return toast.error("Enter a valid YouTube link.");
    const chapters = parseChapters(bulk.text);
    if (!chapters.length) return toast.error("Add at least one line like '0:00 Lesson title'.");
    setBusy(true);
    try {
      const { data } = await api.post(`/admin/programs/${programId}/lessons/bulk`, {
        youtube_url: bulk.youtube_url.trim(), chapters, free_preview_first: bulk.free_preview_first, is_private: bulk.is_private,
      });
      toast.success(`${data.created} lessons created from chapters.`);
      setBulk(null); await load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Bulk create failed"); }
    finally { setBusy(false); }
  };

  const del = async (l) => {
    if (!window.confirm(`Delete lesson "${l.video?.title || "Lesson"}"?`)) return;
    try { await api.delete(`/admin/lessons/${l.id}`); toast.success("Lesson deleted."); await load(); }
    catch { toast.error("Delete failed"); }
  };

  const move = async (idx, dir) => {
    if (!lessons) return;
    const arr = [...lessons];
    const j = idx + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    setLessons(arr);
    try { await api.post(`/admin/programs/${programId}/lessons/reorder`, { lesson_ids: arr.map((l) => l.id) }); }
    catch { toast.error("Reorder failed"); load(); }
  };

  // ---- Learning (LMS) settings for one lesson / the course outline ----
  if (lmsFor) {
    return <LessonExtrasEditor lessonId={lmsFor.id} lessonTitle={lmsFor.video?.title} onClose={() => setLmsFor(null)} onSaved={load} />;
  }
  if (sectionsOpen && lessons?.length) {
    return <SectionsEditor programId={programId} lessons={lessons} onClose={() => setSectionsOpen(false)} onSaved={load} />;
  }

  // ---- Bulk auto-chapters form ----
  if (bulk) {
    const preview = parseChapters(bulk.text);
    return (
      <div className="rounded-2xl bg-white border border-[#E5E6DF] p-5 space-y-4" data-testid="bulk-form">
        <div className="flex items-center justify-between">
          <div className="eyebrow">Auto chapters — one video, many lessons</div>
          <button onClick={() => setBulk(null)} data-testid="bulk-cancel" className="text-sm text-[#6B7269] hover:text-[#1C221F]">Cancel</button>
        </div>
        <Field label="YouTube link (the full recording)">
          <input data-testid="bulk-youtube" className={lc} value={bulk.youtube_url} onChange={(e) => setB("youtube_url", e.target.value)} placeholder="https://www.youtube.com/watch?v=…" />
        </Field>
        <Field label="Chapters — paste a YouTube description or one 'time title' per line" hint="Timestamps are auto-detected; lines without a time are ignored. Each lesson runs until the next timestamp.">
          <textarea data-testid="bulk-text" rows={7} className={lc + " font-mono !text-[13px]"} value={bulk.text} onChange={(e) => setB("text", e.target.value)} />
        </Field>
        <div className="text-xs text-[#6B7269]" data-testid="bulk-preview">Will create <b>{preview.length}</b> lessons: {preview.slice(0, 4).map((c) => `${secToMMSS(c.start_seconds)} ${c.title}`).join(" · ")}{preview.length > 4 ? " …" : ""}</div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" data-testid="bulk-freepreview" checked={bulk.free_preview_first} onChange={(e) => setB("free_preview_first", e.target.checked)} className="h-4 w-4 accent-[#B25A45]" />
          <Eye className="h-4 w-4 text-[#839682]" /> Make the first lesson a free preview
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" data-testid="bulk-private" checked={bulk.is_private} onChange={(e) => setB("is_private", e.target.checked)} className="h-4 w-4 accent-[#B25A45]" />
          <EyeOff className="h-4 w-4 text-[#6B7269]" /> Unlisted link (paid content — not searchable on YouTube)
        </label>
        <button onClick={saveBulk} disabled={busy} data-testid="bulk-save" className="pill pill-primary w-full"><ListPlus className="h-4 w-4" /> {busy ? "Creating…" : `Create ${preview.length} lessons`}</button>
      </div>
    );
  }

  // ---- Single lesson form ----
  if (form) {
    const thumb = youTubeThumb(form.youtube_url);
    return (
      <div className="rounded-2xl bg-white border border-[#E5E6DF] p-5 space-y-4" data-testid="lesson-form">
        <div className="flex items-center justify-between">
          <div className="eyebrow">{form.id ? "Edit lesson" : "New lesson"}</div>
          <button onClick={() => setForm(null)} data-testid="lesson-cancel" className="text-sm text-[#6B7269] hover:text-[#1C221F]">Cancel</button>
        </div>
        <Field label="Lesson title"><input data-testid="lesson-title" className={lc} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Standing Deep Breathing" /></Field>
        <Field label="YouTube link">
          <input data-testid="lesson-youtube" className={lc} value={form.youtube_url} onChange={(e) => set("youtube_url", e.target.value)} placeholder="https://www.youtube.com/watch?v=…" />
          {form.youtube_url && !parseYouTubeId(form.youtube_url) && <div className="text-xs text-[#B25A45] mt-1">Not a recognized YouTube link.</div>}
        </Field>
        {thumb && (
          <div className="flex items-center gap-3">
            <img src={thumb} alt="" className="h-14 w-24 rounded-lg object-cover border border-[#E5E6DF]" />
            <div className="text-xs text-[#6B7269]">Lesson thumbnail (auto)</div>
          </div>
        )}

        <Field label="Cover photo" hint="Shown on the pose card and as the video poster. Overrides the auto YouTube thumbnail.">
          <div className="flex items-center gap-3">
            <div className="relative h-16 w-28 shrink-0 rounded-xl overflow-hidden bg-[#F2F2EC] border border-[#E5E6DF]">
              {form.cover_image
                ? <img src={form.cover_image} alt="" className="h-full w-full object-cover" data-testid="lesson-cover-preview" />
                : <div className="h-full w-full flex items-center justify-center text-[10px] text-[#9AA29B]">No cover</div>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label data-testid="lesson-cover-upload" className={`text-xs font-semibold cursor-pointer rounded-full px-3 py-1.5 w-max ${coverBusy ? "bg-[#F2F2EC] text-[#9AA096]" : "bg-[#B25A45] text-white hover:opacity-90"}`}>
                {coverBusy ? "Uploading…" : (form.cover_image ? "Replace photo" : "Upload photo")}
                <input type="file" accept="image/*" hidden disabled={coverBusy} onChange={(e) => { uploadCover(e.target.files?.[0]); e.target.value = ""; }} />
              </label>
              {form.cover_image && <button type="button" onClick={() => set("cover_image", "")} data-testid="lesson-cover-remove" className="text-xs text-[#6B7269] hover:text-[#B25A45] w-max">Remove</button>}
            </div>
          </div>
        </Field>

        <Field label="Description" hint="Explain the pose / lesson — alignment, breath, benefits, cautions. Shown to students below the video.">
          <textarea data-testid="lesson-description" rows={5} className={lc} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="e.g. Pranamasana (Prayer Pose) — stand tall, palms together at the heart. Grounds the practice and centres the breath…" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Start (m:ss)"><input data-testid="lesson-start" className={lc} value={form.start} onChange={(e) => set("start", e.target.value)} placeholder="0:00" /></Field>
          <Field label="End (m:ss) — optional"><input data-testid="lesson-end" className={lc} value={form.end} onChange={(e) => set("end", e.target.value)} placeholder="10:00" /></Field>
        </div>
        <p className="text-xs text-[#6B7269] -mt-1">Slice one long video into lessons: e.g. start <b>0:00</b> end <b>10:00</b> for lesson 1, then <b>10:00</b>–<b>22:30</b> for lesson 2.</p>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" data-testid="lesson-freepreview" checked={form.is_free_preview} onChange={(e) => set("is_free_preview", e.target.checked)} className="h-4 w-4 accent-[#B25A45]" />
          <Eye className="h-4 w-4 text-[#839682]" /> Free preview (anyone can watch)
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" data-testid="lesson-private" checked={form.is_private} onChange={(e) => set("is_private", e.target.checked)} className="h-4 w-4 accent-[#B25A45]" />
          <EyeOff className="h-4 w-4 text-[#6B7269]" /> Unlisted link (paid content — not searchable on YouTube)
        </label>

        {/* Assignment / graded submission gate */}
        <div className="rounded-2xl bg-[#F7F7F2] border border-[#E5E6DF] p-3 space-y-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" data-testid="lesson-requires-submission" checked={form.requires_submission} onChange={(e) => set("requires_submission", e.target.checked)} className="h-4 w-4 accent-[#B25A45]" />
            <ClipboardCheck className="h-4 w-4 text-[#B25A45]" /> Require a graded submission to unlock the next lesson
          </label>
          {form.requires_submission && (
            <>
              <Field label="Assignment prompt" hint="Tell the student what to record/practise. This guides the AI grader too.">
                <textarea data-testid="lesson-assignment-prompt" rows={3} className={lc} value={form.assignment_prompt} onChange={(e) => set("assignment_prompt", e.target.value)} placeholder="e.g. Record yourself holding Standing Bow for 30s. Focus on a locked standing knee and level hips." />
              </Field>
              <Field label="Pass mark (%)" hint="Minimum AI/instructor score to unlock the next lesson.">
                <input data-testid="lesson-pass-threshold" type="number" min="0" max="100" className={lc} value={form.pass_threshold} onChange={(e) => set("pass_threshold", e.target.value)} />
              </Field>
              <Field label="Max attempts" hint="How many tries a student gets before lockout. 0 = unlimited.">
                <input data-testid="lesson-max-attempts" type="number" min="0" max="20" className={lc} value={form.max_attempts} onChange={(e) => set("max_attempts", e.target.value)} />
              </Field>
            </>
          )}
        </div>

        <button onClick={save} disabled={busy} data-testid="lesson-save" className="pill pill-primary w-full"><Save className="h-4 w-4" /> {busy ? "Saving…" : (form.id ? "Save lesson" : "Add lesson")}</button>
      </div>
    );
  }

  // ---- Lessons list ----
  return (
    <div className="space-y-3" data-testid="lessons-editor">
      <div className="flex items-center justify-between">
        <div className="eyebrow">Lessons {lessons ? `(${lessons.length})` : ""}</div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {lessons?.length > 0 && <button onClick={() => setSectionsOpen(true)} data-testid="lesson-sections" className="pill pill-ghost !py-1.5 !px-3 !text-xs"><BookOpen className="h-3.5 w-3.5" /> Sections</button>}
          <button onClick={openBulk} data-testid="lesson-bulk" className="pill pill-ghost !py-1.5 !px-3 !text-xs"><ListPlus className="h-3.5 w-3.5" /> Auto chapters</button>
          <button onClick={openNew} data-testid="lesson-new" className="pill pill-primary !py-1.5 !px-3 !text-xs"><Plus className="h-3.5 w-3.5" /> Add lesson</button>
        </div>
      </div>
      {lessons === null ? <Spinner /> : lessons.length === 0 ? (
        <p className="text-sm text-[#6B7269] py-4 text-center">No lessons yet — add one, or paste a video's chapters with “Auto chapters”.</p>
      ) : (
        <ul className="space-y-2" data-testid="lessons-list">
          {lessons.map((l, idx) => {
            const yt = isYouTube(l.video?.source_url || l.video?.video_url);
            const seg = (l.video?.start_seconds || l.video?.end_seconds)
              ? `${secToMMSS(l.video?.start_seconds || 0)}${l.video?.end_seconds ? `–${secToMMSS(l.video.end_seconds)}` : "+"}`
              : null;
            return (
              <li key={l.id} data-testid={`lesson-row-${l.id}`} className="rounded-2xl bg-white border border-[#E5E6DF] p-3 flex items-center gap-3">
                <div className="flex flex-col">
                  <button onClick={() => move(idx, -1)} disabled={idx === 0} data-testid={`lesson-up-${l.id}`} className="text-[#9AA29B] hover:text-[#1C221F] disabled:opacity-30"><ChevronUp className="h-4 w-4" /></button>
                  <button onClick={() => move(idx, 1)} disabled={idx === lessons.length - 1} data-testid={`lesson-down-${l.id}`} className="text-[#9AA29B] hover:text-[#1C221F] disabled:opacity-30"><ChevronDown className="h-4 w-4" /></button>
                </div>
                <div className="relative h-11 w-20 shrink-0 rounded-lg overflow-hidden bg-[#F2F2EC]">
                  {l.video?.cover_image
                    ? <img src={l.video.cover_image} alt="" className="h-full w-full object-cover" />
                    : <div className="h-full w-full flex items-center justify-center text-xs text-[#9AA29B]">{idx + 1}</div>}
                  <div className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-black/60 text-white text-[9px] font-semibold flex items-center justify-center">{idx + 1}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold leading-tight truncate">{l.video?.title || "Lesson"}</div>
                  <div className="text-[11px] text-[#6B7269] mt-0.5 flex items-center gap-2 flex-wrap">
                    {yt ? <span className="inline-flex items-center gap-1 text-[#B25A45]"><Youtube className="h-3 w-3" /> YouTube</span> : <span>Video</span>}
                    {seg && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {seg}</span>}
                    {l.is_free_preview && <span className="uppercase tracking-widest text-[9px] font-bold text-[#839682]">Free</span>}
                    {l.video?.is_private && <span className="inline-flex items-center gap-1 uppercase tracking-widest text-[9px] font-bold text-[#6B7269]"><EyeOff className="h-3 w-3" /> Unlisted</span>}
                    {l.section && <span data-testid={`lesson-section-badge-${l.id}`} className="rounded-full bg-[#F2F2EC] px-2 py-0.5 text-[10px] font-semibold text-[#545E56] truncate max-w-[140px]">{l.section}</span>}
                    {l.quiz?.questions?.length > 0 && <span className="text-[10px] font-bold uppercase tracking-widest text-[#8A6D3B]">Quiz · {l.quiz.questions.length}</span>}
                    {l.resources?.length > 0 && <span className="text-[10px] font-semibold text-[#6B7269]">{l.resources.length} file(s)</span>}
                  </div>
                </div>
                <button onClick={() => setLmsFor(l)} data-testid={`lesson-lms-${l.id}`} className="pill pill-ghost !py-1.5 !px-3 !text-xs shrink-0">Learning</button>
                <button onClick={() => openEdit(l)} data-testid={`lesson-edit-${l.id}`} className="pill pill-ghost !py-1.5 !px-3 !text-xs shrink-0">Edit</button>
                <button onClick={() => del(l)} data-testid={`lesson-delete-${l.id}`} className="text-[#B25A45] hover:text-[#8f4436] shrink-0"><Trash2 className="h-4 w-4" /></button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function CoursesPane() {
  const { user } = useAuth();
  const [list, setList] = useState(null);
  const [products, setProducts] = useState([]);
  const [editing, setEditing] = useState(null); // program object being edited, or {__new:true}
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try { const { data } = await api.get("/admin/programs"); setList(data); } catch { setList([]); }
  };
  useEffect(() => {
    load();
    api.get("/products").then(({ data }) => setProducts(data)).catch(() => setProducts([]));
  }, []);

  const openEdit = (p) => {
    setEditing(p);
    setForm({
      title: p.title || "", description: p.description || "", level: p.level || "all",
      style: p.style || "Hatha", duration_weeks: p.duration_weeks ?? 4,
      price: p.price ?? 0, currency: p.currency || "eur", price_model: p.price_model === "one_time" ? "subscription" : (p.price_model || "subscription"),
      access_term: p.access_term || defaultTerm,
      cover_image: p.cover_image || "", benefits: (p.benefits || []).join("\n"),
      demo_video_url: p.demo_video_url || "",
      main_video_url: p.main_video_url || "",
      focus_areas: p.focus_areas || [],
      intensity: p.intensity || "moderate",
      language: p.language || "both",
      related_product_ids: p.related_product_ids || [],
      drip_enabled: !!p.drip_enabled, drip_interval_days: p.drip_interval_days ?? 7,
    });
  };
  const openNew = () => {
    setEditing({ __new: true });
    setForm({ title: "", description: "", level: "beginner", style: "Hatha", duration_weeks: 4, price: 0, currency: "eur", price_model: "subscription", access_term: defaultTerm, cover_image: "", benefits: "", demo_video_url: "", main_video_url: "", focus_areas: [], intensity: "moderate", language: "both", related_product_ids: [], drip_enabled: false, drip_interval_days: 7 });
  };

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleProduct = (pid) => setForm((f) => {
    const cur = f.related_product_ids || [];
    return { ...f, related_product_ids: cur.includes(pid) ? cur.filter((x) => x !== pid) : [...cur, pid] };
  });

  const save = async () => {
    if (!form.title.trim() || !form.description.trim()) return toast.error("Title and description are required.");
    if (form.price_model === "subscription" && termError(form.access_term)) return toast.error(termError(form.access_term));
    setSaving(true);
    const body = {
      title: form.title, description: form.description, level: form.level, style: form.style,
      duration_weeks: Number(form.duration_weeks) || 1, price: Number(form.price) || 0,
      currency: form.currency, price_model: form.price_model, cover_image: form.cover_image || null,
      access_term: form.access_term,
      benefits: form.benefits.split("\n").map((b) => b.trim()).filter(Boolean),
      demo_video_url: form.demo_video_url || "",
      main_video_url: form.main_video_url || "",
      focus_areas: form.focus_areas || [],
      intensity: form.intensity || null,
      language: form.language || null,
      related_product_ids: form.related_product_ids || [],
      drip_enabled: !!form.drip_enabled, drip_interval_days: Number(form.drip_interval_days) || 7,
    };
    try {
      if (editing.__new) {
        await api.post("/admin/programs", { ...body, instructor_id: user.id });
        toast.success("Course created.");
      } else {
        await api.patch(`/admin/programs/${editing.id}`, body);
        toast.success("Course updated.");
      }
      setEditing(null);
      await load();
    } catch (e) { toast.error(typeof e?.response?.data?.detail === "string" ? e.response.data.detail : "Check the course details and subscription dates."); }
    finally { setSaving(false); }
  };

  const inputCls2 = "w-full rounded-2xl border border-[#E5E6DF] px-4 py-2.5 text-[14px] focus:outline-none focus:ring-2 focus:ring-[#B25A45]";

  if (list === null) return <Spinner />;

  if (editing) {
    return (
      <div className="space-y-4" data-testid="admin-course-editor">
        <button onClick={() => setEditing(null)} data-testid="course-back" className="flex items-center gap-1 text-sm text-[#6B7269] hover:text-[#1C221F]"><ArrowLeft className="h-4 w-4" /> All courses</button>
        <div className="rounded-2xl bg-white border border-[#E5E6DF] p-5 space-y-4">
          <Field label="Title"><input data-testid="course-title" className={inputCls2} value={form.title} onChange={(e) => set("title", e.target.value)} /></Field>
          <Field label="Description"><textarea data-testid="course-description" rows={4} className={inputCls2} value={form.description} onChange={(e) => set("description", e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Level">
              <select data-testid="course-level" className={inputCls2} value={form.level} onChange={(e) => set("level", e.target.value)}>
                {["beginner", "intermediate", "advanced", "all"].map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </Field>
            <Field label="Style"><input data-testid="course-style" className={inputCls2} value={form.style} onChange={(e) => set("style", e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Weeks"><input data-testid="course-weeks" type="number" className={inputCls2} value={form.duration_weeks} onChange={(e) => set("duration_weeks", e.target.value)} /></Field>
            <Field label="Price"><input data-testid="course-price" type="number" className={inputCls2} value={form.price} onChange={(e) => set("price", e.target.value)} /></Field>
            <Field label="Currency"><input data-testid="course-currency" className={inputCls2} value={form.currency} onChange={(e) => set("currency", e.target.value)} /></Field>
          </div>
          <Field label="Pricing model">
            <div className="flex flex-wrap gap-2">
              {["subscription", "membership", "free"].map((m) => (
                <button key={m} type="button" onClick={() => set("price_model", m)} data-testid={`course-pricemodel-${m}`}
                  className={`pill !py-2 !px-4 !text-[13px] ${form.price_model === m ? "pill-primary" : "pill-ghost"}`}>{m.replace("_", " ")}</button>
              ))}
            </div>
          </Field>
          {form.price_model === "subscription" && <AccessTermFields value={form.access_term} onChange={(term) => set("access_term", term)} prefix="course" />}
          <ContentImageInput absolute label="Course cover photo (upload or paste a link)" tid="course-cover" value={form.cover_image} onChange={(v) => set("cover_image", v)} hint="Shown on the course card, the course page and in the app." />
          <Field label="Demo / intro video (YouTube)" hint="Plays at the top of the course page for everyone — enrolled or not. Leave blank to auto-use the first lesson clip.">
            <input data-testid="course-demo-video" className={inputCls2} value={form.demo_video_url} onChange={(e) => set("demo_video_url", e.target.value)} placeholder="https://www.youtube.com/watch?v=…" />
            {form.demo_video_url && !parseYouTubeId(form.demo_video_url) && <div className="text-xs text-[#B25A45] mt-1">Not a recognized YouTube link.</div>}
          </Field>

          <Field label="Full course video (YouTube)" hint="The complete guided course. Shows right below the demo — LOCKED for logged-in visitors without access and HIDDEN entirely for logged-out visitors. Only subscribed / enrolled students (and staff) can play it. On YouTube set the video to Unlisted (not Private) and allow embedding; it plays inside the site and never links out to YouTube.">
            <input data-testid="course-main-video" className={inputCls2} value={form.main_video_url} onChange={(e) => set("main_video_url", e.target.value)} placeholder="https://www.youtube.com/watch?v=…" />
            {form.main_video_url && !parseYouTubeId(form.main_video_url) && <div className="text-xs text-[#B25A45] mt-1">Not a recognized YouTube link.</div>}
          </Field>

          <Field label="Focus areas" hint="Used by the Discover filters. Tap to toggle.">
            <div className="flex flex-wrap gap-2" data-testid="course-focus-areas">
              {["Back care","Flexibility","Balance","Strength","Stress relief","Sleep","Energy","Beginner basics"].map((fa) => {
                const on = (form.focus_areas || []).includes(fa);
                return (
                  <button key={fa} type="button" data-testid={`course-focus-${fa}`}
                    onClick={() => set("focus_areas", on ? form.focus_areas.filter((x) => x !== fa) : [...(form.focus_areas || []), fa])}
                    className={`pill !py-1.5 !px-3 !text-[12px] ${on ? "pill-primary" : "pill-ghost"}`}>{fa}</button>
                );
              })}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Intensity">
              <select data-testid="course-intensity" className={inputCls2} value={form.intensity} onChange={(e) => set("intensity", e.target.value)}>
                {["gentle","moderate","strong"].map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </Field>
            <Field label="Language">
              <select data-testid="course-language" className={inputCls2} value={form.language} onChange={(e) => set("language", e.target.value)}>
                <option value="both">EN & ES</option>
                <option value="en">English</option>
                <option value="es">Español</option>
              </select>
            </Field>
          </div>
          <Field label="Benefits (one per line)"><textarea data-testid="course-benefits" rows={4} className={inputCls2} value={form.benefits} onChange={(e) => set("benefits", e.target.value)} /></Field>

          <Field label="Related products" hint="Books, mats & gear to sell alongside this course — shown on the course page and under each lesson video.">
            {products.length === 0 ? (
              <p className="text-xs text-[#6B7269]">No products yet — add some in the Shop first.</p>
            ) : (
              <div className="flex flex-wrap gap-2" data-testid="course-products">
                {products.map((pr) => {
                  const on = (form.related_product_ids || []).includes(pr.id);
                  return (
                    <button key={pr.id} type="button" onClick={() => toggleProduct(pr.id)} data-testid={`course-product-${pr.id}`}
                      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition ${on ? "border-[#B25A45] bg-[#F7ECE8] text-[#B25A45] font-semibold" : "border-[#E5E6DF] text-[#545E56] hover:border-[#B25A45]"}`}>
                      {pr.images?.[0] && <img src={pr.images[0]} alt="" className="h-5 w-5 rounded object-cover" />}
                      <span className="truncate max-w-[140px]">{pr.title}</span>
                      {on && <Check className="h-3.5 w-3.5" />}
                    </button>
                  );
                })}
              </div>
            )}
          </Field>
          <div className="rounded-2xl bg-[#F7F7F2] border border-[#E5E6DF] p-4 space-y-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" data-testid="course-drip" checked={!!form.drip_enabled} onChange={(e) => set("drip_enabled", e.target.checked)} className="h-4 w-4 accent-[#B25A45]" />
              <span className="font-semibold">Drip schedule — release lessons over time</span>
            </label>
            {form.drip_enabled && (
              <div className="flex items-center gap-2 text-sm text-[#545E56]">
                Release one lesson every
                <input data-testid="course-drip-interval" type="number" min={1} className="w-20 rounded-xl border border-[#E5E6DF] px-3 py-1.5 text-[14px]" value={form.drip_interval_days} onChange={(e) => set("drip_interval_days", e.target.value)} />
                days after a student enrolls.
              </div>
            )}
            <p className="text-xs text-[#6B7269]">Lesson 1 is available immediately; lesson 2 after one interval, and so on. Free previews are always open.</p>
          </div>
          <button onClick={save} disabled={saving} data-testid="course-save" className="pill pill-primary w-full"><Save className="h-4 w-4" /> {saving ? "Saving…" : (editing.__new ? "Create course" : "Save changes")}</button>
        </div>
        {editing.__new ? (
          <p className="text-xs text-[#6B7269] text-center">Save the course first, then add lessons.</p>
        ) : (
          <div className="rounded-2xl bg-[#F7F7F2] border border-[#E5E6DF] p-5">
            <LessonsEditor programId={editing.id} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="admin-courses">
      <button onClick={openNew} data-testid="course-new" className="pill pill-primary w-full"><Plus className="h-4 w-4" /> New course</button>
      {list.length === 0 ? (
        <p className="text-sm text-[#6B7269] py-6 text-center">No courses yet — create your first one.</p>
      ) : list.map((p) => (
        <button key={p.id} onClick={() => openEdit(p)} data-testid={`course-row-${p.id}`}
          className="w-full text-left rounded-2xl bg-white border border-[#E5E6DF] p-4 hover:border-[#B25A45] transition flex items-center gap-3">
          {p.cover_image && <img src={p.cover_image} alt="" className="h-14 w-14 rounded-xl object-cover shrink-0" />}
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold truncate">{p.title}</div>
            <div className="text-[11px] text-[#6B7269] mt-0.5 capitalize">{p.level} · {p.duration_weeks} weeks · {p.currency?.toUpperCase()} {Math.round(p.price)}</div>
          </div>
          <span className="text-xs text-[#B25A45] shrink-0">Edit</span>
        </button>
      ))}
    </div>
  );
}

export default CoursesPane;
