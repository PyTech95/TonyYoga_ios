import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  X, Users, Clock, MapPin, Video, Download, Send, UserPlus, Pencil, Ban, Check, UserX, RotateCcw, ArrowUpCircle, Trash2,
  ChevronDown, ChevronUp, Sparkles, Ticket, ExternalLink,
} from "lucide-react";
import { api } from "@/lib/api";
import Spinner from "@/components/Spinner";
import { Field, inputCls, Toggle } from "../shared";
import { Chip, Modal, errText, fmtWhen, fmtTime, toLocalInput, fromLocalInput, downloadBlob, useInstructors, FillBar } from "./classShared";

const ATT = {
  attended: { tone: "green", label: "Attended" },
  no_show: { tone: "red", label: "No-show" },
  booked: { tone: "grey", label: "Booked" },
};

function StudentLine({ r, t }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[14px] font-semibold truncate" data-testid="roster-name">{r.name}</span>
        {r.first_class && <Chip tone="amber">{t("classes.first", "First class")}</Chip>}
        {r.membership && <Chip tone="green">{r.membership}</Chip>}
        {(r.tags || []).slice(0, 3).map((tag) => <Chip key={tag}>{tag}</Chip>)}
      </div>
      <div className="text-[12px] text-[#6B7269] mt-0.5 flex flex-wrap gap-x-3">
        {r.email && <a href={`mailto:${r.email}`} className="hover:text-[#B25A45] truncate">{r.email}</a>}
        {r.phone && <a href={`tel:${r.phone}`} className="hover:text-[#B25A45]">{r.phone}</a>}
        <span className="inline-flex items-center gap-1"><Ticket className="h-3 w-3" />{r.credits} {t("classes.credits_short", "credits")}</span>
        <span>{t("classes.via", "via")} {r.source}</span>
      </div>
      {r.note && <div className="text-[11px] text-[#8A6D3B] mt-1">{r.note}</div>}
    </div>
  );
}

