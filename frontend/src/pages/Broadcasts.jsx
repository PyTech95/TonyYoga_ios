import { useEffect, useState } from "react";
import { Mic, Video as VideoIcon, Play } from "lucide-react";
import { api } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import Spinner from "@/components/Spinner";
import { isYouTube, youTubeEmbed, youTubeThumb } from "@/lib/youtube";

function EpisodePlayer({ ep }) {
  if (ep.media_type === "video") {
    if (isYouTube(ep.media_url)) {
      return (
        <div className="rounded-2xl overflow-hidden bg-black aspect-video" data-testid={`bc-player-${ep.id}`}>
          <iframe title={ep.title} src={youTubeEmbed(ep.media_url)} className="h-full w-full" allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowFullScreen />
        </div>
      );
    }
    return (
      <video controls playsInline className="w-full rounded-2xl bg-black aspect-video" poster={ep.cover_image} src={ep.media_url} data-testid={`bc-player-${ep.id}`} />
    );
  }
  return <audio controls className="w-full mt-1" src={ep.media_url} data-testid={`bc-player-${ep.id}`} />;
}

export default function Broadcasts() {
  const [eps, setEps] = useState(null);
  const [filter, setFilter] = useState("all");
  const [series, setSeries] = useState("");
  const [seriesList, setSeriesList] = useState([]);
  const [open, setOpen] = useState({});

  useEffect(() => { api.get("/broadcasts/series").then(({ data }) => setSeriesList(data || [])).catch(() => {}); }, []);

  const load = () => {
    const params = [];
    if (filter !== "all") params.push(`media_type=${filter}`);
    if (series) params.push(`series=${encodeURIComponent(series)}`);
    const q = params.length ? `?${params.join("&")}` : "";
    api.get(`/broadcasts${q}`).then(({ data }) => setEps(data)).catch(() => setEps([]));
  };
  useEffect(load, [filter, series]);

  return (
    <div data-testid="broadcasts-page" className="pb-10">
      <PageHeader eyebrow="Podcast & talks" title="Broadcasts." showLogo />
      <div className="mx-auto max-w-2xl px-5">
        <div className="flex gap-2 mb-3" data-testid="bc-filters">
          {[["all", "All"], ["audio", "Audio"], ["video", "Video"]].map(([v, label]) => (
            <button key={v} onClick={() => setFilter(v)} data-testid={`bc-filter-${v}`}
              className={`pill !py-2 !px-4 !text-[13px] ${filter === v ? "pill-primary" : "pill-ghost"}`}>
              {label}
            </button>
          ))}
        </div>

        {seriesList.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-5" data-testid="bc-series">
            <button onClick={() => setSeries("")} data-testid="bc-series-all"
              className={`pill !py-1.5 !px-3 !text-[12px] ${series === "" ? "pill-primary" : "pill-ghost"}`}>All series</button>
            {seriesList.map((s) => (
              <button key={s} onClick={() => setSeries(s)} data-testid={`bc-series-${s}`}
                className={`pill !py-1.5 !px-3 !text-[12px] ${series === s ? "pill-primary" : "pill-ghost"}`}>{s}</button>
            ))}
          </div>
        )}

        {eps === null ? <Spinner /> : eps.length === 0 ? (
          <p className="text-sm text-[#6B7269] py-12 text-center" data-testid="bc-empty">No episodes yet — check back soon for Tony's talks.</p>
        ) : (
          <ul className="space-y-4" data-testid="bc-list">
            {eps.map((ep) => {
              const isOpen = !!open[ep.id];
              const thumb = ep.cover_image || (ep.media_type === "video" && isYouTube(ep.media_url) ? youTubeThumb(ep.media_url) : null);
              return (
                <li key={ep.id} data-testid={`bc-card-${ep.id}`} className="rounded-3xl bg-white border border-[#E5E6DF] p-4 space-y-3">
                  <div className="flex gap-4">
                    <div className="h-20 w-20 rounded-2xl overflow-hidden bg-[#F2F2EC] shrink-0 flex items-center justify-center">
                      {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" /> :
                        (ep.media_type === "video" ? <VideoIcon className="h-6 w-6 text-[#B25A45]" /> : <Mic className="h-6 w-6 text-[#B25A45]" />)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-semibold text-[#839682]">
                        {ep.media_type === "video" ? <VideoIcon className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
                        {ep.media_type}
                        <span className="text-[#B7BBB1]">· {new Date(ep.publish_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                      </div>
                      <div className="serif text-lg leading-snug mt-0.5 clamp-2">{ep.title}</div>
                      {ep.description && <p className="text-[13px] text-[#545E56] mt-1 clamp-2 leading-relaxed">{ep.description}</p>}
                      {!isOpen && (
                        <button onClick={() => setOpen((o) => ({ ...o, [ep.id]: true }))} data-testid={`bc-play-${ep.id}`}
                          className="pill pill-primary !py-1.5 !px-4 !text-[13px] mt-2"><Play className="h-3.5 w-3.5" /> Play</button>
                      )}
                    </div>
                  </div>
                  {isOpen && <EpisodePlayer ep={ep} />}
                  {(ep.tags || []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {ep.tags.map((t) => <span key={t} className="rounded-full bg-[#F2F2EC] px-2.5 py-1 text-[11px] text-[#6B7269]">{t}</span>)}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
