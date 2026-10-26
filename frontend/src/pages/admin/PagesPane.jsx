import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Plus, ArrowLeft, ArrowUp, ArrowDown, Trash2, ExternalLink, Save, Heading, Type, Image as ImageIcon, MousePointerClick,
  List, Quote, HelpCircle, LayoutGrid, Video, Eye, EyeOff, Upload,
} from "lucide-react";
import { api } from "@/lib/api";
import Spinner from "@/components/Spinner";
import { ContentImageInput, contentImageUrl } from "@/components/ContentImageInput";
import { Field, inputCls, Toggle } from "./shared";
import { invalidateSiteData } from "@/lib/siteData";

const BLOCKS = [
  { type: "heading", label: "Heading", icon: Heading, make: () => ({ text: "", level: 2 }) },
  { type: "text", label: "Text", icon: Type, make: () => ({ text: "" }) },
  { type: "image", label: "Image", icon: ImageIcon, make: () => ({ src: "", alt: "", caption: "" }) },
  { type: "button", label: "Button", icon: MousePointerClick, make: () => ({ label: "", href: "/", style: "primary" }) },
  { type: "list", label: "Bullet list", icon: List, make: () => ({ items: [""] }) },
  { type: "quote", label: "Quote", icon: Quote, make: () => ({ text: "", author: "" }) },
  { type: "cards", label: "Cards (services, packages…)", icon: LayoutGrid, make: () => ({ items: [{ title: "", text: "", href: "", image: "" }] }) },
  { type: "faq", label: "Questions & answers", icon: HelpCircle, make: () => ({ items: [{ q: "", a: "" }] }) },
  { type: "video", label: "Video (YouTube, Vimeo or MP4)", icon: Video, make: () => ({ url: "", poster: "", caption: "" }) },
];

function VideoUrlInput({ value, onChange }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/admin/uploads", fd, { timeout: 600000 });
      onChange(contentImageUrl(data.url));
    } catch (e) { toast.error(typeof e?.response?.data?.detail === "string" ? e.response.data.detail : "Upload failed"); }
    finally { setBusy(false); }
  };
  return (
    <div className="flex gap-2 items-center min-w-0">
      <input className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} placeholder="YouTube / Vimeo link, or upload an MP4" />
      <input ref={ref} type="file" accept="video/mp4,video/webm,video/quicktime" hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
      <button type="button" onClick={() => ref.current?.click()} className="pill pill-ghost !px-3 !py-2 shrink-0" title="Upload video" disabled={busy}>
        {busy ? "…" : <Upload className="h-4 w-4" />}
      </button>
    </div>
  );
}
const LABEL = Object.fromEntries(BLOCKS.map((b) => [b.type, b.label]));
const newId = () => Math.random().toString(36).slice(2, 10);
const slugify = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
const EMPTY = {
  title: "", slug: "", eyebrow: "", intro: "", cover_image: "", menu_label: "", blocks: [], published: false,
  show_in_header: false, show_in_footer: true, show_in_app_menu: false, order_index: 0,
  seo_title: "", seo_description: "", seo_image: "", noindex: false,
};