function EditModal({ cls, onClose, onSaved }) {
  const { t } = useTranslation();
  const instructors = useInstructors();
  const [f, setF] = useState({
    start: toLocalInput(cls.start_time), duration: cls.duration_minutes || 60, capacity: cls.capacity || 1,
    instructor_id: cls.instructor?.id || "", location_type: cls.location_type || "online", location_detail: cls.location_detail || "",
    zoom_join_url: cls.zoom_join_url || "", is_recorded: !!cls.is_recorded, staff_note: cls.staff_note || "", notify: true,
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e?.target ? (e.target.type === "number" ? Number(e.target.value) : e.target.value) : e }));
  const save = async () => {
    const payload = { notify: f.notify };
    if (f.start !== toLocalInput(cls.start_time)) payload.start_time = fromLocalInput(f.start);
    if (Number(f.duration) !== Number(cls.duration_minutes)) payload.duration_minutes = Number(f.duration);
    if (Number(f.capacity) !== Number(cls.capacity)) payload.capacity = Number(f.capacity);
    if (f.instructor_id && f.instructor_id !== cls.instructor?.id) payload.instructor_id = f.instructor_id;
    if (f.location_type !== cls.location_type) payload.location_type = f.location_type;
    if ((f.location_detail || "") !== (cls.location_detail || "")) payload.location_detail = f.location_detail;
    if (f.zoom_join_url && f.zoom_join_url !== (cls.zoom_join_url || "")) payload.zoom_join_url = f.zoom_join_url.trim();
    if (f.is_recorded !== !!cls.is_recorded) payload.is_recorded = f.is_recorded;
    if ((f.staff_note || "") !== (cls.staff_note || "")) payload.staff_note = f.staff_note;
    if (Object.keys(payload).length === 1) { onClose(); return; }
    setBusy(true);
    try {
      const { data } = await api.patch(`/admin/classes/${cls.id}`, payload);
      const bits = [t("classes.saved", "Class saved.")];
      if (data?.promoted) bits.push(t("classes.promoted_n", "{{n}} moved off the waitlist.", { n: data.promoted }));
      if (data?.students_told) bits.push(t("classes.told_n", "{{n}} student(s) told.", { n: data.students_told }));
      toast.success(bits.join(" "));
      onSaved();
    } catch (e) { toast.error(errText(e, "Could not save the class")); }
    finally { setBusy(false); }
  };
  return (
    <Modal title={t("classes.edit_class", "Edit this class")} onClose={onClose} tid="class-edit-modal">
      <div className="space-y-3">
        <Field label={t("classes.date_time", "Date & time (your time)")}><input type="datetime-local" value={f.start} onChange={set("start")} className={inputCls} data-testid="class-edit-start" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("classes.duration", "Minutes")}><input type="number" min={10} max={480} value={f.duration} onChange={set("duration")} className={inputCls} data-testid="class-edit-duration" /></Field>
          <Field label={t("classes.capacity", "Places")}><input type="number" min={1} max={1000} value={f.capacity} onChange={set("capacity")} className={inputCls} data-testid="class-edit-capacity" /></Field>
        </div>
        <Field label={t("classes.teacher", "Teacher")}>
          <select value={f.instructor_id} onChange={set("instructor_id")} className={inputCls} data-testid="class-edit-teacher">
            {!instructors.some((i) => i.id === f.instructor_id) && f.instructor_id && <option value={f.instructor_id}>{cls.instructor?.name || "Current teacher"}</option>}
            {instructors.map((i) => <option key={i.id} value={i.id}>{i.name || i.email}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("classes.where", "Where")}>
            <select value={f.location_type} onChange={set("location_type")} className={inputCls} data-testid="class-edit-location-type">
              <option value="online">{t("classes.online", "Online")}</option>
              <option value="in_person">{t("classes.in_person", "In person")}</option>
            </select>
          </Field>
          <Field label={t("classes.place", "Place / room")}><input value={f.location_detail} onChange={set("location_detail")} className={inputCls} data-testid="class-edit-place" /></Field>
        </div>
        {f.location_type === "online" && (
          <Field label={t("classes.meeting_link", "Meeting link")} hint={t("classes.meeting_hint", "Leave as is to keep the Zoom meeting. Must start with https://")}>
            <input value={f.zoom_join_url} onChange={set("zoom_join_url")} placeholder="https://zoom.us/j/…" className={inputCls} data-testid="class-edit-link" />
          </Field>
        )}
        <Field label={t("classes.staff_note", "Note for the team (students don't see it)")}><textarea rows={2} value={f.staff_note} onChange={set("staff_note")} className={inputCls} data-testid="class-edit-note" /></Field>
        <div className="flex items-center justify-between rounded-2xl bg-[#F7F6F1] px-4 py-3">
          <span className="text-[13px]">{t("classes.recorded", "Recorded for replay")}</span>
          <Toggle checked={f.is_recorded} onChange={(v) => setF((p) => ({ ...p, is_recorded: v }))} tid="class-edit-recorded" />
        </div>
        <div className="flex items-center justify-between rounded-2xl bg-[#F7F6F1] px-4 py-3">
          <span className="text-[13px]">{t("classes.tell_booked", "Tell booked students about changes")}</span>
          <Toggle checked={f.notify} onChange={(v) => setF((p) => ({ ...p, notify: v }))} tid="class-edit-notify" />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="pill pill-ghost !py-2 !px-4 !text-[13px]">{t("common.cancel", "Cancel")}</button>
          <button onClick={save} disabled={busy} className="pill pill-primary !py-2 !px-4 !text-[13px]" data-testid="class-edit-save">{busy ? "…" : t("common.save", "Save")}</button>
        </div>
      </div>
    </Modal>
  );
}

