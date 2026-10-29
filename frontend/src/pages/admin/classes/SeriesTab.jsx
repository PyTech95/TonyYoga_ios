import { useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Plus, Pencil, CalendarPlus, CalendarX, Repeat, Users, Video, MapPin, CalendarClock } from "lucide-react";
import { api } from "@/lib/api";
import Spinner from "@/components/Spinner";
import { Field, inputCls, Toggle } from "../shared";
import { Chip, Modal, WEEKDAYS, errText, fmtWhen, fromLocalInput, localDate, timeZones, useInstructors } from "./classShared";

function pattern(s, t) {
  const sc = s.schedule || {};
  if (!sc.weekdays?.length) return t("classes.no_pattern", "No weekly pattern");
  const days = sc.weekdays.length === 7 ? t("classes.every_day", "Every day") : sc.weekdays.map((d) => WEEKDAYS[d]).join(", ");
  return `${days} · ${sc.time || ""} ${sc.timezone ? `(${sc.timezone.split("/").pop().replace(/_/g, " ")})` : ""}`;
}

function DayChips({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5" data-testid="series-weekdays">
      {WEEKDAYS.map((d, i) => {
        const on = value.includes(i);
        return (
          <button key={d} type="button" onClick={() => onChange(on ? value.filter((x) => x !== i) : [...value, i].sort())}
            className={`rounded-full px-3 py-1.5 text-[12px] font-semibold border ${on ? "bg-[#1C221F] text-white border-[#1C221F]" : "bg-white text-[#545E56] border-[#E5E6DF]"}`}
            data-testid={`series-day-${i}`} aria-pressed={on}>{d}</button>
        );
      })}
    </div>
  );
}

