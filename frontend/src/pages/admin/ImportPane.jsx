import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Users, Calendar, TrendingUp, Send, Check, X, CreditCard, Mail, Bell, Save, RefreshCw, History, BookOpen, Plus, ArrowLeft, Trash2, ChevronUp, ChevronDown, ChevronRight, Youtube, Play, Clock, Eye, EyeOff, ListPlus, Instagram, Wallet, ClipboardCheck, Package, GraduationCap, Award, MessageCircle, Video, Mic, LayoutDashboard, MountainSnow, Gift, Settings as SettingsIcon, Upload } from "lucide-react";
import { api, API_BASE } from "@/lib/api";
import Spinner from "@/components/Spinner";
import { inputCls } from "./shared";

function ImportPane() {
  const [memberBatch, setMemberBatch] = useState("");
  const [memberFile, setMemberFile] = useState(null);
  const [classFile, setClassFile] = useState(null);
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState(null);

  const importMembers = async () => {
    if (!memberFile) return toast.error("Choose a members CSV first.");
    setBusy("members");
    try {
      const fd = new FormData();
      fd.append("batch_name", memberBatch || "CSV import");
      fd.append("file", memberFile);
      const { data } = await api.post("/admin/legacy/import-csv", fd);
      setResult({ kind: "members", msg: `${data.batch?.valid_records ?? 0} members imported/invited.` });
      toast.success("Members imported.");
    } catch (e) { toast.error(e?.response?.data?.detail || "Import failed"); }
    finally { setBusy(""); }
  };

  const importClasses = async () => {
    if (!classFile) return toast.error("Choose a classes CSV first.");
    setBusy("classes");
    try {
      const fd = new FormData();
      fd.append("file", classFile);
      const { data } = await api.post("/admin/class-instances/import-csv", fd);
      setResult({ kind: "classes", msg: `${data.created} classes created.`, errors: data.errors || [] });
      toast.success(`${data.created} classes created.`);
    } catch (e) { toast.error(e?.response?.data?.detail || "Import failed"); }
    finally { setBusy(""); }
  };

  const card = "rounded-2xl bg-white border border-[#E5E6DF] p-5 space-y-3";
  const fileCls = "block w-full text-sm text-[#545E56] file:mr-3 file:rounded-full file:border-0 file:bg-[#F2F2EC] file:px-4 file:py-2 file:text-[#1C221F] file:font-semibold";
  return (
    <div className="space-y-4" data-testid="admin-import">
      <div className={card}>
        <div className="flex items-center gap-2 text-[#B25A45]"><Users className="h-4 w-4" /><span className="eyebrow !text-[11px]">Import members</span></div>
        <p className="text-[12px] text-[#6B7269] -mt-1">CSV with an <b>email</b> column (optional <b>name</b>). Each gets an account + invite link.</p>
        <input data-testid="import-members-batch" className={inputCls} value={memberBatch} onChange={(e) => setMemberBatch(e.target.value)} placeholder="Batch name (e.g. Squarespace export)" />
        <input data-testid="import-members-file" type="file" accept=".csv" onChange={(e) => setMemberFile(e.target.files?.[0] || null)} className={fileCls} />
        <button type="button" onClick={importMembers} disabled={busy === "members"} data-testid="import-members-btn" className="pill pill-primary w-full">{busy === "members" ? "Importing…" : "Import members"}</button>
      </div>
      <div className={card}>
        <div className="flex items-center gap-2 text-[#B25A45]"><Calendar className="h-4 w-4" /><span className="eyebrow !text-[11px]">Import classes</span></div>
        <p className="text-[12px] text-[#6B7269] -mt-1">CSV columns: <b>title, start_time</b> (ISO e.g. 2026-09-01T08:00:00), duration_minutes, capacity, location_type, location_detail, style, level.</p>
        <input data-testid="import-classes-file" type="file" accept=".csv" onChange={(e) => setClassFile(e.target.files?.[0] || null)} className={fileCls} />
        <button type="button" onClick={importClasses} disabled={busy === "classes"} data-testid="import-classes-btn" className="pill pill-primary w-full">{busy === "classes" ? "Importing…" : "Import classes"}</button>
      </div>
      {result && (
        <div className="rounded-2xl bg-[#F2F2EC] border border-[#E5E6DF] p-4" data-testid="import-result">
          <div className="text-sm font-semibold">{result.msg}</div>
          {result.errors?.length > 0 && (
            <ul className="mt-2 text-[12px] text-[#B25A45] space-y-0.5">
              {result.errors.slice(0, 10).map((e, i) => <li key={i}>• {e}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default ImportPane;
