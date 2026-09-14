import { ContentImageInput } from '@/components/ContentImageInput';
import { Switch } from '@/components/ui/switch';

export const FeaturedTestimonialForm = ({ value, onChange, disabled, onUploadState }) => {
  const set = (key, val) => onChange({ ...value, [key]: val });
  return <section className="space-y-4 border-t border-[#E5E6DF] pt-5" data-testid="featured-testimonial-form">
    <div className="flex items-center justify-between gap-3"><h2 className="serif text-lg">Featured student</h2>
      <label className="flex items-center gap-2 text-xs">Visible<Switch data-testid="featured-testimonial-enabled" checked={value.enabled !== false} onCheckedChange={v => set('enabled', v)} disabled={disabled} /></label>
    </div>
    {[['headline', 'Quote'], ['name', 'Student name'], ['role', 'Role / location'], ['video_url', 'Video link']].map(([key, label]) => <label key={key} className="block space-y-1 text-xs">{label}
      <input className="w-full min-w-0 rounded-xl border border-[#E5E6DF] px-3 py-2 text-sm" data-testid={`featured-testimonial-${key.replaceAll('_', '-')}`} value={value[key] || ''} disabled={disabled} onChange={e => set(key, e.target.value)} />
    </label>)}
    <ContentImageInput tid="featured-testimonial-poster" label="Cover image" value={value.poster_url} onChange={v => set('poster_url', v)} disabled={disabled} onUploadState={onUploadState} />
  </section>;
};