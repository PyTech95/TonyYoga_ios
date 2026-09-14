import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Play, Lock, Pencil, Flower2, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import PageHeader from "@/components/PageHeader";
import Spinner from "@/components/Spinner";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "free", label: "Free" },
  { key: "members", label: "Members" },
];

export default function Library() {
  const [videos, setVideos] = useState(null);
  const [filter, setFilter] = useState("all");
  const { user } = useAuth();

  useEffect(() => {
    api.get("/videos").then(({ data }) => setVideos(data)).catch(() => setVideos([]));
  }, []);

  const list = useMemo(() => {
    if (!videos) return [];
    if (filter === "all") return videos;
    return videos.filter((v) => v.visibility === filter || (filter === "members" && v.visibility === "program"));
  }, [videos, filter]);

  return (
    <div data-testid="library-page">
      <PageHeader eyebrow="Practice" title="Library" testId="library-header"
        action={user?.role === "admin" ? (
          <Link to="/admin?tab=courses" data-testid="library-admin-manage" className="pill pill-primary !py-1.5 !px-3 !text-xs"><Pencil className="h-3.5 w-3.5" /> Manage</Link>
        ) : null}
      />

      <div className="mx-auto max-w-2xl px-5">
        <Link
          to="/asanas"
          data-testid="library-asana-link"
          className="flex items-center gap-3 rounded-2xl bg-[#1C221F] text-[#FAFAF7] p-4 mb-5 hover:bg-[#0F1211] transition"
        >
          <div className="h-10 w-10 rounded-full bg-[#B25A45] flex items-center justify-center shrink-0">
            <Flower2 className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="serif text-lg leading-tight">Asana Index</div>
            <div className="text-xs text-white/70">Search every pose — name, Sanskrit &amp; benefits</div>
          </div>
          <ChevronRight className="h-5 w-5 text-white/60 shrink-0" />
        </Link>

        <div className="flex gap-2 mb-5" data-testid="library-filters">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              data-testid={`library-filter-${f.key}`}
              onClick={() => setFilter(f.key)}
              className={`pill !py-2 !px-4 !text-[13px] ${filter === f.key ? "pill-primary" : "pill-ghost"}`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {videos === null ? <Spinner /> : list.length === 0 ? (
          <p className="text-sm text-[#6B7269] py-10 text-center">No videos in this category.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3" data-testid="library-list">
            {list.map((v) => (
              <li key={v.id}>
                <Link
                  to={`/library/${v.id}`}
                  data-testid={`library-video-${v.id}`}
                  className="block rounded-2xl overflow-hidden bg-white border border-[#E5E6DF] hover:border-[#B25A45] transition group"
                >
                  <div className="relative aspect-[4/5] bg-[#F2F2EC] overflow-hidden">
                    {v.cover_image && <img src={v.cover_image} alt="" className="h-full w-full object-cover" />}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#1C221F]/50 to-transparent" />
                    <div className="absolute top-2 left-2 text-[9px] uppercase tracking-widest font-bold bg-white/95 rounded-full px-2 py-0.5" style={{ color: v.visibility === "free" ? "#839682" : "#B25A45" }}>
                      {v.visibility === "free" ? "FREE" : v.visibility === "program" ? "PROGRAM" : "MEMBERS"}
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="h-11 w-11 rounded-full bg-white/95 flex items-center justify-center group-hover:scale-110 transition">
                        {v.visibility === "free" ? <Play className="h-4 w-4 text-[#B25A45] ml-0.5" /> : <Lock className="h-4 w-4 text-[#B25A45]" />}
                      </div>
                    </div>
                  </div>
                  <div className="p-3">
                    <div className="text-[13px] font-semibold leading-tight clamp-2">{v.title}</div>
                    <div className="text-[10px] text-[#6B7269] mt-1">{v.duration_minutes} min · {v.style}</div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