function BlockEditor({ block, onChange }) {
  const set = (k, v) => onChange({ ...block, [k]: v });
  const setItem = (i, k, v) => set("items", block.items.map((it, j) => (j === i ? (typeof it === "string" ? v : { ...it, [k]: v }) : it)));
  const addItem = (blank) => set("items", [...(block.items || []), blank]);
  const removeItem = (i) => set("items", block.items.filter((_, j) => j !== i));
  switch (block.type) {
    case "heading":
      return <div className="flex gap-2"><input className={inputCls} value={block.text} onChange={(e) => set("text", e.target.value)} placeholder="Section heading" />
        <select className={`${inputCls} !w-28`} value={block.level} onChange={(e) => set("level", Number(e.target.value))}><option value={2}>Large</option><option value={3}>Small</option></select></div>;
    case "text":
      return <><textarea rows={5} className={inputCls} value={block.text} onChange={(e) => set("text", e.target.value)} placeholder="Write your text. Leave an empty line between paragraphs." />
        <p className="text-[11px] text-[#6B7269]">Tip: **bold text** and [link text](/programs) work here.</p></>;
    case "image":
      return <div className="space-y-2"><ContentImageInput absolute label="Image" tid={`blk-img-${block.id}`} value={block.src} onChange={(v) => set("src", v)} />
        <input className={inputCls} value={block.alt} onChange={(e) => set("alt", e.target.value)} placeholder="Describe the image (for Google & screen readers)" />
        <input className={inputCls} value={block.caption} onChange={(e) => set("caption", e.target.value)} placeholder="Caption (optional)" /></div>;
    case "button":
      return <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2"><input className={inputCls} value={block.label} onChange={(e) => set("label", e.target.value)} placeholder="Button text" />
        <input className={inputCls} value={block.href} onChange={(e) => set("href", e.target.value)} placeholder="/schedule or https://…" />
        <select className={inputCls} value={block.style} onChange={(e) => set("style", e.target.value)}><option value="primary">Filled</option><option value="ghost">Outline</option></select></div>;
    case "list":
      return <div className="space-y-2">{(block.items || []).map((it, i) => <div key={i} className="flex gap-2"><input className={inputCls} value={it} onChange={(e) => setItem(i, null, e.target.value)} placeholder={`Point ${i + 1}`} /><button type="button" onClick={() => removeItem(i)} className="text-[#B25A45] px-2" aria-label="Remove point"><Trash2 className="h-4 w-4" /></button></div>)}
        <button type="button" onClick={() => addItem("")} className="text-xs font-semibold text-[#B25A45]">+ Add point</button></div>;
    case "quote":
      return <div className="space-y-2"><textarea rows={2} className={inputCls} value={block.text} onChange={(e) => set("text", e.target.value)} placeholder="Quote" />
        <input className={inputCls} value={block.author} onChange={(e) => set("author", e.target.value)} placeholder="Who said it" /></div>;
    case "cards":
      return <div className="space-y-3">{(block.items || []).map((it, i) => (
        <div key={i} className="rounded-xl border border-[#E5E6DF] p-3 space-y-2 bg-[#FAFAF7]">
          <div className="flex gap-2"><input className={inputCls} value={it.title} onChange={(e) => setItem(i, "title", e.target.value)} placeholder="Card title" /><button type="button" onClick={() => removeItem(i)} className="text-[#B25A45] px-2" aria-label="Remove card"><Trash2 className="h-4 w-4" /></button></div>
          <textarea rows={2} className={inputCls} value={it.text} onChange={(e) => setItem(i, "text", e.target.value)} placeholder="Short text" />
          <input className={inputCls} value={it.href} onChange={(e) => setItem(i, "href", e.target.value)} placeholder="Link (optional) e.g. /private-sessions" />
          <ContentImageInput absolute label="Card image (optional)" tid={`blk-card-${block.id}-${i}`} value={it.image} onChange={(v) => setItem(i, "image", v)} />
        </div>))}
        <button type="button" onClick={() => addItem({ title: "", text: "", href: "", image: "" })} className="text-xs font-semibold text-[#B25A45]">+ Add card</button></div>;
    case "faq":
      return <div className="space-y-3">{(block.items || []).map((it, i) => (
        <div key={i} className="rounded-xl border border-[#E5E6DF] p-3 space-y-2 bg-[#FAFAF7]">
          <div className="flex gap-2"><input className={inputCls} value={it.q} onChange={(e) => setItem(i, "q", e.target.value)} placeholder="Question" /><button type="button" onClick={() => removeItem(i)} className="text-[#B25A45] px-2" aria-label="Remove question"><Trash2 className="h-4 w-4" /></button></div>
          <textarea rows={3} className={inputCls} value={it.a} onChange={(e) => setItem(i, "a", e.target.value)} placeholder="Answer" />
        </div>))}
        <button type="button" onClick={() => addItem({ q: "", a: "" })} className="text-xs font-semibold text-[#B25A45]">+ Add question</button>
        <p className="text-[11px] text-[#6B7269]">Questions are also given to Google and AI assistants as an FAQ.</p></div>;
    case "video":
      return <div className="space-y-2"><VideoUrlInput value={block.url || ""} onChange={(v) => set("url", v)} />
        <ContentImageInput absolute label="Cover picture for MP4 videos (optional)" tid={`blk-poster-${block.id}`} value={block.poster || ""} onChange={(v) => set("poster", v)} />
        <input className={inputCls} value={block.caption || ""} onChange={(e) => set("caption", e.target.value)} placeholder="Caption (optional)" /></div>;
    default: return null;
  }
}

