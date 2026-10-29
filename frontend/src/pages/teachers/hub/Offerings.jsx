import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Plus, Pencil, Archive, RotateCcw, Users, X, Trash2, CalendarDays, PlayCircle, Ticket, Check } from "lucide-react";
import { api } from "@/lib/api";
import { Label, LabelText, errText, fmtWhen, fromLocalInput, inputCls, money, toLocalInput } from "../teacherShared";

const KIND_ICON = { class: CalendarDays, course: PlayCircle, pack: Ticket };
const KIND_LABEL = { class: "Class", course: "Recorded course", pack: "Class pack" };

const blank = (kind = "class") => ({
  kind, title: "", description: "", image: "", level: "all", language: "", location_type: "online", location: "", zoom_url: "",
  price: 0, currency: "eur", capacity: kind === "class" ? 15 : "", access_days: 0, credits: kind === "pack" ? 5 : "", active: true,
  newSessions: [], lessons: kind === "course" ? [{ title: "", video_url: "", duration_min: "", description: "" }] : [],
});

/** The full body PUT/POST /teacher/offerings expects, from an offering (or the editor form). */
function payloadOf(o, newSessions = []) {
  return {
    kind: o.kind, title: (o.title || "").trim(), description: o.description || "", image: o.image || null, level: o.level || "all",
    language: o.language || null, location_type: o.location_type || "online", location: o.location || null, zoom_url: o.zoom_url || null,
    price: Number(o.price || 0), currency: o.currency || "eur",
    capacity: o.kind === "class" && o.capacity !== "" && o.capacity != null ? Number(o.capacity) : null,
    access_days: o.kind === "course" ? Number(o.access_days || 0) : 0,
    credits: o.kind === "pack" ? Number(o.credits || 0) || null : null,
    sessions: newSessions, active: !!o.active,
    lessons: o.kind === "course" ? (o.lessons || []).filter((l) => l.title && l.video_url).map((l) => ({
      title: l.title.trim(), video_url: l.video_url.trim(), duration_min: l.duration_min ? Number(l.duration_min) : null, description: l.description || null,
    })) : [],
  };
}

