import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Trash2, ArrowUp, ArrowDown, ExternalLink } from 'lucide-react';
import { api } from '@/lib/api';
import Spinner from '@/components/Spinner';
import { ContentImageInput } from '@/components/ContentImageInput';
import { FeaturedTestimonialForm } from './FeaturedTestimonialForm';

const input = 'w-full min-w-0 rounded-xl border border-[#E5E6DF] bg-white px-3 py-2 text-sm';
export default function TestimonialsPane() {
  const [items, setItems] = useState(null);
  const [featured, setFeatured] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uploads, setUploads] = useState({});
  const uploading = Object.values(uploads).some(Boolean);
  const uploadState = (id, active) => setUploads(prev => ({ ...prev, [id]: active }));
  const load = () => { setError(''); api.get('/admin/settings').then(({ data }) => { setItems(data.testimonials || []); setFeatured(data.hero_testimonial || {}); }).catch(() => setError('Could not load testimonials.')); };
  useEffect(load, []);
  const set = (id, key, value) => setItems(rows => rows.map(row => row.id === id ? { ...row, [key]: value } : row));
  const move = (i, delta) => setItems(rows => { const next = [...rows]; [next[i], next[i + delta]] = [next[i + delta], next[i]]; return next; });
  const save = async () => {
    setBusy(true); setError('');
    try {
      await api.patch('/admin/settings', { testimonials: items, hero_testimonial: featured });
      toast.success('Testimonials published');
    } catch (e) { setError(typeof e.response?.data?.detail === 'string' ? e.response.data.detail : 'Could not save testimonials.'); }
    finally { setBusy(false); }
  };
  if (items === null && !error) return <Spinner />;
  return <div className="space-y-6 min-w-0" data-testid="testimonials-pane">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="serif text-lg">Student testimonials</h2>
      <Link to="/?edit=1#testimonials" data-testid="testimonials-live-editor" className="pill pill-ghost !text-xs"><ExternalLink size={14} /> Live editor</Link>
    </header>
    {error && <div role="alert" data-testid="testimonials-error" className="text-sm text-red-700">{error}{items === null && <button onClick={load} data-testid="testimonials-retry" className="ml-3 underline">Retry</button>}</div>}
    {items !== null && <>
      <FeaturedTestimonialForm value={featured} onChange={setFeatured} disabled={busy} onUploadState={v => uploadState('featured', v)} />
      <section className="border-t border-[#E5E6DF] pt-6 space-y-4">
        <h2 className="serif text-lg">Student stories</h2>
        {!items.length && <p data-testid="testimonials-empty" className="text-sm text-[#6B7269]">No student stories published.</p>}
        <ul className="space-y-4" data-testid="testimonials-list">
          {items.map((it, i) => <li key={it.id} className="rounded-2xl border border-[#E5E6DF] bg-white p-4 space-y-3 min-w-0" data-testid={`testimonial-item-${i}`}>
            <div className="flex items-center justify-between gap-2">
              <span data-testid={`testimonial-position-${i}`} className="text-xs font-semibold">Student {i + 1}</span>
              <div className="flex gap-1">
                <button title="Move up" aria-label="Move up" disabled={busy || i === 0} onClick={() => move(i, -1)} data-testid={`testimonial-up-${i}`} className="p-2 disabled:opacity-30"><ArrowUp size={16} /></button>
                <button title="Move down" aria-label="Move down" disabled={busy || i === items.length - 1} onClick={() => move(i, 1)} data-testid={`testimonial-down-${i}`} className="p-2 disabled:opacity-30"><ArrowDown size={16} /></button>
                <button title="Remove testimonial" aria-label="Remove testimonial" disabled={busy} onClick={() => setItems(rows => rows.filter(row => row.id !== it.id))} data-testid={`testimonial-remove-${i}`} className="p-2 text-[#B25A45]"><Trash2 size={16} /></button>
              </div>
            </div>
            <label className="block text-xs space-y-1">Quote<textarea rows={3} className={input} data-testid={`testimonial-quote-${i}`} value={it.quote} disabled={busy} onChange={e => set(it.id, 'quote', e.target.value)} /></label>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block text-xs space-y-1">Student name<input className={input} data-testid={`testimonial-author-${i}`} value={it.author} disabled={busy} onChange={e => set(it.id, 'author', e.target.value)} /></label>
              <label className="block text-xs space-y-1">Role / location<input className={input} data-testid={`testimonial-role-${i}`} value={it.role} disabled={busy} onChange={e => set(it.id, 'role', e.target.value)} /></label>
            </div>
            <ContentImageInput tid={`testimonial-photo-${i}`} label="Student photo" value={it.photo} onChange={v => set(it.id, 'photo', v)} disabled={busy} onUploadState={v => uploadState(it.id, v)} />
            <label className="block text-xs space-y-1">Video link<input className={input} data-testid={`testimonial-video-${i}`} value={it.video_url || ''} disabled={busy} onChange={e => set(it.id, 'video_url', e.target.value)} placeholder="https://…" /></label>
          </li>)}
        </ul>
      </section>
      <div className="flex flex-wrap gap-3">
        <button disabled={busy} onClick={() => setItems(rows => [...rows, { id: crypto.randomUUID(), author: '', quote: '', role: '', photo: '', video_url: '' }])} data-testid="testimonial-add" className="pill pill-ghost"><Plus size={16} /> Add testimonial</button>
        <button disabled={busy || uploading} onClick={save} data-testid="testimonials-save" className="pill pill-primary">{busy ? 'Saving…' : uploading ? 'Uploading…' : 'Save & publish'}</button>
      </div>
    </>}
  </div>;
}