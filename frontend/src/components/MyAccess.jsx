import { useCommerceRefresh } from "@/lib/useCommerceRefresh";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarRange, ArrowUpRight } from "lucide-react";
import { api } from "@/lib/api";
import { dateLabel } from "./AccessTerm";

export const MyAccess = () => {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(false);
  const load = () => api.get("/access/mine").then(({ data }) => { setRows(data); setError(false); }).catch(() => setError(true));
  useEffect(() => { load(); }, []);
  useCommerceRefresh(load);
  return <section data-testid="my-subscriptions" className="space-y-3">
    <h2 className="eyebrow flex items-center gap-2"><CalendarRange className="h-4 w-4" /> Courses & class subscriptions</h2>
    {error ? <p data-testid="my-subscriptions-error" role="alert" className="text-sm text-[#B25A45]">Subscriptions could not be loaded.</p> : rows === null ? <p data-testid="my-subscriptions-loading" className="text-sm text-[#6B7269]">Loading subscriptions…</p> : !rows.length ? <p data-testid="my-subscriptions-empty" className="text-sm text-[#6B7269]">No course or class subscriptions yet.</p> : <ul className="space-y-3">
      {rows.map((r) => <li key={r.id} data-testid={`my-access-${r.id}`} className="rounded-2xl bg-white border border-[#E5E6DF] p-4 space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2"><p data-testid={`my-access-title-${r.id}`} className="font-semibold text-sm">{r.title}</p><span data-testid={`my-access-status-${r.id}`} className={`capitalize text-xs ${r.status === "active" ? "text-[#5C7355]" : "text-[#B25A45]"}`}>{r.status}</span></div>
        <p data-testid={`my-access-period-${r.id}`} className="text-xs text-[#6B7269]">{dateLabel(r.starts_at)} – {dateLabel(r.ends_at)}</p>
        <p data-testid={`my-access-type-${r.id}`} className="text-xs text-[#6B7269]">{r.kind === "class_instance" ? "One-time class ticket" : r.auto_renewable ? "Apple subscription · manage in your Apple account" : "Fixed-term · no automatic renewal"}</p>
        <Link data-testid={`my-access-open-${r.id}`} className="text-sm text-[#B25A45] inline-flex items-center gap-1 hover:underline" to={r.return_path || "/schedule"}>{r.kind === "program" ? "Open course" : "Choose / view class"}<ArrowUpRight className="h-3.5 w-3.5" /></Link>
      </li>)}
    </ul>}
  </section>;
};