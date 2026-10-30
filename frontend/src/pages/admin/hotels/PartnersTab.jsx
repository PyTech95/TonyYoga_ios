import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, UserPlus, Plus, X, Mail, Globe, Phone } from "lucide-react";
import { api } from "@/lib/api";
import { StatusChip, fmtDate, errText } from "@/pages/hotels/hotelShared";
import { inputCls, smallBtn, primaryBtn, card, L } from "./hotelAdminShared";

const FILTERS = [["", "All"], ["applied", "New applications"], ["approved", "Approved"], ["paused", "Paused"], ["declined", "Declined"]];

export default function PartnersTab({ data, reload }) {
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState(null);
  const [adding, setAdding] = useState(false);
  const rows = data.partners.filter((p) => !filter || p.status === filter);
  return (
    <div className="space-y-3" data-testid="hotels-partners">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)} data-testid={`hotels-partners-filter-${k || "all"}`}
            className={`rounded-full px-3 py-1.5 text-[12px] font-semibold border ${filter === k ? "bg-[#FBF1EE] border-[#B25A45] text-[#B25A45]" : "bg-white border-[#E5E6DF]"}`}>{label}</button>
        ))}
        <button onClick={() => setAdding((a) => !a)} className={`${primaryBtn} ml-auto`} data-testid="hotels-partner-add"><Plus className="h-4 w-4" />Add partner</button>
      </div>
      {adding && <NewPartner onDone={() => { setAdding(false); reload(); }} />}
      {!rows.length && <div className={`${card} text-[13px] text-[#6B7269]`}>No partners here yet.</div>}
      <ul className="space-y-2">
        {rows.map((p) => (
          <li key={p.id} className={card} data-testid={`hotels-partner-${p.slug}`}>
            <button onClick={() => setOpen(open === p.id ? null : p.id)} className="w-full text-left flex items-start gap-3" data-testid={`hotels-partner-open-${p.slug}`}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><span className="text-[15px] font-semibold">{p.name}</span><StatusChip status={p.status} testId={`hotels-partner-status-${p.slug}`} /></div>
                <div className="text-[12px] text-[#6B7269] mt-0.5">{[p.city, p.country].filter(Boolean).join(", ")} · {p.contact_name} · {p.email} · {p.stays_count} stay(s) · applied {fmtDate(p.created_at)}</div>
              </div>
              {open === p.id ? <ChevronUp className="h-4 w-4 text-[#6B7269]" /> : <ChevronDown className="h-4 w-4 text-[#6B7269]" />}
            </button>
            {open === p.id && <PartnerDetail p={p} reload={reload} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PartnerDetail({ p, reload }) {
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState(p.admin_note || "");
  const [busy, setBusy] = useState(false);
  const patch = async (body, okMsg) => {
    setBusy(true);
    try {
      await api.patch(`/admin/hotels/${p.id}`, body);
      toast.success(okMsg);
      setMessage(""); setEmail("");
      reload();
    } catch (e) { toast.error(errText(e)); }
    finally { setBusy(false); }
  };
  return (
    <div className="mt-4 pt-4 border-t border-[#EFEFE9] space-y-4 text-[13px]" data-testid="hotels-partner-detail">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1 text-[#545E56]">
          <div className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{p.email}</div>
          {p.phone && <div className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{p.phone}</div>}
          {p.website && <div className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" /><a href={p.website} target="_blank" rel="noopener noreferrer" className="underline">{p.website}</a></div>}
          <div>Rooms: {p.rooms || "—"} · Yoga space: {p.has_studio == null ? "—" : p.has_studio ? "yes" : "not yet"}</div>
          {p.preferred_months && <div>Preferred months: {p.preferred_months}</div>}
        </div>
        {p.message && <div className="rounded-xl bg-[#F7F6F1] p-3 whitespace-pre-wrap">{p.message}</div>}
      </div>

      <div>
        <div className="text-[11px] uppercase tracking-widest font-semibold text-[#839682] mb-1">Logins</div>
        {p.users?.length ? (
          <ul className="flex flex-wrap gap-2">
            {p.users.map((u) => (
              <li key={u.id} className="inline-flex items-center gap-1.5 rounded-full bg-[#F2F2EC] px-3 py-1">
                {u.email}
                <button disabled={busy} onClick={() => patch({ remove_user_id: u.id }, "Login removed")} aria-label="Remove login" className="text-[#B25A45]"><X className="h-3 w-3" /></button>
              </li>
            ))}
          </ul>
        ) : <div className="text-[#6B7269]">No login yet — approving creates one for {p.email} and emails a set-password link.</div>}
        {p.status === "approved" && (
          <div className="mt-2 flex gap-2">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Add a staff email" className={inputCls} data-testid="hotels-partner-add-email" />
            <button disabled={busy || !email.includes("@")} onClick={() => patch({ add_user_email: email.trim() }, "Login added and emailed")} className={smallBtn} data-testid="hotels-partner-add-email-btn"><UserPlus className="h-3.5 w-3.5" />Add</button>
          </div>
        )}
      </div>

      <L label="Message for the email (decline / approval note)">
        <textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)} className={inputCls} data-testid="hotels-partner-message" />
      </L>
      <div className="flex flex-wrap gap-2">
        {p.status !== "approved" && <button disabled={busy} onClick={() => patch({ status: "approved", message: message || null }, "Partner approved — login sent")} className={primaryBtn} data-testid="hotels-partner-approve">Approve</button>}
        {p.status === "approved" && <button disabled={busy} onClick={() => patch({ status: "paused" }, "Partner paused")} className={smallBtn} data-testid="hotels-partner-pause">Pause</button>}
        {p.status === "paused" && <button disabled={busy} onClick={() => patch({ status: "approved" }, "Partner active again")} className={smallBtn} data-testid="hotels-partner-resume">Resume</button>}
        {p.status === "applied" && <button disabled={busy} onClick={() => patch({ status: "declined", message: message || null }, "Application declined — email sent")} className={`${smallBtn} !text-[#B25A45]`} data-testid="hotels-partner-decline">Decline</button>}
      </div>
      <L label="Private admin note">
        <div className="flex gap-2">
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} data-testid="hotels-partner-note" />
          <button disabled={busy} onClick={() => patch({ admin_note: note }, "Note saved")} className={`${smallBtn} self-start`} data-testid="hotels-partner-note-save">Save</button>
        </div>
      </L>
    </div>
  );
}

function NewPartner({ onDone }) {
  const [f, setF] = useState({ name: "", contact_name: "", email: "", phone: "", city: "", country: "" });
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/admin/hotels", { ...f, status: "approved", phone: f.phone || null });
      toast.success("Partner added — login emailed");
      onDone();
    } catch (err) { toast.error(errText(err)); }
    finally { setBusy(false); }
  };
  const field = (k, label, type = "text") => (
    <L label={label}><input type={type} required={["name", "email"].includes(k)} value={f[k]} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} className={inputCls} data-testid={`hotels-new-${k}`} /></L>
  );
  return (
    <form onSubmit={save} className={`${card} grid gap-3 sm:grid-cols-3`} data-testid="hotels-new-partner">
      {field("name", "Hotel name")}{field("contact_name", "Contact")}{field("email", "Email", "email")}
      {field("phone", "Phone")}{field("city", "City")}{field("country", "Country")}
      <div className="sm:col-span-3 flex items-center gap-2">
        <button disabled={busy} className={primaryBtn} data-testid="hotels-new-save">Create approved partner</button>
        <span className="text-[12px] text-[#6B7269]">We create a login for the email and send a set-password link.</span>
      </div>
    </form>
  );
}
