import { useEffect, useMemo, useState } from "react";
import { Mail, UserCheck, UserPlus, Sparkles, Send } from "lucide-react";
import { api } from "@/lib/api";
import { t } from "@/lib/i18n";
import Spinner from "@/components/Spinner";

const TIER_LABEL = { online_only: "Essential", online_inperson: "Unlimited", vip: "Annual VIP" };

export default function LeadsPane() {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState("all"); // all | pending

  useEffect(() => {
    api.get("/admin/quiz-leads").then(({ data }) => setData(data)).catch(() => setData({ leads: [], total: 0, converted: 0, pending: 0 }));
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    return filter === "pending" ? data.leads.filter((l) => !l.signed_up) : data.leads;
  }, [data, filter]);

  if (data === null) return <Spinner />;

  const Stat = ({ label, value, tid }) => (
    <div className="rounded-2xl bg-white border border-[#E5E6DF] px-4 py-3" data-testid={tid}>
      <div className="text-2xl serif text-[#1C221F]">{value}</div>
      <div className="text-[11px] uppercase tracking-widest font-bold text-[#9AA096] mt-0.5">{label}</div>
    </div>
  );

  return (
    <div className="space-y-4" data-testid="leads-pane">
      <div className="rounded-2xl bg-white border border-[#E5E6DF] p-4">
        <div className="eyebrow flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-[#B25A45]" /> Find Your Path leads</div>
        <p className="text-xs text-[#6B7269] mt-1">Visitors who asked for their quiz result by email. Follow up with anyone who hasn't signed up yet.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Total leads" value={data.total} tid="leads-stat-total" />
        <Stat label="Signed up" value={data.converted} tid="leads-stat-converted" />
        <Stat label="Not yet" value={data.pending} tid="leads-stat-pending" />
      </div>

      <div className="flex gap-2">
        <button onClick={() => setFilter("all")} data-testid="leads-filter-all" className={`pill !py-1.5 !px-3 !text-xs ${filter === "all" ? "pill-primary" : "pill-ghost"}`}>All</button>
        <button onClick={() => setFilter("pending")} data-testid="leads-filter-pending" className={`pill !py-1.5 !px-3 !text-xs ${filter === "pending" ? "pill-primary" : "pill-ghost"}`}>Not signed up</button>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-[#6B7269] rounded-2xl bg-[#F2F2EC] p-5">{filter === "pending" ? "Everyone who left an email has signed up 🎉" : "No quiz leads yet."}</p>
      ) : (
        <ul className="space-y-2" data-testid="leads-list">
          {rows.map((l) => (
            <li key={l.id} className="rounded-2xl bg-white border border-[#E5E6DF] p-4 flex items-start justify-between gap-3 flex-wrap" data-testid={`lead-row-${l.id}`}>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <a href={`mailto:${l.email}?subject=${encodeURIComponent("Your Tony Yoga path")}`} className="text-sm font-semibold text-[#1C221F] hover:text-[#B25A45] break-all" data-testid={`lead-email-${l.id}`}>{l.email}</a>
                  {l.signed_up ? (
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest font-bold bg-[#E7F0E7] text-[#3E5B3E] rounded-full px-2 py-0.5"><UserCheck className="h-3 w-3" /> Member</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest font-bold bg-[#FBF1E9] text-[#B25A45] rounded-full px-2 py-0.5"><UserPlus className="h-3 w-3" /> Lead</span>
                  )}
                </div>
                <div className="text-xs text-[#6B7269] mt-1">
                  {l.program_title && <>→ {l.program_title}</>}
                  {l.plan_name && <> · {TIER_LABEL[l.plan_tier] || t(l.plan_name)}</>}
                </div>
                <div className="text-[11px] text-[#9AA096] mt-1 flex items-center gap-2">
                  {new Date(l.created_at).toLocaleString()}
                  {l.emailed && <span className="inline-flex items-center gap-1 text-[#839682]"><Send className="h-3 w-3" /> emailed</span>}
                </div>
              </div>
              <a href={`mailto:${l.email}?subject=${encodeURIComponent("Your Tony Yoga path")}`} data-testid={`lead-followup-${l.id}`} className="pill pill-ghost !py-1.5 !px-3 !text-xs shrink-0">
                <Mail className="h-3.5 w-3.5" /> Follow up
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
