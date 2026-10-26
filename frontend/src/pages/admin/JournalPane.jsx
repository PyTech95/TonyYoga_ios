import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, ArrowLeft, Save, Trash2, Eye, EyeOff, ExternalLink } from "lucide-react";
import { api } from "@/lib/api";
import Spinner from "@/components/Spinner";
import { ContentImageInput } from "@/components/ContentImageInput";
import { Field, inputCls } from "./shared";

const EMPTY = { title: "", excerpt: "", body: "", cover_image: "", category: "blog", tags: [], is_published: false };

function Editor({ post, onBack, onSaved }) {
  const [f, setF] = useState({ ...EMPTY, ...post, tagsText: (post.tags || []).join(", ") });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const save = async (publish) => {
    if (!f.title.trim()) return toast.error("Add a title first.");
    const body = {
      title: f.title.trim(), excerpt: f.excerpt, body: f.body, cover_image: f.cover_image, category: f.category,
      tags: f.tagsText.split(",").map((x) => x.trim()).filter(Boolean), is_published: publish ?? f.is_published,
    };
    setBusy(true);
    try {
      if (post.id) await api.patch(`/admin/news/${post.id}`, body);
      else await api.post("/admin/news", body);
      toast.success(body.is_published ? "Published to the Journal" : "Draft saved");
      onSaved();
    } catch (e) { toast.error(typeof e?.response?.data?.detail === "string" ? e.response.data.detail : "Could not save"); }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-4" data-testid="journal-editor">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-[#6B7269] hover:text-[#1C221F]"><ArrowLeft className="h-4 w-4" /> All posts</button>
      <div className="rounded-2xl bg-white border border-[#E5E6DF] p-5 space-y-4">
        <Field label="Title"><input className={inputCls} value={f.title} onChange={(e) => set("title", e.target.value)} data-testid="journal-title" /></Field>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Type"><select className={inputCls} value={f.category} onChange={(e) => set("category", e.target.value)}><option value="blog">Article</option><option value="news">News</option><option value="event">Event</option></select></Field>
          <Field label="Tags (comma separated)"><input className={inputCls} value={f.tagsText} onChange={(e) => set("tagsText", e.target.value)} placeholder="breath, beginners" /></Field>
        </div>
        <Field label="Short summary (shown in lists and Google)"><textarea rows={2} className={inputCls} value={f.excerpt} onChange={(e) => set("excerpt", e.target.value)} maxLength={400} data-testid="journal-excerpt" /></Field>
        <ContentImageInput absolute label="Cover image" tid="journal-cover" value={f.cover_image} onChange={(v) => set("cover_image", v)} />
        <Field label="Article" hint="Leave an empty line between paragraphs. **bold** and [link text](/programs) work.">
          <textarea rows={12} className={inputCls} value={f.body} onChange={(e) => set("body", e.target.value)} data-testid="journal-body" />
        </Field>
      </div>
      <div className="sticky bottom-3 z-10 flex justify-end gap-2">
        <button onClick={() => save(false)} disabled={busy} className="pill pill-ghost bg-white shadow"><Save className="h-4 w-4" /> Save draft</button>
        <button onClick={() => save(true)} disabled={busy} className="pill pill-primary shadow-lg" data-testid="journal-publish"><Eye className="h-4 w-4" /> Publish</button>
      </div>
    </div>
  );
}

export default function JournalPane() {
  const [rows, setRows] = useState(null);
  const [editing, setEditing] = useState(null);
  const load = () => api.get("/admin/news").then(({ data }) => setRows(data)).catch(() => setRows([]));
  useEffect(() => { load(); }, []);
  const del = async (p) => {
    if (!window.confirm(`Delete “${p.title}”?`)) return;
    try { await api.delete(`/admin/news/${p.id}`); load(); } catch { toast.error("Could not delete"); }
  };
  const flip = async (p) => { try { await api.patch(`/admin/news/${p.id}`, { is_published: !p.is_published }); load(); } catch { toast.error("Could not update"); } };
  if (editing) return <Editor post={editing} onBack={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />;
  if (rows === null) return <Spinner />;
  return (
    <div className="space-y-5" data-testid="journal-pane">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow mb-1">Website</div>
          <h2 className="serif text-2xl sm:text-3xl">Journal &amp; news</h2>
          <p className="text-[13px] text-[#6B7269] mt-1 max-w-2xl">Articles, news and events. Each published post gets its own page — regular articles help Google and AI assistants find Tony Yoga.</p>
        </div>
        <button onClick={() => setEditing({ ...EMPTY })} className="pill pill-primary" data-testid="journal-new"><Plus className="h-4 w-4" /> New post</button>
      </div>
      <ul className="space-y-3">
        {rows.map((p) => (
          <li key={p.id} className="rounded-2xl bg-white border border-[#E5E6DF] p-4 flex flex-wrap items-center gap-3">
            {p.cover_image && <img src={p.cover_image} alt="" className="h-12 w-16 rounded-lg object-cover bg-[#F2F2EC]" />}
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-[15px] truncate">{p.title}</div>
              <div className="text-[12px] text-[#6B7269]">{p.category} · {new Date(p.published_at || p.created_at).toLocaleDateString()}</div>
            </div>
            <button onClick={() => flip(p)} className={`rounded-full px-3 py-1 text-[11px] font-semibold ${p.is_published ? "bg-[#EEF1EC] text-[#5C7355]" : "bg-[#F2F2EC] text-[#6B7269]"}`}>
              {p.is_published ? <><Eye className="inline h-3 w-3 mr-1" />Published</> : <><EyeOff className="inline h-3 w-3 mr-1" />Draft</>}
            </button>
            {p.is_published && <a href={`/news/${p.slug}`} target="_blank" rel="noreferrer" className="pill pill-ghost !py-1.5 !px-3 !text-xs"><ExternalLink className="h-3.5 w-3.5" /> View</a>}
            <button onClick={() => setEditing(p)} className="pill pill-ghost !py-1.5 !px-3 !text-xs">Edit</button>
            <button onClick={() => del(p)} className="text-[#B25A45] p-1.5" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
          </li>
        ))}
        {rows.length === 0 && <li className="text-sm text-[#6B7269]">No posts yet.</li>}
      </ul>
    </div>
  );
}

