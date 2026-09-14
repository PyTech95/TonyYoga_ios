import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, X, Clock, Play, Pause, Sparkles, Wind, Moon } from "lucide-react";
import { api } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import Spinner from "@/components/Spinner";

export default function Meditations() {
  const { t } = useTranslation();
  const TABS = [
    { key: "all", label: t("med.tab_all"), icon: Sparkles },
    { key: "meditation", label: t("med.tab_meditation"), icon: Sparkles },
    { key: "breathwork", label: t("med.tab_breathwork"), icon: Wind },
    { key: "nidra", label: t("med.tab_nidra"), icon: Moon },
  ];
  const [rows, setRows] = useState(null);
  const [daily, setDaily] = useState(null);
  const [facets, setFacets] = useState({ focus_areas: [], durations: [] });
  const [tab, setTab] = useState("all");
  const [focus, setFocus] = useState("");
  const [duration, setDuration] = useState("");
  const [q, setQ] = useState("");
  const [active, setActive] = useState(null);

  useEffect(() => {
    api.get("/meditations").then(({ data }) => setRows(data)).catch(() => setRows([]));
    api.get("/meditations/daily").then(({ data }) => setDaily(data)).catch(() => {});
    api.get("/meditations/facets").then(({ data }) => setFacets(data)).catch(() => {});
  }, []);

  const list = useMemo(() => {
    if (!rows) return [];
    const n = q.trim().toLowerCase();
    return rows.filter((m) => {
      if (tab !== "all" && m.kind !== tab) return false;
      if (focus && !(m.focus_areas || []).includes(focus)) return false;
      if (duration) {
        const d = m.duration_minutes || 0;
        if (duration === "5-15" && !(d <= 15)) return false;
        if (duration === "20-40" && !(15 < d && d <= 40)) return false;
        if (duration === "60+" && !(d > 40)) return false;
      }
      if (n && !(m.title || "").toLowerCase().includes(n)) return false;
      return true;
    });
  }, [rows, tab, focus, duration, q]);

  return (
    <div data-testid="meditations-page" className="pb-10">
      <PageHeader eyebrow={t("med.eyebrow")} title={t("med.title")} testId="meditations-header" />

      <div className="mx-auto max-w-5xl px-5">
        <p className="text-[15px] text-[#545E56] leading-relaxed mb-5 max-w-2xl">
          {t("med.intro")}
        </p>

        {daily && (
          <button
            onClick={() => setActive(daily)}
            data-testid="meditation-daily"
            className="w-full text-left rounded-3xl overflow-hidden bg-[#1C221F] text-white mb-6 grid sm:grid-cols-[1.4fr,1fr] group"
          >
            <div className="p-6 sm:p-8">
              <div className="eyebrow !text-[#B25A45] mb-2">{t("med.daily")}</div>
              <div className="serif text-2xl sm:text-3xl leading-tight mb-2">{daily.title}</div>
              <p className="text-white/70 text-sm leading-relaxed line-clamp-2">{daily.description}</p>
              <div className="mt-4 inline-flex items-center gap-2 text-xs font-semibold bg-[#B25A45] rounded-full px-4 py-2">
                <Play className="h-3.5 w-3.5" /> {t("med.play")} {daily.duration_minutes ? `· ${daily.duration_minutes} ${t("med.min")}` : ""}
              </div>
            </div>
            <div className="relative min-h-[140px] hidden sm:block">
              {daily.cover_image && <img src={daily.cover_image} alt="" className="absolute inset-0 h-full w-full object-cover group-hover:scale-105 transition duration-500" />}
              <div className="absolute inset-0 bg-gradient-to-r from-[#1C221F] to-transparent" />
            </div>
          </button>
        )}

        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar mb-3" data-testid="meditation-tabs">
          {TABS.map((tb) => (
            <button key={tb.key} data-testid={`meditation-tab-${tb.key}`} onClick={() => setTab(tb.key)}
              className={`shrink-0 pill !py-2 !px-4 !text-[13px] ${tab === tb.key ? "pill-primary" : "pill-ghost"}`}>
              <tb.icon className="h-3.5 w-3.5" /> {tb.label}
            </button>
          ))}
        </div>

        {/* Search + filters */}
        <div className="relative mb-3">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9AA096]" />
          <input data-testid="meditation-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("med.search")}
            className="w-full rounded-full border border-[#E5E6DF] bg-white pl-11 pr-10 py-3 text-[15px] focus:outline-none focus:border-[#B25A45]" />
          {q && <button onClick={() => setQ("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#9AA096]"><X className="h-4 w-4" /></button>}
        </div>
        <div className="flex flex-wrap gap-2 mb-6">
          {facets.focus_areas?.map((f) => (
            <button key={f} data-testid={`meditation-focus-${f}`} onClick={() => setFocus(focus === f ? "" : f)}
              className={`pill !py-1.5 !px-3 !text-[12px] ${focus === f ? "pill-primary" : "pill-ghost"}`}>{f}</button>
          ))}
          <span className="w-px bg-[#E5E6DF] mx-1" />
          {(facets.durations || []).map((d) => (
            <button key={d} data-testid={`meditation-duration-${d}`} onClick={() => setDuration(duration === d ? "" : d)}
              className={`pill !py-1.5 !px-3 !text-[12px] ${duration === d ? "pill-primary" : "pill-ghost"}`}>{d} min</button>
          ))}
        </div>

        {rows === null ? <Spinner /> : list.length === 0 ? (
          <div data-testid="meditation-empty" className="text-center py-16 text-[#6B7269] text-sm">{t("med.empty")}</div>
        ) : (
          <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3" data-testid="meditation-grid">
            {list.map((m) => (
              <li key={m.id}>
                <button onClick={() => setActive(m)} data-testid={`meditation-card-${m.id}`}
                  className="w-full text-left block rounded-2xl overflow-hidden bg-white border border-[#E5E6DF] hover:border-[#B25A45] transition group">
                  <div className="relative aspect-[4/5] bg-[#F2F2EC] overflow-hidden">
                    {m.cover_image && <img src={m.cover_image} alt={m.title} loading="lazy" className="h-full w-full object-cover group-hover:scale-105 transition duration-500" />}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#1C221F]/75 via-transparent to-transparent" />
                    <span className="absolute top-2 left-2 text-[9px] uppercase tracking-widest font-bold bg-white/95 text-[#B25A45] rounded-full px-2 py-0.5 capitalize">{m.kind === "nidra" ? "Yoga Nidra" : m.kind}</span>
                    <div className="absolute bottom-2 left-3 right-3 text-white">
                      <div className="text-[13px] font-semibold leading-tight clamp-2">{m.title}</div>
                      {m.duration_minutes && <div className="text-[10px] text-white/80 mt-0.5 inline-flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" />{m.duration_minutes} {t("med.min")}</div>}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {active && <MeditationPlayer m={active} onClose={() => setActive(null)} />}
    </div>
  );
}

function MeditationPlayer({ m, onClose }) {
  const { t } = useTranslation();
  const yid = m.youtube_id;
  const embed = yid ? `https://www.youtube.com/embed/${yid}?rel=0&modestbranding=1&autoplay=1` : null;
  return (
    <div data-testid="meditation-player" className="fixed inset-0 z-[80] bg-[#1C221F]/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6" onClick={onClose}>
      <div className="bg-[#FAFAF7] w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="relative">
          {embed ? (
            <div className="aspect-video bg-black sm:rounded-t-3xl overflow-hidden">
              <iframe title={m.title} src={embed} className="h-full w-full" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
            </div>
          ) : m.cover_image ? (
            <div className="aspect-video bg-[#F2F2EC] sm:rounded-t-3xl overflow-hidden">
              <img src={m.cover_image} alt={m.title} className="h-full w-full object-cover" />
            </div>
          ) : null}
          <button data-testid="meditation-player-close" onClick={onClose} className="absolute top-3 right-3 h-9 w-9 rounded-full bg-white/95 flex items-center justify-center shadow"><X className="h-4 w-4 text-[#1C221F]" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <div className="eyebrow mb-1 capitalize">{m.kind === "nidra" ? "Yoga Nidra" : m.kind}{m.duration_minutes ? ` · ${m.duration_minutes} ${t("med.min")}` : ""}</div>
            <h2 className="serif text-3xl leading-tight">{m.title}</h2>
          </div>
          {m.description && <p className="text-[15px] text-[#545E56] leading-relaxed">{m.description}</p>}
          {m.media_kind === "audio" && m.audio_url && (
            <audio data-testid="meditation-audio" controls autoPlay src={m.audio_url} className="w-full">
              {t("med.audio_unsupported")}
            </audio>
          )}
          {m.focus_areas?.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {m.focus_areas.map((f) => <span key={f} className="text-[11px] rounded-full bg-[#F2F2EC] text-[#6B7269] px-3 py-1">{f}</span>)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