function Editor({ page, onBack, onSaved }) {
  const [form, setForm] = useState(() => ({ ...EMPTY, ...page, blocks: (page.blocks || []).map((b) => ({ ...b, id: b.id || newId() })) }));
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const isNew = !page.id;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setBlock = (i, b) => setForm((f) => ({ ...f, blocks: f.blocks.map((x, j) => (j === i ? b : x)) }));
  const move = (i, d) => setForm((f) => { const b = [...f.blocks]; const j = i + d; if (j < 0 || j >= b.length) return f; [b[i], b[j]] = [b[j], b[i]]; return { ...f, blocks: b }; });
  const remove = (i) => setForm((f) => ({ ...f, blocks: f.blocks.filter((_, j) => j !== i) }));
  const add = (type) => { const def = BLOCKS.find((b) => b.type === type); setForm((f) => ({ ...f, blocks: [...f.blocks, { id: newId(), type, ...def.make() }] })); setAdding(false); };

  const save = async (publish) => {
    const body = { ...form, published: publish ?? form.published, slug: form.slug || slugify(form.title) };
    delete body.id; delete body.created_at; delete body.updated_at;
    setSaving(true);
    try {
      const { data } = isNew ? await api.post("/admin/pages", body) : await api.patch(`/admin/pages/${page.id}`, body);
      invalidateSiteData("cms_pages");
      toast.success(body.published ? "Page published" : "Saved as draft");
      onSaved(data);
    } catch (e) {
      const d = e?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Check the page — some fields need attention.");
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-5 min-w-0" data-testid="page-editor">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-[#6B7269] hover:text-[#1C221F]"><ArrowLeft className="h-4 w-4" /> All pages</button>
      <div className="rounded-2xl bg-white border border-[#E5E6DF] p-5 space-y-4">
        <Field label="Page title">
          <input className={inputCls} value={form.title} onChange={(e) => { set("title", e.target.value); if (isNew) set("slug", slugify(e.target.value)); }} placeholder="About us" data-testid="page-title" />
        </Field>
        <Field label="Page address" hint={`Opens at tonyoga.com/${form.slug || "your-page"}`}>
          <div className="flex items-center gap-1"><span className="text-sm text-[#6B7269]">/</span><input className={inputCls} value={form.slug} onChange={(e) => set("slug", slugify(e.target.value))} placeholder="about-us" data-testid="page-slug" /></div>
        </Field>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Small heading above the title (optional)"><input className={inputCls} value={form.eyebrow} onChange={(e) => set("eyebrow", e.target.value)} placeholder="Our story" /></Field>
          <Field label="Name in menus (optional)"><input className={inputCls} value={form.menu_label} onChange={(e) => set("menu_label", e.target.value)} placeholder="About" /></Field>
        </div>
        <Field label="Introduction"><textarea rows={3} className={inputCls} value={form.intro} onChange={(e) => set("intro", e.target.value)} placeholder="One or two sentences under the title." data-testid="page-intro" /></Field>
        <ContentImageInput absolute label="Top image (optional)" tid="page-cover" value={form.cover_image} onChange={(v) => set("cover_image", v)} />
      </div>

      <div className="space-y-3" data-testid="page-blocks">
        <div className="text-[11px] uppercase tracking-widest font-semibold text-[#839682]">Page content</div>
        {form.blocks.length === 0 && <p className="text-sm text-[#6B7269] rounded-2xl border border-dashed border-[#D8D9D0] p-5 text-center">No content yet — add a heading, text, images, buttons or cards.</p>}
        {form.blocks.map((b, i) => (
          <div key={b.id} className="rounded-2xl bg-white border border-[#E5E6DF] p-4 space-y-3" data-testid={`page-block-${i}`}>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#545E56] flex-1">{LABEL[b.type]}</span>
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="p-1.5 rounded-lg hover:bg-[#F2F2EC] disabled:opacity-30" aria-label="Move up"><ArrowUp className="h-4 w-4" /></button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === form.blocks.length - 1} className="p-1.5 rounded-lg hover:bg-[#F2F2EC] disabled:opacity-30" aria-label="Move down"><ArrowDown className="h-4 w-4" /></button>
              <button type="button" onClick={() => remove(i)} className="p-1.5 rounded-lg text-[#B25A45] hover:bg-[#FBF1EE]" aria-label="Delete block"><Trash2 className="h-4 w-4" /></button>
            </div>
            <BlockEditor block={b} onChange={(nb) => setBlock(i, nb)} />
          </div>
        ))}
        {adding ? (
          <div className="rounded-2xl bg-white border border-[#E5E6DF] p-3 grid grid-cols-2 sm:grid-cols-3 gap-2" data-testid="page-add-menu">
            {BLOCKS.map((b) => (
              <button key={b.type} type="button" onClick={() => add(b.type)} data-testid={`page-add-${b.type}`} className="flex items-center gap-2 rounded-xl border border-[#E5E6DF] px-3 py-2.5 text-left text-[13px] hover:border-[#B25A45]">
                <b.icon className="h-4 w-4 text-[#B25A45] shrink-0" /> {b.label}
              </button>
            ))}
          </div>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="pill pill-ghost w-full" data-testid="page-add-block"><Plus className="h-4 w-4" /> Add content</button>
        )}
      </div>

      <div className="rounded-2xl bg-white border border-[#E5E6DF] p-5 space-y-3">
        <div className="text-[11px] uppercase tracking-widest font-semibold text-[#839682]">Where it appears</div>
        {[["show_in_header", "Website top menu"], ["show_in_footer", "Website footer"], ["show_in_app_menu", "App menu (iPhone & Android)"]].map(([k, label]) => (
          <label key={k} className="flex items-center justify-between gap-3 text-sm"><span>{label}</span><Toggle checked={!!form[k]} onChange={(v) => set(k, v)} tid={`page-${k}`} /></label>
        ))}
        <Field label="Menu order (lower comes first)"><input type="number" className={`${inputCls} !w-28`} value={form.order_index} onChange={(e) => set("order_index", Number(e.target.value) || 0)} /></Field>
      </div>

      <div className="rounded-2xl bg-white border border-[#E5E6DF] p-5 space-y-3">
        <div className="text-[11px] uppercase tracking-widest font-semibold text-[#839682]">Google (SEO)</div>
        <Field label={`Title in Google (${(form.seo_title || form.title).length}/60)`}><input className={inputCls} value={form.seo_title} onChange={(e) => set("seo_title", e.target.value)} placeholder={`${form.title || "Page title"} | Tony Yoga`} data-testid="page-seo-title" /></Field>
        <Field label={`Description in Google (${(form.seo_description || form.intro).length}/160)`}><textarea rows={2} className={inputCls} value={form.seo_description} onChange={(e) => set("seo_description", e.target.value)} placeholder={form.intro || "What this page is about, in one or two sentences."} /></Field>
        <ContentImageInput absolute label="Share image (optional)" tid="page-seo-image" value={form.seo_image} onChange={(v) => set("seo_image", v)} />
        <label className="flex items-center justify-between gap-3 text-sm"><span>Hide from Google</span><Toggle checked={!!form.noindex} onChange={(v) => set("noindex", v)} /></label>
      </div>

      <div className="sticky bottom-3 z-10 flex flex-wrap justify-end gap-2">
        {!isNew && form.published && <a href={`/${form.slug}`} target="_blank" rel="noreferrer" className="pill pill-ghost bg-white shadow"><ExternalLink className="h-4 w-4" /> View</a>}
        <button onClick={() => save(false)} disabled={saving} className="pill pill-ghost bg-white shadow" data-testid="page-save-draft"><Save className="h-4 w-4" /> Save draft</button>
        <button onClick={() => save(true)} disabled={saving} className="pill pill-primary shadow-lg" data-testid="page-publish"><Eye className="h-4 w-4" /> {saving ? "Saving…" : "Publish"}</button>
      </div>
    </div>
  );
}

