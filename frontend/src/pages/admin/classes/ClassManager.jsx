import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarDays, Repeat, BarChart3 } from "lucide-react";
import { api } from "@/lib/api";
import ScheduleTab from "./ScheduleTab";
import SeriesTab from "./SeriesTab";
import ReportsTab from "./ReportsTab";

const TABS = [
  { key: "schedule", label: "Schedule", icon: CalendarDays },
  { key: "series", label: "Weekly series", icon: Repeat },
  { key: "reports", label: "Reports", icon: BarChart3 },
];

/** Admin → Class manager: schedule, rosters & attendance, weekly series, reports. */
export default function ClassManager() {
  const { t } = useTranslation();
  const [tab, setTab] = useState("schedule");
  const [series, setSeries] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadSeries = useCallback(() => {
    setLoading(true);
    api.get("/admin/classes/series").then(({ data }) => setSeries(data || [])).catch(() => setSeries([])).finally(() => setLoading(false));
  }, []);
  useEffect(() => { loadSeries(); }, [loadSeries]);

  const changed = () => { loadSeries(); setRefreshKey((k) => k + 1); };

  return (
    <div data-testid="class-manager">
      <div className="mb-5">
        <p className="text-[13px] text-[#6B7269]">{t("classes.manager_sub", "Plan the weekly timetable, see who is coming, take attendance and keep students informed.")}</p>
      </div>
      <div className="flex gap-1 rounded-full bg-[#F2F2EC] p-1 mb-5 w-full sm:w-auto sm:inline-flex overflow-x-auto" role="tablist">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)} data-testid={`classmgr-tab-${key}`}
            className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold whitespace-nowrap transition ${tab === key ? "bg-white text-[#1C221F] shadow-sm" : "text-[#6B7269]"}`}>
            <Icon className="h-4 w-4" />{t(`classes.tab_${key}`, label)}
          </button>
        ))}
      </div>
      {tab === "schedule" && <ScheduleTab series={series || []} refreshKey={refreshKey} />}
      {tab === "series" && <SeriesTab series={series} loading={loading} onChanged={changed} />}
      {tab === "reports" && <ReportsTab />}
    </div>
  );
}
