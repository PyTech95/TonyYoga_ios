import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Users, Calendar, TrendingUp, Send, Check, X, CreditCard, Mail, Bell, Save, RefreshCw, History, BookOpen, Plus, ArrowLeft, Trash2, ChevronUp, ChevronDown, ChevronRight, Youtube, Play, Clock, Eye, EyeOff, ListPlus, Instagram, Wallet, ClipboardCheck, Package, GraduationCap, Award, MessageCircle, Video, Mic, LayoutDashboard, MountainSnow, Gift, Settings as SettingsIcon, Upload } from "lucide-react";
import { api, API_BASE } from "@/lib/api";
import Spinner from "@/components/Spinner";
import { ClassPricingPane } from "./ClassPricingPane";

function ClassRecordingForm({ instance, onDone }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [days, setDays] = useState(3);
  const [busy, setBusy] = useState(false);

  const createMeeting = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/admin/class-instances/${instance.id}/zoom-meeting`);
      toast.success(data.zoom_mock ? "Mock Zoom meeting created (add keys in Settings for real ones)." : "Zoom meeting created.");
      onDone();
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not create meeting"); }
    finally { setBusy(false); }
  };

  const attach = async () => {
    setBusy(true);
    try {
      await api.post(`/admin/class-instances/${instance.id}/recording`, { recording_url: url || undefined, replay_days: Number(days) || 3 });
      toast.success("Recording attached.");
      setOpen(false); setUrl("");
      onDone();
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not attach recording"); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.delete(`/admin/class-instances/${instance.id}/recording`);
      toast.success("Recording removed.");
      onDone();
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not remove"); }
    finally { setBusy(false); }
  };

  const hasRec = !!instance.recording_expires_at;
  return (
    <div className="mt-3 pt-3 border-t border-[#EEEFE8] space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        {instance.location_type === "online" && (
          instance.zoom_join_url
            ? <span className="text-[#839682] font-semibold" data-testid={`zoom-set-${instance.id}`}>Zoom link ✓{instance.zoom_mock ? " (mock)" : ""}</span>
            : <button onClick={createMeeting} disabled={busy} data-testid={`zoom-create-${instance.id}`} className="text-[#2D8CFF] hover:underline font-semibold">Create Zoom meeting</button>
        )}
        {hasRec ? (
          <span className="text-[#545E56]" data-testid={`rec-set-${instance.id}`}>
            · Recording set · expires {new Date(instance.recording_expires_at).toLocaleDateString()}
            <button onClick={remove} disabled={busy} data-testid={`rec-remove-${instance.id}`} className="ml-2 text-[#B25A45] hover:underline">Remove</button>
          </span>
        ) : (
          <button onClick={() => setOpen((o) => !o)} data-testid={`rec-add-${instance.id}`} className="text-[#B25A45] hover:underline font-semibold">· Add recording</button>
        )}
      </div>
      {open && !hasRec && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Recording URL (leave blank to pull from Zoom)"
            data-testid={`rec-url-${instance.id}`}
            className="flex-1 rounded-xl border border-[#E5E6DF] px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#B25A45]"
          />
          <input
            type="number" min={1} max={60} value={days}
            onChange={(e) => setDays(e.target.value)}
            data-testid={`rec-days-${instance.id}`}
            className="w-20 rounded-xl border border-[#E5E6DF] px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#B25A45]"
            title="Replay days"
          />
          <button onClick={attach} disabled={busy} data-testid={`rec-save-${instance.id}`} className="pill pill-primary !py-2 !px-4 !text-[13px]">Save</button>
        </div>
      )}
    </div>
  );
}

function ClassesPane() {
  const [instances, setInstances] = useState(null);

  const load = async () => {
    try { const { data } = await api.get("/class-instances?upcoming=true&include_cancelled=true"); setInstances(data); }
    catch { setInstances([]); }
  };
  useEffect(() => { load(); }, []);

  const cancel = async (id) => {
    if (!window.confirm("Cancel this class? This will also cancel all bookings.")) return;
    try {
      await api.patch(`/admin/class-instances/${id}`, { status: "cancelled" });
      toast.success("Class cancelled.");
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not cancel"); }
  };

  if (instances === null) return <Spinner />;
  return (
    <div><ClassPricingPane /><ul className="space-y-2" data-testid="admin-classes-list">
      {instances.map((c) => (
        <li key={c.id} className="rounded-2xl bg-white border border-[#E5E6DF] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold truncate">{c.title}</div>
              <div className="text-xs text-[#6B7269] mt-0.5">{new Date(c.start_time).toLocaleString()}</div>
              <div className="text-[11px] mt-1.5 text-[#545E56]">{c.bookings_count || 0} / {c.capacity} booked · {c.location_type}</div>
              <div className="text-[10px] mt-1 uppercase tracking-widest font-semibold" style={{ color: c.status === "cancelled" ? "#B25A45" : "#839682" }}>{c.status}</div>
            </div>
            {c.status !== "cancelled" && (
              <button onClick={() => cancel(c.id)} data-testid={`admin-cancel-${c.id}`} className="text-xs text-[#B25A45] hover:underline shrink-0">Cancel</button>
            )}
          </div>
          {c.status !== "cancelled" && <ClassRecordingForm instance={c} onDone={load} />}
        </li>
      ))}
    </ul></div>
  );
}

export default ClassesPane;
