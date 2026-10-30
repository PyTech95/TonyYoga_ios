import { useState } from "react";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Download } from "lucide-react";
import { api } from "@/lib/api";
import { errText, inputCls, smallBtn, primaryBtn, useCatalog } from "./memberShared";

const SAMPLE = "Email,First Name,Last Name,Phone,Plan,Courses,Start date,End date,Credits,Status\n" +
  "ana@example.com,Ana,Ruiz,+34600000000,Essential,,2025-11-01,2027-01-31,,Active\n" +
  "marco@example.com,Marco,Bianchi,,Unlimited,,15/03/2025,31/12/2026,,Active\n" +
  "lena@example.com,Lena,Schmidt,,,Core 26+,2026-01-10,2026-12-31,5,Active\n";

/** Import members from a CSV/Excel export (e.g. subscribers from Tony's old Squarespace site). */
export default function ImportTab({ onOpen }) {
  const cat = useCatalog();
  const [file, setFile] = useState(null);
  const [opts, setOpts] = useState({ default_plan_id: "", default_program_ids: [], mode: "file", default_days: 30, default_ends_at: "", send_invites: true, batch_name: "Old website members" });
  const [preview, setPreview] = useState(null);
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => { setOpts((o) => ({ ...o, [k]: v })); setPreview(null); setDone(null); };

  const send = async (dry) => {
    if (!file) return toast.error("Choose a file first.");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("dry_run", dry ? "true" : "false");
    fd.append("batch_name", opts.batch_name || "Import");
    fd.append("default_plan_id", opts.default_plan_id);
    fd.append("default_program_ids", opts.default_program_ids.join(","));
    fd.append("default_days", opts.mode === "days" ? String(opts.default_days || 0) : "0");
    fd.append("default_ends_at", opts.mode === "until" ? opts.default_ends_at : "");
    fd.append("lifetime", opts.mode === "lifetime" ? "true" : "false");
    fd.append("send_invites", opts.send_invites ? "true" : "false");
    setBusy(true);
    try {
      const { data } = await api.post("/admin/members/import", fd, { timeout: 300000 });
      if (dry) setPreview(data); else { setDone(data); setPreview(null); toast.success("Import finished"); }
    } catch (e) { toast.error(errText(e, "Import failed")); } finally { setBusy(false); }
  };

  const sample = () => {
    const href = URL.createObjectURL(new Blob([SAMPLE], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = href; a.download = "tony-yoga-members-template.csv"; a.click(); URL.revokeObjectURL(href);
  };

  const result = done || preview;
  return (
    <div className="space-y-4" data-testid="members-import">
      <div className="rounded-2xl bg-white border border-[#E5E6DF] p-4 space-y-3">
        <div className="flex items-start gap-3">
          <FileSpreadsheet className="h-6 w-6 text-[#B25A45] shrink-0" />
          <div className="text-[13px] text-[#545E56] leading-relaxed">
            Upload the member list from the old website (CSV or Excel). Each row needs an <span className="font-semibold">email</span>. Optional columns: name (or first/last name), phone,
            plan/membership/subscription, courses, start date, end date/expires, credits, status. Column names from Squarespace, Excel or Google Sheets are recognised automatically.
            <span className="block mt-1">Nothing is changed until you check the preview and press <span className="font-semibold">Import</span>. Running the same file twice doesn't create duplicates.</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className={`${primaryBtn} cursor-pointer`} data-testid="import-choose">
            <Upload className="h-4 w-4" />{file ? "Change file" : "Choose file"}
            <input type="file" accept=".csv,.xlsx,.xlsm,text/csv" className="hidden" data-testid="import-file" onChange={(e) => { setFile(e.target.files?.[0] || null); setPreview(null); setDone(null); }} />
          </label>
          {file && <span className="text-[13px] font-semibold">{file.name}</span>}
          <button className={smallBtn} onClick={sample}><Download className="h-3.5 w-3.5" />Template</button>
        </div>
      </div>

      <div className="rounded-2xl bg-white border border-[#E5E6DF] p-4 space-y-3">
        <div className="text-[13px] font-bold uppercase tracking-widest">For rows without their own plan/dates</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="text-[11px] text-[#6B7269]">Membership to give
            <select className={inputCls} value={opts.default_plan_id} onChange={(e) => set("default_plan_id", e.target.value)} data-testid="import-plan">
              <option value="">— none —</option>
              {cat?.plans.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          <label className="text-[11px] text-[#6B7269]">Courses to give (hold Ctrl/⌘ for several)
            <select multiple className={`${inputCls} h-24`} value={opts.default_program_ids} onChange={(e) => set("default_program_ids", [...e.target.selectedOptions].map((o) => o.value))}>
              {cat?.programs.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {[["file", "Use dates from the file"], ["days", "Number of days"], ["until", "Until a date"], ["lifetime", "Lifetime"]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => set("mode", k)} className={`rounded-full px-3 py-1.5 text-[12px] font-semibold border ${opts.mode === k ? "bg-[#1C221F] text-white border-[#1C221F]" : "bg-white border-[#E5E6DF]"}`}>{l}</button>
          ))}
          {opts.mode === "days" && <input type="number" min="1" className={`${inputCls} w-28`} value={opts.default_days} onChange={(e) => set("default_days", e.target.value)} />}
          {opts.mode === "until" && <input type="date" className={`${inputCls} w-44`} value={opts.default_ends_at} onChange={(e) => set("default_ends_at", e.target.value)} />}
        </div>
        <label className="flex items-center gap-2 text-[12px] text-[#545E56]"><input type="checkbox" className="h-4 w-4 accent-[#B25A45]" checked={opts.send_invites} onChange={(e) => set("send_invites", e.target.checked)} data-testid="import-invites" />Email new members a link to set their password ("your membership has been moved over — nothing to pay")</label>
        <label className="text-[11px] text-[#6B7269] block">Name for this import<input className={inputCls} value={opts.batch_name} onChange={(e) => set("batch_name", e.target.value)} /></label>
        <button className={primaryBtn} disabled={busy || !file} onClick={() => send(true)} data-testid="import-preview">{busy && !preview ? "Reading…" : "Preview"}</button>
      </div>

      {result && (
        <div className="rounded-2xl bg-white border border-[#E5E6DF] p-4 space-y-3" data-testid="import-result">
          <div className="flex items-center gap-2">
            {done ? <CheckCircle2 className="h-5 w-5 text-[#3E7C57]" /> : <AlertTriangle className="h-5 w-5 text-[#8A6D3B]" />}
            <div className="text-[14px] font-semibold">{done ? "Imported" : "Preview — nothing has been changed yet"}</div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            {[["Rows", result.summary.rows], ["New accounts", result.summary.new_accounts], ["Already had an account", result.summary.existing_accounts], ["Memberships", result.summary.memberships],
              ["Courses", result.summary.courses], ["Credits", result.summary.credits], ["Skipped", result.summary.skipped], ["Invites", result.summary.invites]].map(([l, v]) => (
              <div key={l} className="rounded-xl bg-[#FAFAF7] border border-[#F0F0EA] p-2"><div className="serif text-xl">{v}</div><div className="text-[10px] uppercase tracking-widest text-[#6B7269]">{l}</div></div>
            ))}
          </div>
          <div className="text-[12px] text-[#6B7269]">Columns found: {Object.entries(result.columns).map(([k, v]) => `${k} ← "${v}"`).join(" · ")}</div>
          <div className="max-h-80 overflow-y-auto rounded-xl border border-[#F0F0EA]">
            <table className="w-full text-[12px]">
              <thead className="bg-[#FAFAF7] sticky top-0"><tr><th className="text-left p-2">Row</th><th className="text-left p-2">Email</th><th className="text-left p-2">What happens</th></tr></thead>
              <tbody>
                {result.results.map((r) => (
                  <tr key={r.row} className="border-t border-[#F0F0EA] align-top">
                    <td className="p-2 text-[#9AA096]">{r.row}</td>
                    <td className="p-2">{r.email || "—"}<div className="text-[#9AA096]">{r.name}</div></td>
                    <td className="p-2">
                      {r.status === "error" ? <span className="text-[#B25A45] font-semibold">{r.error}</span> : (
                        <>
                          <span className="font-semibold">{r.status === "new" ? "New account" : "Existing account"}</span>
                          {r.actions?.length > 0 && <span> · {r.actions.join(" · ")}</span>}
                          {r.warnings?.map((w) => <div key={w} className="text-[#8A6D3B]">{w}</div>)}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!done && <button className={primaryBtn} disabled={busy} onClick={() => { if (window.confirm(`Import ${result.summary.rows - result.summary.skipped} row(s) now?`)) send(false); }} data-testid="import-commit">{busy ? "Importing…" : `Import ${result.summary.rows - result.summary.skipped} row(s)`}</button>}
          {done && <button className={smallBtn} onClick={() => { setDone(null); setFile(null); }}>Import another file</button>}
        </div>
      )}
    </div>
  );
}
