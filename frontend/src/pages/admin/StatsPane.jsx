import { useEffect, useState } from "react";
import { Download, RefreshCw, Database, Activity, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { UsageMetrics, PerformanceChart } from "./PerformanceChart";
import { BusinessOverview } from "./BusinessOverview";
import { DashboardActivity } from "./DashboardActivity";
import { RevenueOverview } from "./RevenueOverview";
import AdminInbox from "./AdminInbox";

export default function StatsPane() {
  const [days, setDays] = useState(30), [revision, setRevision] = useState(0);
  const [data, setData] = useState(null), [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError("");
    const options = { signal: controller.signal };
    Promise.all([api.get(`/admin/analytics?days=${days}`, options), api.get("/admin/stats", options),
      api.get("/admin/dashboard", options), api.get("/admin/stats/trend", options), api.get("/health", options)])
      .then(([report, stats, dashboard, trend, health]) => setData({ report: report.data, stats: stats.data, dashboard: dashboard.data, trend: trend.data.trend, health: health.data, updated: new Date() }))
      .catch(() => { if (!controller.signal.aborted) setError("Could not load the dashboard. Please retry."); });
    return () => controller.abort();
  }, [days, revision]);
  const updateTracking = async enabled => {
    setSaving(true);
    try {
      await api.patch("/admin/analytics/config", { enabled });
      setData(previous => previous ? { ...previous, report: { ...previous.report, enabled } } : previous);
      toast.success(enabled ? "Visitor analytics enabled" : "Visitor analytics paused");
    } catch { toast.error("Could not update analytics collection."); }
    finally { setSaving(false); }
  };
  const exportCsv = () => {
    const rows = [["Date (UTC)", "Website page views", "App page views", "Website average load (ms)", "App average load (ms)"], ...data.report.series.map(row => [row.date, row.website, row.app, row.website_load_ms ?? "", row.app_load_ms ?? ""])];
    const url = URL.createObjectURL(new Blob([rows.map(row => row.join(",")).join("\n")], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `tony-yoga-performance-${days}d.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <div className="admin-dashboard">
    <div className="admin-overview-heading"><div><p className="admin-kicker">TONY YOGA · ADMIN</p><h1 data-testid="admin-header">Studio overview</h1><p data-testid="admin-overview-date">{new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p></div>
      <div className="admin-period-controls"><CalendarDays size={15} className="text-[#68796d]" /><select data-testid="admin-period-select" aria-label="Reporting period" value={days} onChange={e => setDays(Number(e.target.value))} disabled={saving}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select><button className="admin-icon-button" data-testid="admin-refresh" title="Refresh dashboard" aria-label="Refresh dashboard" onClick={() => setRevision(value => value + 1)} disabled={(!data && !error) || saving}><RefreshCw size={16} /></button><button className="admin-icon-button" data-testid="admin-export-csv" title="Export performance CSV" aria-label="Export performance CSV" onClick={exportCsv} disabled={!data}><Download size={16} /></button></div>
    </div>
    <AdminInbox />
    {error ? <div className="admin-error" role="alert" data-testid="admin-dashboard-error">{error}<button data-testid="admin-dashboard-retry" className="admin-icon-button" onClick={() => setRevision(value => value + 1)}>Retry</button></div> : !data ? <div data-testid="admin-dashboard-loading" className="py-20 text-sm text-[#68716c]" role="status">Loading studio performance…</div> : <>
      <UsageMetrics summary={data.report.summary} />
      <PerformanceChart report={data.report} onTrackingChange={updateTracking} saving={saving} />
      <BusinessOverview stats={data.stats} trend={data.trend} topPages={data.report.top_pages} />
      <RevenueOverview stats={data.stats} trend={data.trend} />
      <DashboardActivity data={data.dashboard} />
      <footer className="admin-service-strip"><span data-testid="admin-api-status"><Activity size={13} /> API {data.health.ok ? "responding" : "needs attention"}</span><span data-testid="admin-database-status"><Database size={13} /> Database {data.health.db_connected ? "connected" : "unavailable"}</span><span data-testid="admin-last-updated">Checked {data.updated.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span><span data-testid="admin-metric-source">Business totals: all time · traffic: selected period</span></footer>
    </>}
  </div>;
}