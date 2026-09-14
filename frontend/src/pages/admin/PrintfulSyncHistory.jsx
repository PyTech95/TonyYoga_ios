import { useEffect, useState, useCallback } from "react";
import { History, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";

export const PrintfulSyncHistory = ({ refreshKey }) => {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    setError("");
    api.get("/admin/printful/sync-history").then(({ data }) => setRows(data)).catch(() => setError("Could not load sync history."));
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);
  return <section data-testid="printful-sync-history" className="space-y-3 border-y border-[#E5E6DF] py-5">
    <div className="flex items-center justify-between"><h2 className="font-semibold text-base flex items-center gap-2"><History className="h-4 w-4 text-[#B25A45]" /> Recent syncs</h2><button type="button" data-testid="printful-history-refresh" onClick={load} title="Refresh sync history" aria-label="Refresh sync history" className="p-2 text-[#6B7269] hover:text-[#B25A45]"><RefreshCw className="h-4 w-4" /></button></div>
    {error && <p data-testid="printful-history-error" role="alert" className="text-sm text-[#B25A45]">{error}</p>}
    {rows === null ? <p data-testid="printful-history-loading" className="text-sm text-[#6B7269]">Loading history…</p> : !rows.length ? <p data-testid="printful-history-empty" className="text-sm text-[#6B7269]">No sync runs recorded yet.</p> : <ul className="divide-y divide-[#E5E6DF]">
      {rows.map((r) => <li key={r.id} data-testid={`printful-sync-run-${r.id}`} className="py-3 space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2"><time dateTime={r.started_at} data-testid={`printful-sync-date-${r.id}`} className="text-sm">{new Date(r.started_at).toLocaleString()}</time><span data-testid={`printful-sync-status-${r.id}`} className={`text-xs capitalize ${r.status === "succeeded" ? "text-[#5C7355]" : "text-[#B25A45]"}`}>{r.source} · {r.status === "succeeded" ? "Complete" : r.status}</span></div>
        <p data-testid={`printful-sync-counts-${r.id}`} className="text-xs text-[#6B7269]">{r.updated} updated · {r.created} added · {r.total} total</p>
        {r.error && <p data-testid={`printful-sync-error-${r.id}`} className="text-xs text-[#B25A45]">{r.error}</p>}
      </li>)}
    </ul>}
  </section>;
};