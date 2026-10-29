import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Mail } from "lucide-react";
import { api } from "@/lib/api";
import Spinner from "@/components/Spinner";
import { WEEKDAYS } from "./classShared";

function Tile({ label, value, tid, tone }) {
  return (
    <div className={`rounded-2xl border p-4 ${tone === "dark" ? "bg-[#1C221F] text-white border-[#1C221F]" : "bg-white border-[#E5E6DF]"}`} data-testid={tid}>
      <div className={`text-[10px] uppercase tracking-widest font-bold ${tone === "dark" ? "text-[#E8B8A8]" : "text-[#839682]"}`}>{label}</div>
      <div className="serif text-3xl mt-1">{value}</div>
    </div>
  );
}

export default function ReportsTab() {
  const { t } = useTranslation();
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const load = useCallback(() => {
    setData(null);
    api.get(`/admin/classes/reports?days=${days}`).then(({ data: d }) => { setData(d); setError(false); }).catch(() => setError(true));
  }, [days]);
  useEffect(() => { load(); }, [load]);
  const pct = (v) => (v == null ? "—" : `${v}%`);
  const maxBooked = Math.max(1, ...((data?.heatmap || []).map((h) => h.booked)));
  const tot = data?.totals || {};

  return (
    <div data-testid="class-reports">
      <div className="flex items-center gap-2 mb-4">
        {[30, 90, 365].map((d) => (
          <button key={d} onClick={() => setDays(d)} data-testid={`reports-days-${d}`}
            className={`rounded-full px-4 py-1.5 text-[13px] font-semibold border ${days === d ? "bg-[#1C221F] text-white border-[#1C221F]" : "bg-white border-[#E5E6DF] text-[#545E56]"}`}>
            {d === 365 ? t("classes.last_year", "Last year") : t("classes.last_days", "Last {{n}} days", { n: d })}
          </button>
        ))}
      </div>
      {error && <div className="rounded-2xl bg-[#FBEFEA] p-4 text-sm text-[#8A3B2A]">{t("classes.report_load_error", "Could not load the report.")} <button onClick={load} className="underline font-semibold">{t("common.retry", "Try again")}</button></div>}
      {!data && !error && <Spinner />}
      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <Tile label={t("classes.r_classes", "Classes held")} value={tot.classes ?? 0} tid="kpi-classes" tone="dark" />
            <Tile label={t("classes.r_cancelled", "Cancelled")} value={tot.cancelled ?? 0} tid="kpi-cancelled" />
            <Tile label={t("classes.r_booked", "Bookings")} value={tot.booked ?? 0} tid="kpi-booked" />
            <Tile label={t("classes.r_attended", "Attended")} value={tot.attended ?? 0} tid="kpi-attended" />
            <Tile label={t("classes.r_noshow", "No-shows")} value={tot.no_show ?? 0} tid="kpi-noshow" />
            <Tile label={t("classes.r_fill", "Fill rate")} value={pct(tot.fill)} tid="kpi-fill" />
            <Tile label={t("classes.r_att", "Attendance")} value={pct(tot.attendance)} tid="kpi-attendance" />
          </div>

          <section>
            <h3 className="eyebrow !text-[11px] mb-2">{t("classes.by_series", "By class")}</h3>
            {data.series.length === 0 ? <p className="text-[13px] text-[#6B7269]">{t("classes.no_data", "No classes in this period.")}</p> : (
              <div className="overflow-x-auto rounded-2xl border border-[#E5E6DF] bg-white">
                <table className="w-full text-[13px]" data-testid="reports-series">
                  <thead className="bg-[#F7F6F1] text-[11px] uppercase tracking-widest text-[#839682]">
                    <tr><th className="text-left px-3 py-2">{t("classes.class", "Class")}</th><th className="px-3 py-2">{t("classes.r_classes_col", "Classes")}</th><th className="px-3 py-2">{t("classes.r_booked", "Bookings")}</th><th className="px-3 py-2">{t("classes.r_fill_col", "Fill")}</th><th className="px-3 py-2">{t("classes.r_attended", "Attended")}</th><th className="px-3 py-2">{t("classes.r_noshow", "No-shows")}</th><th className="px-3 py-2">{t("classes.r_att", "Attendance")}</th></tr>
                  </thead>
                  <tbody className="divide-y divide-[#EFEFE9]">
                    {data.series.map((s) => (
                      <tr key={s.title}>
                        <td className="px-3 py-2 font-semibold">{s.title}</td>
                        <td className="px-3 py-2 text-center">{s.classes}</td>
                        <td className="px-3 py-2 text-center">{s.booked}</td>
                        <td className="px-3 py-2 text-center">{pct(s.fill)}</td>
                        <td className="px-3 py-2 text-center">{s.attended}</td>
                        <td className="px-3 py-2 text-center">{s.no_show}</td>
                        <td className="px-3 py-2 text-center">{pct(s.attendance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section>
              <h3 className="eyebrow !text-[11px] mb-2">{t("classes.busiest", "Busiest times (UTC)")}</h3>
              {data.heatmap.length === 0 ? <p className="text-[13px] text-[#6B7269]">—</p> : (
                <ul className="space-y-1.5" data-testid="reports-heatmap">
                  {[...data.heatmap].sort((a, b) => b.booked - a.booked).slice(0, 10).map((h) => (
                    <li key={`${h.weekday}-${h.hour}`} className="flex items-center gap-3 text-[13px]">
                      <span className="w-24 shrink-0 font-semibold">{WEEKDAYS[h.weekday]} {String(h.hour).padStart(2, "0")}:00</span>
                      <div className="flex-1 h-2.5 rounded-full bg-[#EEF1EC] overflow-hidden"><div className="h-full bg-[#B25A45]" style={{ width: `${Math.round((h.booked * 100) / maxBooked)}%` }} /></div>
                      <span className="w-28 shrink-0 text-right text-[12px] text-[#6B7269]">{h.booked} {t("classes.bookings_in", "bookings ·")} {h.classes}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h3 className="eyebrow !text-[11px] mb-2">{t("classes.top_students", "Most classes attended")}</h3>
              {data.top_students.length === 0 ? <p className="text-[13px] text-[#6B7269]">—</p> : (
                <ol className="space-y-1.5" data-testid="reports-top">
                  {data.top_students.map((s, i) => (
                    <li key={s.user_id} className="flex items-center justify-between gap-3 rounded-2xl bg-white border border-[#E5E6DF] px-3 py-2 text-[13px]">
                      <span className="truncate"><span className="text-[#839682] font-bold mr-2">{i + 1}</span>{s.name || s.email}</span>
                      <span className="font-semibold shrink-0">{s.classes}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>

          <section>
            <h3 className="eyebrow !text-[11px] mb-1">{t("classes.quiet", "Members who haven't booked in 14 days")}</h3>
            <p className="text-[12px] text-[#6B7269] mb-2">{t("classes.quiet_hint", "They have an active membership but no recent booking — a friendly message often brings them back.")}</p>
            {data.quiet_members.length === 0 ? <p className="text-[13px] text-[#6B7269]">{t("classes.quiet_none", "Everyone is practising. 🙏")}</p> : (
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2" data-testid="reports-quiet">
                {data.quiet_members.map((q) => (
                  <li key={q.user_id} className="flex items-center justify-between gap-3 rounded-2xl bg-white border border-[#E5E6DF] px-3 py-2 text-[13px]">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{q.name || q.email}</div>
                      <div className="text-[11px] text-[#6B7269]">{q.last_booking ? `${t("classes.last_booked", "Last booked")} ${new Date(q.last_booking).toLocaleDateString()}` : t("classes.never_booked", "Never booked")}</div>
                    </div>
                    <a href={`mailto:${q.email}?subject=${encodeURIComponent("We miss you on the mat")}`} className="h-8 w-8 rounded-full bg-[#FBF1EE] flex items-center justify-center shrink-0" aria-label="Email"><Mail className="h-4 w-4 text-[#B25A45]" /></a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
