import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Users, Calendar, TrendingUp, Send, Check, X, CreditCard, Mail, Bell, Save, RefreshCw, History, BookOpen, Plus, ArrowLeft, Trash2, ChevronUp, ChevronDown, ChevronRight, Youtube, Play, Clock, Eye, EyeOff, ListPlus, Instagram, Wallet, ClipboardCheck, Package, GraduationCap, Award, MessageCircle, Video, Mic, LayoutDashboard, MountainSnow, Gift, Settings as SettingsIcon, Upload } from "lucide-react";
import { api, API_BASE } from "@/lib/api";
import Spinner from "@/components/Spinner";
import { NotificationStatus } from './NotificationStatus';
import { Field, inputCls } from "./shared";

function EpisodesManager() {
  const [eps, setEps] = useState(null);
  const empty = { title: "", description: "", media_type: "audio", media_url: "", cover_image: "", tags: "", series: "", publish_at: "", notify_push: true };
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const load = async () => {
    try { const { data } = await api.get("/admin/broadcasts"); setEps(data); } catch { setEps([]); }
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.title.trim() || !form.media_url.trim()) { toast.error("Title and media URL are required."); return; }
    setBusy(true);
    try {
      const payload = {
        title: form.title, description: form.description, media_type: form.media_type,
        media_url: form.media_url, cover_image: form.cover_image || undefined,
        tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        series: form.series || undefined,
        publish_at: form.publish_at ? new Date(form.publish_at).toISOString() : undefined,
        notify_push: form.notify_push,
      };
      await api.post("/admin/broadcasts", payload);
      toast.success(form.publish_at && new Date(form.publish_at) > new Date() ? "Episode scheduled." : "Episode published.");
      setForm(empty); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not save"); }
    finally { setBusy(false); }
  };

  const publishNow = async (id) => {
    try { await api.post(`/admin/broadcasts/${id}/publish`); toast.success("Published."); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const del = async (id) => {
    if (!window.confirm("Delete this episode?")) return;
    try { await api.delete(`/admin/broadcasts/${id}`); toast.success("Deleted."); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white border border-[#E5E6DF] p-5 space-y-4" data-testid="admin-episode-form">
        <div className="flex items-center gap-2 text-[#B25A45]"><Mic className="h-4 w-4" /><span className="eyebrow !text-[11px]">New episode</span></div>
        <Field label="Title"><input data-testid="episode-title" className={inputCls} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Breath & the nervous system" /></Field>
        <Field label="Type">
          <div className="flex gap-2">
            {["audio", "video"].map((m) => (
              <button key={m} type="button" onClick={() => set("media_type", m)} data-testid={`episode-type-${m}`}
                className={`pill !py-2 !px-4 !text-[13px] ${form.media_type === m ? "pill-primary" : "pill-ghost"}`}>{m === "audio" ? "Audio" : "Video"}</button>
            ))}
          </div>
        </Field>
        <Field label="Media URL" hint="YouTube link for video, or a direct .mp3/.mp4 URL.">
          <input data-testid="episode-url" className={inputCls} value={form.media_url} onChange={(e) => set("media_url", e.target.value)} placeholder="https://…" />
        </Field>
        <Field label="Description"><textarea data-testid="episode-desc" rows={2} className={inputCls} value={form.description} onChange={(e) => set("description", e.target.value)} /></Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Cover image URL (optional)"><input data-testid="episode-cover" className={inputCls} value={form.cover_image} onChange={(e) => set("cover_image", e.target.value)} placeholder="https://…" /></Field>
          <Field label="Tags (comma-separated)"><input data-testid="episode-tags" className={inputCls} value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder="philosophy, beginner" /></Field>
        </div>
        <Field label="Series / season (optional)" hint="Group episodes into a themed run, e.g. 'Foundations of Breath'.">
          <input data-testid="episode-series" className={inputCls} value={form.series} onChange={(e) => set("series", e.target.value)} placeholder="Series name" />
        </Field>
        <Field label="Schedule release (optional)" hint="Leave blank to publish immediately. Future time auto-publishes later.">
          <input data-testid="episode-schedule" type="datetime-local" className={inputCls} value={form.publish_at} onChange={(e) => set("publish_at", e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-[#545E56]">
          <input type="checkbox" data-testid="episode-notify" checked={form.notify_push} onChange={(e) => set("notify_push", e.target.checked)} className="h-4 w-4 accent-[#B25A45]" />
          Notify subscribers with a push when it goes live
        </label>
        <button onClick={create} disabled={busy} data-testid="episode-save" className="pill pill-primary w-full"><Plus className="h-4 w-4" /> {busy ? "Saving…" : "Save episode"}</button>
      </div>

      {eps === null ? <Spinner /> : eps.length === 0 ? (
        <p className="text-sm text-[#6B7269] py-4 text-center">No episodes yet.</p>
      ) : (
        <ul className="space-y-2" data-testid="admin-episodes-list">
          {eps.map((ep) => {
            const scheduled = !ep.is_published;
            return (
              <li key={ep.id} data-testid={`episode-row-${ep.id}`} className="rounded-2xl bg-white border border-[#E5E6DF] p-4 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold truncate">{ep.title}</div>
                  <div className="text-[11px] text-[#6B7269] mt-0.5 uppercase tracking-widest">{ep.media_type} · {scheduled ? `scheduled ${new Date(ep.publish_at).toLocaleString()}` : `live ${new Date(ep.publish_at).toLocaleDateString()}`}</div>
                </div>
                {scheduled && <button onClick={() => publishNow(ep.id)} data-testid={`episode-publish-${ep.id}`} className="pill pill-ghost !py-1.5 !px-3 !text-xs">Publish now</button>}
                <button onClick={() => del(ep.id)} data-testid={`episode-delete-${ep.id}`} className="text-[#B25A45] hover:text-[#8f4436] shrink-0"><Trash2 className="h-4 w-4" /></button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function BroadcastPane() {
  const [deliveryStatus, setDeliveryStatus] = useState(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState("all");
  const [sending, setSending] = useState(false);

  const send = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      const { data } = await api.post("/admin/push/broadcast", { title, body, audience });
      if (!data.total_subscriptions) toast.info('No subscribed browser devices yet. Nothing was sent.');
      else if (data.sent === 0) toast.error(`No notifications accepted. ${data.failed} failed; please check push settings.`);
      else if (data.failed) toast.warning(`Accepted by push service: ${data.sent}. Failed: ${data.failed}.`);
      else toast.success(`Accepted by push service for ${data.sent} browser device${data.sent === 1 ? "" : "s"}.`);
      setTitle(""); setBody("");
    } catch (e) { toast.error(e?.response?.data?.detail || "Broadcast failed"); }
    finally { setSending(false); }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="eyebrow mb-2">Podcast & talks</div>
        <EpisodesManager />
      </div>
      <div>
        <div className="eyebrow mb-2">Send browser push notification</div>
        <NotificationStatus onLoad={setDeliveryStatus} />
        {deliveryStatus && !deliveryStatus.web_push.ready && <p className="text-sm text-[#975440] my-3" data-testid="broadcast-not-configured">Browser push is not enabled. Open Settings → Class reminders to configure it. Native phone push needs separate setup.</p>}
        <form onSubmit={send} className="rounded-2xl bg-white border border-[#E5E6DF] p-5 space-y-3">
          <input
            data-testid="admin-broadcast-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="Title"
            className="w-full rounded-2xl border border-[#E5E6DF] px-4 py-3 text-[14px] focus:outline-none focus:ring-2 focus:ring-[#B25A45]"
          />
          <textarea
            data-testid="admin-broadcast-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
            rows={3}
            placeholder="Message"
            className="w-full rounded-2xl border border-[#E5E6DF] px-4 py-3 text-[14px] focus:outline-none focus:ring-2 focus:ring-[#B25A45]"
          />
          <div className="flex gap-2">
            {["all", "members"].map((a) => (
              <button key={a} type="button" onClick={() => setAudience(a)} data-testid={`admin-broadcast-audience-${a}`} className={`pill !py-2 !px-4 !text-[13px] ${audience === a ? "pill-primary" : "pill-ghost"}`}>
                {a === "all" ? "Everyone" : "Members only"}
              </button>
            ))}
          </div>
          <button type="submit" disabled={sending || !deliveryStatus?.web_push.ready} data-testid="admin-broadcast-send" className="pill pill-primary w-full disabled:opacity-50">
            <Send className="h-4 w-4" /> {sending ? "Sending…" : "Send push"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default BroadcastPane;