function Editor({ initial, onClose, onSaved }) {
  const { t } = useTranslation();
  const editing = !!initial?.id;
  const [f, setF] = useState(() => (initial ? { ...blank(initial.kind), ...initial, newSessions: [], lessons: (initial.lessons || []).map((l) => ({ ...l, duration_min: l.duration_min || "" })) } : blank()));
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const setKind = (k) => setF((x) => ({ ...blank(k), title: x.title, description: x.description, price: x.price, currency: x.currency }));

  const addSession = () => {
    const last = f.newSessions[f.newSessions.length - 1];
    const base = last ? new Date(new Date(fromLocalInput(last.when)).getTime() + 7 * 86400000) : new Date(Date.now() + 86400000);
    if (!last) base.setHours(9, 0, 0, 0);
    set("newSessions", [...f.newSessions, { when: toLocalInput(base.toISOString()), duration_min: last?.duration_min || 60 }]);
  };

  const save = async () => {
    if (!f.title.trim()) { toast.error(t("hub.need_title", "Give it a title.")); return; }
    const sessions = [];
    for (const s of f.newSessions) {
      const iso = fromLocalInput(s.when);
      if (!iso) { toast.error(t("hub.bad_date", "Check the class dates.")); return; }
      if (new Date(iso) < new Date()) { toast.error(t("hub.past_date", "Class dates must be in the future.")); return; }
      sessions.push({ start_time: iso, duration_min: Number(s.duration_min) || 60 });
    }
    setBusy(true);
    try {
      const body = payloadOf(f, sessions);
      if (editing) await api.put(`/teacher/offerings/${initial.id}`, body);
      else await api.post("/teacher/offerings", body);
      toast.success(t("hub.saved", "Saved."));
      onSaved();
    } catch (e) { toast.error(errText(e)); }
    finally { setBusy(false); }
  };

  const lesson = (i, k, v) => set("lessons", f.lessons.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  return (
    <div className="rounded-3xl bg-white border border-[#B25A45] p-5 space-y-4" data-testid="offering-editor">
      <div className="flex items-center justify-between">
        <div className="serif text-xl">{editing ? t("hub.edit", "Edit") : t("hub.new", "New")} · {t(`hub.kind_${f.kind}`, KIND_LABEL[f.kind])}</div>
        <button type="button" onClick={onClose} aria-label="Close" className="h-8 w-8 rounded-full hover:bg-[#F2F2EC] flex items-center justify-center"><X className="h-4 w-4" /></button>
      </div>
      {!editing && (
        <div className="flex flex-wrap gap-1.5">
          {Object.keys(KIND_LABEL).map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)} data-testid={`offering-kind-${k}`}
              className={`rounded-full px-3 py-1.5 text-[12px] font-semibold border ${f.kind === k ? "bg-[#1C221F] text-white border-[#1C221F]" : "bg-white border-[#E5E6DF]"}`}>{t(`hub.kind_${k}`, KIND_LABEL[k])}</button>
          ))}
        </div>
      )}
      <Label><LabelText>{t("hub.f_title", "Title")}</LabelText><input value={f.title} onChange={(e) => set("title", e.target.value)} className={inputCls} data-testid="offering-title" /></Label>
      <Label><LabelText>{t("hub.f_desc", "Description")}</LabelText><textarea rows={3} value={f.description} onChange={(e) => set("description", e.target.value)} className={inputCls} data-testid="offering-description" /></Label>
      <div className="grid grid-cols-2 gap-3">
        <Label><LabelText>{t("hub.f_price", "Price")}</LabelText><input type="number" min={0} step="0.5" value={f.price} onChange={(e) => set("price", e.target.value)} className={inputCls} data-testid="offering-price" /></Label>
        <Label><LabelText>{t("hub.f_currency", "Currency")}</LabelText>
          <select value={f.currency} onChange={(e) => set("currency", e.target.value)} className={inputCls}><option value="eur">EUR</option><option value="usd">USD</option><option value="gbp">GBP</option></select></Label>
      </div>
      <p className="text-[11px] text-[#9AA096] -mt-2">{t("hub.price_hint", "0 = free. Students pay you directly (card through your Stripe, or in person).")}</p>
      <div className="grid grid-cols-2 gap-3">
        <Label><LabelText>{t("hub.f_level", "Level")}</LabelText>
          <select value={f.level} onChange={(e) => set("level", e.target.value)} className={inputCls}>
            {["all", "beginner", "intermediate", "advanced"].map((l) => <option key={l} value={l}>{t(`hub.level_${l}`, l === "all" ? "All levels" : l[0].toUpperCase() + l.slice(1))}</option>)}
          </select></Label>
        <Label><LabelText>{t("hub.f_language", "Language")}</LabelText><input value={f.language || ""} onChange={(e) => set("language", e.target.value)} className={inputCls} placeholder="English" /></Label>
      </div>
      <Label><LabelText>{t("hub.f_image", "Image link (optional)")}</LabelText><input value={f.image || ""} onChange={(e) => set("image", e.target.value)} className={inputCls} placeholder="https://" /></Label>

      {f.kind === "class" && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {[["online", t("hub.online", "Online")], ["in_person", t("hub.in_person", "In person")]].map(([v, label]) => (
              <button key={v} type="button" onClick={() => set("location_type", v)} data-testid={`offering-loc-${v}`}
                className={`rounded-full px-3 py-1.5 text-[12px] font-semibold border ${f.location_type === v ? "bg-[#1C221F] text-white border-[#1C221F]" : "bg-white border-[#E5E6DF]"}`}>{label}</button>
            ))}
          </div>
          {f.location_type === "online" ? (
            <Label hint={t("hub.zoom_hint", "Your own Zoom / Meet link. Booked students see it from an hour before the class.")}><LabelText>{t("hub.f_zoom", "Meeting link")}</LabelText>
              <input value={f.zoom_url || ""} onChange={(e) => set("zoom_url", e.target.value)} className={inputCls} placeholder="https://zoom.us/j/…" data-testid="offering-zoom" /></Label>
          ) : (
            <Label><LabelText>{t("hub.f_location", "Address")}</LabelText><input value={f.location || ""} onChange={(e) => set("location", e.target.value)} className={inputCls} data-testid="offering-location" /></Label>
          )}
          <Label><LabelText>{t("hub.f_capacity", "Places per class")}</LabelText><input type="number" min={1} value={f.capacity ?? ""} onChange={(e) => set("capacity", e.target.value)} className={inputCls} data-testid="offering-capacity" /></Label>
          <div>
            <LabelText>{t("hub.f_dates", "Class dates")}</LabelText>
            {editing && (initial.sessions || []).length > 0 && (
              <ul className="mb-2 space-y-1 text-[12px] text-[#545E56]">
                {(initial.sessions || []).filter((s) => !s.cancelled && new Date(s.start_time) > new Date()).map((s) => <li key={s.id}>• {fmtWhen(s.start_time)} · {s.duration_min} min</li>)}
              </ul>
            )}
            <div className="space-y-2">
              {f.newSessions.map((s, i) => (
                <div key={i} className="flex items-center gap-2" data-testid={`offering-session-row-${i}`}>
                  <input type="datetime-local" value={s.when} onChange={(e) => set("newSessions", f.newSessions.map((x, j) => (j === i ? { ...x, when: e.target.value } : x)))} className={`${inputCls} flex-1`} data-testid={`offering-session-when-${i}`} />
                  <input type="number" min={10} max={600} value={s.duration_min} onChange={(e) => set("newSessions", f.newSessions.map((x, j) => (j === i ? { ...x, duration_min: e.target.value } : x)))} className={`${inputCls} !w-20`} title={t("hub.minutes", "Minutes")} />
                  <button type="button" onClick={() => set("newSessions", f.newSessions.filter((_, j) => j !== i))} aria-label="Remove" className="h-9 w-9 rounded-full hover:bg-[#F2F2EC] flex items-center justify-center shrink-0"><Trash2 className="h-4 w-4 text-[#B25A45]" /></button>
                </div>
              ))}
            </div>
            <button type="button" onClick={addSession} className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-[#B25A45]" data-testid="offering-add-session"><Plus className="h-3.5 w-3.5" />{t("hub.add_date", "Add a date")}</button>
          </div>
        </>
      )}

      {f.kind === "course" && (
        <>
          <Label hint={t("hub.access_hint", "0 = access never ends.")}><LabelText>{t("hub.f_access", "Days of access")}</LabelText>
            <input type="number" min={0} value={f.access_days} onChange={(e) => set("access_days", e.target.value)} className={inputCls} /></Label>
          <div>
            <LabelText>{t("hub.f_lessons", "Lessons (YouTube, Vimeo or other https links)")}</LabelText>
            <div className="space-y-3">
              {f.lessons.map((l, i) => (
                <div key={i} className="rounded-2xl bg-[#FAFAF7] border border-[#EFEFE9] p-3 space-y-2" data-testid={`offering-lesson-row-${i}`}>
                  <div className="flex gap-2">
                    <input value={l.title} onChange={(e) => lesson(i, "title", e.target.value)} placeholder={t("hub.lesson_title", "Lesson title")} className={`${inputCls} flex-1`} data-testid={`offering-lesson-title-${i}`} />
                    <input type="number" min={1} value={l.duration_min} onChange={(e) => lesson(i, "duration_min", e.target.value)} placeholder="min" className={`${inputCls} !w-20`} />
                  </div>
                  <input value={l.video_url} onChange={(e) => lesson(i, "video_url", e.target.value)} placeholder="https://youtu.be/…" className={inputCls} data-testid={`offering-lesson-url-${i}`} />
                  <div className="flex justify-between">
                    <input value={l.description || ""} onChange={(e) => lesson(i, "description", e.target.value)} placeholder={t("hub.lesson_note", "Note (optional)")} className={`${inputCls} flex-1 mr-2`} />
                    <button type="button" onClick={() => set("lessons", f.lessons.filter((_, j) => j !== i))} aria-label="Remove" className="h-9 w-9 rounded-full hover:bg-[#F2F2EC] flex items-center justify-center"><Trash2 className="h-4 w-4 text-[#B25A45]" /></button>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => set("lessons", [...f.lessons, { title: "", video_url: "", duration_min: "", description: "" }])} className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-[#B25A45]" data-testid="offering-add-lesson"><Plus className="h-3.5 w-3.5" />{t("hub.add_lesson", "Add a lesson")}</button>
          </div>
        </>
      )}

      {f.kind === "pack" && (
        <Label hint={t("hub.pack_hint", "Students use one credit per class with you.")}><LabelText>{t("hub.f_credits", "Classes in the pack")}</LabelText>
          <input type="number" min={2} max={100} value={f.credits} onChange={(e) => set("credits", e.target.value)} className={inputCls} data-testid="offering-credits" /></Label>
      )}

      <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={!!f.active} onChange={(e) => set("active", e.target.checked)} className="h-4 w-4 accent-[#B25A45]" data-testid="offering-active" />{t("hub.published", "Published (students can see it)")}</label>
      <div className="flex gap-2">
        <button type="button" onClick={save} disabled={busy} className="pill pill-primary" data-testid="offering-save">{busy ? "…" : t("hub.save", "Save")}</button>
        <button type="button" onClick={onClose} className="pill pill-ghost">{t("common.cancel", "Cancel")}</button>
      </div>
    </div>
  );
}

function Roster({ offering, sessionId, onClose }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState(null);
  const load = useCallback(() => {
    api.get(`/teacher/roster/${offering.id}${sessionId ? `?session_id=${sessionId}` : ""}`).then(({ data }) => setRows(data || [])).catch(() => setRows([]));
  }, [offering.id, sessionId]);
  useEffect(() => { load(); }, [load]);
  const patch = async (e, body) => {
    try { await api.patch(`/teacher/enrollments/${e.id}`, body); load(); }
    catch (err) { toast.error(errText(err)); }
  };
  const session = (offering.sessions || []).find((s) => s.id === sessionId);
  return (
    <div className="rounded-2xl bg-[#F7F2EC] border border-[#E7D9CB] p-3 space-y-2" data-testid="offering-roster">
      <div className="flex items-center justify-between">
        <div className="text-[13px] font-semibold">{offering.title}{session ? ` · ${fmtWhen(session.start_time)}` : ""}</div>
        <button type="button" onClick={onClose} aria-label="Close" className="h-7 w-7 rounded-full hover:bg-white flex items-center justify-center"><X className="h-4 w-4" /></button>
      </div>
      {rows === null ? <div className="h-10 rounded-xl bg-white/60 animate-pulse" /> : rows.length === 0 ? <p className="text-[12px] text-[#6B7269]">{t("hub.no_bookings", "No bookings yet.")}</p> : (
        <ul className="space-y-1.5">
          {rows.map((e) => (
            <li key={e.id} className="rounded-xl bg-white border border-[#E5E6DF] p-2.5 flex flex-wrap items-center justify-between gap-2" data-testid={`roster-row-${e.id}`}>
              <div className="min-w-0">
                <div className="text-[13px] font-semibold truncate">{e.user_name || e.user_email}</div>
                <div className="text-[11px] text-[#6B7269] truncate">{e.user_email} · {e.payment}{e.payment === "offline" ? (e.paid ? ` · ${t("hub.paid", "paid")}` : ` · ${t("hub.unpaid", "not paid yet")}`) : ""}</div>
              </div>
              <div className="flex items-center gap-1.5">
                {e.payment === "offline" && (
                  <button type="button" onClick={() => patch(e, { paid: !e.paid })} data-testid={`roster-paid-${e.id}`}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold border ${e.paid ? "bg-[#E4F0E8] border-[#CFE3D5] text-[#3E7C57]" : "bg-white border-[#E5E6DF]"}`}>{e.paid ? <><Check className="inline h-3 w-3" /> {t("hub.paid", "paid")}</> : t("hub.mark_paid", "Mark paid")}</button>
                )}
                {e.kind === "class" && (
                  <select value={e.status} onChange={(ev) => patch(e, { status: ev.target.value })} data-testid={`roster-status-${e.id}`} className="rounded-full border border-[#E5E6DF] bg-white px-2 py-1 text-[11px] font-semibold">
                    <option value="booked">{t("hub.st_booked", "Booked")}</option>
                    <option value="attended">{t("hub.st_attended", "Attended")}</option>
                    <option value="no_show">{t("hub.st_no_show", "No-show")}</option>
                    <option value="cancelled">{t("hub.st_cancelled", "Cancelled")}</option>
                  </select>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Offerings({ me, reload }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState(null);
  const [editing, setEditing] = useState(null); // null | "new" | offering
  const [roster, setRoster] = useState(null); // {offering, sessionId}

  const load = useCallback(() => {
    api.get("/teacher/offerings").then(({ data }) => setRows(data || [])).catch(() => setRows([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggleActive = async (o) => {
    try { await api.put(`/teacher/offerings/${o.id}`, { ...payloadOf(o), active: !o.active }); toast.success(o.active ? t("hub.archived", "Hidden from students.") : t("hub.published_ok", "Published.")); load(); reload(); }
    catch (e) { toast.error(errText(e)); }
  };
  const cancelSession = async (o, s) => {
    if (!window.confirm(t("hub.cancel_date_confirm", "Cancel {{when}}? Booked students are told and class credits are returned.", { when: fmtWhen(s.start_time) }))) return;
    try { const { data } = await api.post(`/teacher/offerings/${o.id}/sessions/${s.id}/cancel`); toast.success(t("hub.date_cancelled", "Cancelled. {{n}} student(s) told.", { n: data?.notified || 0 })); load(); reload(); }
    catch (e) { toast.error(errText(e)); }
  };

  const limit = Number(me.tier?.max_offerings || 0);
  const active = (rows || []).filter((o) => o.active).length;

  return (
    <div className="space-y-4" data-testid="hub-offerings">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-[#6B7269]">{limit ? t("hub.limit", "{{n}} of {{max}} active on your {{tier}} plan.", { n: active, max: limit, tier: me.tier?.name || "" }) : t("hub.n_active", "{{n}} active.", { n: active })}</p>
        {editing === null && <button type="button" onClick={() => setEditing("new")} className="pill pill-primary !py-2 !px-4 !text-xs" data-testid="offering-new"><Plus className="h-3.5 w-3.5" />{t("hub.add_new", "Add class, course or pack")}</button>}
      </div>
      {editing !== null && <Editor key={editing === "new" ? "new" : editing.id} initial={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); reload(); }} />}
      {rows === null && <div className="h-24 rounded-3xl bg-[#F2F2EC] animate-pulse" />}
      {rows?.length === 0 && editing === null && <p className="text-[14px] text-[#6B7269]" data-testid="offerings-empty">{t("hub.no_offerings", "Nothing yet. Add your first class: pick the dates, the price and your meeting link or address.")}</p>}
      <ul className="space-y-3">
        {(rows || []).map((o) => {
          const Icon = KIND_ICON[o.kind] || CalendarDays;
          return (
            <li key={o.id} className={`rounded-3xl bg-white border border-[#E5E6DF] p-4 space-y-3 ${o.active ? "" : "opacity-70"}`} data-testid={`hub-offering-${o.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><Icon className="h-4 w-4 text-[#B25A45] shrink-0" /><span className="text-[15px] font-semibold truncate">{o.title}</span></div>
                  <div className="text-[12px] text-[#6B7269] mt-0.5">
                    {t(`hub.kind_${o.kind}`, KIND_LABEL[o.kind])} · {Number(o.price) > 0 ? money(o.price, o.currency) : t("teachers.free", "Free")}
                    {o.kind === "pack" ? ` · ${o.credits} ${t("hub.classes", "classes")}` : ""}{o.kind === "course" ? ` · ${(o.lessons || []).length} ${t("hub.lessons", "lessons")}` : ""}
                    {` · ${t("hub.n_enrolled", "{{n}} students", { n: o.enrolled || 0 })}`}{!o.active ? ` · ${t("hub.hidden", "hidden")}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" onClick={() => setEditing(o)} aria-label={t("hub.edit", "Edit")} data-testid={`offering-edit-${o.id}`} className="h-8 w-8 rounded-full hover:bg-[#F2F2EC] flex items-center justify-center"><Pencil className="h-4 w-4" /></button>
                  <button type="button" onClick={() => toggleActive(o)} aria-label={o.active ? "Hide" : "Publish"} data-testid={`offering-toggle-${o.id}`} className="h-8 w-8 rounded-full hover:bg-[#F2F2EC] flex items-center justify-center">{o.active ? <Archive className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}</button>
                  {o.kind !== "class" && <button type="button" onClick={() => setRoster({ offering: o, sessionId: null })} aria-label={t("hub.students", "Students")} data-testid={`offering-roster-${o.id}`} className="h-8 w-8 rounded-full hover:bg-[#F2F2EC] flex items-center justify-center"><Users className="h-4 w-4" /></button>}
                </div>
              </div>
              {o.kind === "class" && (o.upcoming || []).length > 0 && (
                <ul className="space-y-1.5">
                  {o.upcoming.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#FAFAF7] border border-[#EFEFE9] px-3 py-2">
                      <span className="text-[13px]"><span className="font-semibold">{fmtWhen(s.start_time)}</span> <span className="text-[#6B7269]">· {s.booked}{o.capacity ? `/${o.capacity}` : ""} {t("hub.booked", "booked")}</span></span>
                      <span className="flex items-center gap-3">
                        <button type="button" onClick={() => setRoster({ offering: o, sessionId: s.id })} data-testid={`session-roster-${s.id}`} className="text-[12px] font-semibold text-[#1C221F] hover:text-[#B25A45]">{t("hub.roster", "Roster")}</button>
                        <button type="button" onClick={() => cancelSession(o, s)} data-testid={`session-cancel-${s.id}`} className="text-[12px] text-[#B25A45] hover:underline">{t("common.cancel", "Cancel")}</button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {o.kind === "class" && !(o.upcoming || []).length && <p className="text-[12px] text-[#9AA096]">{t("hub.no_dates", "No upcoming dates. Edit to add some.")}</p>}
              {roster?.offering.id === o.id && <Roster offering={o} sessionId={roster.sessionId} onClose={() => setRoster(null)} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export { payloadOf };