function SeriesForm({ initial, onClose, onSaved }) {
  const { t } = useTranslation();
  const instructors = useInstructors();
  const editing = !!initial;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const [f, setF] = useState(() => ({
    title: initial?.title || "", description: initial?.description || "", instructor_id: initial?.instructor_id || "",
    location_type: initial?.location_type || "online", location_detail: initial?.location_detail || "", style: initial?.style || "hot",
    level: initial?.level || "all", duration_minutes: initial?.duration_minutes || 60, capacity: initial?.capacity || 20,
    weekdays: initial?.schedule?.weekdays || [0, 2, 4], time: initial?.schedule?.time || "08:00",
    timezone: initial?.schedule?.timezone || "Europe/Madrid", start_date: localDate(tomorrow), weeks: 8, is_recorded: false,
    create_meetings: true, apply_to_future: true, notify: true,
  }));
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e?.target ? (e.target.type === "number" ? Number(e.target.value) : e.target.value) : e }));
  const teacher = f.instructor_id || instructors[0]?.id || "";

  const save = async () => {
    if (f.title.trim().length < 2) { toast.error(t("classes.need_title", "Give the class a name.")); return; }
    if (!teacher) { toast.error(t("classes.need_teacher", "Choose a teacher.")); return; }
    if (!editing && !f.weekdays.length) { toast.error(t("classes.need_days", "Pick at least one day.")); return; }
    setBusy(true);
    try {
      if (editing) {
        const payload = { apply_to_future: f.apply_to_future, notify: f.notify };
        for (const k of ["title", "description", "location_type", "location_detail", "style", "level"]) if ((f[k] || "") !== (initial[k] || "")) payload[k] = f[k];
        if (teacher !== initial.instructor_id) payload.instructor_id = teacher;
        if (Number(f.duration_minutes) !== Number(initial.duration_minutes)) payload.duration_minutes = Number(f.duration_minutes);
        if (Number(f.capacity) !== Number(initial.capacity)) payload.capacity = Number(f.capacity);
        if (f.time !== (initial.schedule?.time || "")) payload.time = f.time;
        if (f.timezone !== (initial.schedule?.timezone || "")) payload.timezone = f.timezone;
        const { data } = await api.patch(`/admin/classes/series/${initial.id}`, payload);
        toast.success(t("classes.series_saved", "Series saved. {{n}} future class(es) updated, {{m}} student(s) told.", { n: data?.classes_changed || 0, m: data?.students_told || 0 }));
      } else {
        const { data } = await api.post("/admin/classes/series", {
          title: f.title.trim(), description: f.description, instructor_id: teacher, location_type: f.location_type,
          location_detail: f.location_detail || null, style: f.style || "hot", level: f.level || "all", duration_minutes: Number(f.duration_minutes),
          capacity: Number(f.capacity), weekdays: f.weekdays, time: f.time, timezone: f.timezone, start_date: f.start_date, weeks: Number(f.weeks),
          is_recorded: f.is_recorded, create_meetings: f.create_meetings,
        });
        toast.success(t("classes.series_created", "Series created with {{n}} classes.", { n: data?.created || 0 }));
      }
      onSaved();
    } catch (e) { toast.error(errText(e, "Could not save the series")); }
    finally { setBusy(false); }
  };

  return (
    <Modal title={editing ? t("classes.edit_series", "Edit series") : t("classes.new_series", "New weekly series")} onClose={onClose} tid="series-form" wide>
      <div className="space-y-3">
        <Field label={t("classes.class_name", "Class name")}><input value={f.title} onChange={set("title")} maxLength={120} className={inputCls} placeholder="Hot 26 · Morning" data-testid="series-title" /></Field>
        <Field label={t("classes.description", "Description")}><textarea rows={2} value={f.description} onChange={set("description")} className={inputCls} data-testid="series-description" /></Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={t("classes.teacher", "Teacher")}>
            <select value={teacher} onChange={set("instructor_id")} className={inputCls} data-testid="series-teacher">
              {instructors.map((i) => <option key={i.id} value={i.id}>{i.name || i.email}</option>)}
            </select>
          </Field>
          <Field label={t("classes.where", "Where")}>
            <select value={f.location_type} onChange={set("location_type")} className={inputCls} data-testid="series-location-type">
              <option value="online">{t("classes.online", "Online")}</option>
              <option value="in_person">{t("classes.in_person", "In person")}</option>
            </select>
          </Field>
        </div>
        {f.location_type === "in_person" && <Field label={t("classes.place", "Place / room")}><input value={f.location_detail} onChange={set("location_detail")} className={inputCls} placeholder="Studio Málaga" data-testid="series-place" /></Field>}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label={t("classes.style", "Style")}><input value={f.style} onChange={set("style")} className={inputCls} data-testid="series-style" /></Field>
          <Field label={t("classes.level", "Level")}>
            <select value={f.level} onChange={set("level")} className={inputCls} data-testid="series-level">
              {["all", "beginner", "intermediate", "advanced"].map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </Field>
          <Field label={t("classes.duration", "Minutes")}><input type="number" min={10} max={480} value={f.duration_minutes} onChange={set("duration_minutes")} className={inputCls} data-testid="series-duration" /></Field>
          <Field label={t("classes.capacity", "Places")}><input type="number" min={1} max={1000} value={f.capacity} onChange={set("capacity")} className={inputCls} data-testid="series-capacity" /></Field>
        </div>
        {!editing && <Field label={t("classes.days", "Days")}><DayChips value={f.weekdays} onChange={(v) => setF((p) => ({ ...p, weekdays: v }))} /></Field>}
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("classes.time", "Time")}><input type="time" value={f.time} onChange={set("time")} className={inputCls} data-testid="series-time" /></Field>
          <Field label={t("classes.timezone", "Time zone")}>
            <select value={f.timezone} onChange={set("timezone")} className={inputCls} data-testid="series-timezone">
              {timeZones().map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
            </select>
          </Field>
        </div>
        {!editing && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("classes.start_date", "First week from")}><input type="date" value={f.start_date} onChange={set("start_date")} className={inputCls} data-testid="series-start" /></Field>
            <Field label={t("classes.weeks", "Number of weeks")}><input type="number" min={1} max={52} value={f.weeks} onChange={set("weeks")} className={inputCls} data-testid="series-weeks" /></Field>
          </div>
        )}
        {!editing ? (
          <>
            <div className="flex items-center justify-between rounded-2xl bg-[#F7F6F1] px-4 py-3">
              <span className="text-[13px]">{t("classes.recorded", "Recorded for replay")}</span>
              <Toggle checked={f.is_recorded} onChange={(v) => setF((p) => ({ ...p, is_recorded: v }))} tid="series-recorded" />
            </div>
            {f.location_type === "online" && (
              <div className="flex items-center justify-between rounded-2xl bg-[#F7F6F1] px-4 py-3">
                <span className="text-[13px]">{t("classes.make_zoom", "Create Zoom meetings automatically")}</span>
                <Toggle checked={f.create_meetings} onChange={(v) => setF((p) => ({ ...p, create_meetings: v }))} tid="series-zoom" />
              </div>
            )}
            <p className="text-[11px] text-[#6B7269]">{t("classes.price_note", "Online classes use the prices in Class pricing. In-person classes are booked free and paid at the studio.")}</p>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-2xl bg-[#F7F6F1] px-4 py-3">
              <span className="text-[13px]">{t("classes.apply_future", "Also change every future date of this series")}</span>
              <Toggle checked={f.apply_to_future} onChange={(v) => setF((p) => ({ ...p, apply_to_future: v }))} tid="series-apply-future" />
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-[#F7F6F1] px-4 py-3">
              <span className="text-[13px]">{t("classes.tell_booked", "Tell booked students about changes")}</span>
              <Toggle checked={f.notify} onChange={(v) => setF((p) => ({ ...p, notify: v }))} tid="series-notify" />
            </div>
          </>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="pill pill-ghost !py-2 !px-4 !text-[13px]">{t("common.cancel", "Cancel")}</button>
          <button onClick={save} disabled={busy} className="pill pill-primary !py-2 !px-4 !text-[13px]" data-testid="series-save">{busy ? "…" : editing ? t("common.save", "Save") : t("classes.create_series", "Create series")}</button>
        </div>
      </div>
    </Modal>
  );
}

function ExtendModal({ s, onClose, onSaved }) {
  const { t } = useTranslation();
  const [weeks, setWeeks] = useState(4);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/admin/classes/series/${s.id}/extend`, { weeks: Number(weeks) });
      toast.success(t("classes.extended", "{{n}} more classes added.", { n: data?.created || 0 }));
      onSaved();
    } catch (e) { toast.error(errText(e, "Could not add weeks")); }
    finally { setBusy(false); }
  };
  return (
    <Modal title={t("classes.add_weeks", "Add more weeks")} onClose={onClose} tid="series-extend">
      <div className="space-y-3">
        <p className="text-[13px] text-[#6B7269]">{pattern(s, t)}</p>
        <Field label={t("classes.weeks", "Number of weeks")}><input type="number" min={1} max={52} value={weeks} onChange={(e) => setWeeks(e.target.value)} className={inputCls} data-testid="series-extend-weeks" /></Field>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="pill pill-ghost !py-2 !px-4 !text-[13px]">{t("common.cancel", "Cancel")}</button>
          <button onClick={go} disabled={busy} className="pill pill-primary !py-2 !px-4 !text-[13px]" data-testid="series-extend-save">{busy ? "…" : t("classes.add", "Add")}</button>
        </div>
      </div>
    </Modal>
  );
}

function OneOffModal({ s, onClose, onSaved }) {
  const { t } = useTranslation();
  const [when, setWhen] = useState("");
  const [capacity, setCapacity] = useState(s.capacity || 20);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    const iso = fromLocalInput(when);
    if (!iso) { toast.error(t("classes.need_when", "Choose the date and time.")); return; }
    setBusy(true);
    try {
      await api.post("/admin/classes/one-off", { template_id: s.id, start_time: iso, capacity: Number(capacity) });
      toast.success(t("classes.one_off_added", "Extra class added."));
      onSaved();
    } catch (e) { toast.error(errText(e, "Could not add the class")); }
    finally { setBusy(false); }
  };
  return (
    <Modal title={t("classes.add_one_date", "Add one extra date")} onClose={onClose} tid="series-oneoff">
      <div className="space-y-3">
        <Field label={t("classes.date_time", "Date & time (your time)")}><input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={inputCls} data-testid="series-oneoff-when" /></Field>
        <Field label={t("classes.capacity", "Places")}><input type="number" min={1} max={1000} value={capacity} onChange={(e) => setCapacity(e.target.value)} className={inputCls} data-testid="series-oneoff-capacity" /></Field>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="pill pill-ghost !py-2 !px-4 !text-[13px]">{t("common.cancel", "Cancel")}</button>
          <button onClick={go} disabled={busy} className="pill pill-primary !py-2 !px-4 !text-[13px]" data-testid="series-oneoff-save">{busy ? "…" : t("classes.add", "Add")}</button>
        </div>
      </div>
    </Modal>
  );
}

function EndModal({ s, onClose, onSaved }) {
  const { t } = useTranslation();
  const [from, setFrom] = useState(localDate(new Date()));
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(true);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/admin/classes/series/${s.id}/end?from_date=${from}`, { reason: reason.trim(), notify, compensate: "credit" });
      toast.success(t("classes.ended", "Series ended: {{n}} classes cancelled, {{m}} student(s) told.", { n: data?.classes_cancelled || 0, m: data?.students_told || 0 }));
      onSaved();
    } catch (e) { toast.error(errText(e, "Could not end the series")); }
    finally { setBusy(false); }
  };
  return (
    <Modal title={t("classes.end_series", "End this series")} onClose={onClose} tid="series-end">
      <div className="space-y-3">
        <div className="rounded-2xl bg-[#FBEFEA] border border-[#EED9D2] p-4 text-[13px] text-[#8A3B2A]">
          {t("classes.end_warn", "Every class of “{{title}}” from the date below is cancelled. Booked students get their credits back and are told.", { title: s.title })}
        </div>
        <Field label={t("classes.from_date", "Cancel classes from")}><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} data-testid="series-end-from" /></Field>
        <Field label={t("classes.reason", "Reason (shown to students)")}><input value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} data-testid="series-end-reason" /></Field>
        <div className="flex items-center justify-between rounded-2xl bg-[#F7F6F1] px-4 py-3">
          <span className="text-[13px]">{t("classes.notify_all", "Email and notify everyone booked")}</span>
          <Toggle checked={notify} onChange={setNotify} tid="series-end-notify" />
        </div>
        <Field label={t("classes.type_end", "Type END to confirm")}><input value={typed} onChange={(e) => setTyped(e.target.value)} className={inputCls} data-testid="series-end-typed" /></Field>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="pill pill-ghost !py-2 !px-4 !text-[13px]">{t("classes.keep_series", "Keep the series")}</button>
          <button onClick={go} disabled={busy || typed.trim().toUpperCase() !== "END"} className="pill !py-2 !px-4 !text-[13px] bg-[#B25A45] text-white disabled:opacity-50" data-testid="series-end-confirm">{busy ? "…" : t("classes.end_now", "End series")}</button>
        </div>
      </div>
    </Modal>
  );
}

