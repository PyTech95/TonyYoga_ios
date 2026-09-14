import { useState } from "react";
import { TrendingUp } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { MeasuredChart } from "./MeasuredChart";

export const RevenueOverview = ({ stats, trend }) => {
  const currencies = Object.keys(stats.revenue_by_currency || {}).sort();
  const [selection, setSelection] = useState("");
  const currency = currencies.includes(selection) ? selection : currencies[0];
  const money = value => currency ? new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value) : "—";
  const series = trend.map(row => ({ month: row.month, revenue: row.by_currency?.[currency] || 0 }));
  return <section className="admin-revenue-section" data-testid="admin-revenue-trend">
    <div className="admin-section-header"><div><h2>Revenue</h2><p className="admin-section-subtitle">Paid transactions · last 6 months · currencies reported separately</p></div>
      {!!currencies.length && <select className="rounded-lg border bg-white px-3 py-2 text-xs" aria-label="Revenue currency" data-testid="admin-revenue-currency" value={currency} onChange={e => setSelection(e.target.value)}>{currencies.map(code => <option key={code}>{code}</option>)}</select>}
    </div>
    <div className="admin-revenue-layout"><div><p className="admin-section-subtitle">All-time revenue</p><div className="admin-metric-value" data-testid="admin-revenue-total">{money(stats.revenue_by_currency?.[currency] || 0)}</div><p className="admin-section-subtitle" data-testid="admin-revenue-month">This month: {money(series[series.length - 1]?.revenue || 0)}</p></div>
      {series.some(row => row.revenue > 0) ? <div className="admin-business-chart" data-testid="admin-revenue-chart"><MeasuredChart><AreaChart data={series} margin={{ top: 6, right: 6, left: 0 }} accessibilityLayer><CartesianGrid stroke="#e3e8df" strokeDasharray="3 5" vertical={false} /><XAxis dataKey="month" tick={{ fontSize: 10, fill: "#68756a" }} axisLine={false} tickLine={false} /><YAxis width={50} tick={{ fontSize: 10, fill: "#68756a" }} axisLine={false} tickLine={false} /><Tooltip formatter={value => [money(value), "Revenue"]} contentStyle={{ border: "1px solid #e3e8df", borderRadius: 8, fontSize: 12 }} /><Area type="monotone" dataKey="revenue" stroke="#b25a45" fill="#b25a45" fillOpacity={0.08} strokeWidth={2} isAnimationActive={false} /></AreaChart></MeasuredChart></div> : <div className="admin-empty flex items-center gap-3" data-testid="admin-revenue-empty"><TrendingUp size={20} strokeWidth={1.4} /> No paid revenue recorded in this period.</div>}
    </div>
  </section>;
};