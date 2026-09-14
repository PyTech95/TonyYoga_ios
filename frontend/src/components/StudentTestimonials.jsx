import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { contentImageUrl } from './ContentImageInput';

export const StudentTestimonials = () => {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  useEffect(() => { api.get('/settings/public').then(({ data }) => setItems(data.testimonials || [])).catch(() => {}); }, []);
  if (!items.length) return null;
  return <section id="testimonials" className="bg-[#F2F2EC] py-14 sm:py-20 lg:py-24">
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <div className="max-w-lg mb-8 sm:mb-12"><div className="eyebrow mb-3" data-testid="testimonials-eyebrow">{t('tst.eyebrow')}</div><h2 className="serif text-3xl sm:text-4xl leading-tight" data-testid="testimonials-heading">{t('tst.title')}</h2></div>
      <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6" data-testid="marketing-testimonials">
        {items.map(tm => <li key={tm.id} className="rounded-2xl sm:rounded-3xl bg-[#FAFAF7] p-6 sm:p-8 flex flex-col min-w-0" data-testid={`student-testimonial-${tm.id}`}>
          <div className="serif text-4xl text-[#B25A45] leading-none" aria-hidden="true">“</div>
          <p data-cms={`testimonials:${tm.id}:quote`} data-testid={`student-quote-${tm.id}`} className="text-[15px] text-[#1C221F] leading-relaxed mt-3 flex-1 break-words">{tm.quote}</p>
          <div className="mt-6 pt-4 border-t border-[#E5E6DF] flex items-center gap-3">
            {tm.photo ? <img data-cms={`testimonials:${tm.id}:photo`} data-testid={`student-photo-${tm.id}`} src={contentImageUrl(tm.photo)} alt={tm.author} className="h-11 w-11 rounded-full object-cover shrink-0" loading="lazy" />
              : <div data-cms={`testimonials:${tm.id}:photo`} data-editor-image="true" data-testid={`student-photo-${tm.id}`} className="h-11 w-11 rounded-full bg-[#E5E6DF] shrink-0 flex items-center justify-center">{tm.author?.[0] || '•'}</div>}
            <div className="min-w-0">
              <div data-cms={`testimonials:${tm.id}:author`} data-testid={`student-name-${tm.id}`} className="text-sm font-semibold break-words">{tm.author}</div>
              <div data-cms={`testimonials:${tm.id}:role`} data-testid={`student-role-${tm.id}`} className="text-xs text-[#6B7269] mt-0.5 break-words">{tm.role}</div>
            </div>
          </div>
          <a data-cms={`testimonials:${tm.id}:video_url`} data-testid={`student-video-${tm.id}`} data-editor-empty={!tm.video_url || undefined} hidden={!tm.video_url} href={tm.video_url || ''} target="_blank" rel="noopener noreferrer" className="text-sm text-[#B25A45] font-semibold mt-4">Watch student video →</a>
        </li>)}
      </ul>
    </div>
  </section>;
};