export default function SeriesTab({ series, loading, onChanged }) {
  const { t } = useTranslation();
  const [modal, setModal] = useState(null); // {kind, s}
  const done = () => { setModal(null); onChanged(); };
  const active = (series || []).filter((s) => s.active !== false || s.upcoming > 0);
  const ended = (series || []).filter((s) => !(s.active !== false || s.upcoming > 0));

  const card = (s) => (
    <li key={s.id} className="rounded-3xl bg-white border border-[#E5E6DF] p-4" data-testid={`series-row-${s.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[15px] font-semibold" data-testid="series-row-title">{s.title}</span>
            {s.active === false && <Chip>{t("classes.ended_chip", "Ended")}</Chip>}
            {s.level && <Chip>{s.level}</Chip>}
          </div>
          <div className="text-[12px] text-[#6B7269] mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            <span className="inline-flex items-center gap-1"><Repeat className="h-3.5 w-3.5" />{pattern(s, t)}</span>
            <span className="inline-flex items-center gap-1">{s.location_type === "online" ? <Video className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}{s.location_type === "online" ? t("classes.online", "Online") : (s.location_detail || t("classes.in_person", "In person"))}</span>
            {s.instructor_name && <span>{t("classes.with", "with")} {s.instructor_name}</span>}
          </div>
          <div className="text-[12px] text-[#545E56] mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5">
            <span>{t("classes.next", "Next")}: <strong>{s.next_start ? fmtWhen(s.next_start) : "—"}</strong></span>
            <span>{s.upcoming} {t("classes.upcoming_dates", "upcoming dates")}</span>
            <span>{t("classes.fill30", "Fill (30 days)")}: <strong>{s.fill_30d == null ? "—" : `${s.fill_30d}%`}</strong></span>
            <span>{t("classes.att30", "Attendance")}: <strong>{s.attendance_30d == null ? "—" : `${s.attendance_30d}%`}</strong></span>
            <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{s.subscribers} {t("classes.subscribers", "series subscribers")}</span>
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => setModal({ kind: "edit", s })} className="pill pill-ghost !py-1.5 !px-3 !text-[12px]" data-testid={`series-edit-${s.id}`}><Pencil className="h-3.5 w-3.5" />{t("classes.edit", "Edit")}</button>
        <button onClick={() => setModal({ kind: "extend", s })} className="pill pill-ghost !py-1.5 !px-3 !text-[12px]" data-testid={`series-extend-${s.id}`}><CalendarPlus className="h-3.5 w-3.5" />{t("classes.add_weeks", "Add more weeks")}</button>
        <button onClick={() => setModal({ kind: "oneoff", s })} className="pill pill-ghost !py-1.5 !px-3 !text-[12px]" data-testid={`series-oneoff-${s.id}`}><CalendarClock className="h-3.5 w-3.5" />{t("classes.add_one_date", "Add one extra date")}</button>
        {s.upcoming > 0 && <button onClick={() => setModal({ kind: "end", s })} className="pill !py-1.5 !px-3 !text-[12px] border border-[#EED9D2] text-[#B25A45] bg-white" data-testid={`series-end-${s.id}`}><CalendarX className="h-3.5 w-3.5" />{t("classes.end_series", "End this series")}</button>}
      </div>
    </li>
  );

  return (
    <div data-testid="class-series">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-[13px] text-[#6B7269] max-w-xl">{t("classes.series_intro", "A series is a class that repeats every week (for example Hot 26 on Monday, Wednesday and Friday at 8:00). Change it once and every future date follows.")}</p>
        <button onClick={() => setModal({ kind: "new" })} className="pill pill-primary !py-2 !px-4 !text-[13px]" data-testid="series-new"><Plus className="h-4 w-4" />{t("classes.new_series", "New weekly series")}</button>
      </div>
      {loading && !series && <Spinner />}
      {series && active.length === 0 && <div className="rounded-3xl border border-dashed border-[#D8D9D1] p-6 text-center text-[13px] text-[#6B7269]">{t("classes.no_series", "No class series yet.")}</div>}
      <ul className="space-y-3">{active.map(card)}</ul>
      {ended.length > 0 && (
        <details className="mt-6">
          <summary className="eyebrow !text-[11px] cursor-pointer">{t("classes.ended_series", "Ended series ({{n}})", { n: ended.length })}</summary>
          <ul className="space-y-3 mt-3">{ended.map(card)}</ul>
        </details>
      )}
      {modal?.kind === "new" && <SeriesForm onClose={() => setModal(null)} onSaved={done} />}
      {modal?.kind === "edit" && <SeriesForm initial={modal.s} onClose={() => setModal(null)} onSaved={done} />}
      {modal?.kind === "extend" && <ExtendModal s={modal.s} onClose={() => setModal(null)} onSaved={done} />}
      {modal?.kind === "oneoff" && <OneOffModal s={modal.s} onClose={() => setModal(null)} onSaved={done} />}
      {modal?.kind === "end" && <EndModal s={modal.s} onClose={() => setModal(null)} onSaved={done} />}
    </div>
  );
}