function MessageModal({ cls, onClose }) {
  const { t } = useTranslation();
  const [f, setF] = useState({ title: "", body: "", audience: "confirmed", email: true });
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (f.title.trim().length < 2 || f.body.trim().length < 2) { toast.error(t("classes.msg_need", "Write a title and a message.")); return; }
    setBusy(true);
    try {
      const { data } = await api.post(`/admin/classes/${cls.id}/message`, { ...f, title: f.title.trim(), body: f.body.trim() });
      toast.success(t("classes.msg_sent", "Message sent to {{n}} student(s).", { n: data?.sent || 0 }));
      onClose();
    } catch (e) { toast.error(errText(e, "Could not send the message")); }
    finally { setBusy(false); }
  };
  return (
    <Modal title={t("classes.message_class", "Message the class")} onClose={onClose} tid="class-message-modal">
      <div className="space-y-3">
        <Field label={t("classes.to", "To")}>
          <select value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })} className={inputCls} data-testid="class-message-audience">
            <option value="confirmed">{t("classes.to_booked", "Booked students")}</option>
            <option value="waitlist">{t("classes.to_waitlist", "Waitlist")}</option>
            <option value="all">{t("classes.to_all", "Booked and waitlist")}</option>
          </select>
        </Field>
        <Field label={t("classes.msg_title", "Title")}><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={120} className={inputCls} data-testid="class-message-title" /></Field>
        <Field label={t("classes.msg_body", "Message")}><textarea rows={4} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} maxLength={2000} className={inputCls} data-testid="class-message-body" /></Field>
        <div className="flex items-center justify-between rounded-2xl bg-[#F7F6F1] px-4 py-3">
          <span className="text-[13px]">{t("classes.also_email", "Also send by email (app notification always)")}</span>
          <Toggle checked={f.email} onChange={(v) => setF({ ...f, email: v })} tid="class-message-email" />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="pill pill-ghost !py-2 !px-4 !text-[13px]">{t("common.cancel", "Cancel")}</button>
          <button onClick={send} disabled={busy} className="pill pill-primary !py-2 !px-4 !text-[13px]" data-testid="class-message-send"><Send className="h-4 w-4" />{busy ? "…" : t("classes.send", "Send")}</button>
        </div>
      </div>
    </Modal>
  );
}

