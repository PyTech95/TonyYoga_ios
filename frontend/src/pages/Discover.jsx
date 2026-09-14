import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Search, X, SlidersHorizontal, Clock, GraduationCap, Compass } from "lucide-react";
import { api } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import Spinner from "@/components/Spinner";

export default function Discover() {
  const { t } = useTranslation();
  const TYPE_TABS = [
    { key: "all", label: t("disc.all") },
    { key: "program", label: t("disc.programs") },
    { key: "class", label: t("disc.classes") },
  ];
  const [facets, setFacets] = useState(null);
  const [items, setItems] = useState(null);
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [filters, setFilters] = useState({ level: "", style: "", focus: "", duration: "", language: "" });
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    api.get("/discover/facets").then(({ data }) => setFacets(data)).catch(() => setFacets({}));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (type !== "all") params.set("type", type);
    if (q.trim()) params.set("q", q.trim());
    Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
    setItems(null);
    const t = setTimeout(() => {
      api.get(`/discover?${params.toString()}`).then(({ data }) => setItems(data)).catch(() => setItems([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, type, filters]);

  const activeCount = useMemo(() => Object.values(filters).filter(Boolean).length, [filters]);
  const set = (k, v) => setFilters((f) => ({ ...f, [k]: f[k] === v ? "" : v }));
  const clearAll = () => { setFilters({ level: "", style: "", focus: "", duration: "", language: "" }); setQ(""); };

  return (
    <div data-testid="discover-page" className="pb-10">
      <PageHeader eyebrow={t("disc.eyebrow")} title={t("disc.title")} testId="discover-header" />

      <div className="mx-auto max-w-5xl px-5">
        <p className="text-[15px] text-[#545E56] leading-relaxed mb-5 max-w-2xl">
          {t("disc.sub")}
        </p>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9AA096]" />
          <input
            data-testid="discover-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("disc.search")}
            className="w-full rounded-full border border-[#E5E6DF] bg-white pl-11 pr-10 py-3 text-[15px] focus:outline-none focus:border-[#B25A45]"
          />
          {q && (
            <button data-testid="discover-search-clear" onClick={() => setQ("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#9AA096] hover:text-[#B25A45]">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Type tabs + filter toggle */}
        <div className="flex items-center gap-2 mb-4">
          <div className="flex gap-2 flex-1 overflow-x-auto no-scrollbar">
            {TYPE_TABS.map((tb) => (
              <button
                key={tb.key}
                data-testid={`discover-type-${tb.key}`}
                onClick={() => setType(tb.key)}
                className={`shrink-0 pill !py-2 !px-4 !text-[13px] ${type === tb.key ? "pill-primary" : "pill-ghost"}`}
              >
                {tb.label}
              </button>
            ))}
          </div>
          <button
            data-testid="discover-filter-toggle"
            onClick={() => setShowFilters((s) => !s)}
            className={`shrink-0 pill !py-2 !px-4 !text-[13px] ${showFilters || activeCount ? "pill-primary" : "pill-ghost"}`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" /> {t("disc.filters")}{activeCount ? ` (${activeCount})` : ""}
          </button>
        </div>

        {/* Filter panel */}
        {showFilters && facets && (
          <div data-testid="discover-filters" className="rounded-2xl bg-white border border-[#E5E6DF] p-4 mb-5 space-y-4">
            <FilterRow label={t("disc.focus")} testid="focus" options={facets.focus_areas} value={filters.focus} onPick={(v) => set("focus", v)} />
            <FilterRow label={t("disc.level")} testid="level" options={facets.levels} value={filters.level} onPick={(v) => set("level", v)} cap />
            <FilterRow label={t("disc.style")} testid="style" options={facets.styles} value={filters.style} onPick={(v) => set("style", v)} />
            <FilterRow label={t("disc.duration")} testid="duration" options={facets.durations} value={filters.duration} onPick={(v) => set("duration", v)} suffix=" min" note={t("disc.classes_only")} />
            <FilterRow label={t("disc.language")} testid="language" options={facets.languages} value={filters.language} onPick={(v) => set("language", v)} labels={{ en: "English", es: "Español" }} />
            {(activeCount > 0 || q) && (
              <button data-testid="discover-clear-all" onClick={clearAll} className="text-xs font-semibold text-[#B25A45] hover:underline">{t("disc.clear")}</button>
            )}
          </div>
        )}

        {/* Results */}
        {items === null ? <Spinner /> : items.length === 0 ? (
          <div data-testid="discover-empty" className="text-center py-16 text-[#6B7269]">
            <Compass className="h-8 w-8 mx-auto mb-3 text-[#C9CBBF]" />
            <p className="text-sm">{t("disc.empty")}</p>
            <button onClick={clearAll} className="mt-3 pill pill-ghost !text-xs">{t("disc.reset")}</button>
          </div>
        ) : (
          <>
            <div className="text-xs text-[#6B7269] mb-3" data-testid="discover-count">{items.length} {items.length === 1 ? t("disc.result") : t("disc.results")}</div>
            <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3" data-testid="discover-grid">
              {items.map((it) => (
                <li key={`${it.kind}-${it.id}`}>
                  <Link to={it.url} data-testid={`discover-card-${it.id}`} className="block rounded-2xl overflow-hidden bg-white border border-[#E5E6DF] hover:border-[#B25A45] transition group">
                    <div className="relative aspect-[4/5] bg-[#F2F2EC] overflow-hidden">
                      {it.cover && <img src={it.cover} alt={it.title} loading="lazy" className="h-full w-full object-cover group-hover:scale-105 transition duration-500" />}
                      <div className="absolute inset-0 bg-gradient-to-t from-[#1C221F]/75 via-transparent to-transparent" />
                      <span className={`absolute top-2 left-2 text-[9px] uppercase tracking-widest font-bold rounded-full px-2 py-0.5 ${it.kind === "program" ? "bg-[#B25A45] text-white" : "bg-white/95 text-[#1C221F]"}`}>
                        {it.kind === "program" ? t("disc.program") : t("disc.class")}
                      </span>
                      <div className="absolute bottom-2 left-3 right-3 text-white">
                        <div className="text-[13px] font-semibold leading-tight clamp-2">{it.title}</div>
                        <div className="flex items-center gap-2 text-[10px] text-white/80 mt-1">
                          {it.duration_label && <span className="inline-flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" />{it.duration_label}</span>}
                          {it.level && <span className="capitalize">· {it.level}</span>}
                        </div>
                      </div>
                    </div>
                    {it.focus_areas?.length > 0 && (
                      <div className="px-3 py-2 flex flex-wrap gap-1">
                        {it.focus_areas.slice(0, 2).map((f) => (
                          <span key={f} className="text-[9px] rounded-full bg-[#F2F2EC] text-[#6B7269] px-2 py-0.5">{f}</span>
                        ))}
                      </div>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function FilterRow({ label, testid, options = [], value, onPick, cap, suffix = "", labels, note }) {
  if (!options?.length) return null;
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] uppercase tracking-widest font-bold text-[#9AA096]">{label}</span>
        {note && <span className="text-[10px] text-[#C0A99D]">· {note}</span>}
      </div>
      <div className="flex flex-wrap gap-2" data-testid={`discover-filter-${testid}`}>
        {options.map((o) => (
          <button
            key={o}
            data-testid={`discover-${testid}-${o}`}
            onClick={() => onPick(o)}
            className={`pill !py-1.5 !px-3 !text-[12px] ${value === o ? "pill-primary" : "pill-ghost"} ${cap ? "capitalize" : ""}`}
          >
            {labels?.[o] || o}{suffix}
          </button>
        ))}
      </div>
    </div>
  );
}
