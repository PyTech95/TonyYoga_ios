import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { TrendingUp, Calendar, Percent, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import PageHeader from "@/components/PageHeader";
import Spinner from "@/components/Spinner";
import EmptyState from "@/components/EmptyState";

export default function Instructor() {
  const { user, ready } = useAuth();
  const [earnings, setEarnings] = useState(null);
  const [classes, setClasses] = useState(null);

  const load = async () => {
    try {
      const [e, c] = await Promise.all([
        api.get("/instructor/earnings"),
        api.get("/instructor/class-instances"),
      ]);
      setEarnings(e.data);
      setClasses(c.data);
    } catch {
      setEarnings(false);
      setClasses([]);
    }
  };
  useEffect(() => { if (ready && user) load(); }, [ready, user]);

  if (!ready) return null;
  if (!user || !["instructor", "admin"].includes(user.role)) return <Navigate to="/home" replace />;

  const cancel = async (id) => {
    if (!window.confirm("Cancel this class? All bookings will be cancelled.")) return;
    try {
      await api.patch(`/instructor/class-instances/${id}/cancel`);
      toast.success("Class cancelled.");
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not cancel"); }
  };

  const cur = (earnings && earnings.breakdown && earnings.breakdown[0]?.currency) || "€";
  return (
    <div data-testid="instructor-page" className="pb-6">
      <PageHeader eyebrow="Teacher" title="Studio" testId="instructor-header" />
      <div className="mx-auto max-w-2xl px-5 space-y-6">
        {/* Earnings */}
        <section data-testid="instructor-earnings">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-[#1C221F] text-[#FAFAF7] p-5">
              <div className="flex items-center gap-2 text-[#B25A45]"><TrendingUp className="h-4 w-4" /><span className="eyebrow !text-[10px]">Total earnings</span></div>
              <div className="serif text-3xl mt-2">{earnings === null ? "…" : `€${(earnings.total_earnings || 0).toFixed(2)}`}</div>
              <div className="text-[11px] text-white/50 mt-1">Your revenue share to date</div>
            </div>
            <div className="rounded-2xl bg-white border border-[#E5E6DF] p-5">
              <div className="flex items-center gap-2 text-[#839682]"><Calendar className="h-4 w-4" /><span className="eyebrow !text-[10px]">Upcoming classes</span></div>
              <div className="serif text-3xl mt-2">{classes === null ? "…" : classes.filter((c) => c.status !== "cancelled").length}</div>
              <div className="text-[11px] text-[#6B7269] mt-1">Scheduled and live</div>
            </div>
          </div>
        </section>

        {/* Revenue-share rules */}
        <section>
          <div className="eyebrow mb-3">Revenue share</div>
          {earnings === null ? <Spinner /> : (earnings.rules || []).length === 0 ? (
            <p className="text-sm text-[#6B7269]">No revenue-share rules assigned yet. Ask an admin to set your split.</p>
          ) : (
            <ul className="space-y-2" data-testid="instructor-rules">
              {earnings.rules.map((r, i) => (
                <li key={i} className="rounded-2xl bg-white border border-[#E5E6DF] p-4 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm"><Percent className="h-4 w-4 text-[#B25A45]" /><span className="capitalize">{r.type} share</span></div>
                  <span className="serif text-xl">{r.percentage}%</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* My classes */}
        <section>
          <div className="eyebrow mb-3">My classes</div>
          {classes === null ? <Spinner /> : classes.length === 0 ? (
            <EmptyState title="No upcoming classes" subtitle="Classes assigned to you will appear here." />
          ) : (
            <ul className="space-y-2" data-testid="instructor-classes">
              {classes.map((c) => (
                <li key={c.id} className="rounded-2xl bg-white border border-[#E5E6DF] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-semibold truncate">{c.title}</div>
                      <div className="text-xs text-[#6B7269] mt-0.5">{new Date(c.start_time).toLocaleString()}</div>
                      <div className="text-[11px] mt-1.5 text-[#545E56] flex items-center gap-1"><Users className="h-3 w-3" />{c.bookings_count || 0} / {c.capacity} booked · {c.location_type}</div>
                      <div className="text-[10px] mt-1 uppercase tracking-widest font-semibold" style={{ color: c.status === "cancelled" ? "#B25A45" : "#839682" }}>{c.status}</div>
                    </div>
                    {c.status !== "cancelled" && (
                      <button onClick={() => cancel(c.id)} data-testid={`instructor-cancel-${c.id}`} className="text-xs text-[#B25A45] hover:underline shrink-0">Cancel</button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
