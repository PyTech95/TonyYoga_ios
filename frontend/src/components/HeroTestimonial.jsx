import { useEffect, useState } from 'react';
import { Quote } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { isYouTube, youTubeEmbed } from '@/lib/youtube';
import { contentImageUrl } from './ContentImageInput';

export default function HeroTestimonial() {
  const { t } = useTranslation();
  const [cfg, setCfg] = useState(null);
  useEffect(() => { api.get('/settings/public').then(({ data }) => setCfg(data.hero_testimonial)).catch(() => {}); }, []);
  if (!cfg || cfg.enabled === false) return null;
  let embed = '';
  if (isYouTube(cfg.video_url || '')) embed = youTubeEmbed(cfg.video_url);
  else {
    const match = (cfg.video_url || '').match(/^https:\/\/(?:www\.)?vimeo\.com\/(\d+)/);
    if (match) embed = `https://player.vimeo.com/video/${match[1]}`;
  }
  return <section className="mx-auto max-w-6xl px-4 sm:px-6 py-14 sm:py-20 lg:py-24" data-testid="hero-testimonial">
    <div className="grid lg:grid-cols-5 gap-6 lg:gap-10 items-center">
      <div className="lg:col-span-3 relative aspect-[9/16] sm:aspect-video max-w-md sm:max-w-none mx-auto w-full rounded-2xl sm:rounded-3xl overflow-hidden bg-[#1C221F]">
        {cfg.video_url ? (embed ? <iframe data-cms="hero_testimonial:video_url" data-testid="hero-testimonial-video" data-video-source={cfg.video_url} src={embed} title="Student testimonial" allow="fullscreen; picture-in-picture" allowFullScreen className="absolute inset-0 h-full w-full" />
          : <video data-cms="hero_testimonial:video_url" data-testid="hero-testimonial-video" src={contentImageUrl(cfg.video_url)} poster={contentImageUrl(cfg.poster_url)} controls playsInline preload="metadata" className="absolute inset-0 h-full w-full object-contain" />)
          : <>
            {cfg.poster_url ? <img data-cms="hero_testimonial:poster_url" data-testid="hero-testimonial-poster" src={contentImageUrl(cfg.poster_url)} alt={cfg.name} className="absolute inset-0 h-full w-full object-cover" />
              : <div data-cms="hero_testimonial:poster_url" data-testid="hero-testimonial-poster" data-editor-image="true" className="absolute inset-0 h-full w-full bg-cover bg-center" />}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#1C221F]/85 via-[#1C221F]/20 to-transparent" />
            <div className="pointer-events-none absolute bottom-4 left-4 right-4 text-[#FAFAF7]"><div className="eyebrow !text-[#E5E6DF] !text-[10px]" data-testid="featured-video-coming">{t('ht.coming')}</div><div className="serif text-lg sm:text-xl mt-1" data-testid="featured-video-caption">{t('ht.filmed')}</div></div>
          </>}
      </div>
      <div className="lg:col-span-2 min-w-0">
        <Quote className="h-6 w-6 text-[#B25A45] mb-3" />
        <blockquote data-cms="hero_testimonial:headline" className="serif text-2xl sm:text-3xl leading-tight text-[#1C221F] break-words" data-testid="hero-testimonial-quote">{cfg.headline}</blockquote>
        <div className="mt-6 pt-4 border-t border-[#E5E6DF]">
          <div data-cms="hero_testimonial:name" className="text-sm font-semibold break-words" data-testid="hero-testimonial-name">{cfg.name}</div>
          <div data-cms="hero_testimonial:role" className="text-xs text-[#6B7269] mt-0.5 break-words" data-testid="hero-testimonial-role">{cfg.role}</div>
          {!cfg.video_url && <a data-cms="hero_testimonial:video_url" data-editor-empty="true" data-testid="featured-video-add" hidden href="" className="mt-3 text-sm text-[#B25A45]">Student video link</a>}
        </div>
      </div>
    </div>
  </section>;
}