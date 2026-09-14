import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
const date = value => value ? new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";
const time = value => value ? new Date(value).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "—";
const money = payment => new Intl.NumberFormat(undefined, { style: "currency", currency: payment.currency || "EUR" }).format(payment.amount);
const Heading = ({ title, tab, id }) => <div className="admin-section-header"><h2>{title}</h2><Link data-testid={`${id}-manage`} className="admin-section-link" to={`/admin?tab=${tab}`}>Manage <ArrowUpRight size={13} /></Link></div>;

export const DashboardActivity = ({ data }) => <div className="admin-activity-grid" data-testid="admin-dashboard">
  <section data-testid="dash-today-classes"><Heading title="Today’s schedule" tab="classes" id="admin-schedule" />
    {!data.today.length ? <p className="admin-empty" data-testid="admin-schedule-empty">No classes scheduled today.</p> : data.today.map(item => <div key={item.id} className="admin-list-row" data-testid={`admin-schedule-row-${item.id}`}><div className="min-w-0"><strong>{item.title}</strong><small>{time(item.start_time)} · {item.location_type}</small></div><small className="shrink-0" data-testid={`admin-schedule-booked-${item.id}`}>{item.booked}/{item.capacity}</small></div>)}
  </section>
  <section data-testid="dash-recent-signups"><Heading title="Recent signups" tab="students" id="admin-signups" />
    {!data.recent_signups.length ? <p className="admin-empty" data-testid="admin-signups-empty">No signups in the last 7 days.</p> : data.recent_signups.map((item, i) => <div key={i} className="admin-list-row" data-testid={`admin-signup-row-${i}`}><div className="min-w-0"><strong>{item.name || item.email}</strong><small>{item.role}</small></div><small className="shrink-0">{date(item.created_at)}</small></div>)}
  </section>
  <section data-testid="dash-recent-payments"><Heading title="Recent payments" tab="orders" id="admin-payments" />
    {!data.recent_payments.length ? <p className="admin-empty" data-testid="admin-payments-empty">No paid transactions yet.</p> : data.recent_payments.map((item, i) => <div key={i} className="admin-list-row" data-testid={`admin-payment-row-${i}`}><div className="min-w-0"><strong className="capitalize">{(item.item_type || "purchase").replaceAll("_", " ")}</strong><small>{date(item.at)} · {item.provider}</small></div><strong className="shrink-0" data-testid={`admin-payment-amount-${i}`}>{money(item)}</strong></div>)}
  </section>
</div>;