export default function PagesPane() {
  const [rows, setRows] = useState(null);
  const [editing, setEditing] = useState(null);
  const load = () => api.get("/admin/pages").then(({ data }) => setRows(data)).catch(() => setRows([]));
  useEffect(() => { load(); }, []);

  const del = async (p) => {
    if (!window.confirm(`Delete “${p.title}”? This cannot be undone.`)) return;
    try { await api.delete(`/admin/pages/${p.id}`); invalidateSiteData("cms_pages"); toast.success("Page deleted"); load(); }
    catch { toast.error("Could not delete"); }
  };
  const togglePublish = async (p) => {
    try { await api.patch(`/admin/pages/${p.id}`, { published: !p.published }); invalidateSiteData("cms_pages"); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Could not update"); }
  };

  if (editing) return <Editor page={editing} onBack={() => setEditing(null)} onSaved={(p) => { setEditing(null); load(); return p; }} />;
  if (rows === null) return <Spinner />;
  return (
    <div className="space-y-5" data-testid="pages-pane">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow mb-1">Website</div>
          <h2 className="serif text-2xl sm:text-3xl">Custom pages</h2>
          <p className="text-[13px] text-[#6B7269] mt-1 max-w-2xl">Create and edit pages such as About us, Services or Packages — text, pictures, buttons, cards and FAQs — and choose whether they appear in the website menu, footer or the app menu. To change text and pictures on the built-in pages (homepage, programs…), use “Pages &amp; live editor”.</p>
        </div>
        <button onClick={() => setEditing({ ...EMPTY })} className="pill pill-primary" data-testid="pages-new"><Plus className="h-4 w-4" /> New page</button>
      </div>
      <ul className="space-y-3">
        {rows.map((p) => (
          <li key={p.id} className="rounded-2xl bg-white border border-[#E5E6DF] p-4 flex flex-wrap items-center gap-3" data-testid={`pages-row-${p.slug}`}>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-[15px]">{p.title}</div>
              <div className="text-[12px] text-[#6B7269]">/{p.slug} · {[p.show_in_header && "top menu", p.show_in_footer && "footer", p.show_in_app_menu && "app menu"].filter(Boolean).join(", ") || "not in menus"}</div>
            </div>
            <button onClick={() => togglePublish(p)} className={`rounded-full px-3 py-1 text-[11px] font-semibold ${p.published ? "bg-[#EEF1EC] text-[#5C7355]" : "bg-[#F2F2EC] text-[#6B7269]"}`}>
              {p.published ? <><Eye className="inline h-3 w-3 mr-1" />Published</> : <><EyeOff className="inline h-3 w-3 mr-1" />Draft</>}
            </button>
            {p.published && <a href={`/${p.slug}`} target="_blank" rel="noreferrer" className="pill pill-ghost !py-1.5 !px-3 !text-xs"><ExternalLink className="h-3.5 w-3.5" /> View</a>}
            <button onClick={() => setEditing(p)} className="pill pill-ghost !py-1.5 !px-3 !text-xs" data-testid={`pages-edit-${p.slug}`}>Edit</button>
            <button onClick={() => del(p)} className="text-[#B25A45] p-1.5" aria-label={`Delete ${p.title}`}><Trash2 className="h-4 w-4" /></button>
          </li>
        ))}
        {rows.length === 0 && <li className="text-sm text-[#6B7269]">No pages yet.</li>}
      </ul>
    </div>
  );
}
