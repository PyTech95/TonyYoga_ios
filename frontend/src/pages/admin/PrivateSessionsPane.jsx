import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Video, Clock, Save, CalendarPlus } from "lucide-react";
import { api } from "@/lib/api";
import Spinner from "@/components/Spinner";
import { ContentImageInput } from "@/components/ContentImageInput";
import { Field, inputCls } from "./shared";
import { AvailabilityPane } from "./AvailabilityPane";

function PricingCard() {
  const [form, setForm] = useState(null);
  const [pkgs, setPkgs] = useState([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    api.get("/admin/settings").then(({ data }) => {
      setForm({
        private_session_price: data.private_session_price ?? 120,
        private_session_duration_min: data.private_session_duration_min ?? 60,
        private_session_image: data.private_session_image ?? "",
      });
      setPkgs(Array.isArray(data.private_session_packages) ? data.private_session_packages : []);
    }).catch(() => {});
  }, []);
  const addPkg = () => setPkgs((p) => [...p, { sessions: (p.length ? p[p.length - 1].sessions + 1 : 5), price: 0, label: "" }]);
  const setPkg = (i, k, v) => setPkgs((p) => p.map((row, idx) => idx === i ? { ...row, [k]: v } : row));
  const removePkg = (i) => setPkgs((p) => p.filter((_, idx) => idx !== i));
  const save = async () => {
    setSaving(true);
    try {
      await api.patch("/admin/settings", {
        private_session_price: Number(form.private_session_price) || 0,
        private_session_duration_min: Number(form.private_session_duration_min) || 60,
        private_session_image: form.private_session_image,
        private_session_packages: pkgs
          .filter((p) => Number(p.sessions) > 0)
          .map((p) => ({ sessions: Number(p.sessions), price: Number(p.price) || 0, label: (p.label || "").trim() })),
      });
      toast.success("Private-session pricing saved");
    }
    catch (e) { toast.error(e?.response?.data?.detail || "Could not save"); }
    finally { setSaving(false); }
  };
  if (!form) return null;
  const base = Number(form.private_session_price) || 0;
  return (
    <div className="rounded-2xl bg-white border border-[#E5E6DF] p-5 space-y-4" data-testid="private-pricing-card">
      <div>
        <div className="eyebrow mb-1">Pricing &amp; presentation</div>
        <p className="text-xs text-[#6B7269]">Set the price, length and photo shown on the homepage and booking page.</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Price per session (EUR)">
          <input type="number" min="0" step="1" className={inputCls} value={form.private_session_price}
            onChange={(e) => setForm({ ...form, private_session_price: e.target.value })} data-testid="private-price-input" />
        </Field>
        <Field label="Session length (minutes)">
          <input type="number" min="15" max="240" step="5" className={inputCls} value={form.private_session_duration_min}
            onChange={(e) => setForm({ ...form, private_session_duration_min: e.target.value })} data-testid="private-duration-input" />
        </Field>
      </div>
      <ContentImageInput label="Session photo (optional)" tid="private-image" value={form.private_session_image}
        onChange={(v) => setForm({ ...form, private_session_image: v })} />

      {/* Discounted bundles */}
      <div className="rounded-xl border border-[#E5E6DF] bg-[#FAFAF7] p-4 space-y-3" data-testid="private-packages">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-widest font-semibold text-[#839682]">Discounted bundles (optional)</div>
            <div className="text-[11px] text-[#6B7269] mt-0.5">Offer multi-session packs at a lower total. Leave empty to just sell 1–3 sessions.</div>
          </div>
          <button type="button" onClick={addPkg} data-testid="private-package-add" className="pill pill-ghost !py-1.5 !px-3 text-xs">+ Add bundle</button>
        </div>
        {pkgs.length > 0 && <ul className="space-y-2">
          {pkgs.map((p, i) => {
            const list = base * Number(p.sessions || 0);
            const save = list - (Number(p.price) || 0);
            return (
              <li key={i} className="flex flex-wrap items-end gap-2" data-testid={`private-package-${i}`}>
                <label className="text-[10px] text-[#6B7269]">Sessions
                  <input type="number" min="1" max="50" value={p.sessions} onChange={(e) => setPkg(i, "sessions", e.target.value)} data-testid={`private-package-sessions-${i}`} className={`${inputCls} !py-2 w-20 block mt-0.5`} />
                </label>
                <label className="text-[10px] text-[#6B7269]">Total price €
                  <input type="number" min="0" step="1" value={p.price} onChange={(e) => setPkg(i, "price", e.target.value)} data-testid={`private-package-price-${i}`} className={`${inputCls} !py-2 w-24 block mt-0.5`} />
                </label>
                <label className="text-[10px] text-[#6B7269] flex-1 min-w-[120px]">Label (optional)
                  <input value={p.label || ""} placeholder="Best value" onChange={(e) => setPkg(i, "label", e.target.value)} data-testid={`private-package-label-${i}`} className={`${inputCls} !py-2 block mt-0.5`} />
                </label>
                {base > 0 && save > 0 && <span className="text-[11px] text-[#5C7355] font-semibold pb-2">save €{Math.round(save)}</span>}
                <button type="button" onClick={() => removePkg(i)} data-testid={`private-package-remove-${i}`} className="text-[#B25A45] text-xs font-semibold pb-2.5">Remove</button>
              </li>
            );
          })}
        </ul>}
      </div>

      <button onClick={save} disabled={saving} className="pill pill-primary !text-sm" data-testid="private-pricing-save">
        <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save pricing"}
      </button>
    </div>
  );
}

const STATUS_BADGE = {
  paid: { label: "Paid — needs scheduling", bg: "#FBF1EE", fg: "#B25A45" },
  scheduled: { label: "Scheduled", bg: "#EEF1EC", fg: "#5C7355" },
  completed: { label: "Completed", bg: "#F2F2EC", fg: "#6B7269" },
};

function Row({ r, onChanged }) {
  const [total, setTotal] = useState(r.sessions_total);
  const [when, setWhen] = useState("");
  const [dur, setDur] = useState(60);
  const [busy, setBusy] = useState(false);
  const badge = STATUS_BADGE[r.status] || { label: r.status, bg: "#F2F2EC", fg: "#6B7269" };

  const saveTotal = async () => {
    try { await api.patch(`/admin/private-sessions/${r.id}`, { sessions_total: Number(total) }); toast.success("Updated"); onChanged(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const schedule = async () => {
    if (!when) return toast.error("Pick a date & time first.");
    setBusy(true);
    try {
      await api.post(`/admin/private-sessions/${r.id}/schedule`, {
        start_time: new Date(when).toISOString(), duration_minutes: Number(dur) || 60,
      });
      toast.success("Session scheduled — student notified");
      setWhen(""); onChanged();
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not schedule"); }
    finally { setBusy(false); }
  };

  const ic = "rounded-xl border border-[#E5E6DF] bg-white px-3 py-2 text-sm focus:outline-none focus:border-[#B25A45]";

  return (
    <li className="rounded-2xl bg-white border border-[#E5E6DF] p-4 space-y-3" data-testid={`admin-private-${r.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{r.user_name || r.user_email || "Member"}</div>
          <div className="text-xs text-[#6B7269]">{r.user_email}</div>
          {r.focus_area && <div className="text-xs text-[#545E56] mt-1">Focus: {r.focus_area}</div>}
          {r.notes && <div className="text-xs text-[#9AA096] mt-0.5">Notes: {r.notes}</div>}
          {r.preferred_time && <div className="text-xs text-[#9AA096] mt-0.5">Prefers: {r.preferred_time}</div>}
        </div>
        <span className="text-[11px] font-semibold rounded-full px-2.5 py-1 shrink-0" style={{ background: badge.bg, color: badge.fg }}>{badge.label}</span>
      </div>

      <div className="flex items-center gap-2 text-xs text-[#545E56]">
        <span>Sessions granted:</span>
        <input type="number" min="0" max="20" value={total} onChange={(e) => setTotal(e.target.value)} data-testid={`admin-private-total-${r.id}`} className={`${ic} w-20`} />
        <button onClick={saveTotal} data-testid={`admin-private-save-${r.id}`} className="pill pill-ghost !py-1.5 !px-3"><Save className="h-3.5 w-3.5" /> Save</button>
        <span className="text-[#9AA096]">· {r.sessions_scheduled || 0} scheduled</span>
      </div>

      {(r.sessions || []).length > 0 && (
        <ul className="space-y-1.5">
          {r.sessions.map((s) => (
            <li key={s.session_id} className="flex items-center justify-between rounded-xl bg-[#FAFAF7] border border-[#E5E6DF] px-3 py-2 text-xs">
              <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-[#B25A45]" />{String(s.start_time).slice(0, 16).replace("T", " ")} UTC · {s.duration_minutes}m{s.zoom_mock ? " · (mock Zoom)" : ""}</span>
              {s.join_url && <a href={s.join_url} target="_blank" rel="noopener noreferrer" className="text-[#B25A45] font-semibold flex items-center gap-1"><Video className="h-3.5 w-3.5" /> Join link</a>}
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-xl border border-dashed border-[#D8D9CF] bg-[#FAFAF7] p-3 flex flex-wrap items-end gap-2">
        <label className="text-[11px] text-[#6B7269]">Date & time (UTC)
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} data-testid={`admin-private-when-${r.id}`} className={`${ic} block mt-1`} />
        </label>
        <label className="text-[11px] text-[#6B7269]">Minutes
          <input type="number" min="15" max="180" value={dur} onChange={(e) => setDur(e.target.value)} className={`${ic} block mt-1 w-20`} />
        </label>
        <button onClick={schedule} disabled={busy} data-testid={`admin-private-schedule-${r.id}`} className="pill pill-primary !py-2 !px-4"><CalendarPlus className="h-4 w-4" /> {busy ? "Scheduling…" : "Schedule + Zoom"}</button>
      </div>
    </li>
  );
}

export default function PrivateSessionsPane() {
  const [rows, setRows] = useState(null);
  const load = () => api.get("/admin/private-sessions").then(({ data }) => setRows(data)).catch(() => setRows([]));
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4" data-testid="private-sessions-pane">
      <div className="rounded-2xl bg-[#F2F2EC] p-4">
        <div className="eyebrow mb-1">Private sessions</div>
        <p className="text-xs text-[#6B7269] leading-relaxed">
          Paid 1:1 requests appear here. Adjust how many sessions a student has, then schedule each one — a Zoom link is created and the student is notified automatically.
        </p>
      </div>
      <PricingCard />
      <AvailabilityPane />
      {rows === null ? <Spinner /> : rows.length === 0 ? (
        <p className="text-sm text-[#6B7269] rounded-2xl bg-white border border-[#E5E6DF] p-5">No private-session bookings yet.</p>
      ) : (
        <ul className="space-y-3" data-testid="admin-private-list">
          {rows.map((r) => <Row key={r.id} r={r} onChanged={load} />)}
        </ul>
      )}
    </div>
  );
}
