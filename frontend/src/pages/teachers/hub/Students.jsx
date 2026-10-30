import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { UserPlus, Send, Mail, Ticket, Save } from "lucide-react";
import { api } from "@/lib/api";
import { Label, LabelText, Section, errText, fmtDate, fmtWhen, inputCls } from "../teacherShared";

function NoteEditor({ s, onSaved }) {
  const { t } = useTranslation();
  const [note, setNote] = useState(s.note || "");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await api.patch(`/teacher/students/${s.id}`, { note }); toast.success(t("hub.note_saved", "Note saved.")); onSaved(); }
    catch (e) { toast.error(errText(e)); }
    finally { setBusy(false); }
  };
  return (
    <div className="flex gap-2 mt-2">
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("hub.private_note", "Private note (injuries, goals…)")} className={`${inputCls} !py-2 !text-[13px] flex-1`} data-testid={`student-note-${s.id}`} />
      {note !== (s.note || "") && <button type="button" onClick={save} disabled={busy} aria-label={t("hub.save", "Save")} className="h-9 w-9 rounded-full bg-[#1C221F] text-white flex items-center justify-center shrink-0" data-testid={`student-note-save-${s.id}`}><Save className="h-4 w-4" /></button>}
    </div>
  );
}

export default function Students({ me }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState(null);
  const [offerings, setOfferings] = useState([]);
  const [q, setQ] = useState("");
  const [add, setAdd] = useState({ email: "", name: "", offering_id: "", session_id: "", paid: true, note: "" });
  const [msg, setMsg] = useState({ subject: "", body: "", offering_id: "", session_id: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get("/teacher/students").then(({ data }) => setRows(data || [])).catch(() => setRows([]));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get("/teacher/offerings").then(({ data }) => setOfferings(data || [])).catch(() => {}); }, []);

  const sessionsOf = (id) => (offerings.find((o) => o.id === id)?.upcoming || []);
  const kindOf = (id) => offerings.find((o) => o.id === id)?.kind;

  const addStudent = async (e) => {
    e.preventDefault();
    if (add.offering_id && kindOf(add.offering_id) === "class" && !add.session_id) { toast.error(t("hub.pick_date", "Choose the class date.")); return; }
    setBusy(true);
    try {
      const { data } = await api.post("/teacher/students", {
        email: add.email.trim(), name: add.name.trim() || null, offering_id: add.offering_id || null, session_id: add.session_id || null, paid: add.paid, note: add.note || null,
      });
      toast.success(data?.invited ? t("hub.student_invited", "Added. We emailed them an invitation to set a password.") : t("hub.student_added", "Added."));
      setAdd({ email: "", name: "", offering_id: "", session_id: "", paid: true, note: "" });
      load();
    } catch (err) { toast.error(errText(err)); }
    finally { setBusy(false); }
  };

  const send = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post("/teacher/messages", { subject: msg.subject.trim(), body: msg.body.trim(), offering_id: msg.offering_id || null, session_id: msg.session_id || null });
      toast.success(t("hub.sent", "Sent to {{n}} student(s).", { n: data?.sent || 0 }));
      setMsg({ subject: "", body: "", offering_id: "", session_id: "" });
    } catch (err) { toast.error(errText(err)); }
    finally { setBusy(false); }
  };

  const shown = (rows || []).filter((s) => !q || `${s.name} ${s.email}`.toLowerCase().includes(q.toLowerCase()));
  const max = Number(me.tier?.max_students || 0);

  return (
    <div className="space-y-6" data-testid="hub-students">
      <Section icon={Mail} title={t("hub.students_title", "Your students")} action={max ? <span className="text-[11px] text-[#6B7269]">{(rows || []).length}/{max}</span> : null}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("hub.search_students", "Search by name or email")} className={`${inputCls} mb-3`} data-testid="students-search" />
        {rows === null && <div className="h-20 rounded-3xl bg-[#F2F2EC] animate-pulse" />}
        {rows?.length === 0 && <p className="text-[13px] text-[#6B7269]" data-testid="students-empty">{t("hub.no_students", "Students appear here when they book with you, or when you add them below.")}</p>}
        <ul className="space-y-2" data-testid="students-list">
          {shown.map((s) => (
            <li key={s.id} className="rounded-2xl bg-white border border-[#E5E6DF] p-3" data-testid={`student-${s.email}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold truncate">{s.name || s.email}</div>
                  <a href={`mailto:${s.email}`} className="text-[12px] text-[#6B7269] hover:text-[#B25A45]">{s.email}</a>
                </div>
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  <span className="rounded-full bg-[#F2F2EC] px-2 py-0.5">{t("hub.n_bookings", "{{n}} bookings", { n: s.bookings })}</span>
                  <span className="rounded-full bg-[#E4F0E8] text-[#3E7C57] px-2 py-0.5">{t("hub.n_attended", "{{n}} attended", { n: s.attended })}</span>
                  {s.unpaid > 0 && <span className="rounded-full bg-[#F3E7C9] text-[#8A6D3B] px-2 py-0.5 font-semibold" data-testid={`student-unpaid-${s.email}`}>{t("hub.n_unpaid", "{{n}} unpaid", { n: s.unpaid })}</span>}
                  {s.credits > 0 && <span className="rounded-full bg-[#FBF1EE] text-[#B25A45] px-2 py-0.5 inline-flex items-center gap-1"><Ticket className="h-3 w-3" />{s.credits}</span>}
                </div>
              </div>
              <div className="text-[11px] text-[#9AA096] mt-1">{t("hub.since", "Since {{date}}", { date: fmtDate(s.created_at) })}{s.source === "manual" ? ` · ${t("hub.added_by_you", "added by you")}` : ""}</div>
              <NoteEditor s={s} onSaved={load} />
            </li>
          ))}
        </ul>
      </Section>

      <Section icon={UserPlus} title={t("hub.add_student", "Add a student")}>
        <form onSubmit={addStudent} className="rounded-3xl bg-white border border-[#E5E6DF] p-4 space-y-3" data-testid="student-add-form">
          <p className="text-[12px] text-[#6B7269]">{t("hub.add_student_hint", "For students you already teach. New people get an email to set their password.")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Label><LabelText>{t("hub.email", "Email")}</LabelText><input type="email" required value={add.email} onChange={(e) => setAdd((a) => ({ ...a, email: e.target.value }))} className={inputCls} data-testid="student-add-email" /></Label>
            <Label><LabelText>{t("hub.name", "Name")}</LabelText><input value={add.name} onChange={(e) => setAdd((a) => ({ ...a, name: e.target.value }))} className={inputCls} data-testid="student-add-name" /></Label>
          </div>
          <Label><LabelText>{t("hub.also_book", "Also book them into (optional)")}</LabelText>
            <select value={add.offering_id} onChange={(e) => setAdd((a) => ({ ...a, offering_id: e.target.value, session_id: "" }))} className={inputCls} data-testid="student-add-offering">
              <option value="">{t("hub.nothing", "Nothing for now")}</option>
              {offerings.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
            </select></Label>
          {add.offering_id && kindOf(add.offering_id) === "class" && (
            <Label><LabelText>{t("hub.date", "Date")}</LabelText>
              <select value={add.session_id} onChange={(e) => setAdd((a) => ({ ...a, session_id: e.target.value }))} className={inputCls} data-testid="student-add-session">
                <option value="">{t("hub.choose", "Choose…")}</option>
                {sessionsOf(add.offering_id).map((s) => <option key={s.id} value={s.id}>{fmtWhen(s.start_time)}</option>)}
              </select></Label>
          )}
          {add.offering_id && <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={add.paid} onChange={(e) => setAdd((a) => ({ ...a, paid: e.target.checked }))} className="h-4 w-4 accent-[#B25A45]" />{t("hub.already_paid", "They've already paid me")}</label>}
          <Label><LabelText>{t("hub.note", "Note")}</LabelText><input value={add.note} onChange={(e) => setAdd((a) => ({ ...a, note: e.target.value }))} className={inputCls} /></Label>
          <button type="submit" disabled={busy || !add.email} className="pill pill-primary" data-testid="student-add-submit"><UserPlus className="h-4 w-4" />{t("hub.add", "Add student")}</button>
        </form>
      </Section>

      <Section icon={Send} title={t("hub.message", "Message your students")}>
        <form onSubmit={send} className="rounded-3xl bg-white border border-[#E5E6DF] p-4 space-y-3" data-testid="message-form">
          <Label><LabelText>{t("hub.to", "To")}</LabelText>
            <select value={msg.offering_id} onChange={(e) => setMsg((m) => ({ ...m, offering_id: e.target.value, session_id: "" }))} className={inputCls} data-testid="message-audience">
              <option value="">{t("hub.all_students", "All my students")}</option>
              {offerings.map((o) => <option key={o.id} value={o.id}>{t("hub.students_of", "Students of {{title}}", { title: o.title })}</option>)}
            </select></Label>
          {msg.offering_id && kindOf(msg.offering_id) === "class" && sessionsOf(msg.offering_id).length > 0 && (
            <select value={msg.session_id} onChange={(e) => setMsg((m) => ({ ...m, session_id: e.target.value }))} className={inputCls}>
              <option value="">{t("hub.every_date", "Every date")}</option>
              {sessionsOf(msg.offering_id).map((s) => <option key={s.id} value={s.id}>{fmtWhen(s.start_time)}</option>)}
            </select>
          )}
          <input required minLength={2} value={msg.subject} onChange={(e) => setMsg((m) => ({ ...m, subject: e.target.value }))} placeholder={t("hub.subject", "Subject")} className={inputCls} data-testid="message-subject" />
          <textarea required minLength={2} rows={4} value={msg.body} onChange={(e) => setMsg((m) => ({ ...m, body: e.target.value }))} placeholder={t("hub.body", "Message")} className={inputCls} data-testid="message-body" />
          <p className="text-[11px] text-[#9AA096]">{t("hub.message_hint", "Sent by email and as a notification in the app. Up to 10 messages a day.")}</p>
          <button type="submit" disabled={busy} className="pill pill-primary" data-testid="message-send"><Send className="h-4 w-4" />{t("hub.send", "Send")}</button>
        </form>
      </Section>
    </div>
  );
}
