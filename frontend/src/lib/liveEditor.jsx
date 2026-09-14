/* Live visual editor.
 * - Applies PUBLISHED content overrides for every visitor (text, colours, images, links).
 * - For admins, adds an inline edit mode: click any element to edit its text,
 *   text/background colour, image, or button label/link. Saves to a draft,
 *   preview it, then publish. Per-page comments for team collaboration.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { createPortal } from "react-dom";
import {
  Pencil, Eye, EyeOff, UploadCloud, MessageSquare, Check, Trash2, X,
  Rocket, Undo2, Type, Palette, Link2, ImageIcon, CheckCircle2, Loader2,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { isNativeApp } from "@/lib/platform";
import { toast } from "sonner";
import { readElement, applyOne, directText } from './liveEditorDom';

/* ---------- selector + colour helpers ---------- */
function rgbToHex(rgb) {
  if (!rgb) return "#000000";
  if (rgb.startsWith("#")) return rgb;
  const m = rgb.match(/\d+/g);
  if (!m || m.length < 3) return "#000000";
  return "#" + m.slice(0, 3).map((n) => (+n).toString(16).padStart(2, "0")).join("");
}

/* ---------- component ---------- */
export default function LiveEditor() {
  const { user } = useAuth();
  const loc = useLocation();
  const route = loc.pathname;
  const isAdmin = user?.role === "admin" && !isNativeApp() && !route.startsWith('/admin') && window.self === window.top;

  const [editMode, setEditMode] = useState(false);
  const [preview, setPreview] = useState(false);
  const [overrides, setOverrides] = useState([]);
  const [selected, setSelected] = useState(null); // {selector, kind, props, el}
  const [pending, setPending] = useState(0);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const saveQueue = useRef(Promise.resolve());
  const saveCount = useRef(0);
  const imageUploading = useRef(false);
  const failedSaves = useRef(new Set());

  const overridesRef = useRef([]);
  const observerRef = useRef(null);
  const selectedElRef = useRef(null);

  const draftView = isAdmin && (editMode || preview);
  const mode = draftView ? "draft" : "published";

  useEffect(() => {
    setSelected(null);
    setEditMode(isAdmin && new URLSearchParams(loc.search).get('edit') === '1');
    setPreview(false);
  }, [route, isAdmin, loc.search]);

  useEffect(() => {
    const followEditedLink = e => {
      if (editMode || e.defaultPrevented || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      const link = e.target.closest?.('a[data-editor-href]');
      if (!link || link.closest('[data-ty-editor]') || link.target === '_blank') return;
      e.preventDefault(); e.stopPropagation();
      window.location.assign(link.dataset.editorHref);
    };
    document.addEventListener('click', followEditedLink, true);
    return () => document.removeEventListener('click', followEditedLink, true);
  }, [editMode]);

  /* fetch overrides for current route + mode */
  const loadOverrides = useCallback(async () => {
    try {
      const { data } = await api.get("/editor/overrides", { params: { route, mode } });
      setOverrides(data.overrides || []);
      overridesRef.current = data.overrides || [];
    } catch {
      setOverrides([]); overridesRef.current = [];
    }
  }, [route, mode]);

  const loadPending = useCallback(async () => {
    if (!isAdmin) return;
    try { const { data } = await api.get("/editor/status"); setPending(data.pending_total || 0); } catch {}
  }, [isAdmin]);

  useEffect(() => { loadOverrides(); }, [loadOverrides]);
  useEffect(() => { loadPending(); }, [loadPending, editMode]);

  /* apply overrides to the DOM, resilient to async page renders */
  useEffect(() => {
    if (typeof document === "undefined") return;
    let raf;
    const apply = () => {
      const list = overridesRef.current;
      if (!list.length) return;
      const obs = observerRef.current;
      if (obs) obs.disconnect();
      list.forEach((o) => {
        try { document.querySelectorAll(o.selector).forEach((el) => applyOne(el, o.kind, o.props)); } catch {}
      });
      if (obs && document.body) obs.observe(document.body, { childList: true, subtree: true });
    };
    const debounced = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(apply); };
    const obs = new MutationObserver(debounced);
    observerRef.current = obs;
    apply();
    if (document.body) obs.observe(document.body, { childList: true, subtree: true });
    const timers = [200, 600, 1200, 2500].map((t) => setTimeout(apply, t));
    return () => { obs.disconnect(); timers.forEach(clearTimeout); cancelAnimationFrame(raf); };
  }, [overrides, route]);

  /* edit-mode: hover outline + click to select */
  useEffect(() => {
    if (!isAdmin || !editMode || preview) return;
    document.body.classList.add("ty-edit-mode");
    let hover = null;
    const inPanel = (t) => t && t.closest && t.closest("[data-ty-editor]");
    const onOver = (e) => { if (inPanel(e.target)) return; if (hover) hover.classList.remove("ty-hover"); hover = e.target; hover.classList.add("ty-hover"); };
    const onOut = (e) => { if (e.target.classList) e.target.classList.remove("ty-hover"); };
    const onClick = (e) => {
      if (inPanel(e.target)) return;
      e.preventDefault(); e.stopPropagation();
      if (imageUploading.current) return;
      selectElement(e.target);
    };
    document.addEventListener("mouseover", onOver, true);
    document.addEventListener("mouseout", onOut, true);
    document.addEventListener("click", onClick, true);
    return () => {
      document.body.classList.remove("ty-edit-mode");
      document.removeEventListener("mouseover", onOver, true);
      document.removeEventListener("mouseout", onOut, true);
      document.removeEventListener("click", onClick, true);
      if (hover) hover.classList.remove("ty-hover");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, editMode, preview]);

  const clearSelectionOutline = () => {
    if (selectedElRef.current) selectedElRef.current.classList.remove("ty-selected");
  };

  const selectElement = (el) => {
    if (el.closest('svg')) el = el.closest('a,button') || el.closest('svg').parentElement;
    if (!directText(el) && !el.dataset.cms && !['IMG', 'VIDEO', 'IFRAME'].includes(el.tagName)) el = el.querySelector('img,video,iframe') || el;
    clearSelectionOutline();
    const element = readElement(el);
    const { selector } = element;
    if (!selector) return;
    const cs = window.getComputedStyle(el);
    const props = {
      ...element.props,
      color: rgbToHex(cs.color),
      backgroundColor: rgbToHex(cs.backgroundColor),
    };
    el.classList.add("ty-selected");
    selectedElRef.current = el;
    setSelected({ ...element, props });
    setShowComments(false);
  };

  /* persist one property to the draft + live-apply */
  const saveProp = async (key, value) => {
    if (!selected) return;
    const target = selected;
    saveCount.current += 1;
    setSaving(true);
    setSelected((s) => s?.selector === target.selector ? { ...s, props: { ...s.props, [key]: value } } : s);
    if (selectedElRef.current) applyOne(selectedElRef.current, selected.kind, { [key]: value });
    const work = async () => {
    try {
      await api.put("/editor/override", {
        route, selector: target.selector, kind: target.kind, props: { [key]: value },
      });
      // merge into local overrides list
      setOverrides((list) => {
        const idx = list.findIndex((o) => o.selector === target.selector);
        const merged = idx >= 0 ? { ...list[idx], props: { ...list[idx].props, [key]: value }, has_draft: true }
                                : { selector: target.selector, kind: target.kind, props: { [key]: value }, has_draft: true };
        const copy = idx >= 0 ? [...list] : [...list, merged];
        if (idx >= 0) copy[idx] = merged;
        overridesRef.current = copy;
        return copy;
      });
      loadPending();
      failedSaves.current.delete(`${target.selector}:${key}`);
      setSaveError(failedSaves.current.size > 0);
      return true;
    } catch {
      failedSaves.current.add(`${target.selector}:${key}`);
      setSaveError(true);
      toast.error("Couldn't save that change");
      return false;
    } finally { saveCount.current -= 1; if (!saveCount.current && !imageUploading.current) setSaving(false); }
    };
    saveQueue.current = saveQueue.current.then(work, work);
    return saveQueue.current;
  };

  const resetElement = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await saveQueue.current;
      await api.delete("/editor/override", { data: { route, selector: selected.selector } });
      toast.success("Reverted — reloading");
      setTimeout(() => window.location.reload(), 500);
    } catch { toast.error("Reset failed"); }
    finally { setBusy(false); }
  };

  const onUpload = async (file) => {
    if (!file) return;
    imageUploading.current = true;
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/admin/uploads", fd, { headers: { "Content-Type": "multipart/form-data" } });
      if (await saveProp("src", data.url)) toast.success("Image updated");
    } catch { toast.error("Upload failed"); }
    finally { imageUploading.current = false; if (!saveCount.current) setSaving(false); }
  };

  const publishPage = async () => {
    setBusy(true);
    try {
      await saveQueue.current;
      if (failedSaves.current.size) { toast.error('Some changes were not saved. Please retry them before publishing.'); return; }
      const { data } = await api.post("/editor/publish", { route });
      toast.success(`Published ${data.published} change${data.published === 1 ? "" : "s"}`);
      setEditMode(false); setPreview(false); setSelected(null); clearSelectionOutline();
      loadPending();
      window.location.assign(route + loc.hash);
    } catch (e) { toast.error(typeof e.response?.data?.detail === 'string' ? e.response.data.detail : "Publish failed"); }
    finally { setBusy(false); }
  };

  const discardPage = async () => {
    setBusy(true);
    try {
      await saveQueue.current;
      await api.post("/editor/discard", { route });
      toast.success("Draft changes discarded");
      setSelected(null); clearSelectionOutline();
      setTimeout(() => window.location.reload(), 400);
    } catch { toast.error("Discard failed"); }
    finally { setBusy(false); }
  };

  /* comments */
  const loadComments = useCallback(async () => {
    try { const { data } = await api.get("/editor/comments", { params: { route } }); setComments(data || []); } catch {}
  }, [route]);
  useEffect(() => { if (showComments) loadComments(); }, [showComments, loadComments]);

  const addComment = async () => {
    const text = newComment.trim();
    if (!text) return;
    try {
      await api.post("/editor/comments", { route, selector: selected?.selector || null, text });
      setNewComment(""); loadComments();
    } catch { toast.error("Couldn't add comment"); }
  };
  const toggleResolve = async (id) => { try { await api.post(`/editor/comments/${id}/resolve`); loadComments(); } catch {} };
  const delComment = async (id) => { try { await api.delete(`/editor/comments/${id}`); loadComments(); } catch {} };

  if (!isAdmin) return null;

  const openComments = () => { setSelected(null); clearSelectionOutline(); setShowComments(true); };

  return createPortal(
    <div data-ty-editor="true">
      {/* Floating toolbar */}
      <div className="ty-le-toolbar" data-testid="live-editor-toolbar">
        {!editMode && !preview ? (
          <button className="ty-le-btn ty-le-primary" data-testid="live-editor-enter" onClick={() => setEditMode(true)}>
            <Pencil size={15} /> Edit page
          </button>
        ) : (
          <>
            <button className="ty-le-btn" data-testid="live-editor-exit"
              disabled={busy || imageUploading.current} onClick={async () => { await saveQueue.current; if (!failedSaves.current.size) window.location.assign(route + loc.hash); }}>
              <X size={15} /> Exit
            </button>
            <button className={`ty-le-btn ${preview ? "ty-le-on" : ""}`} data-testid="live-editor-preview"
              onClick={() => { setPreview((p) => !p); setSelected(null); clearSelectionOutline(); }}>
              {preview ? <EyeOff size={15} /> : <Eye size={15} />} {preview ? "Editing" : "Preview"}
            </button>
            <button className="ty-le-btn" data-testid="live-editor-comments" onClick={openComments}>
              <MessageSquare size={15} /> Notes
            </button>
            <button className="ty-le-btn ty-le-danger" data-testid="live-editor-discard" onClick={discardPage} disabled={busy || imageUploading.current}>
              <Undo2 size={15} /> Discard
            </button>
            <button className="ty-le-btn ty-le-primary" data-testid="live-editor-publish" onClick={publishPage} disabled={busy || imageUploading.current || saveError}>
              {busy ? <Loader2 size={15} className="ty-spin" /> : <Rocket size={15} />} Publish
            </button>
          </>
        )}
        {pending > 0 && <span className="ty-le-badge" data-testid="live-editor-pending">{pending} draft{pending === 1 ? "" : "s"}</span>}
      </div>

      {/* Edit hint */}
      {editMode && !preview && !selected && !showComments && (
        <div className="ty-le-hint" data-testid="live-editor-hint">Click any text, image or button to edit it</div>
      )}

      {/* Property panel */}
      {editMode && !preview && selected && (
        <div className="ty-le-panel" data-testid="live-editor-panel" key={selected.selector}>
          <div className="ty-le-panel-head">
            <span className="ty-le-kind">{selected.tag?.toLowerCase()} · {selected.kind}</span>
            <button className="ty-le-x" data-testid="live-editor-close-panel" onClick={() => { setSelected(null); clearSelectionOutline(); }}><X size={16} /></button>
          </div>

          {selected.props.text != null && !selected.hasChildren && (
            <label className="ty-le-field">
              <span><Type size={13} /> Text</span>
              <textarea data-testid="live-editor-text" value={selected.props.text}
                onChange={(e) => saveProp("text", e.target.value)} rows={3} />
            </label>
          )}
          {selected.hasChildren && selected.kind !== "image" && (
            <p className="ty-le-note">This block has nested items — click a more specific line to edit its text. You can still change colours below.</p>
          )}

          {selected.kind === "link" && (
            <label className="ty-le-field">
              <span><Link2 size={13} /> Link URL</span>
              <input data-testid="live-editor-href" type="text" value={selected.props.href || ""} onChange={e => setSelected(s => ({ ...s, props: { ...s.props, href: e.target.value } }))}
                onBlur={(e) => saveProp("href", e.target.value)} placeholder="/programs or https://…" />
            </label>
          )}

          {['image', 'video'].includes(selected.kind) && (
            <div className="ty-le-field">
              <span><ImageIcon size={13} /> Image</span>
              {selected.kind === 'image' && <label className="ty-le-upload" data-testid="live-editor-upload">
                <UploadCloud size={15} /> Upload new image
                <input data-testid="live-editor-upload-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => onUpload(e.target.files?.[0])} />
              </label>}
              <input data-testid="live-editor-image-url" className="ty-le-url" type="text" placeholder={selected.kind === 'video' ? 'Video URL' : 'Image URL'}
                value={selected.props.src || ""} onChange={e => setSelected(s => ({ ...s, props: { ...s.props, src: e.target.value } }))} onBlur={(e) => saveProp("src", e.target.value)} />
              {selected.props.alt != null && <input data-testid="live-editor-image-alt" type="text" placeholder="Image description" value={selected.props.alt} onChange={e => setSelected(s => ({ ...s, props: { ...s.props, alt: e.target.value } }))} onBlur={e => saveProp('alt', e.target.value)} />}
              {selected.props.poster != null && <input data-testid="live-editor-video-poster" type="text" placeholder="Video poster URL" value={selected.props.poster} onChange={e => setSelected(s => ({ ...s, props: { ...s.props, poster: e.target.value } }))} onBlur={e => saveProp('poster', e.target.value)} />}
            </div>
          )}

          <label className="ty-le-field">
            <span><Palette size={13} /> Text colour</span>
            <div className="ty-le-color">
              <input data-testid="live-editor-color" type="color" value={selected.props.color || "#000000"}
                onChange={(e) => saveProp("color", e.target.value)} />
              <code>{selected.props.color}</code>
            </div>
          </label>

          <label className="ty-le-field">
            <span><Palette size={13} /> Background colour</span>
            <div className="ty-le-color">
              <input data-testid="live-editor-bg" type="color" value={selected.props.backgroundColor || "#ffffff"}
                onChange={(e) => saveProp("backgroundColor", e.target.value)} />
              <code>{selected.props.backgroundColor}</code>
            </div>
          </label>

          <div className="ty-le-panel-foot">
            {saving ? <span data-testid="live-editor-save-status" className="ty-le-saving"><Loader2 size={13} className="ty-spin" /> Saving…</span>
                    : <span data-testid="live-editor-save-status" className="ty-le-saved"><CheckCircle2 size={13} /> {saveError ? 'Not saved' : 'Draft saved'}</span>}
            <button className="ty-le-reset" data-testid="live-editor-reset" disabled={busy || imageUploading.current} onClick={resetElement}><Trash2 size={13} /> Revert</button>
          </div>
        </div>
      )}

      {/* Comments drawer */}
      {editMode && showComments && (
        <div className="ty-le-panel" data-testid="live-editor-comments-panel">
          <div className="ty-le-panel-head">
            <span className="ty-le-kind"><MessageSquare size={14} /> Page notes</span>
            <button className="ty-le-x" data-testid="live-editor-comments-close" onClick={() => setShowComments(false)}><X size={16} /></button>
          </div>
          <div className="ty-le-comments">
            {comments.length === 0 && <p className="ty-le-note">No notes yet. Leave one for your team.</p>}
            {comments.map((c) => (
              <div key={c.id} className={`ty-le-comment ${c.resolved ? "done" : ""}`} data-testid={`live-editor-comment-${c.id}`}>
                <div className="ty-le-comment-top">
                  <strong>{c.author_name || c.author}</strong>
                  <span>
                    <button title="Resolve" data-testid={`live-editor-comment-resolve-${c.id}`} onClick={() => toggleResolve(c.id)}><Check size={13} /></button>
                    <button title="Delete" data-testid={`live-editor-comment-delete-${c.id}`} onClick={() => delComment(c.id)}><Trash2 size={13} /></button>
                  </span>
                </div>
                <p>{c.text}</p>
              </div>
            ))}
          </div>
          <div className="ty-le-comment-add">
            <textarea data-testid="live-editor-comment-input" rows={2} value={newComment}
              onChange={(e) => setNewComment(e.target.value)} placeholder="Add a note for the team…" />
            <button className="ty-le-btn ty-le-primary" data-testid="live-editor-comment-send" onClick={addComment}>Post note</button>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
