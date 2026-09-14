import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, RefreshCw, Save, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { collectContentFields } from '@/lib/liveEditorDom';
import { ContentImageInput } from '@/components/ContentImageInput';

const ROUTES = [['/', 'Homepage'], ['/home', 'Member home'], ['/teacher-training', 'Teacher training'], ['/programs', 'Programs'], ['/schedule', 'Class schedule'], ['/private-sessions', 'Private sessions'], ['/memberships', 'Memberships'], ['/workshops', 'Retreats'], ['/shop', 'Shop'], ['/asanas', 'Asana index'], ['/meditations', 'Meditation'], ['/challenges', 'Challenges'], ['/find-your-path', 'Find your path'], ['/news', 'News'], ['/broadcasts', 'Broadcasts'], ['/passes', 'Passes'], ['/support', 'Support'], ['/privacy', 'Privacy'], ['/terms', 'Terms'], ['/account-deletion', 'Account deletion']];
export default function WebsiteContentPane() {
  const [route, setRoute] = useState('/');
  const [fields, setFields] = useState([]);
  const [changes, setChanges] = useState({});
  const [search, setSearch] = useState('');
  const [section, setSection] = useState('all');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploads, setUploads] = useState({});
  const uploading = Object.values(uploads).some(Boolean);
  const [revision, setRevision] = useState(0);
  const frame = useRef(null), timer = useRef(null), generation = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const load = () => {
    const version = generation.current;
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const list = collectContentFields(frame.current.contentDocument);
        const { data } = await api.get('/editor/overrides', { params: { route, mode: 'draft' } });
        if (version !== generation.current) return;
        const edits = new Map(data.overrides.map(o => [o.selector, o.props]));
        setFields(list.map(field => ({ ...field, props: { ...field.props, ...edits.get(field.selector) } })));
        if (!list.length) setError('No editable content loaded. Please reload this page.');
      } catch { setError('Could not load page content.'); }
      finally { setLoading(false); }
    }, 1600);
  };
  const refresh = () => { generation.current += 1; setLoading(true); setError(''); setChanges({}); setFields([]); setRevision(v => v + 1); };
  const set = (selector, key, value) => { setError(''); setChanges(prev => ({ ...prev, [selector]: { ...prev[selector], [key]: value } })); };
  const save = async (publish) => {
    setBusy(true); setError('');
    try {
      for (const [selector, props] of Object.entries(changes)) {
        await api.put('/editor/override', { route, selector, kind: fields.find(f => f.selector === selector).kind, props });
      }
      if (publish) await api.post('/editor/publish', { route });
      toast.success(publish ? 'Page content published' : 'Draft saved');
      refresh();
    } catch (e) { setError(typeof e.response?.data?.detail === 'string' ? e.response.data.detail : 'Could not save page content.'); }
    finally { setBusy(false); }
  };
  const discard = async () => {
    setBusy(true);
    try { await api.post('/editor/discard', { route }); refresh(); toast.success('Draft discarded'); }
    catch { setError('Could not discard draft.'); }
    finally { setBusy(false); }
  };
  return <div className="space-y-5 min-w-0" data-testid="website-content-pane">
    <header className="flex flex-wrap justify-between gap-3 items-center"><h2 className="serif text-lg">Website content</h2><Link to={`${route}?edit=1`} data-testid="content-open-live-editor" className="pill pill-ghost !text-xs"><ExternalLink size={14} /> Live editor</Link></header>
    <div className="flex flex-wrap gap-2">
      <select value={route} disabled={busy || Object.keys(changes).length > 0} onChange={e => { setRoute(e.target.value); setSection('all'); refresh(); }} data-testid="content-page-select" aria-label="Page" className="max-w-full rounded-xl border px-3 py-2 text-sm">{ROUTES.map(([url, label]) => <option value={url} key={url}>{label}</option>)}</select>
      <button onClick={refresh} disabled={busy} data-testid="content-reload" className="pill pill-ghost !px-3" title="Reload content"><RefreshCw size={16} /></button>
      <button onClick={() => save(false)} disabled={busy || uploading || loading || !Object.keys(changes).length} data-testid="content-save-draft" className="pill pill-ghost !text-xs"><Save size={14} /> Save draft</button>
      <button onClick={() => save(true)} disabled={busy || uploading || loading || !fields.length} data-testid="content-publish" className="pill pill-primary !text-xs"><Upload size={14} /> Publish</button>
      <button onClick={discard} disabled={busy || loading} data-testid="content-discard" className="pill pill-ghost !text-xs">Discard draft</button>
    </div>
    <div className="flex flex-wrap gap-2">
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search content…" data-testid="content-search" aria-label="Search content" className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm" />
      <select value={section} onChange={e => setSection(e.target.value)} data-testid="content-section-select" aria-label="Section" className="max-w-full rounded-xl border px-3 py-2 text-sm"><option value="all">All sections</option>{[...new Set(fields.map(f => f.section))].map(s => <option key={s}>{s}</option>)}</select>
    </div>
    {error && <p role="alert" data-testid="content-error" className="text-sm text-red-700">{error}</p>}
    <p data-testid="content-status" className="text-xs text-[#6B7269]">{loading ? 'Loading page content…' : `${fields.length} editable elements · ${Object.keys(changes).length} unsaved`}</p>
    <iframe ref={frame} key={`${route}-${revision}`} src={`${route}?content-frame=1`} title="Content source" data-testid="content-source-frame" className="hidden" onLoad={load} />
    {!loading && <div className="space-y-4">
      {fields.map((field, i) => {
        if ((section !== 'all' && section !== field.section) || !`${field.label} ${field.selector}`.toLowerCase().includes(search.toLowerCase())) return null;
        const props = { ...field.props, ...changes[field.selector] };
        return <div key={field.selector} className="rounded-xl border border-[#E5E6DF] bg-white p-4 min-w-0 space-y-3" data-testid={`content-item-${i}`}>
          <div className="text-xs text-[#6B7269] break-words" data-testid={`content-label-${i}`}>{field.section} · {field.label}</div>
          {props.text != null && <textarea aria-label="Text" rows={2} value={props.text} disabled={busy} onChange={e => set(field.selector, 'text', e.target.value)} data-testid={`content-text-${i}`} className="w-full rounded-lg border p-2 text-sm" />}
          {field.kind === 'image' && <ContentImageInput tid={`content-image-${i}`} value={props.src} onChange={v => set(field.selector, 'src', v)} disabled={busy} onUploadState={v => setUploads(prev => ({ ...prev, [field.selector]: v }))} />}
          {['href', 'alt', 'poster', ...(field.kind === 'video' ? ['src'] : [])].filter(key => props[key] != null).map(key => <label key={key} className="block text-xs space-y-1">{key === 'href' ? 'Link URL' : key === 'src' ? 'Video URL' : key === 'alt' ? 'Image description' : 'Poster URL'}<input value={props[key]} disabled={busy} onChange={e => set(field.selector, key, e.target.value)} data-testid={`content-${key}-${i}`} className="w-full min-w-0 rounded-lg border p-2 text-sm" /></label>)}
        </div>;
      })}
    </div>}
  </div>;
}