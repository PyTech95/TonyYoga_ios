import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, API_BASE } from "@/lib/api";
import Spinner from "@/components/Spinner";

const EMPTY = {
  title: "", system: "Core 40", description: "", location: "Villa San Pedro · Málaga, Spain",
  start_date: "", end_date: "", price_eur: 1600, deposit_eur: 500, capacity: 14,
  cover_image: "", gallery: "", student_video_url: "",
};

function RetreatsPane() {
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const ic = "w-full rounded-xl border border-[#E5E6DF] bg-white px-3 py-2 text-sm focus:outline-none focus:border-[#B25A45]";
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const galleryUrls = (form.gallery || "").split("\n").map((s) => s.trim()).filter(Boolean);

  const uploadPhotos = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const urls = [];
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        const { data } = await api.post("/admin/uploads", fd, { headers: { "Content-Type": "multipart/form-data" } });
        urls.push(`${API_BASE}/files/${data.path}`);
      }
      set("gallery", [...galleryUrls, ...urls].join("\n"));
      toast.success(`${urls.length} photo${urls.length > 1 ? "s" : ""} uploaded`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = (url) => set("gallery", galleryUrls.filter((u) => u !== url).join("\n"));

  const load = () => api.get("/admin/workshops").then(({ data }) => setRows(data)).catch(() => setRows([]));
  useEffect(() => { load(); }, []);

  const startEdit = (w) => {
    setEditingId(w.id);
    setForm({
      title: w.title || "", system: w.system || "Core 40", description: w.description || "",
      location: w.location || "", start_date: String(w.start_date || "").slice(0, 10),
      end_date: String(w.end_date || "").slice(0, 10), price_eur: w.price_eur ?? 1600,
      deposit_eur: w.deposit_eur ?? 500, capacity: w.capacity ?? 14, cover_image: w.cover_image || "",
      gallery: (w.gallery || []).join("\n"), student_video_url: w.student_video_url || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => { setEditingId(null); setForm(EMPTY); };

  const submit = async () => {
    if (!form.title.trim() || !form.start_date || !form.end_date) return toast.error("Title and both dates are required.");
    setBusy(true);
    const payload = {
      ...form,
      price_eur: Number(form.price_eur) || 0,
      deposit_eur: Number(form.deposit_eur) || 0,
      capacity: Number(form.capacity) || 14,
      gallery: galleryUrls,
      student_video_url: (form.student_video_url || "").trim(),
      start_date: new Date(form.start_date).toISOString(),
      end_date: new Date(form.end_date).toISOString(),
    };
    try {
      if (editingId) {
        await api.patch(`/admin/workshops/${editingId}`, payload);
        toast.success("Retreat updated");
      } else {
        await api.post("/admin/workshops", payload);
        toast.success("Retreat published");
      }
      cancelEdit(); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not save"); }
    finally { setBusy(false); }
  };

  const toggleActive = async (w) => {
    try { await api.patch(`/admin/workshops/${w.id}`, { is_active: !w.is_active }); load(); }
    catch { toast.error("Failed"); }
  };
  const remove = async (w) => {
    if (!window.confirm(`Delete "${w.title}"? This cannot be undone.`)) return;
    try { await api.delete(`/admin/workshops/${w.id}`); if (editingId === w.id) cancelEdit(); load(); }
    catch { toast.error("Failed"); }
  };

  return (
    <div className="space-y-4" data-testid="retreats-pane">
      <div className="rounded-2xl bg-white border border-[#E5E6DF] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="eyebrow">{editingId ? "Edit retreat" : "Publish a retreat"}</div>
          {editingId && (
            <button onClick={cancelEdit} data-testid="retreat-cancel-edit" className="text-xs text-[#6B7269] hover:underline">Cancel edit</button>
          )}
        </div>
        <input data-testid="retreat-title" className={ic} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Title — e.g. Tree of Yoga · Core 40" />
        <div className="grid grid-cols-2 gap-3">
          <input data-testid="retreat-system" className={ic} value={form.system} onChange={(e) => set("system", e.target.value)} placeholder="System (Core 40)" />
          <input data-testid="retreat-location" className={ic} value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="Location" />
        </div>
        <textarea data-testid="retreat-description" rows={2} className={ic} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Description" />
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-[#6B7269]">Start date<input data-testid="retreat-start" type="date" className={ic} value={form.start_date} onChange={(e) => set("start_date", e.target.value)} /></label>
          <label className="text-xs text-[#6B7269]">End date<input data-testid="retreat-end" type="date" className={ic} value={form.end_date} onChange={(e) => set("end_date", e.target.value)} /></label>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <label className="text-xs text-[#6B7269]">Full price €<input data-testid="retreat-price" type="number" className={ic} value={form.price_eur} onChange={(e) => set("price_eur", e.target.value)} /></label>
          <label className="text-xs text-[#6B7269]">Deposit €<input data-testid="retreat-deposit" type="number" className={ic} value={form.deposit_eur} onChange={(e) => set("deposit_eur", e.target.value)} /></label>
          <label className="text-xs text-[#6B7269]">Capacity<input data-testid="retreat-capacity" type="number" className={ic} value={form.capacity} onChange={(e) => set("capacity", e.target.value)} /></label>
        </div>
        <input data-testid="retreat-cover" className={ic} value={form.cover_image} onChange={(e) => set("cover_image", e.target.value)} placeholder="Cover image URL (optional)" />

        <label className="block text-xs text-[#6B7269]">Student video link (YouTube / Vimeo / Loom)
          <input data-testid="retreat-student-video" className={ic} value={form.student_video_url} onChange={(e) => set("student_video_url", e.target.value)} placeholder="https://youtu.be/… — a real student sharing their retreat" />
        </label>

        <div className="rounded-xl border border-dashed border-[#D8D9CF] bg-[#FAFAF7] p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#545E56]">Gallery photos (shown as a slider)</span>
            <label data-testid="retreat-photo-upload" className={`text-xs font-semibold cursor-pointer rounded-full px-3 py-1 ${uploading ? "bg-[#F2F2EC] text-[#9AA096]" : "bg-[#B25A45] text-white hover:opacity-90"}`}>
              {uploading ? "Uploading…" : "+ Upload photos"}
              <input type="file" accept="image/*" multiple hidden disabled={uploading}
                onChange={(e) => { uploadPhotos(e.target.files); e.target.value = ""; }} />
            </label>
          </div>
          {galleryUrls.length > 0 && (
            <div className="grid grid-cols-4 gap-2" data-testid="retreat-gallery-preview">
              {galleryUrls.map((url, i) => (
                <div key={i} className="relative group aspect-square">
                  <img src={url} alt="" className="h-full w-full rounded-lg object-cover" />
                  <button type="button" onClick={() => removePhoto(url)} data-testid={`retreat-gallery-remove-${i}`}
                    className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-[#1C221F] text-white text-xs flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition">×</button>
                </div>
              ))}
            </div>
          )}
          <textarea data-testid="retreat-gallery" rows={2} className={ic} value={form.gallery} onChange={(e) => set("gallery", e.target.value)} placeholder="…or paste image URLs — one per line" />
        </div>

        <button onClick={submit} disabled={busy} data-testid="retreat-create" className="pill pill-primary w-full">
          {busy ? "Saving…" : editingId ? "Save changes" : "Publish retreat"}
        </button>
      </div>

      <div className="eyebrow">All retreats {rows?.length ? `(${rows.length})` : ""}</div>
      {rows === null ? <Spinner /> : rows.length === 0 ? (
        <p className="text-sm text-[#6B7269] rounded-2xl bg-[#F2F2EC] p-5">No retreats yet.</p>
      ) : (
        <ul className="space-y-2" data-testid="retreats-list">
          {rows.map((w) => (
            <li key={w.id} className={`rounded-2xl bg-white border p-3 flex items-center justify-between gap-3 ${editingId === w.id ? "border-[#B25A45]" : "border-[#E5E6DF]"}`} data-testid={`retreat-row-${w.id}`}>
              <div className="min-w-0">
                <div className="text-[14px] font-semibold truncate">{w.title}</div>
                <div className="text-xs text-[#6B7269]">{String(w.start_date).slice(0, 10)} → {String(w.end_date).slice(0, 10)} · €{w.price_eur} · €{w.deposit_eur ?? 500} deposit{w.student_video_url ? " · 🎬 video" : ""}{w.gallery?.length ? ` · ${w.gallery.length} photos` : ""}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => startEdit(w)} data-testid={`retreat-edit-${w.id}`} className="text-xs rounded-full px-2.5 py-1 font-semibold bg-[#F2F2EC] text-[#545E56] hover:bg-[#E5E6DF]">Edit</button>
                <button onClick={() => toggleActive(w)} data-testid={`retreat-toggle-${w.id}`} className="text-xs rounded-full px-2.5 py-1 font-semibold" style={{ background: w.is_active ? "#EEF1EC" : "#F2F2EC", color: w.is_active ? "#5C7355" : "#6B7269" }}>{w.is_active ? "Active" : "Hidden"}</button>
                <button onClick={() => remove(w)} data-testid={`retreat-delete-${w.id}`} className="text-xs text-[#B25A45] hover:underline">Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}


export default RetreatsPane;
