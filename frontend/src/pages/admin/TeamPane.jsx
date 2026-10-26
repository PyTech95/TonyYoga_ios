import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Save, User } from "lucide-react";
import { api } from "@/lib/api";
import Spinner from "@/components/Spinner";
import { ContentImageInput, contentImageUrl } from "@/components/ContentImageInput";
import { Field, inputCls } from "./shared";
import { TONY } from "@/lib/brandMedia";

function Member({ m, onSaved }) {
  const [f, setF] = useState({ name: m.name || "", bio: m.bio || "", photo_url: m.photo_url || "", years_experience: m.years_experience ?? "", styles: (m.styles || []).join(", ") });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    setBusy(true);
    try {
      await api.patch(`/admin/team/${m.id}`, { ...f, styles: f.styles.split(",").map((x) => x.trim()).filter(Boolean) });
      toast.success(`${f.name} saved`);
      onSaved();
    } catch (e) { toast.error(typeof e?.response?.data?.detail === "string" ? e.response.data.detail : "Could not save"); }
    finally { setBusy(false); }
  };
  return (
    <div className="rounded-2xl bg-white border border-[#E5E6DF] p-5 space-y-4" data-testid={`team-${m.id}`}>
      <div className="flex items-center gap-3">
        <div className="h-14 w-14 rounded-full overflow-hidden bg-[#F2F2EC] flex items-center justify-center shrink-0">
          {f.photo_url ? <img src={contentImageUrl(f.photo_url)} alt="" className="h-full w-full object-cover" /> : <User className="h-5 w-5 text-[#B25A45]" />}
        </div>
        <div className="min-w-0">
          <div className="font-semibold">{m.name}</div>
          <div className="text-[12px] text-[#6B7269]">{m.role === "admin" ? "Admin & teacher" : "Instructor"} · {m.email}</div>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Name shown to students"><input className={inputCls} value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Years of experience"><input type="number" min="0" className={inputCls} value={f.years_experience} onChange={(e) => set("years_experience", e.target.value)} /></Field>
      </div>
      <ContentImageInput absolute label="Profile photo (shown on every class)" tid={`team-photo-${m.id}`} value={f.photo_url} onChange={(v) => set("photo_url", v)} />
      {m.role === "admin" && f.photo_url !== TONY.face && (
        <button type="button" onClick={() => set("photo_url", TONY.face)} className="text-[12px] font-semibold text-[#B25A45]" data-testid="team-use-builtin">
          Use the built-in photo of Tony
        </button>
      )}
      <Field label="Short bio"><textarea rows={4} className={inputCls} value={f.bio} onChange={(e) => set("bio", e.target.value)} data-testid="team-bio" /></Field>
      <Field label="Styles (comma separated)"><input className={inputCls} value={f.styles} onChange={(e) => set("styles", e.target.value)} placeholder="Core 26+, Core 40, Core 84" /></Field>
      <div className="flex justify-end"><button onClick={save} disabled={busy} className="pill pill-primary !py-2 !text-[13px]" data-testid="team-save"><Save className="h-4 w-4" /> {busy ? "Saving…" : "Save"}</button></div>
    </div>
  );
}

export default function TeamPane() {
  const [rows, setRows] = useState(null);
  const load = () => api.get("/admin/team").then(({ data }) => setRows(data)).catch(() => setRows([]));
  useEffect(() => { load(); }, []);
  if (rows === null) return <Spinner />;
  return (
    <div className="space-y-5" data-testid="team-pane">
      <div>
        <div className="eyebrow mb-1">Teaching</div>
        <h2 className="serif text-2xl sm:text-3xl">Instructors</h2>
        <p className="text-[13px] text-[#6B7269] mt-1 max-w-2xl">Photo, name and bio shown on class pages in the website and app.</p>
      </div>
      {rows.map((m) => <Member key={m.id} m={m} onSaved={load} />)}
    </div>
  );
}
