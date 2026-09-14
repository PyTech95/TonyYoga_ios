import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Trophy, Flame, GraduationCap, CalendarCheck, Award, ChevronLeft } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const MEDAL = ["#D4AF37", "#B7B7B7", "#B07A4A"];

export default function Leaderboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get("/leaderboard");
        setData(res.data);
      } catch {
        setData({ enabled: true, rows: [], me: null, total: 0 });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-5 pb-28 pt-6" data-testid="leaderboard-page">
      <Link to="/streak" className="mb-4 inline-flex items-center gap-1 text-[13px] text-[#6B7269] hover:text-[#1C221F]">
        <ChevronLeft className="h-4 w-4" /> Back
      </Link>

      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#B25A45]/10 text-[#B25A45]">
          <Trophy className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1C221F]" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>
            Community Leaderboard
          </h1>
          <p className="text-[13px] text-[#6B7269]">Practice, attend, complete — every mat moment counts.</p>
        </div>
      </div>

      {loading ? (
        <div className="py-16 text-center text-[13px] text-[#6B7269]">Loading…</div>
      ) : data && data.enabled === false ? (
        <div className="rounded-2xl border border-[#E5E6DF] bg-white px-6 py-12 text-center text-[13px] text-[#6B7269]">
          The leaderboard is currently turned off.
        </div>
      ) : (
        <>
          {data?.me && (
            <div data-testid="leaderboard-me" className="mb-5 rounded-2xl bg-[#1C221F] px-5 py-4 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#B25A45] text-[13px] font-bold">
                    #{data.me.rank}
                  </span>
                  <div>
                    <div className="text-[14px] font-semibold">You · {data.me.name}</div>
                    <div className="text-[11px] text-white/60">out of {data.total} yogis</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-[#E4A788]">{data.me.points}</div>
                  <div className="text-[11px] text-white/60">points</div>
                </div>
              </div>
            </div>
          )}

          {(!data || data.rows.length === 0) ? (
            <div className="rounded-2xl border border-dashed border-[#D8D9D0] bg-white px-6 py-14 text-center">
              <Flame className="mx-auto mb-3 h-8 w-8 text-[#B25A45]" />
              <p className="text-[14px] font-semibold text-[#1C221F]">No rankings yet</p>
              <p className="mt-1 text-[13px] text-[#6B7269]">
                Complete lessons, attend classes and keep your streak alive to appear here.
              </p>
              {!user && (
                <Link to="/register" className="mt-4 inline-block rounded-full bg-[#B25A45] px-5 py-2 text-[13px] font-semibold text-white">
                  Join the community
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {data.rows.map((r) => (
                <motion.div
                  key={r.rank}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(r.rank * 0.02, 0.3) }}
                  data-testid={`leaderboard-row-${r.rank}`}
                  className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${
                    r.is_me ? "border-[#B25A45] bg-[#B25A45]/5" : "border-[#E5E6DF] bg-white"
                  }`}
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white"
                    style={{ background: MEDAL[r.rank - 1] || "#6B7269" }}
                  >
                    {r.rank}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold text-[#1C221F]">
                      {r.name}{r.is_me && <span className="ml-1 text-[11px] text-[#B25A45]">(you)</span>}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[#6B7269]">
                      <span className="inline-flex items-center gap-1"><GraduationCap className="h-3 w-3" />{r.lessons}</span>
                      <span className="inline-flex items-center gap-1"><CalendarCheck className="h-3 w-3" />{r.attendance}</span>
                      <span className="inline-flex items-center gap-1"><Award className="h-3 w-3" />{r.certificates}</span>
                      <span className="inline-flex items-center gap-1"><Flame className="h-3 w-3" />{r.longest_streak}d</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[15px] font-bold text-[#B25A45]">{r.points}</div>
                    <div className="text-[10px] text-[#9AA096]">pts</div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
