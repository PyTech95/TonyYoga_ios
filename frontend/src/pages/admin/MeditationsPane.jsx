import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, X, Sparkles } from "lucide-react";
import { api, API_BASE } from "@/lib/api";
import Spinner from "@/components/Spinner";

const KINDS = ["meditation", "breathwork", "nidra"];
const FOCUS = ["Sleep", "Stress relief", "Grounding", "Energy", "Focus", "Anxiety relief", "Gratitude", "Breath control"];

function MeditationsPane() {
  const empty = {
    id: null, title: "", kind: "meditation", media_kind: "audio", youtube_url: "", audio_url: "",
    duration_minutes: "", focus_areas: [], level: "beginner", language: "both", cover_image: "", description: "", is_published: true,
  };
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const ic = "w-full rounded-xl border border-[#E5E6DF] bg-white px-3 py-2 text-sm focus:outline-none focus:border-[#B25A45]";
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const editing = !!form.id;

  const load = () => api.get("/admin/meditations").then(({ data }) => setRows(data)).catch(() => setRows([]));
  useEffect(() => { load(); }, []);

  const uploadCover = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const { data } = await api.post("/admin/uploads", fd, { headers: { "Content-Type": "multipart/form-data" } });
      set("cover_image", `${API_BASE}/files/${data.path}`);
      toast.success("Photo uploaded");
    } catch (e) { toast.error(e?.response?.data?.detail || "Upload failed"); }
    finally { setUploading(false); }
  };

  const openEdit = (m) => {
    setForm({
      id: m.id, title: m.title || "", kind: m.kind || "meditation", media_kind: m.media_kind || "audio",
      youtube_url: m.youtube_url || "", audio_url: m.audio_url || "", duration_minutes: m.duration_minutes ?? "",
      focus_areas: m.focus_areas || [], level: m.level || "beginner", language: m.language || "both",
      cover_image: m.cover_image || "", description: m.description || "", is_published: m.is_published !== false,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const reset = () => setForm(empty);

  const save = async () => {
    if (!form.title.trim()) return toast.error("Title is required.");
    setBusy(true);
    const payload = {
      title: form.title.trim(), kind: form.kind, media_kind: form.media_kind,
      youtube_url: form.youtube_url.trim(), audio_url: form.audio_url.trim(),
      duration_minutes: form.duration_minutes === "" ? null : Number(form.duration_minutes),
      focus_areas: form.focus_areas, level: form.level, language: form.language,
      cover_image: form.cover_image.trim(), description: form.description.trim(), is_published: !!form.is_published,
    };
    try {
      if (editing) await api.patch(`/admin/meditations/${form.id}`, payload);
      else await api.post("/admin/meditations", payload);
      toast.success(editing ? "Updated" : "Added");
      reset(); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not save"); }
    finally { setBusy(false); }
  };

  const remove = async (m) => {
    if (!window.confirm(`Delete "${m.title}"?`)) return;
    try { await api.delete(`/admin/meditations/${m.id}`); load(); } catch { toast.error("Failed"); }
  };

  const toggleFocus = (f) => set("focus_areas", form.focus_areas.includes(f) ? form.focus_areas.filter((x) => x !== f) : [...form.focus_areas, f]);

  return (
    <div className="space-y-4" data-testid="meditations-pane">
      <div className="rounded-2xl bg-white border border-[#E5E6DF] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="eyebrow flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-[#B25A45]" /> {editing ? "Edit session" : "Add a session"}</div>
          {editing && <button onClick={reset} className="text-xs text-[#6B7269] hover:underline flex items-center gap-1"><X className="h-3 w-3" /> Cancel</button>}
        </div>

        <input data-testid="med-title" className={ic} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Title — e.g. Box Breathing Reset" />
        <div className="grid grid-cols-3 gap-3">
          <label className="text-xs text-[#6B7269]">Type
            <select data-testid="med-kind" className={ic} value={form.kind} onChange={(e) => set("kind", e.target.value)}>
              {KINDS.map((k) => <option key={k} value={k}>{k === "nidra" ? "Yoga Nidra" : k}</option>)}
            </select>
          </label>
          <label className="text-xs text-[#6B7269]">Media
            <select data-testid="med-media" className={ic} value={form.media_kind} onChange={(e) => set("media_kind", e.target.value)}>
              <option value="audio">Audio</option><option value="video">Video (YouTube)</option>
            </select>
          </label>
          <label className="text-xs text-[#6B7269]">Duration (min)
            <input data-testid="med-duration" type="number" className={ic} value={form.duration_minutes} onChange={(e) => set("duration_minutes", e.target.value)} />
          </label>
        </div>

        {form.media_kind === "audio" ? (
          <input data-testid="med-audio" className={ic} value={form.audio_url} onChange={(e) => set("audio_url", e.target.value)} placeholder="Audio file URL (mp3)" />
        ) : (
          <input data-testid="med-youtube" className={ic} value={form.youtube_url} onChange={(e) => set("youtube_url", e.target.value)} placeholder="YouTube URL" />
        )}

        <textarea data-testid="med-description" rows={2} className={ic} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Short description" />

        <div className="rounded-xl border border-dashed border-[#D8D9CF] bg-[#FAFAF7] p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#545E56]">Cover photo</span>
            <label data-testid="med-cover-upload" className={`text-xs font-semibold cursor-pointer rounded-full px-3 py-1 ${uploading ? "bg-[#F2F2EC] text-[#9AA096]" : "bg-[#B25A45] text-white hover:opacity-90"}`}>
              {uploading ? "Uploading…" : "+ Upload"}
              <input type="file" accept="image/*" hidden disabled={uploading} onChange={(e) => { uploadCover(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
          </div>
          {form.cover_image && <img src={form.cover_image} alt="" className="h-20 w-20 rounded-lg object-cover" />}
          <input data-testid="med-cover-url" className={ic} value={form.cover_image} onChange={(e) => set("cover_image", e.target.value)} placeholder="…or paste image URL" />
        </div>

        <div>
          <div className="text-xs text-[#6B7269] mb-1">Focus areas</div>
          <div className="flex flex-wrap gap-2" data-testid="med-focus">
            {FOCUS.map((f) => (
              <button key={f} type="button" onClick={() => toggleFocus(f)} className={`pill !py-1.5 !px-3 !text-[12px] ${form.focus_areas.includes(f) ? "pill-primary" : "pill-ghost"}`}>{f}</button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-[#545E56]">
          <input type="checkbox" data-testid="med-published" checked={form.is_published} onChange={(e) => set("is_published", e.target.checked)} /> Published
        </label>

        <button onClick={save} disabled={busy} data-testid="med-save" className="pill pill-primary w-full">
          {busy ? "Saving…" : editing ? "Update session" : <><Plus className="h-4 w-4" /> Add session</>}
        </button>
      </div>

      <div className="eyebrow">All sessions {rows?.length ? `(${rows.length})` : ""}</div>
      {rows === null ? <Spinner /> : rows.length === 0 ? (
        <p className="text-sm text-[#6B7269] rounded-2xl bg-[#F2F2EC] p-5">No sessions yet.</p>
      ) : (
        <ul className="space-y-2" data-testid="meditations-list">
          {rows.map((m) => (
            <li key={m.id} className="rounded-2xl bg-white border border-[#E5E6DF] p-3 flex items-center gap-3">
              <div className="h-12 w-12 shrink-0 rounded-lg bg-[#F2F2EC] overflow-hidden">{m.cover_image && <img src={m.cover_image} alt="" className="h-full w-full object-cover" />}</div>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold truncate">{m.title} {!m.is_published && <span className="text-[10px] text-[#B25A45]">· hidden</span>}</div>
                <div className="text-xs text-[#6B7269] truncate capitalize">{m.kind} · {m.media_kind}{m.duration_minutes ? ` · ${m.duration_minutes} min` : ""}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => openEdit(m)} data-testid={`med-edit-${m.id}`} className="text-[#6B7269] hover:text-[#B25A45]"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => remove(m)} data-testid={`med-delete-${m.id}`} className="text-[#B25A45] hover:opacity-70"><Trash2 className="h-4 w-4" /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default MeditationsPane;
