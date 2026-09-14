import { useEffect, useState } from 'react';
import { Smartphone, Save, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Field, inputCls, Toggle } from './shared';
import { ContentImageInput } from '@/components/ContentImageInput';

const KEYS = [
  'app_store_url', 'google_play_url',
  'download_popup_enabled', 'download_popup_mode',
  'download_popup_delay_seconds', 'download_popup_on_exit',
  'download_popup_eyebrow', 'download_popup_title', 'download_popup_description',
  'download_popup_cta_label', 'download_popup_cta_url', 'download_popup_image_url', 'download_popup_offer_expiry',
];

const isoToLocal = (iso) => { if (!iso) return ''; const d = new Date(iso); if (isNaN(d)) return ''; return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const localToIso = (local) => { if (!local) return ''; const d = new Date(local); return isNaN(d) ? '' : d.toISOString(); };

const DELAYS = [[10, '10 seconds'], [30, '30 seconds'], [60, '1 minute'], [0, 'On exit only']];

export const AppDownloadsSettings = () => {
  const [form, setForm] = useState(null), [saving, setSaving] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    api.get('/admin/settings').then(({ data }) => {
      const next = {};
      KEYS.forEach(k => {
        next[k] = data[k] ?? (
          k === 'download_popup_enabled' ? true :
          k === 'download_popup_mode' ? 'app' :
          k === 'download_popup_delay_seconds' ? 30 :
          k === 'download_popup_on_exit' ? false : ''
        );
      });
      setForm(next);
    }).catch(() => setError('Could not load pop-up settings.'));
  }, []);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const save = async event => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      await api.patch('/admin/settings', form);
      toast.success('Pop-up settings saved.');
    } catch (err) { setError(err.response?.data?.detail || 'Could not save. Please try again.'); }
    finally { setSaving(false); }
  };
  if (!form) return null;
  const isCustom = form.download_popup_mode === 'custom';
  // "On exit only" preset = delay 0 + on_exit true
  const delayPreset = (form.download_popup_on_exit && Number(form.download_popup_delay_seconds) === 0) ? 0 : Number(form.download_popup_delay_seconds);
  const pickDelay = (val) => {
    if (val === 0) { setForm(f => ({ ...f, download_popup_delay_seconds: 0, download_popup_on_exit: true })); }
    else { set('download_popup_delay_seconds', val); }
  };
  return <section className="rounded-2xl border border-[#E5E6DF] bg-white p-5 space-y-5" data-testid="settings-app-downloads">
    <div>
      <h2 className="flex items-center gap-2 text-base font-semibold"><Smartphone size={19} /> Pop-up &amp; app downloads</h2>
      <p className="text-xs text-[#6B7269] mt-1" data-testid="settings-app-downloads-description">Control the pop-up that greets visitors. Choose when it appears, turn it off, keep the app-download invitation, or swap it for your own offer.</p>
    </div>
    {error && <p role="alert" className="text-sm text-red-700" data-testid="settings-app-download-error">{error}</p>}

    <form onSubmit={save} className="space-y-5" data-testid="settings-app-download-form">
      {/* Master enable */}
      <div className="flex items-center justify-between rounded-2xl bg-[#F7F7F2] border border-[#E5E6DF] px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-[#1C221F]">Show the pop-up</div>
          <div className="text-[11px] text-[#6B7269]">When off, no pop-up appears anywhere on the site.</div>
        </div>
        <Toggle checked={form.download_popup_enabled !== false} onChange={v => set('download_popup_enabled', v)} tid="settings-popup-enabled" />
      </div>

      {form.download_popup_enabled !== false && <>
        {/* Schedule window */}
        <Field label="When should it appear?">
          <div className="flex flex-wrap gap-2" data-testid="settings-popup-delay">
            {DELAYS.map(([val, label]) => (
              <button key={val} type="button" onClick={() => pickDelay(val)}
                data-testid={`settings-popup-delay-${val}`}
                className={`rounded-2xl border px-4 py-2.5 text-sm font-semibold transition ${delayPreset === val ? 'border-[#B25A45] bg-[#FBF1EE] text-[#B25A45]' : 'border-[#E5E6DF] text-[#545E56]'}`}>
                {label}
              </button>
            ))}
          </div>
        </Field>
        <label className="flex items-center gap-2.5 text-[13px] text-[#545E56] cursor-pointer" data-testid="settings-popup-exit-row">
          <Toggle checked={form.download_popup_on_exit === true} onChange={v => set('download_popup_on_exit', v)} tid="settings-popup-on-exit" />
          Also show when the visitor is about to leave (exit-intent)
        </label>

        {/* Mode */}
        <Field label="What should the pop-up show?">
          <div className="flex gap-2" data-testid="settings-popup-mode">
            {[['app', 'App download'], ['custom', 'Custom offer']].map(([val, label]) => (
              <button key={val} type="button" onClick={() => set('download_popup_mode', val)}
                data-testid={`settings-popup-mode-${val}`}
                className={`flex-1 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition ${form.download_popup_mode === val ? 'border-[#B25A45] bg-[#FBF1EE] text-[#B25A45]' : 'border-[#E5E6DF] text-[#545E56]'}`}>
                {label}
              </button>
            ))}
          </div>
        </Field>

        {/* App-store links (app mode) */}
        {!isCustom && [['app_store_url', 'Apple App Store', 'https://apps.apple.com/'], ['google_play_url', 'Google Play', 'https://play.google.com/store/apps/details?id=']].map(([key, label, placeholder]) => (
          <Field key={key} label={label} hint="Leave empty to show “Coming soon · Demo”.">
            <input type="url" maxLength={2000} className={inputCls} placeholder={placeholder} value={form[key]} onChange={e => set(key, e.target.value)} data-testid={`settings-${key}`} />
            {form[key] && form[key].startsWith(placeholder.split('/store')[0]) && <a href={form[key]} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs mt-2 text-[#B25A45]" data-testid={`settings-preview-${key}`}>Check listing<ExternalLink size={12} /></a>}
          </Field>
        ))}

        {/* Custom offer fields */}
        {isCustom && <div className="rounded-2xl bg-[#F7F7F2] border border-[#E5E6DF] p-4 space-y-4">
          <Field label="Eyebrow (small label)"><input maxLength={60} className={inputCls} placeholder="SPECIAL OFFER" value={form.download_popup_eyebrow} onChange={e => set('download_popup_eyebrow', e.target.value)} data-testid="settings-popup-eyebrow" /></Field>
          <Field label="Title"><input maxLength={120} className={inputCls} placeholder="A gift for you." value={form.download_popup_title} onChange={e => set('download_popup_title', e.target.value)} data-testid="settings-popup-title" /></Field>
          <Field label="Description"><textarea maxLength={300} rows={3} className={inputCls} placeholder="Describe your offer…" value={form.download_popup_description} onChange={e => set('download_popup_description', e.target.value)} data-testid="settings-popup-description" /></Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Button text"><input maxLength={40} className={inputCls} placeholder="Claim offer" value={form.download_popup_cta_label} onChange={e => set('download_popup_cta_label', e.target.value)} data-testid="settings-popup-cta-label" /></Field>
            <Field label="Button link (URL)"><input type="url" maxLength={2000} className={inputCls} placeholder="https://…" value={form.download_popup_cta_url} onChange={e => set('download_popup_cta_url', e.target.value)} data-testid="settings-popup-cta-url" /></Field>
          </div>
          <ContentImageInput label="Offer image (optional)" tid="settings-popup-image" value={form.download_popup_image_url} onChange={v => set('download_popup_image_url', v)} />
          <Field label="Offer expiry (optional)" hint="Shows a live countdown; the offer stops appearing after this time.">
            <input type="datetime-local" className={inputCls} value={isoToLocal(form.download_popup_offer_expiry)} onChange={e => set('download_popup_offer_expiry', localToIso(e.target.value))} data-testid="settings-popup-expiry" />
          </Field>
        </div>}
      </>}

      <button disabled={saving} type="submit" className="pill pill-primary !text-sm" data-testid="settings-app-download-save"><Save size={16} />{saving ? 'Saving…' : 'Save pop-up settings'}</button>
    </form>
  </section>;
};
