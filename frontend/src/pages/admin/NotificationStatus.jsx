import { useEffect, useState } from 'react';
import { Bell, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';

export const NotificationStatus = ({ onLoad }) => {
  const [status, setStatus] = useState(null), [error, setError] = useState('');
  const load = async () => {
    setError('');
    try { const { data } = await api.get('/admin/notifications/status'); setStatus(data); onLoad?.(data); }
    catch { setError('Could not check notification status.'); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <section className="rounded-2xl border border-[#E5E6DF] bg-white p-5 space-y-3" data-testid="admin-notification-status">
    <div className="flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-base font-semibold"><Bell size={18} /> Notification channels</h2><button onClick={load} type="button" title="Refresh status" aria-label="Refresh notification status" data-testid="notification-status-refresh"><RefreshCw size={16} /></button></div>
    {error && <p role="alert" data-testid="notification-status-error">{error}</p>}
    {!status && !error && <p data-testid="notification-status-loading">Checking…</p>}
    {status && <div className="space-y-3 text-sm">
      <p className="flex flex-wrap justify-between gap-2" data-testid="notification-inapp-status"><span>In-app notification center</span><strong className="text-[#3e7651]">Available</strong></p>
      <p className="flex flex-wrap justify-between gap-2" data-testid="notification-web-status"><span>Browser push</span><strong>{status.web_push.ready ? 'Configured' : 'Not enabled / setup required'}</strong></p>
      <p className="text-xs text-[#6b7269]" data-testid="notification-subscriber-count">{status.web_push.subscribers} subscribed browser devices. Configuration does not confirm delivery.</p>
      <p className="flex flex-wrap justify-between gap-2" data-testid="notification-android-status"><span>Native Android push</span><strong>FCM setup required</strong></p>
      <p className="flex flex-wrap justify-between gap-2" data-testid="notification-ios-status"><span>Native iOS push</span><strong>APNs setup required</strong></p>
      <p className="text-xs text-[#6b7269] leading-relaxed" data-testid="notification-native-note">Native app push is not connected in this workspace. App-store links do not enable phone notifications.</p>
    </div>}
  </section>;
};