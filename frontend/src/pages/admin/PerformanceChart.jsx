import { useState } from "react";
import { Activity, Globe, Smartphone, Timer, Users } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { Switch } from "@/components/ui/switch";
import { MeasuredChart } from "./MeasuredChart";

const dateLabel = value => new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
export const UsageMetrics = ({ summary }) => {
  const cells = [
    { key: "views", label: "Page views", value: summary.views.toLocaleString(), note: `${summary.website_views.toLocaleString()} on website`, icon: Globe },
    { key: "sessions", label: "Sessions", value: summary.sessions.toLocaleString(), note: "30-minute inactivity window", icon: Users },
    { key: "app", label: "App page views", value: summary.app_views.toLocaleString(), note: "Installed PWA & native app", icon: Smartphone },
    { key: "load", label: "Avg. page load", value: summary.avg_load_ms === null ? "—" : `${(summary.avg_load_ms / 1000).toFixed(2)}s`, note: `${summary.load_samples.toLocaleString()} document load samples`, icon: Timer },
  ];
  return <div className="admin-metrics" data-testid="admin-usage-metrics">{cells.map(({ key, label, value, note, icon: Icon }) => <article className="admin-metric" key={key}><div className="admin-metric-top"><span>{label}</span><Icon size={16} /></div><div className="admin-metric-value" data-testid={`admin-metric-${key}`}>{value}</div><p className="admin-metric-note" data-testid={`admin-metric-${key}-note`}>{note}</p></article>)}</div>;
};

export const PerformanceChart = ({ report, onTrackingChange, saving }) => {
  const [metric, setMetric] = useState("views");
  const load = metric === "load";
  const empty = load ? !report.summary.load_samples : !report.summary.views;
  return <section className="admin-performance" data-testid="admin-performance-section">
    <div className="admin-section-header"><div><h2>Website & app performance</h2><p className="admin-section-subtitle" data-testid="admin-chart-date-range">{dateLabel(report.series[0].date)} – {dateLabel(report.series[report.series.length - 1].date)} · UTC</p></div><div className="admin-chart-controls"><div className="admin-chart-legend" data-testid="admin-chart-legend"><span><i /> Website</span><span><i /> App</span></div><div className="admin-segmented" aria-label="Performance metric"><button data-testid="admin-chart-views" aria-pressed={!load} onClick={() => setMetric("views")}>Page views</button><button data-testid="admin-chart-load" aria-pressed={load} onClick={() => setMetric("load")}>Page load</button></div></div></div>
    {empty ? <div className="admin-empty-chart" data-testid="admin-performance-empty"><Activity size={26} strokeWidth={1.3} /><strong>{load ? "No page-load measurements yet" : "No visitor activity in this period"}</strong><span>{report.enabled ? "Only recorded visitor activity is included. Admin previews are excluded." : "Collection is paused. Previously recorded activity remains available."}</span></div> : <div className="admin-chart" data-testid="admin-performance-chart" role="img" aria-label={`${load ? "Average page load time" : "Page views"} for website and app over ${report.days} days`}>
      <MeasuredChart><AreaChart data={report.series} margin={{ top: 8, left: 0, right: 8, bottom: 0 }} accessibilityLayer>
        <defs><linearGradient id="usageWebsiteFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#829c7c" stopOpacity={0.24} /><stop offset="100%" stopColor="#829c7c" stopOpacity={0.01} /></linearGradient><linearGradient id="usageAppFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#b25a45" stopOpacity={0.15} /><stop offset="100%" stopColor="#b25a45" stopOpacity={0.01} /></linearGradient></defs>
        <CartesianGrid vertical={false} stroke="#e2e8df" strokeDasharray="3 5" />
        <XAxis dataKey="date" tickFormatter={dateLabel} minTickGap={38} tick={{ fontSize: 10, fill: "#738074" }} axisLine={false} tickLine={false} tickMargin={12} />
        <YAxis width={38} tick={{ fontSize: 10, fill: "#738074" }} axisLine={false} tickLine={false} allowDecimals={load} tickFormatter={v => load ? `${(v / 1000).toFixed(1)}s` : v} />
        <Tooltip labelFormatter={dateLabel} contentStyle={{ border: "1px solid #dfe5dc", borderRadius: 8, fontSize: 12 }} formatter={(value, name) => [load ? `${(value / 1000).toFixed(2)}s` : value, name]} />
        <Area name="Website" type="monotone" dataKey={load ? "website_load_ms" : "website"} stroke="#63806a" strokeWidth={2.5} fill="url(#usageWebsiteFill)" dot={load ? { r: 3 } : false} activeDot={{ r: 4 }} isAnimationActive={false} />
        <Area name="App" type="monotone" dataKey={load ? "app_load_ms" : "app"} stroke="#b25a45" strokeWidth={2.5} fill="url(#usageAppFill)" dot={load ? { r: 3 } : false} activeDot={{ r: 4 }} isAnimationActive={false} />
      </AreaChart></MeasuredChart>
    </div>}
    <div className="admin-chart-foot"><span data-testid="admin-analytics-disclosure">{load ? "Browser document loads, not SPA transitions. " : "App includes installed PWA and native sessions. "}90-day retention · no historical backfill.</span><label htmlFor="admin-analytics-tracking"><Switch id="admin-analytics-tracking" data-testid="admin-analytics-tracking" checked={report.enabled} disabled={saving} onCheckedChange={onTrackingChange} /><span data-testid="admin-tracking-status">{saving ? "Saving…" : report.enabled ? "Collection on" : "Collection paused"}</span></label></div>
  </section>;
};