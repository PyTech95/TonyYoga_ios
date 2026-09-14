import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Users, Calendar, TrendingUp, Send, Check, X, CreditCard, Mail, Bell, Save, RefreshCw, History, BookOpen, Plus, ArrowLeft, Trash2, ChevronUp, ChevronDown, ChevronRight, Youtube, Play, Clock, Eye, EyeOff, ListPlus, Instagram, Wallet, ClipboardCheck, Package, GraduationCap, Award, MessageCircle, Video, Mic, LayoutDashboard, MountainSnow, Gift, Settings as SettingsIcon, Upload } from "lucide-react";
import { api, API_BASE } from "@/lib/api";
import Spinner from "@/components/Spinner";

function ApplicationsPane() {
  const [apps, setApps] = useState(null);
  const load = async () => {
    try { const { data } = await api.get("/admin/instructor-applications"); setApps(data); }
    catch { setApps([]); }
  };
  useEffect(() => { load(); }, []);

  const decide = async (id, action) => {
    try {
      await api.post("/admin/instructor-applications/decision", { application_id: id, action });
      toast.success(`Application ${action}d.`);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  if (apps === null) return <Spinner />;
  if (apps.length === 0) return <p data-testid="admin-apps-empty" className="text-sm text-[#6B7269] py-8 text-center">No applications yet.</p>;

  return (
    <ul className="space-y-3" data-testid="admin-apps-list">
      {apps.map((a) => (
        <li key={a.id} className="rounded-2xl bg-white border border-[#E5E6DF] p-4">
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold">{a.name}</div>
              <div className="text-xs text-[#6B7269] mt-0.5">{a.email} · {a.years_experience}yr</div>
              <div className="text-xs mt-1 text-[#545E56]">{(a.styles || []).join(", ")}</div>
              <p className="text-xs text-[#6B7269] mt-2 clamp-3 leading-relaxed">{a.bio}</p>
              <div className="text-[10px] mt-2 uppercase tracking-widest font-semibold" style={{ color: a.status === "pending" ? "#B25A45" : "#839682" }}>{a.status}</div>
            </div>
            {a.status === "pending" && (
              <div className="flex flex-col gap-2 shrink-0">
                <button onClick={() => decide(a.id, "approve")} data-testid={`admin-approve-${a.id}`} className="pill pill-primary !py-1.5 !px-3 !text-xs"><Check className="h-3 w-3" /> Approve</button>
                <button onClick={() => decide(a.id, "reject")} data-testid={`admin-reject-${a.id}`} className="pill pill-ghost !py-1.5 !px-3 !text-xs"><X className="h-3 w-3" /> Reject</button>
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export default ApplicationsPane;
