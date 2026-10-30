import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarCheck, PlayCircle, Timer, Flame, Award, BookOpenCheck } from "lucide-react";
import { api } from "@/lib/api";

function monthLabel(ym) {
  const [y, m] = String(ym).split("-").map(Number);
  const d = new Date(Date.UTC(y, (m || 1) - 1, 1));
  return Number.isNaN(d.getTime()) ? ym : d.toLocaleDateString(undefined, { month: "short", timeZone: "UTC" });
}
function minutesLabel(n) {
  const v = Number(n || 0);
  if (v >= 60) return `${Math.floor(v / 60)}h ${v % 60 ? `${v % 60}m` : ""}`.trim();
  return `${v}m`;
}

/** Practice history for the profile: classes, videos, minutes, streak, certificates and the last 6 months. */
export default function PracticeStats() {
  const { t } = useTranslation();
  const [s, setS] = useState(null);
  useEffect(() => {
    let live = true;
    api.get("/me/stats").then(({ data }) => { if (live) setS(data); }).catch(() => { if (live) setS(false); });
    return () => { live = false; };
  }, []);
  if (s === false) return null;
  if (!s) return <div className="h-40 rounded-3xl bg-[#F2F2EC] animate-pulse" aria-busy="true" />;

  const tiles = [
    { icon: CalendarCheck, label: t("stats.classes", "Classes attended"), value: s.classes_attended, tid: "classes" },
    { icon: PlayCircle, label: t("stats.videos", "Videos completed"), value: s.videos_completed, tid: "videos" },
    { icon: Timer, label: t("stats.minutes", "Time practised"), value: minutesLabel(s.minutes), tid: "minutes" },
    { icon: Flame, label: t("stats.streak", "Day streak"), value: `${s.streak}`, sub: t("stats.best", "best {{n}}", { n: s.longest_streak }), tid: "streak" },
    { icon: BookOpenCheck, label: t("stats.lessons", "Lessons done"), value: s.lessons_done, tid: "lessons" },
    { icon: Award, label: t("stats.certs", "Certificates"), value: s.certificates, tid: "certs" },
  ];
  const months = s.months || [];
  const max = Math.max(1, ...months.map((m) => (m.classes || 0) + (m.videos || 0)));

  return (
    <section data-testid="practice-stats" className="rounded-3xl bg-white border border-[#E5E6DF] p-5">
      <div className="eyebrow !text-[11px]">{t("stats.title", "Your practice")}</div>
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
        {tiles.map(({ icon: Icon, label, value, sub, tid }) => (
          <div key={tid} data-testid={`practice-stat-${tid}`} className="rounded-2xl bg-[#F7F7F2] border border-[#EFEFE9] p-3">
            <Icon className="h-4 w-4 text-[#B25A45]" />
            <div className="serif text-2xl leading-none mt-2">{value}</div>
            <div className="text-[11px] text-[#6B7269] mt-1 leading-tight">{label}{sub ? ` · ${sub}` : ""}</div>
          </div>
        ))}
      </div>
      {months.length > 0 && (
        <div className="mt-5" data-testid="practice-stats-chart">
          <div className="flex items-end justify-between gap-2 h-24" role="img" aria-label={t("stats.chart", "Classes and videos per month")}>
            {months.map((m) => {
              const classes = m.classes || 0;
              const videos = m.videos || 0;
              const total = classes + videos;
              return (
                <div key={m.month} className="flex-1 flex flex-col items-center justify-end h-full" title={`${monthLabel(m.month)}: ${classes} ${t("stats.c", "classes")}, ${videos} ${t("stats.v", "videos")}, ${m.minutes || 0} min`}>
                  <div className="text-[10px] text-[#6B7269] mb-1">{total || ""}</div>
                  <div className="w-full max-w-[28px] rounded-t-md overflow-hidden flex flex-col justify-end bg-[#EEF1EC]" style={{ height: `${Math.max(4, (total / max) * 100)}%` }}>
                    <div className="bg-[#B25A45]" style={{ height: total ? `${(classes / total) * 100}%` : 0 }} />
                    <div className="bg-[#E8B8A8]" style={{ height: total ? `${(videos / total) * 100}%` : 0 }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between gap-2 mt-1">
            {months.map((m) => <div key={m.month} className="flex-1 text-center text-[10px] text-[#6B7269]">{monthLabel(m.month)}</div>)}
          </div>
          <div className="flex items-center gap-4 mt-3 text-[11px] text-[#6B7269]">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#B25A45]" /> {t("stats.legend_classes", "Live classes")}</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#E8B8A8]" /> {t("stats.legend_videos", "Videos")}</span>
          </div>
        </div>
      )}
    </section>
  );
}
