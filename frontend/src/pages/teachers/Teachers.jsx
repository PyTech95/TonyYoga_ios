import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Search, MapPin, Globe, ArrowRight, Users, Languages } from "lucide-react";
import { api } from "@/lib/api";
import { useFeatures } from "@/lib/features";
import PageHeader from "@/components/PageHeader";
import { CertBadge, NotOpen, inputCls } from "./teacherShared";

export default function Teachers() {
  const { t } = useTranslation();
  const { teacherLabel } = useFeatures();
  const [rows, setRows] = useState(null);
  const [closed, setClosed] = useState(false);
  const [error, setError] = useState(false);
  const [q, setQ] = useState("");
  const [country, setCountry] = useState("");
  const [style, setStyle] = useState("");
  const [online, setOnline] = useState("");
  const [applied, setApplied] = useState({ q: "", country: "", style: "", online: "" });

  useEffect(() => {
    let live = true;
    const params = new URLSearchParams();
    if (applied.q) params.set("q", applied.q);
    if (applied.country) params.set("country", applied.country);
    if (applied.style) params.set("style", applied.style);
    if (applied.online) params.set("online", applied.online);
    setError(false);
    api.get(`/teachers${params.toString() ? `?${params}` : ""}`)
      .then(({ data }) => { if (live) setRows(data || []); })
      .catch((e) => { if (!live) return; if (e?.response?.status === 404) setClosed(true); else { setError(true); setRows([]); } });
    return () => { live = false; };
  }, [applied]);

  // Search as you type, a moment after the last key.
  useEffect(() => {
    const id = setTimeout(() => {
      const next = { q: q.trim(), country: country.trim(), style: style.trim(), online };
      setApplied((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    }, 350);
    return () => clearTimeout(id);
  }, [q, country, style, online]);

  if (closed) return <NotOpen />;

  return (
    <div data-testid="teachers-page" className="pb-24">
      <PageHeader eyebrow={t("teachers.eyebrow", "Tony-certified teachers")} title={t("teachers.title", "Find a teacher")} testId="teachers-header" />
      <div className="mx-auto max-w-2xl px-5 space-y-6">
        <p className="text-[15px] text-[#545E56] leading-relaxed -mt-2">
          {t("teachers.intro", "Teachers trained by Tony Sanchez, verified by Tony Yoga. Practise with them online or in their studio.")}
        </p>

        <div className="rounded-3xl bg-white border border-[#E5E6DF] p-4 space-y-3" data-testid="teachers-filters">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9AA096]" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("teachers.search", "Name, city or style")}
              data-testid="teachers-search" className={`${inputCls} !pl-10`} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder={t("teachers.country", "Country")} data-testid="teachers-country" className={inputCls} />
            <input value={style} onChange={(e) => setStyle(e.target.value)} placeholder={t("teachers.style", "Style (e.g. Hot 26)")} data-testid="teachers-style" className={inputCls} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[["", t("teachers.any", "Online or in person")], ["true", t("teachers.online", "Teaches online")], ["false", t("teachers.in_person", "In person only")]].map(([v, label]) => (
              <button key={v || "any"} type="button" onClick={() => setOnline(v)} data-testid={`teachers-online-${v || "any"}`}
                className={`rounded-full px-3 py-1.5 text-[12px] font-semibold border ${online === v ? "bg-[#1C221F] text-white border-[#1C221F]" : "bg-white border-[#E5E6DF] text-[#1C221F]"}`}>{label}</button>
            ))}
          </div>
        </div>

        {rows === null && (
          <div className="space-y-3" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="h-28 rounded-3xl bg-[#F2F2EC] animate-pulse" />)}</div>
        )}
        {error && <p className="text-sm text-[#8A3B2A]">{t("teachers.load_error", "We couldn't load the teachers right now.")}</p>}
        {rows && rows.length === 0 && !error && (
          <div data-testid="teachers-empty" className="rounded-3xl bg-white border border-[#E5E6DF] p-8 text-center">
            <Users className="h-8 w-8 text-[#839682] mx-auto" />
            <p className="text-[15px] text-[#545E56] mt-3">{t("teachers.none", "No teachers match yet. Try another city or style.")}</p>
          </div>
        )}

        {rows && rows.length > 0 && (
          <ul className="space-y-3" data-testid="teachers-list">
            {rows.map((tc) => (
              <li key={tc.id}>
                <Link to={`/teachers/${tc.slug}`} data-testid={`teacher-card-${tc.slug}`}
                  className="flex gap-4 rounded-3xl bg-white border border-[#E5E6DF] p-4 hover:border-[#B25A45] transition">
                  <div className="h-20 w-20 rounded-2xl bg-[#F2F2EC] overflow-hidden shrink-0 flex items-center justify-center">
                    {tc.photo ? <img src={tc.photo} alt="" className="h-full w-full object-cover" loading="lazy" />
                      : <span className="serif text-3xl text-[#B25A45]">{(tc.display_name || "?").slice(0, 1)}</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="serif text-xl leading-tight">{tc.display_name}</span>
                      {tc.certified && <CertBadge label={teacherLabel} compact />}
                      {tc.featured && <span className="text-[10px] uppercase tracking-widest font-bold text-[#B25A45]">{t("teachers.featured", "Featured")}</span>}
                    </div>
                    {tc.headline && <div className="text-[13px] text-[#545E56] mt-0.5 line-clamp-2">{tc.headline}</div>}
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-[#6B7269]">
                      {(tc.city || tc.country) && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{[tc.city, tc.country].filter(Boolean).join(", ")}</span>}
                      {tc.online && <span className="inline-flex items-center gap-1"><Globe className="h-3.5 w-3.5" />{t("teachers.online_short", "Online")}</span>}
                      {tc.languages?.length > 0 && <span className="inline-flex items-center gap-1"><Languages className="h-3.5 w-3.5" />{tc.languages.slice(0, 3).join(", ")}</span>}
                    </div>
                    {tc.styles?.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {tc.styles.slice(0, 4).map((s) => <span key={s} className="rounded-full bg-[#F7F2EC] px-2 py-0.5 text-[11px] text-[#5C5346]">{s}</span>)}
                      </div>
                    )}
                    <div className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-[#B25A45]">
                      {tc.offerings > 0 ? t("teachers.n_offerings", "{{n}} classes & courses", { n: tc.offerings }) : t("teachers.view_profile", "View profile")}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="rounded-3xl bg-[#1C221F] text-[#FAFAF7] p-6" data-testid="teachers-apply-cta">
          <div className="text-[11px] uppercase tracking-[0.2em] font-semibold text-[#E8B8A8]">{t("teachers.for_teachers", "For teachers")}</div>
          <h2 className="serif text-2xl mt-2 leading-tight">{t("teachers.cta_title", "Trained with Tony? Teach on Tony Yoga.")}</h2>
          <p className="text-[13px] text-white/70 mt-2">{t("teachers.cta_body", "A verified profile, your own schedule, courses and students, and payments straight to your bank.")}</p>
          <Link to="/teachers/apply" data-testid="teachers-apply-link" className="pill mt-4 bg-white text-[#1C221F]">{t("teachers.apply", "Apply to teach")}</Link>
        </div>
      </div>
    </div>
  );
}