function AddModal({ cls, onClose, onSaved }) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState([]);
  const [pick, setPick] = useState(null);
  const [waitlist, setWaitlist] = useState(false);
  const [useCredit, setUseCredit] = useState(false);
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2 || pick) { setHits([]); return undefined; }
    const id = setTimeout(() => {
      api.get(`/admin/members?q=${encodeURIComponent(term)}&segment=all&limit=10`).then(({ data }) => setHits((data?.rows || []).slice(0, 8))).catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(id);
  }, [q, pick]);
  const add = async () => {
    const email = (pick?.email || q).trim();
    if (!email.includes("@")) { toast.error(t("classes.add_need", "Choose a student or type their email.")); return; }
    setBusy(true);
    try {
      await api.post(`/admin/classes/${cls.id}/add`, pick ? { user_id: pick.id, waitlist, use_credit: useCredit, notify } : { email, waitlist, use_credit: useCredit, notify });
      toast.success(waitlist ? t("classes.added_wl", "Added to the waitlist.") : t("classes.added", "Student booked."));
      onSaved();
    } catch (e) { toast.error(errText(e, "Could not add the student")); }
    finally { setBusy(false); }
  };
  return (
    <Modal title={t("classes.add_student", "Add a student")} onClose={onClose} tid="class-add-modal">
      <div className="space-y-3">
        <Field label={t("classes.find_student", "Name or email")}>
          <input value={pick ? `${pick.name || ""} <${pick.email}>` : q} onChange={(e) => { setPick(null); setQ(e.target.value); }} className={inputCls} placeholder="maria@example.com" data-testid="class-add-search" />
        </Field>
        {hits.length > 0 && (
          <ul className="rounded-2xl border border-[#E5E6DF] divide-y divide-[#EFEFE9] overflow-hidden" data-testid="class-add-hits">
            {hits.map((h) => (
              <li key={h.id}>
                <button onClick={() => { setPick(h); setHits([]); }} className="w-full text-left px-4 py-2.5 hover:bg-[#F7F6F1]" data-testid={`class-add-hit-${h.id}`}>
                  <div className="text-[13px] font-semibold">{h.name || h.email}</div>
                  <div className="text-[11px] text-[#6B7269]">{h.email}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center justify-between rounded-2xl bg-[#F7F6F1] px-4 py-3">
          <span className="text-[13px]">{t("classes.put_waitlist", "Put on the waitlist instead")}</span>
          <Toggle checked={waitlist} onChange={setWaitlist} tid="class-add-waitlist" />
        </div>
        <div className="flex items-center justify-between rounded-2xl bg-[#F7F6F1] px-4 py-3">
          <span className="text-[13px]">{t("classes.use_credit", "Use one of their class credits")}</span>
          <Toggle checked={useCredit} onChange={setUseCredit} tid="class-add-credit" />
        </div>
        <div className="flex items-center justify-between rounded-2xl bg-[#F7F6F1] px-4 py-3">
          <span className="text-[13px]">{t("classes.notify_student", "Tell the student")}</span>
          <Toggle checked={notify} onChange={setNotify} tid="class-add-notify" />
        </div>
        <p className="text-[11px] text-[#6B7269]">{t("classes.add_hint", "Without a credit the place is free (a seat is held even if the class is full).")}</p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="pill pill-ghost !py-2 !px-4 !text-[13px]">{t("common.cancel", "Cancel")}</button>
          <button onClick={add} disabled={busy} className="pill pill-primary !py-2 !px-4 !text-[13px]" data-testid="class-add-save"><UserPlus className="h-4 w-4" />{busy ? "…" : t("classes.add", "Add")}</button>
        </div>
      </div>
    </Modal>
  );
}

function CancelModal({ cls, booked, onClose, onSaved }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(true);
  const [credit, setCredit] = useState(true);
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/admin/classes/${cls.id}/cancel`, { reason: reason.trim(), notify, compensate: credit ? "credit" : "none" });
      toast.success(t("classes.cancelled_msg", "Class cancelled. {{n}} booking(s) cancelled, {{m}} told.", { n: data?.cancelled || 0, m: data?.told || 0 }));
      onSaved();
    } catch (e) { toast.error(errText(e, "Could not cancel the class")); }
    finally { setBusy(false); }
  };
  return (
    <Modal title={t("classes.cancel_class", "Cancel this class")} onClose={onClose} tid="class-cancel-modal">
      <div className="space-y-3">
        <div className="rounded-2xl bg-[#FBEFEA] border border-[#EED9D2] p-4 text-[13px] text-[#8A3B2A]">
          <div className="font-semibold">{cls.title} · {fmtWhen(cls.start_time)}</div>
          {t("classes.cancel_warn", "{{n}} booked student(s) lose their place. Class credits they used come back automatically.", { n: booked })}
        </div>
        <Field label={t("classes.reason", "Reason (shown to students)")}><input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className={inputCls} placeholder={t("classes.reason_ph", "Tony is unwell — sorry!")} data-testid="class-cancel-reason" /></Field>
        <div className="flex items-center justify-between rounded-2xl bg-[#F7F6F1] px-4 py-3">
          <span className="text-[13px]">{t("classes.notify_all", "Email and notify everyone booked")}</span>
          <Toggle checked={notify} onChange={setNotify} tid="class-cancel-notify" />
        </div>
        <div className="flex items-center justify-between rounded-2xl bg-[#F7F6F1] px-4 py-3">
          <span className="text-[13px]">{t("classes.give_credit", "Give a free class credit to people who paid for this class")}</span>
          <Toggle checked={credit} onChange={setCredit} tid="class-cancel-credit" />
        </div>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} className="h-4 w-4 accent-[#B25A45]" data-testid="class-cancel-sure" />
          {t("classes.cancel_sure", "Yes, cancel the class")}
        </label>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="pill pill-ghost !py-2 !px-4 !text-[13px]">{t("classes.keep", "Keep the class")}</button>
          <button onClick={go} disabled={!sure || busy} className="pill !py-2 !px-4 !text-[13px] bg-[#B25A45] text-white disabled:opacity-50" data-testid="class-cancel-confirm"><Ban className="h-4 w-4" />{busy ? "…" : t("classes.cancel_now", "Cancel class")}</button>
        </div>
      </div>
    </Modal>
  );
}

function RemoveModal({ cls, row, onClose, onSaved }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      await api.post(`/admin/classes/${cls.id}/remove`, { booking_id: row.booking_id, reason: reason.trim() || undefined, notify });
      toast.success(t("classes.removed", "Booking cancelled."));
      onSaved();
    } catch (e) { toast.error(errText(e, "Could not remove the booking")); }
    finally { setBusy(false); }
  };
  return (
    <Modal title={t("classes.remove_title", "Remove {{name}}?", { name: row.name })} onClose={onClose} tid="class-remove-modal">
      <div className="space-y-3">
        <p className="text-[13px] text-[#6B7269]">{t("classes.remove_hint", "Their class credit comes back and the next person on the waitlist gets the place.")}</p>
        <Field label={t("classes.reason_opt", "Reason (optional, shown to the student)")}><input value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} data-testid="class-remove-reason" /></Field>
        <div className="flex items-center justify-between rounded-2xl bg-[#F7F6F1] px-4 py-3">
          <span className="text-[13px]">{t("classes.notify_student", "Tell the student")}</span>
          <Toggle checked={notify} onChange={setNotify} tid="class-remove-notify" />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="pill pill-ghost !py-2 !px-4 !text-[13px]">{t("common.cancel", "Cancel")}</button>
          <button onClick={go} disabled={busy} className="pill !py-2 !px-4 !text-[13px] bg-[#B25A45] text-white" data-testid="class-remove-confirm">{busy ? "…" : t("classes.remove", "Remove")}</button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Everything about one class. mode="admin" (full control) or "instructor" (roster, attendance, message).
 */
export default function ClassDrawer({ classId, mode = "admin", onClose, onChanged }) {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [modal, setModal] = useState(null); // edit | message | add | cancel | {remove: row}
  const [busy, setBusy] = useState(null);
  const [showCancelled, setShowCancelled] = useState(false);
  const admin = mode === "admin";

  const load = useCallback(() => {
    api.get(`/admin/classes/${classId}/roster`).then(({ data: d }) => { setData(d); setError(false); }).catch(() => setError(true));
  }, [classId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !modal) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, modal]);

  const refresh = () => { setModal(null); load(); onChanged && onChanged(); };
  const cls = data?.class;
  const attendanceOpen = useMemo(() => cls && new Date(cls.start_time).getTime() - 60 * 60 * 1000 <= Date.now(), [cls]);
  const live = cls && cls.status !== "cancelled";

  const mark = async (row, status) => {
    setBusy(`${row ? row.booking_id : "all"}:${status}`);
    try {
      await api.post(`/admin/classes/${classId}/attendance`, row ? { booking_id: row.booking_id, status } : { status, all: true });
      if (!row) toast.success(t("classes.all_in", "Everyone checked in."));
      load();
      onChanged && onChanged();
    } catch (e) { toast.error(errText(e, "Could not save attendance")); }
    finally { setBusy(null); }
  };

  const promote = async (row) => {
    setBusy(`promote:${row.booking_id}`);
    try {
      await api.post(`/admin/classes/${classId}/promote`, { booking_id: row.booking_id, notify: true });
      toast.success(t("classes.promoted", "{{name}} has a place now.", { name: row.name }));
      load();
      onChanged && onChanged();
    } catch (e) { toast.error(errText(e, "Could not move them off the waitlist")); }
    finally { setBusy(null); }
  };

  const csv = async () => {
    try {
      await downloadBlob(`/admin/classes/${classId}/roster.csv`, `roster-${(cls?.title || "class").toLowerCase().replace(/\s+/g, "-")}-${String(cls?.start_time || "").slice(0, 10)}.csv`);
    } catch (e) { toast.error(errText(e, "Could not download the roster")); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex justify-end" data-testid="class-drawer">
      <button aria-label="Close" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative h-full w-full max-w-[720px] bg-[#FAFAF7] shadow-2xl flex flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-[#E5E6DF] bg-white px-5 py-4">
          {cls ? (
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="serif text-2xl leading-tight" data-testid="class-drawer-title">{cls.title}</h2>
                {cls.status === "cancelled" && <Chip tone="red">{t("classes.cancelled", "Cancelled")}</Chip>}
                {cls.past && cls.status !== "cancelled" && <Chip>{t("classes.past", "Past")}</Chip>}
                {live && cls.spots_left === 0 && <Chip tone="dark">{t("classes.full", "Full")}</Chip>}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[#6B7269]">
                <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{fmtWhen(cls.start_time)} – {fmtTime(cls.end_time)}</span>
                <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{cls.booked}/{cls.capacity} · {cls.waitlist} {t("classes.waiting", "waiting")}</span>
                <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{cls.location_type === "online" ? t("classes.online", "Online") : (cls.location_detail || t("classes.in_person", "In person"))}</span>
                {cls.instructor?.name && <span>{t("classes.with", "with")} {cls.instructor.name}</span>}
              </div>
              {cls.zoom_join_url && (
                <a href={cls.zoom_join_url} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold text-[#2D8CFF]" data-testid="class-drawer-link">
                  <Video className="h-3.5 w-3.5" />{t("classes.meeting", "Meeting link")} <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {cls.staff_note && <div className="mt-1.5 text-[12px] text-[#8A6D3B]">{cls.staff_note}</div>}
              {cls.cancel_reason && <div className="mt-1.5 text-[12px] text-[#B25A45]">{cls.cancel_reason}</div>}
            </div>
          ) : <div className="h-12" />}
          <button onClick={onClose} aria-label="Close" className="h-9 w-9 rounded-full hover:bg-[#F2F2EC] flex items-center justify-center shrink-0" data-testid="class-drawer-close"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {error && <div className="rounded-2xl bg-[#FBEFEA] p-4 text-sm text-[#8A3B2A]">{t("classes.load_error", "Could not load this class.")} <button onClick={load} className="underline font-semibold">{t("common.retry", "Try again")}</button></div>}
          {!data && !error && <Spinner />}
          {cls && (
            <>
              <FillBar booked={cls.booked} capacity={cls.capacity} />
              <div className="flex flex-wrap gap-2" data-testid="class-drawer-actions">
                {admin && live && <button onClick={() => setModal("add")} className="pill pill-primary !py-2 !px-4 !text-[13px]" data-testid="class-action-add"><UserPlus className="h-4 w-4" />{t("classes.add_student", "Add a student")}</button>}
                {live && <button onClick={() => setModal("message")} className="pill pill-ghost !py-2 !px-4 !text-[13px]" data-testid="class-action-message"><Send className="h-4 w-4" />{t("classes.message", "Message")}</button>}
                {admin && live && <button onClick={() => setModal("edit")} className="pill pill-ghost !py-2 !px-4 !text-[13px]" data-testid="class-action-edit"><Pencil className="h-4 w-4" />{t("classes.edit", "Edit")}</button>}
                <button onClick={csv} className="pill pill-ghost !py-2 !px-4 !text-[13px]" data-testid="class-action-csv"><Download className="h-4 w-4" />{t("classes.csv", "Roster CSV")}</button>
                {admin && live && !cls.past && <button onClick={() => setModal("cancel")} className="pill !py-2 !px-4 !text-[13px] border border-[#EED9D2] text-[#B25A45] bg-white" data-testid="class-action-cancel"><Ban className="h-4 w-4" />{t("classes.cancel_class", "Cancel this class")}</button>}
              </div>

              <section data-testid="roster-booked">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="eyebrow !text-[11px]">{t("classes.booked_n", "Booked ({{n}})", { n: data.confirmed.length })}</h3>
                  {live && data.confirmed.length > 0 && (
                    attendanceOpen ? (
                      <button onClick={() => mark(null, "attended")} disabled={!!busy} className="text-[12px] font-semibold text-[#3E7C57] inline-flex items-center gap-1" data-testid="roster-checkin-all">
                        <Check className="h-4 w-4" />{t("classes.checkin_all", "Check in everyone")}
                      </button>
                    ) : <span className="text-[11px] text-[#6B7269]">{t("classes.att_opens", "Attendance opens 1 hour before the class")}</span>
                  )}
                </div>
                {data.confirmed.length === 0 ? (
                  <p className="text-[13px] text-[#6B7269] rounded-2xl bg-white border border-[#E5E6DF] p-4">{t("classes.nobody", "Nobody is booked yet.")}</p>
                ) : (
                  <ul className="space-y-2">
                    {data.confirmed.map((r) => {
                      const a = ATT[r.attendance] || ATT.booked;
                      return (
                        <li key={r.booking_id} className="rounded-2xl bg-white border border-[#E5E6DF] p-3" data-testid={`roster-row-${r.booking_id}`}>
                          <div className="flex items-start gap-3">
                            <StudentLine r={r} t={t} />
                            <Chip tone={a.tone} tid={`roster-att-${r.booking_id}`}>{t(`classes.att_${r.attendance}`, a.label)}</Chip>
                          </div>
                          {live && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {attendanceOpen && (
                                <>
                                  <button onClick={() => mark(r, "attended")} disabled={!!busy || r.attendance === "attended"} className="rounded-full border border-[#CFE3D6] bg-[#F1F8F3] px-3 py-1 text-[12px] font-semibold text-[#3E7C57] disabled:opacity-40 inline-flex items-center gap-1" data-testid={`roster-attended-${r.booking_id}`}><Check className="h-3.5 w-3.5" />{t("classes.attended", "Attended")}</button>
                                  <button onClick={() => mark(r, "no_show")} disabled={!!busy || r.attendance === "no_show"} className="rounded-full border border-[#EED9D2] bg-[#FDF6F3] px-3 py-1 text-[12px] font-semibold text-[#B25A45] disabled:opacity-40 inline-flex items-center gap-1" data-testid={`roster-noshow-${r.booking_id}`}><UserX className="h-3.5 w-3.5" />{t("classes.no_show", "No-show")}</button>
                                  {r.attendance !== "booked" && <button onClick={() => mark(r, "booked")} disabled={!!busy} className="rounded-full border border-[#E5E6DF] px-3 py-1 text-[12px] text-[#6B7269] inline-flex items-center gap-1" data-testid={`roster-reset-${r.booking_id}`}><RotateCcw className="h-3.5 w-3.5" />{t("classes.reset", "Reset")}</button>}
                                </>
                              )}
                              {admin && !cls.past && <button onClick={() => setModal({ remove: r })} className="rounded-full border border-[#E5E6DF] px-3 py-1 text-[12px] text-[#6B7269] hover:text-[#B25A45] inline-flex items-center gap-1 ml-auto" data-testid={`roster-remove-${r.booking_id}`}><Trash2 className="h-3.5 w-3.5" />{t("classes.remove", "Remove")}</button>}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section data-testid="roster-waitlist">
                <h3 className="eyebrow !text-[11px] mb-2">{t("classes.waitlist_n", "Waitlist ({{n}})", { n: data.waitlist.length })}</h3>
                {data.waitlist.length === 0 ? (
                  <p className="text-[13px] text-[#6B7269]">{t("classes.no_waitlist", "No one is waiting.")}</p>
                ) : (
                  <ul className="space-y-2">
                    {data.waitlist.map((r) => (
                      <li key={r.booking_id} className="rounded-2xl bg-white border border-[#E5E6DF] p-3 flex items-start gap-3" data-testid={`waitlist-row-${r.booking_id}`}>
                        <span className="h-7 w-7 rounded-full bg-[#F3E7C9] text-[#8A6D3B] text-[12px] font-bold flex items-center justify-center shrink-0">#{r.position}</span>
                        <StudentLine r={r} t={t} />
                        {admin && live && (
                          <div className="flex flex-col gap-1.5 shrink-0">
                            <button onClick={() => promote(r)} disabled={!!busy} className="rounded-full bg-[#1C221F] text-white px-3 py-1 text-[12px] font-semibold inline-flex items-center gap-1" data-testid={`waitlist-promote-${r.booking_id}`}><ArrowUpCircle className="h-3.5 w-3.5" />{t("classes.give_place", "Give a place")}</button>
                            <button onClick={() => setModal({ remove: r })} className="text-[12px] text-[#6B7269] hover:text-[#B25A45]" data-testid={`waitlist-remove-${r.booking_id}`}>{t("classes.remove", "Remove")}</button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {data.cancelled.length > 0 && (
                <section>
                  <button onClick={() => setShowCancelled((v) => !v)} className="eyebrow !text-[11px] inline-flex items-center gap-1" data-testid="roster-cancelled-toggle">
                    {t("classes.cancelled_n", "Cancelled bookings ({{n}})", { n: data.cancelled.length })}
                    {showCancelled ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                  {showCancelled && (
                    <ul className="mt-2 space-y-1.5" data-testid="roster-cancelled">
                      {data.cancelled.map((r) => (
                        <li key={r.booking_id} className="rounded-2xl bg-white border border-[#E5E6DF] px-3 py-2 text-[13px] flex items-center justify-between gap-3">
                          <span className="truncate">{r.name} <span className="text-[#6B7269]">· {r.email}</span></span>
                          <span className="text-[11px] text-[#6B7269] shrink-0">{r.booked_by ? t("classes.by_studio", "by studio") : ""}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
              {admin && (
                <p className="text-[11px] text-[#6B7269] inline-flex items-center gap-1"><Sparkles className="h-3.5 w-3.5 text-[#B25A45]" />{t("classes.pricing_hint", "Prices for online classes are set in Class pricing.")}</p>
              )}
            </>
          )}
        </div>
      </div>

      {modal === "edit" && cls && <EditModal cls={cls} onClose={() => setModal(null)} onSaved={refresh} />}
      {modal === "message" && cls && <MessageModal cls={cls} onClose={() => setModal(null)} />}
      {modal === "add" && cls && <AddModal cls={cls} onClose={() => setModal(null)} onSaved={refresh} />}
      {modal === "cancel" && cls && <CancelModal cls={cls} booked={data.confirmed.length} onClose={() => setModal(null)} onSaved={refresh} />}
      {modal?.remove && cls && <RemoveModal cls={cls} row={modal.remove} onClose={() => setModal(null)} onSaved={refresh} />}
    </div>
  );
}
