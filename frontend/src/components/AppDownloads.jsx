import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Apple, Play, X, Clock } from 'lucide-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Dialog, DialogPortal, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { isNativeApp } from '@/lib/platform';
import { sessionRead, sessionWrite } from '@/lib/assistantApi';
import './appDownloads.css';

const OfferCountdown = ({ target, onExpire }) => {
  const [remaining, setRemaining] = useState(() => new Date(target).getTime() - Date.now());
  useEffect(() => {
    const id = setInterval(() => setRemaining(new Date(target).getTime() - Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);
  useEffect(() => { if (remaining <= 0) onExpire?.(); }, [remaining, onExpire]);
  if (remaining <= 0) return null;
  const s = Math.floor(remaining / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  const parts = d > 0 ? [[d, 'D'], [h, 'H'], [m, 'M']] : [[h, 'H'], [m, 'M'], [sec, 'S']];
  return (
    <div className="ty-offer-countdown" data-testid="app-download-countdown">
      <Clock size={14} /> <span>Ends in</span>
      {parts.map(([val, label]) => (
        <span key={label} className="ty-offer-unit"><b>{pad(val)}</b><i>{label}</i></span>
      ))}
    </div>
  );
};

const fields = [
  { key: 'app_store_url', store: 'App Store', platform: 'iPhone & iPad', Icon: Apple },
  { key: 'google_play_url', store: 'Google Play', platform: 'Android', Icon: Play },
];

export const StoreButtons = ({ settings, prefix }) => <div className="ty-store-buttons">
  {fields.map(({ key, store, platform, Icon }) => {
    const href = settings[key];
    const content = <><Icon size={23} aria-hidden="true" /><span><small>{href ? platform : 'Coming soon · Demo'}</small><strong>{store}</strong></span></>;
    return href ? <a key={key} href={href} target="_blank" rel="noopener noreferrer" aria-label={`Download for ${platform} on ${store} (opens a new tab)`} data-testid={`${prefix}-${key}`} className="ty-store-button">{content}</a>
      : <button key={key} disabled aria-label={`${store}: coming soon, demo only`} data-testid={`${prefix}-${key}`} className="ty-store-button ty-store-demo">{content}</button>;
  })}
</div>;

export const AppDownloads = () => {
  const { pathname } = useLocation();
  const [settings, setSettings] = useState(null), [open, setOpen] = useState(false);
  const eligible = !isNativeApp() && !/^\/(admin|instructor|login|register|reset-password|magic-link|checkout|library|certificate|privacy|terms|account-deletion)(\/|$)/.test(pathname);
  useEffect(() => {
    const load = () => api.get('/settings/public').then(({ data }) => setSettings(data)).catch(() => {});
    load(); window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, []);
  useEffect(() => {
    if (!eligible || settings?.download_popup_enabled === false) { setOpen(false); return; }
    if (sessionRead('ty_download_invited')) return;
    const rawDelay = Number(settings?.download_popup_delay_seconds);
    const delaySec = Number.isFinite(rawDelay) ? rawDelay : 30;
    const delayMs = delaySec > 0 ? Math.max(3, delaySec) * 1000 : 0;
    const onExit = settings?.download_popup_on_exit === true;
    let ready = false;
    const show = () => {
      if (!ready || document.hidden || document.body.dataset.assistantOpen === 'true' || document.querySelector('[role="dialog"]') || sessionRead('ty_download_invited')) return;
      sessionWrite('ty_download_invited', true); setOpen(true);
    };
    const timer = delayMs > 0 ? setTimeout(() => { ready = true; show(); }, delayMs) : null;
    const interval = setInterval(show, 1500);
    const exitHandler = (e) => { if (e.clientY <= 0) { ready = true; show(); } };
    if (onExit) document.addEventListener('mouseout', exitHandler);
    return () => { if (timer) clearTimeout(timer); clearInterval(interval); if (onExit) document.removeEventListener('mouseout', exitHandler); };
  }, [eligible, settings]);
  useEffect(() => {
    if (!eligible) return;
    const show = () => {
      if (settings?.download_popup_enabled === false) return;
      sessionWrite('ty_download_invited', true); setOpen(true);
    };
    window.addEventListener('tony-open-downloads', show);
    document.body.classList.add('ty-downloads-visible');
    return () => { window.removeEventListener('tony-open-downloads', show); document.body.classList.remove('ty-downloads-visible'); };
  }, [eligible, settings]);
  useEffect(() => {
    document.body.dataset.downloadOpen = open ? 'true' : 'false';
    if (open) window.dispatchEvent(new Event('tony-pause-assistant'));
    return () => { delete document.body.dataset.downloadOpen; };
  }, [open]);
  if (!eligible || !settings) return null;
  if (settings.download_popup_enabled === false) return null;
  const mode = settings.download_popup_mode === 'custom' ? 'custom' : 'app';
  const offerExpiry = settings.download_popup_offer_expiry;
  const expiryTs = offerExpiry ? new Date(offerExpiry).getTime() : NaN;
  const offerExpired = mode === 'custom' && Number.isFinite(expiryTs) && Date.now() > expiryTs;
  if (offerExpired) return null;
  const demo = !settings.app_store_url && !settings.google_play_url;
  const eyebrow = mode === 'custom' ? (settings.download_popup_eyebrow || 'SPECIAL OFFER') : 'YOUR PRACTICE. YOUR PACE.';
  const title = mode === 'custom' ? (settings.download_popup_title || 'A gift for you.') : 'Take Tony Yoga with you.';
  const description = mode === 'custom'
    ? (settings.download_popup_description || 'A little something from Tony to deepen your practice.')
    : 'Join us on the app. Your next moment on the mat is closer than you think.';
  const ctaLabel = settings.download_popup_cta_label || 'Learn more';
  const ctaUrl = settings.download_popup_cta_url || '';
  const popupImg = (mode === 'custom' && settings.download_popup_image_url) ? settings.download_popup_image_url : '/brand/logo.png';
  return <>
    {mode === 'app' && <aside aria-label="Download the Tony Yoga application" className={`ty-download-dock ${pathname === '/' ? '' : 'ty-download-dock-above-nav'}`} data-testid="app-download-dock"><StoreButtons settings={settings} prefix="floating-download" /></aside>}
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogPortal>
        <DialogPrimitive.Overlay className="ty-download-overlay" data-testid="app-download-overlay" />
        <DialogPrimitive.Content className="ty-download-dialog" data-testid="app-download-popup" data-mode={mode}>
          <DialogPrimitive.Close className="ty-download-close" aria-label="Close invitation" data-testid="app-download-close"><X size={21} /></DialogPrimitive.Close>
          <img src={popupImg} alt="Tony Yoga" className="ty-download-logo" data-testid="app-download-logo" />
          <span className="ty-download-eyebrow" data-testid="app-download-eyebrow">{eyebrow}</span>
          <DialogTitle className="ty-download-title serif" data-testid="app-download-title">{title}</DialogTitle>
          <DialogDescription className="ty-download-description" data-testid="app-download-description">{description}</DialogDescription>
          {mode === 'custom' ? <>
            {offerExpiry && <OfferCountdown target={offerExpiry} onExpire={() => setOpen(false)} />}
            {ctaUrl && <a href={ctaUrl} target="_blank" rel="noopener noreferrer" className="ty-store-button ty-download-custom-cta" data-testid="app-download-custom-cta" onClick={() => setOpen(false)}><span><strong>{ctaLabel}</strong></span></a>}
          </> : <>
            <StoreButtons settings={settings} prefix="popup-download" />
            {demo && <p className="ty-download-demo-note" data-testid="app-download-demo-note">App downloads are coming soon. You can enjoy Tony Yoga here in the meantime.</p>}
          </>}
          <DialogPrimitive.Close className="ty-download-continue" data-testid="app-download-continue">Continue on the website</DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  </>;
};