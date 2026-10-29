import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, CalendarDays, Users, Video, MapPin } from "lucide-react";
import { api } from "@/lib/api";
import Spinner from "@/components/Spinner";
import { inputCls } from "../shared";
import ClassDrawer from "./ClassDrawer";
import { Chip, FillBar, fmtTime, localDate, mondayOf, rememberInstructors } from "./classShared";

export default function ScheduleTab({ series = [], refreshKey = 0 }) {
  const { t } = useTranslation();
  const [monday, setMonday] = useState(() => mondayOf(new Date()));
  const [filter, setFilter] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(null);

  const load = useCallback(() => {
    // Ask one day either side so every class in the viewer's local week is included.
    const from = new Date(monday);
    from.setDate(from.getDate() - 1);
    const q = `/admin/classes/calendar?start=${localDate(from)}&days=9${filter ? `&template_id=${filter}` : ""}`;
    api.get(q).then(({ data: d }) => { setData(d); setError(false); rememberInstructors(d?.instructors); }).catch(() => setError(true));
  }, [monday, filter]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const days = useMemo(() => {
    const out = [];
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      out.push({ key: localDate(d), date: d, classes: [] });
    }
    for (const c of data?.classes || []) {
      const k = localDate(new Date(c.start_time));
      const day = out.find((x) => x.key === k);
      if (day) day.classes.push(c);
    }
    out.forEach((d) => d.classes.sort((a, b) => String(a.start_time).localeCompare(String(b.start_time))));
    return out;
  }, [data, monday]);

  const shift = (n) => setMonday((m) => { const x = new Date(m); x.setDate(x.getDate() + 7 * n); return x; });
  const total = days.reduce((s, d) => s + d.classes.filter((c) => c.status !== "cancelled").length, 0);
  const booked = days.reduce((s, d) => s + d.classes.reduce((a, c) => a + (c.status !== "cancelled" ? c.booked : 0), 0), 0);
  const todayKey = localDate(new Date());
  const end = new Date(monday);
  end.setDate(end.getDate() + 6);

  return (
    <div data-testid="class-schedule">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button onClick={() => shift(-1)} className="h-9 w-9 rounded-full border border-[#E5E6DF] bg-white flex items-center justify-center" aria-label="Previous week" data-testid="week-prev"><ChevronLeft className="h-4 w-4" /></button>
        <button onClick={() => setMonday(mondayOf(new Date()))} className="pill pill-ghost !py-2 !px-4 !text-[13px]" data-testid="week-today">{t("classes.this_week", "This week")}</button>
        <button onClick={() => shift(1)} className="h-9 w-9 rounded-full border border-[#E5E6DF] bg-white flex items-center justify-center" aria-label="Next week" data-testid="week-next"><ChevronRight className="h-4 w-4" /></button>
        <div className="text-[14px] font-semibold ml-1" data-testid="week-label">
          {monday.toLocaleDateString(undefined, { day: "numeric", month: "short" })} – {end.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className={`${inputCls} !py-2 !w-auto`} data-testid="week-filter">
            <option value="">{t("classes.all_series", "All classes")}</option>
            {series.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        </div>
      </div>
      <div className="text-[12px] text-[#6B7269] mb-3" data-testid="week-summary">
        {t("classes.week_summary", "{{n}} classes · {{b}} bookings", { n: total, b: booked })}
      </div>
      {error && <div className="rounded-2xl bg-[#FBEFEA] p-4 text-sm text-[#8A3B2A]">{t("classes.schedule_load_error", "Could not load the schedule.")} <button onClick={load} className="underline font-semibold">{t("common.retry", "Try again")}</button></div>}
      {!data && !error && <Spinner />}
      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7 gap-3">
          {days.map((d) => (
            <section key={d.key} className={`rounded-3xl border p-3 ${d.key === todayKey ? "border-[#B25A45] bg-[#FDF8F6]" : "border-[#E5E6DF] bg-white"}`} data-testid={`day-${d.key}`}>
              <div className="flex items-baseline justify-between mb-2 px-1">
                <div className="text-[12px] font-bold uppercase tracking-widest text-[#839682]">{d.date.toLocaleDateString(undefined, { weekday: "short" })}</div>
                <div className="text-[13px] font-semibold">{d.date.toLocaleDateString(undefined, { day: "numeric", month: "short" })}</div>
              </div>
              {d.classes.length === 0 ? (
                <div className="text-[12px] text-[#9AA096] px-1 py-3">{t("classes.no_classes", "No classes")}</div>
              ) : (
                <ul className="space-y-2">
                  {d.classes.map((c) => (
                    <li key={c.id}>
                      <button onClick={() => setOpen(c.id)} data-testid={`class-card-${c.id}`}
                        className={`w-full text-left rounded-2xl border p-3 transition hover:border-[#B25A45] ${c.status === "cancelled" ? "border-[#EED9D2] bg-[#FDF6F3] opacity-70" : c.past ? "border-[#E5E6DF] bg-[#F7F6F1]" : "border-[#E5E6DF] bg-white"}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[13px] font-bold">{fmtTime(c.start_time)}</span>
                          {c.status === "cancelled" ? <Chip tone="red">{t("classes.cancelled", "Cancelled")}</Chip>
                            : c.spots_left === 0 ? <Chip tone="dark">{t("classes.full", "Full")}</Chip>
                              : c.past ? <Chip>{t("classes.past", "Past")}</Chip> : null}
                        </div>
                        <div className={`text-[13px] font-semibold leading-snug mt-1 ${c.status === "cancelled" ? "line-through" : ""}`}>{c.title}</div>
                        <div className="text-[11px] text-[#6B7269] mt-0.5 flex items-center gap-1 truncate">
                          {c.location_type === "online" ? <Video className="h-3 w-3 shrink-0" /> : <MapPin className="h-3 w-3 shrink-0" />}
                          <span className="truncate">{c.instructor?.name || "—"}</span>
                        </div>
                        {c.status !== "cancelled" && (
                          <div className="mt-2">
                            <FillBar booked={c.booked} capacity={c.capacity} />
                            <div className="mt-1 flex items-center justify-between text-[11px] text-[#545E56]">
                              <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{c.booked}/{c.capacity}</span>
                              {c.waitlist > 0 && <span className="text-[#8A6D3B] font-semibold">+{c.waitlist} {t("classes.waiting", "waiting")}</span>}
                              {c.past && c.booked > 0 && <span>{c.attended} {t("classes.came", "came")}</span>}
                            </div>
                          </div>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
      {data && total === 0 && (
        <div className="mt-4 rounded-3xl border border-dashed border-[#D8D9D1] p-6 text-center text-[13px] text-[#6B7269]" data-testid="week-empty">
          <CalendarDays className="h-6 w-6 mx-auto text-[#839682]" />
          <div className="mt-2">{t("classes.week_empty", "No classes this week. Create a weekly series in the Series tab.")}</div>
        </div>
      )}
      {open && <ClassDrawer classId={open} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  );
}
