import { useEffect, useMemo, useState } from "react";
import { Search, X, Flower2, ChevronRight, Play } from "lucide-react";
import { api } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import Spinner from "@/components/Spinner";

export default function Asanas() {
  const [asanas, setAsanas] = useState(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [active, setActive] = useState(null);

  useEffect(() => {
    api.get("/asanas").then(({ data }) => setAsanas(data)).catch(() => setAsanas([]));
  }, []);

  const categories = useMemo(() => {
    if (!asanas) return [];
    return Array.from(new Set(asanas.map((a) => a.category).filter(Boolean))).sort();
  }, [asanas]);

  const list = useMemo(() => {
    if (!asanas) return [];
    const needle = q.trim().toLowerCase();
    return asanas.filter((a) => {
      if (cat !== "all" && a.category !== cat) return false;
      if (!needle) return true;
      const hay = [a.name, a.sanskrit, a.description, a.category, (a.benefits || []).join(" ")]
        .join(" ").toLowerCase();
      return hay.includes(needle);
    });
  }, [asanas, q, cat]);

  return (
    <div data-testid="asanas-page" className="pb-10">
      <PageHeader eyebrow="Pose library" title="Asana Index" testId="asanas-header" />

      <div className="mx-auto max-w-5xl px-5">
        <p className="text-[15px] text-[#545E56] leading-relaxed mb-5 max-w-2xl">
          Every posture across the Core programs — English name, Sanskrit, benefits and a short clip. Search a pose or browse by family.
        </p>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9AA096]" />
          <input
            data-testid="asana-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search a pose — e.g. Camel, Trikonasana, backbend…"
            className="w-full rounded-full border border-[#E5E6DF] bg-white pl-11 pr-10 py-3 text-[15px] focus:outline-none focus:border-[#B25A45]"
          />
          {q && (
            <button data-testid="asana-search-clear" onClick={() => setQ("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#9AA096] hover:text-[#B25A45]">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Category chips */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 mb-6" data-testid="asana-categories">
          {["all", ...categories].map((c) => (
            <button
              key={c}
              data-testid={`asana-cat-${c}`}
              onClick={() => setCat(c)}
              className={`shrink-0 pill !py-2 !px-4 !text-[13px] capitalize ${cat === c ? "pill-primary" : "pill-ghost"}`}
            >
              {c === "all" ? "All poses" : c}
            </button>
          ))}
        </div>

        {asanas === null ? <Spinner /> : list.length === 0 ? (
          <div data-testid="asana-empty" className="text-center py-16 text-[#6B7269]">
            <Flower2 className="h-8 w-8 mx-auto mb-3 text-[#C9CBBF]" />
            <p className="text-sm">No poses match “{q}”.</p>
          </div>
        ) : (
          <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3" data-testid="asana-grid">
            {list.map((a) => (
              <li key={a.id}>
                <button
                  onClick={() => setActive(a)}
                  data-testid={`asana-card-${a.id}`}
                  className="w-full text-left block rounded-2xl overflow-hidden bg-white border border-[#E5E6DF] hover:border-[#B25A45] transition group"
                >
                  <div className="relative aspect-[4/5] bg-[#F2F2EC] overflow-hidden">
                    {a.cover_image && <img src={a.cover_image} alt={a.name} loading="lazy" className="h-full w-full object-cover group-hover:scale-105 transition duration-500" />}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#1C221F]/70 via-transparent to-transparent" />
                    {a.category && (
                      <span className="absolute top-2 left-2 text-[9px] uppercase tracking-widest font-bold bg-white/95 text-[#B25A45] rounded-full px-2 py-0.5">{a.category}</span>
                    )}
                    {a.youtube_id && (
                      <span data-testid={`asana-clip-${a.id}`} className="absolute top-2 right-2 h-6 w-6 rounded-full bg-[#B25A45] text-white flex items-center justify-center shadow" title="Video clip">
                        <Play className="h-3 w-3 ml-0.5" fill="currentColor" />
                      </span>
                    )}
                    <div className="absolute bottom-2 left-3 right-3 text-white">
                      <div className="text-[13px] font-semibold leading-tight clamp-1">{a.name}</div>
                      {a.sanskrit && <div className="text-[11px] italic text-white/80 clamp-1">{a.sanskrit}</div>}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {active && <AsanaDetail asana={active} onClose={() => setActive(null)} />}
    </div>
  );
}

function AsanaDetail({ asana, onClose }) {
  const yid = asana.youtube_id;
  const start = asana.start_seconds || 0;
  const embed = yid
    ? `https://www.youtube.com/embed/${yid}?start=${start}${asana.end_seconds ? `&end=${asana.end_seconds}` : ""}&rel=0&modestbranding=1`
    : null;

  return (
    <div
      data-testid="asana-detail"
      className="fixed inset-0 z-[80] bg-[#1C221F]/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6"
      onClick={onClose}
    >
      <div
        className="bg-[#FAFAF7] w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          {embed ? (
            <div className="aspect-video bg-black sm:rounded-t-3xl overflow-hidden">
              <iframe title={asana.name} src={embed} className="h-full w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
            </div>
          ) : asana.cover_image ? (
            <div className="aspect-video bg-[#F2F2EC] sm:rounded-t-3xl overflow-hidden">
              <img src={asana.cover_image} alt={asana.name} className="h-full w-full object-cover" />
            </div>
          ) : null}
          <button data-testid="asana-detail-close" onClick={onClose} className="absolute top-3 right-3 h-9 w-9 rounded-full bg-white/95 flex items-center justify-center hover:bg-white shadow">
            <X className="h-4 w-4 text-[#1C221F]" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            {asana.category && <div className="eyebrow mb-1">{asana.category}{asana.difficulty ? ` · ${asana.difficulty}` : ""}</div>}
            <h2 className="serif text-3xl leading-tight">{asana.name}</h2>
            {asana.sanskrit && <div className="text-[15px] italic text-[#B25A45] mt-0.5">{asana.sanskrit}</div>}
          </div>

          {asana.description && <p className="text-[15px] text-[#545E56] leading-relaxed">{asana.description}</p>}

          {asana.benefits?.length > 0 && (
            <div>
              <div className="eyebrow mb-2">Benefits</div>
              <ul className="space-y-2" data-testid="asana-benefits">
                {asana.benefits.map((b, i) => (
                  <li key={i} className="flex items-start gap-2.5 rounded-xl bg-white border border-[#E5E6DF] p-3">
                    <ChevronRight className="h-4 w-4 text-[#839682] mt-0.5 shrink-0" />
                    <span className="text-sm text-[#1C221F] leading-snug">{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
