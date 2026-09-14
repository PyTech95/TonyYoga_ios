import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { BarChart, Bar, XAxis, Tooltip, CartesianGrid } from "recharts";
import { MeasuredChart } from "./MeasuredChart";

export const BusinessOverview = ({ stats, trend, topPages }) => <>
  <div className="admin-business-grid" data-testid="admin-stats">{[
    ["students", "Total students", stats.students], ["subscriptions", "Active subscriptions", stats.active_subscriptions],
    ["bookings", "Confirmed bookings", stats.bookings], ["transactions", "Paid transactions", stats.transactions],
  ].map(([key, label, value]) => <div key={key} className="admin-business-stat"><p>{label}</p><strong data-testid={`admin-business-${key}`}>{value.toLocaleString()}</strong></div>)}</div>
  <div className="admin-secondary-grid">
    <section data-testid="admin-account-growth"><div className="admin-section-header"><div><h2>Community growth</h2><p className="admin-section-subtitle">New accounts · last 6 months</p></div><Link data-testid="admin-growth-students" to="/admin?tab=students" className="admin-section-link">Students <ArrowUpRight size={13} /></Link></div>
      {trend.some(row => row.members > 0) ? <div className="admin-business-chart" data-testid="admin-growth-chart"><MeasuredChart><BarChart data={trend} margin={{ left: 0, right: 0 }} accessibilityLayer><CartesianGrid vertical={false} stroke="#e3e8df" strokeDasharray="3 5" /><XAxis dataKey="month" tick={{ fontSize: 10, fill: "#67766b" }} axisLine={false} tickLine={false} /><Tooltip cursor={{ fill: "#e8eee3" }} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e3e8df" }} formatter={value => [value, "New accounts"]} /><Bar dataKey="members" fill="#83977c" maxBarSize={35} radius={[4, 4, 0, 0]} isAnimationActive={false} /></BarChart></MeasuredChart></div> : <p className="admin-empty" data-testid="admin-growth-empty">No new accounts in this period.</p>}
    </section>
    <section data-testid="admin-top-pages"><div className="admin-section-header"><div><h2>Popular pages</h2><p className="admin-section-subtitle">Recorded page views · selected period</p></div><Link data-testid="admin-popular-edit-pages" to="/admin?tab=content" className="admin-section-link">Edit pages <ArrowUpRight size={13} /></Link></div>
      {topPages.length ? topPages.map((page, index) => <div key={page.path} className="admin-page-row"><Link data-testid={`admin-popular-page-${index}`} to={page.path}>{page.path === "/" ? "Homepage" : page.path}<ArrowUpRight size={12} /></Link><div className="admin-page-bar" aria-hidden="true"><span style={{ width: `${page.views / topPages[0].views * 100}%` }} /></div><strong data-testid={`admin-popular-views-${index}`}>{page.views}</strong></div>) : <p className="admin-empty" data-testid="admin-popular-empty">Page rankings will appear after visitor activity is recorded.</p>}
    </section>
  </div>
</>;