import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Calendar, GraduationCap, Sparkles, Play, Award } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useTranslation } from "react-i18next";
import Spinner from "@/components/Spinner";
import StreakCard from "@/components/StreakCard";
import Logo from "@/components/Logo";

const HERO = "https://images.squarespace-cdn.com/content/v1/620bca2d082bbf5542408178/6b55c6a0-8c26-4670-8cb7-68a45f7371fb/TonySanchez-head-to-knee.png";

function formatWhen(iso, locale) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" }) +
      " · " + d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  } catch { return ""; }
}

export default function HomePage() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "es" ? "es-ES" : "en-US";
  const [classes, setClasses] = useState(null);
  const [programs, setPrograms] = useState(null);
  const [news, setNews] = useState([]);
  const [continueRows, setContinueRows] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [c, p, n] = await Promise.all([
          api.get("/class-instances?upcoming=true"),
          api.get("/programs"),
          api.get("/news").catch(() => ({ data: [] })),
        ]);
        setClasses(c.data.slice(0, 4));
        setPrograms(p.data);
        setNews((n.data || []).slice(0, 3));
      } catch {
        setClasses([]); setPrograms([]);
      }
    })();
  }, []);

  useEffect(() => {
    if (!user) { setContinueRows([]); return; }
    api.get("/me/continue").then(({ data }) => setContinueRows(data || [])).catch(() => setContinueRows([]));
  }, [user]);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return t("home.greeting_morning");
    if (h < 18) return t("home.greeting_afternoon");
    return t("home.greeting_evening");
  })();

  return (
    <div data-testid="home-page" className="animate-fade-up">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="relative h-[52vh] min-h-[380px]">
          <img src={HERO} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#1C221F]/0 via-[#1C221F]/25 to-[#1C221F]/85" />
          <div className="absolute top-3 sm:top-4 left-4 sm:left-5 z-10 safe-top">
            <Logo className="h-14 w-14 sm:h-16 sm:w-16" />
          </div>
          <div className="absolute inset-x-0 bottom-0 p-6 text-[#FAFAF7]">
            <div className="mx-auto max-w-2xl">
              <div className="eyebrow !text-[#E5E6DF] mb-2">{greeting}{user?.name ? `, ${user.name.split(" ")[0]}` : ""}</div>
              <h1 className="serif text-4xl sm:text-5xl leading-[1.02] font-medium mb-4 max-w-sm">
                {t("home.hero_title")}
              </h1>
              <Link to="/schedule" data-testid="home-cta-schedule" className="pill pill-primary">
                {t("home.cta_schedule")} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-5 mt-10 space-y-10">
        {/* Streak (signed-in only) */}
        <StreakCard />

        {/* Continue learning (signed-in, enrolled) */}
        {user && continueRows.length > 0 && (
          <section data-testid="continue-learning">
            <div className="flex items-baseline justify-between mb-4">
              <div>
                <div className="eyebrow mb-1">{t("home.keep_going")}</div>
                <h2 className="serif text-2xl">{t("home.continue_learning")}</h2>
              </div>
            </div>
            <div className="flex gap-4 overflow-x-auto no-scrollbar -mx-5 px-5 pb-2">
              {continueRows.map((r) => {
                const nl = r.next_lesson;
                const target = nl ? `/library/${nl.video_id}` : `/programs/${r.program_id}`;
                return (
                  <Link
                    key={r.program_id}
                    to={target}
                    data-testid={`continue-${r.program_id}`}
                    className="shrink-0 w-72 rounded-2xl overflow-hidden bg-white border border-[#E5E6DF] hover:border-[#B25A45] transition"
                  >
                    <div className="relative aspect-[16/9] overflow-hidden bg-[#F2F2EC]">
                      {(nl?.cover_image || r.cover_image) && <img src={nl?.cover_image || r.cover_image} alt="" className="h-full w-full object-cover" />}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
                      <div className="absolute left-3 right-3 bottom-2 text-[#FAFAF7]">
                        <div className="text-[11px] uppercase tracking-widest opacity-90">{r.program_title}</div>
                        <div className="text-sm font-semibold leading-tight truncate">{nl ? nl.title : t("home.course_complete")}</div>
                      </div>
                      <div className="absolute top-2 right-2 h-10 w-10 rounded-full bg-[#B25A45] text-white flex items-center justify-center">
                        {nl ? <Play className="h-4 w-4" /> : <Award className="h-4 w-4" />}
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="flex items-center justify-between text-xs text-[#6B7269] mb-1.5">
                        <span>{r.completed}/{r.total} {t("home.lessons")}</span>
                        <span className="font-semibold text-[#545E56]">{r.percent}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[#F2F2EC] overflow-hidden">
                        <div className="h-full bg-[#839682] rounded-full transition-all" style={{ width: `${r.percent}%` }} />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* Upcoming */}
        <section>
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <div className="eyebrow mb-1">{t("home.upcoming")}</div>
              <h2 className="serif text-2xl">{t("home.live_this_week")}</h2>
            </div>
            <Link to="/schedule" data-testid="home-schedule-all" className="text-sm text-[#6B7269] hover:text-[#B25A45]">{t("home.all")} →</Link>
          </div>
          {classes === null ? <Spinner /> : classes.length === 0 ? (
            <p className="text-sm text-[#6B7269]">{t("home.no_classes")}</p>
          ) : (
            <ul className="space-y-3" data-testid="home-classes-list">
              {classes.map((c) => (
                <li key={c.id}>
                  <Link
                    to={`/schedule/${c.id}`}
                    data-testid={`home-class-${c.id}`}
                    className="flex items-center gap-4 rounded-2xl bg-white border border-[#E5E6DF] p-4 hover:border-[#B25A45] transition"
                  >
                    <div className="h-14 w-14 shrink-0 rounded-2xl bg-[#F2F2EC] flex flex-col items-center justify-center">
                      <Calendar className="h-4 w-4 text-[#B25A45]" strokeWidth={1.8} />
                      <span className="text-[10px] mt-1 font-semibold text-[#545E56]">{new Date(c.start_time).toLocaleDateString(locale, { day: "numeric" })}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-semibold text-[#1C221F] truncate">{c.title}</div>
                      <div className="text-xs text-[#6B7269] mt-0.5">{formatWhen(c.start_time, locale)} · {c.location_type === "online" ? t("home.online") : t("home.studio")}</div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-[#839682] shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Programs */}
        <section>
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <div className="eyebrow mb-1">{t("home.on_demand")}</div>
              <h2 className="serif text-2xl">{t("home.core_series")}</h2>
            </div>
            <Link to="/programs" data-testid="home-programs-all" className="text-sm text-[#6B7269] hover:text-[#B25A45]">{t("home.all")} →</Link>
          </div>
          {programs === null ? <Spinner /> : (
            <div className="flex gap-4 overflow-x-auto no-scrollbar -mx-5 px-5 pb-2" data-testid="home-programs-list">
              {programs.map((p) => (
                <Link
                  key={p.id}
                  to={`/programs/${p.id}`}
                  data-testid={`home-program-${p.id}`}
                  className="shrink-0 w-64 rounded-2xl overflow-hidden bg-white border border-[#E5E6DF] hover:border-[#B25A45] transition"
                >
                  {p.cover_image && (
                    <div className="aspect-[4/5] overflow-hidden bg-[#F2F2EC]">
                      <img src={p.cover_image} alt="" className="h-full w-full object-cover" />
                    </div>
                  )}
                  <div className="p-4">
                    <div className="eyebrow">{p.level}</div>
                    <div className="serif text-lg mt-1 leading-tight">{p.title}</div>
                    <div className="text-xs text-[#6B7269] mt-2">{p.duration_weeks} {t("home.weeks")} · €{Math.round(p.price)}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Membership CTA */}
        <section>
          <Link to="/memberships" data-testid="home-membership-cta" className="block rounded-3xl overflow-hidden bg-[#1C221F] text-[#FAFAF7] p-8 hover:bg-[#0F1211] transition">
            <div className="flex items-start gap-3 mb-2">
              <Sparkles className="h-5 w-5 text-[#B25A45]" />
              <span className="eyebrow !text-[#B25A45]">{t("home.membership")}</span>
            </div>
            <h3 className="serif text-3xl leading-tight mb-3 max-w-sm">{t("home.membership_title")}</h3>
            <p className="text-sm text-white/70 max-w-md leading-relaxed">{t("home.membership_desc")}</p>
            <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#B25A45]">{t("home.see_plans")} <ArrowRight className="h-4 w-4" /></div>
          </Link>
        </section>

        {/* News / Workshops teasers */}
        <section className="grid grid-cols-2 gap-3">
          <Link to="/workshops" data-testid="home-workshops-cta" className="rounded-2xl bg-white border border-[#E5E6DF] p-5 hover:border-[#B25A45] transition">
            <GraduationCap className="h-5 w-5 text-[#B25A45] mb-2" />
            <div className="serif text-lg leading-tight">{t("home.retreats_workshops")}</div>
            <div className="text-xs text-[#6B7269] mt-1">{t("home.malaga")}</div>
          </Link>
          <Link to="/shop" data-testid="home-shop-cta" className="rounded-2xl bg-white border border-[#E5E6DF] p-5 hover:border-[#B25A45] transition">
            <div className="text-[#B25A45] mb-2">◯</div>
            <div className="serif text-lg leading-tight">{t("home.practice_shop")}</div>
            <div className="text-xs text-[#6B7269] mt-1">{t("home.shop_desc")}</div>
          </Link>
        </section>

        {news.length > 0 && (
          <section>
            <div className="eyebrow mb-2">{t("home.journal")}</div>
            <ul className="space-y-4">
              {news.map((n) => (
                <li key={n.id} className="border-b border-[#E5E6DF] pb-4 last:border-0">
                  <div className="serif text-lg leading-tight">{n.title}</div>
                  <p className="text-sm text-[#6B7269] mt-1 clamp-2">{n.excerpt}</p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
