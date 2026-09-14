import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, X, Flower2 } from "lucide-react";
import { api, API_BASE } from "@/lib/api";
import Spinner from "@/components/Spinner";

const CATEGORIES = ["Standing", "Balancing", "Backbend", "Forward Fold", "Twist", "Inversion", "Seated", "Restorative"];
const DIFFICULTY = ["beginner", "intermediate", "advanced"];

function AsanasPane() {
  const empty = {
    id: null, name: "", sanskrit: "", benefits: "", description: "",
    category: "Standing", difficulty: "beginner", cover_image: "",
    youtube_url: "", start_seconds: "", end_seconds: "", program_id: "", is_published: true,
  };
  const [rows, setRows] = useState(null);
  const [programs, setPrograms] = useState([]);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const ic = "w-full rounded-xl border border-[#E5E6DF] bg-white px-3 py-2 text-sm focus:outline-none focus:border-[#B25A45]";
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const editing = !!form.id;

  const load = () => api.get("/admin/asanas").then(({ data }) => setRows(data)).catch(() => setRows([]));
  useEffect(() => {
    load();
    api.get("/programs").then(({ data }) => setPrograms(data)).catch(() => {});
  }, []);

  const uploadCover = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/admin/uploads", fd, { headers: { "Content-Type": "multipart/form-data" } });
      set("cover_image", `${API_BASE}/files/${data.path}`);
      toast.success("Photo uploaded");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Upload failed");
    } finally { setUploading(false); }
  };

  const openEdit = (a) => {
    setForm({
      id: a.id, name: a.name || "", sanskrit: a.sanskrit || "",
      benefits: (a.benefits || []).join("\n"), description: a.description || "",
      category: a.category || "Standing", difficulty: a.difficulty || "beginner",
      cover_image: a.cover_image || "", youtube_url: a.youtube_url || "",
      start_seconds: a.start_seconds ?? "", end_seconds: a.end_seconds ?? "",
      program_id: a.program_id || "", is_published: a.is_published !== false,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const reset = () => setForm(empty);

  const save = async () => {
    if (!form.name.trim()) return toast.error("Pose name is required.");
    setBusy(true);
    const payload = {
      name: form.name.trim(),
      sanskrit: form.sanskrit.trim(),
      benefits: (form.benefits || "").split("\n").map((s) => s.trim()).filter(Boolean),
      description: form.description.trim(),
      category: form.category,
      difficulty: form.difficulty,
      cover_image: form.cover_image.trim(),
      youtube_url: form.youtube_url.trim(),
      start_seconds: form.start_seconds === "" ? 0 : Number(form.start_seconds),
      end_seconds: form.end_seconds === "" ? null : Number(form.end_seconds),
      program_id: form.program_id || null,
      is_published: !!form.is_published,
    };
    try {
      if (editing) await api.patch(`/admin/asanas/${form.id}`, payload);
      else await api.post("/admin/asanas", payload);
      toast.success(editing ? "Pose updated" : "Pose added");
      reset(); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not save"); }
    finally { setBusy(false); }
  };

  const remove = async (a) => {
    if (!window.confirm(`Delete "${a.name}"?`)) return;
    try { await api.delete(`/admin/asanas/${a.id}`); load(); }
    catch { toast.error("Failed"); }
  };

  return (
    <div className="space-y-4" data-testid="asanas-pane">
      <div className="rounded-2xl bg-white border border-[#E5E6DF] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="eyebrow flex items-center gap-2"><Flower2 className="h-3.5 w-3.5 text-[#B25A45]" /> {editing ? "Edit pose" : "Add a pose"}</div>
          {editing && <button onClick={reset} data-testid="asana-cancel-edit" className="text-xs text-[#6B7269] hover:underline flex items-center gap-1"><X className="h-3 w-3" /> Cancel</button>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <input data-testid="asana-name" className={ic} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Name — e.g. Camel Pose" />
          <input data-testid="asana-sanskrit" className={ic} value={form.sanskrit} onChange={(e) => set("sanskrit", e.target.value)} placeholder="Sanskrit — e.g. Ustrasana" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-[#6B7269]">Category
            <select data-testid="asana-category" className={ic} value={form.category} onChange={(e) => set("category", e.target.value)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="text-xs text-[#6B7269]">Difficulty
            <select data-testid="asana-difficulty" className={ic} value={form.difficulty} onChange={(e) => set("difficulty", e.target.value)}>
              {DIFFICULTY.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
        </div>

        <textarea data-testid="asana-description" rows={2} className={ic} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Short description" />
        <textarea data-testid="asana-benefits" rows={3} className={ic} value={form.benefits} onChange={(e) => set("benefits", e.target.value)} placeholder="Benefits — one per line" />

        {/* Cover photo — upload button + URL fallback */}
        <div className="rounded-xl border border-dashed border-[#D8D9CF] bg-[#FAFAF7] p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#545E56]">Cover photo</span>
            <label data-testid="asana-cover-upload" className={`text-xs font-semibold cursor-pointer rounded-full px-3 py-1 ${uploading ? "bg-[#F2F2EC] text-[#9AA096]" : "bg-[#B25A45] text-white hover:opacity-90"}`}>
              {uploading ? "Uploading…" : "+ Upload image"}
              <input type="file" accept="image/*" hidden disabled={uploading}
                onChange={(e) => { uploadCover(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
          </div>
          {form.cover_image && (
            <div className="relative w-28" data-testid="asana-cover-preview">
              <img src={form.cover_image} alt="" className="h-28 w-28 rounded-lg object-cover" />
              <button type="button" onClick={() => set("cover_image", "")} data-testid="asana-cover-remove"
                className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-[#1C221F] text-white text-xs flex items-center justify-center">×</button>
            </div>
          )}
          <input data-testid="asana-cover-url" className={ic} value={form.cover_image} onChange={(e) => set("cover_image", e.target.value)} placeholder="…or paste an image URL" />
        </div>

        {/* Optional clip */}
        <input data-testid="asana-youtube" className={ic} value={form.youtube_url} onChange={(e) => set("youtube_url", e.target.value)} placeholder="YouTube clip URL (optional)" />
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-[#6B7269]">Clip start (sec)<input data-testid="asana-start" type="number" className={ic} value={form.start_seconds} onChange={(e) => set("start_seconds", e.target.value)} /></label>
          <label className="text-xs text-[#6B7269]">Clip end (sec)<input data-testid="asana-end" type="number" className={ic} value={form.end_seconds} onChange={(e) => set("end_seconds", e.target.value)} /></label>
        </div>

        <label className="text-xs text-[#6B7269]">Link to program (optional)
          <select data-testid="asana-program" className={ic} value={form.program_id} onChange={(e) => set("program_id", e.target.value)}>
            <option value="">— none —</option>
            {programs.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm text-[#545E56]">
          <input type="checkbox" data-testid="asana-published" checked={form.is_published} onChange={(e) => set("is_published", e.target.checked)} />
          Published (visible in the public Asana Index)
        </label>

        <button onClick={save} disabled={busy} data-testid="asana-save" className="pill pill-primary w-full">
          {busy ? "Saving…" : editing ? "Update pose" : <><Plus className="h-4 w-4" /> Add pose</>}
        </button>
      </div>

      <div className="eyebrow">All poses {rows?.length ? `(${rows.length})` : ""}</div>
      {rows === null ? <Spinner /> : rows.length === 0 ? (
        <p className="text-sm text-[#6B7269] rounded-2xl bg-[#F2F2EC] p-5">No poses yet.</p>
      ) : (
        <ul className="space-y-2" data-testid="asanas-list">
          {rows.map((a) => (
            <li key={a.id} className="rounded-2xl bg-white border border-[#E5E6DF] p-3 flex items-center gap-3" data-testid={`asana-row-${a.id}`}>
              <div className="h-12 w-12 shrink-0 rounded-lg bg-[#F2F2EC] overflow-hidden">
                {a.cover_image && <img src={a.cover_image} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold truncate">{a.name} {!a.is_published && <span className="text-[10px] text-[#B25A45]">· hidden</span>}</div>
                <div className="text-xs text-[#6B7269] truncate">{a.sanskrit}{a.category ? ` · ${a.category}` : ""}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => openEdit(a)} data-testid={`asana-edit-${a.id}`} className="text-[#6B7269] hover:text-[#B25A45]"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => remove(a)} data-testid={`asana-delete-${a.id}`} className="text-[#B25A45] hover:opacity-70"><Trash2 className="h-4 w-4" /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default AsanasPane;
