import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Inbox, CalendarCheck, ChevronRight, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";

function timeOf(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** "Needs attention" + today's classes, at the top of the admin overview. */
export default function AdminInbox() {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    api.get("/admin/inbox").then(({ data: d }) => { if (live) setData(d); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, []);
  if (failed) return null;
  if (!data) return <div data-testid="admin-inbox-loading" className="h-24 rounded-3xl bg-[#F2F2EC] animate-pulse mb-5" />;
  const open = data.items.filter((i) => i.count > 0);
  return (
    <section data-testid="admin-inbox" className="grid gap-4 lg:grid-cols-[1.4fr_1fr] mb-6">
      <div className="rounded-3xl bg-white border border-[#E5E6DF] p-5">
        <div className="flex items-center gap-2 mb-3">
          <Inbox className="h-4 w-4 text-[#B25A45]" />
          <h2 className="text-[11px] uppercase tracking-[0.2em] font-semibold text-[#839682]">Needs attention</h2>
          {data.total > 0 && <span data-testid="admin-inbox-total" className="ml-auto rounded-full bg-[#B25A45] text-white text-[11px] font-bold px-2.5 py-0.5">{data.total}</span>}
        </div>
        {open.length === 0 ? (
          <div data-testid="admin-inbox-clear" className="flex items-center gap-2 text-[14px] text-[#3E7C57]"><CheckCircle2 className="h-4 w-4" /> All caught up.</div>
        ) : (
          <ul className="divide-y divide-[#EFEFE9]">
            {open.map((i) => (
              <li key={i.key}>
                <Link to={`/admin?tab=${i.tab}${i.view ? `&view=${i.view}` : ""}`} data-testid={`admin-inbox-${i.key}`}
                  className="flex items-center gap-3 py-2.5 text-[14px] text-[#1C221F] hover:text-[#B25A45]">
                  <span className="min-w-[2rem] text-center rounded-full bg-[#FBF1EE] text-[#B25A45] font-bold text-[13px] px-2 py-0.5">{i.count}</span>
                  <span className="flex-1">{i.label}</span>
                  <ChevronRight className="h-4 w-4 text-[#C3C6BE]" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="rounded-3xl bg-white border border-[#E5E6DF] p-5">
        <div className="flex items-center gap-2 mb-3">
          <CalendarCheck className="h-4 w-4 text-[#B25A45]" />
          <h2 className="text-[11px] uppercase tracking-[0.2em] font-semibold text-[#839682]">Classes today</h2>
          <Link to="/admin?tab=classmgr" className="ml-auto text-[12px] font-semibold text-[#B25A45]">Class manager →</Link>
        </div>
        {data.classes_today.length === 0 ? <p className="text-[14px] text-[#6B7269]">No more classes today.</p> : (
          <ul className="space-y-2" data-testid="admin-inbox-classes">
            {data.classes_today.map((c) => (
              <li key={c.id} className="flex items-center gap-3 text-[14px]">
                <span className="w-16 text-[#6B7269]">{timeOf(c.start_time)}</span>
                <span className="flex-1 truncate font-semibold">{c.title}</span>
                <span className="text-[12px] text-[#545E56]">{c.booked}/{c.capacity}{c.waitlist ? ` · +${c.waitlist} waiting` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
