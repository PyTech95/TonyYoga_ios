import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Users, Calendar, TrendingUp, Send, Check, X, CreditCard, Mail, Bell, Save, RefreshCw, History, BookOpen, Plus, ArrowLeft, Trash2, ChevronUp, ChevronDown, ChevronRight, Youtube, Play, Clock, Eye, EyeOff, ListPlus, Instagram, Wallet, ClipboardCheck, Package, GraduationCap, Award, MessageCircle, Video, Mic, LayoutDashboard, MountainSnow, Gift, Settings as SettingsIcon, Upload } from "lucide-react";
import { api, API_BASE } from "@/lib/api";
import Spinner from "@/components/Spinner";

function StudentsPane() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/admin/students/progress").then(({ data }) => setData(data)).catch(() => setData(false)); }, []);
  if (data === null) return <Spinner />;
  if (data === false) return <p className="text-sm text-[#6B7269] py-4 text-center">Could not load students.</p>;

  return (
    <div className="space-y-3" data-testid="students-pane">
      <div className="flex items-center justify-between">
        <div className="eyebrow">Students ({data.total})</div>
        <button
          data-testid="export-certificates-csv"
          onClick={async () => {
            try {
              const res = await api.get("/admin/certificates/export.csv", { responseType: "blob" });
              const href = URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
              const a = document.createElement("a");
              a.href = href; a.download = "certificates.csv"; a.click();
              URL.revokeObjectURL(href);
            } catch { toast.error("Export failed"); }
          }}
          className="pill pill-ghost !py-1.5 !px-3 !text-xs"
        >
          <Award className="h-3.5 w-3.5" /> Export certificates CSV
        </button>
      </div>
      {data.students.length === 0 ? (
        <p className="text-sm text-[#6B7269] py-4 text-center">No students yet.</p>
      ) : (
        <ul className="space-y-2" data-testid="students-list">
          {data.students.map((s) => (
            <li key={s.user_id} className="rounded-2xl bg-white border border-[#E5E6DF] p-4 space-y-3" data-testid={`student-row-${s.user_id}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold truncate">{s.name || s.email}</div>
                  <div className="text-xs text-[#6B7269] truncate">{s.email}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {s.active_member && <span className="text-[10px] uppercase tracking-widest font-bold text-[#839682] bg-[#EEF1EC] rounded-full px-2 py-1">Member</span>}
                  {s.certificates > 0 && <span className="flex items-center gap-1 text-[11px] font-semibold text-[#B25A45]"><Award className="h-3.5 w-3.5" /> {s.certificates}</span>}
                </div>
              </div>
              {s.enrollments.length === 0 ? (
                <div className="text-xs text-[#6B7269]">Not enrolled in any course yet.</div>
              ) : (
                <ul className="space-y-2">
                  {s.enrollments.map((e) => (
                    <li key={e.program_id} data-testid={`student-${s.user_id}-prog-${e.program_id}`}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="truncate flex items-center gap-1.5">{e.certified && <Award className="h-3 w-3 text-[#B25A45]" />}{e.program_title}</span>
                        <span className="text-[#6B7269] shrink-0">{e.completed}/{e.total} · {e.pct}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[#EEF1EC] overflow-hidden">
                        <div className="h-full bg-[#B25A45]" style={{ width: `${e.pct}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}


export default StudentsPane;
