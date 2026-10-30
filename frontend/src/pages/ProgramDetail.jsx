import { isIOSApp } from "@/lib/iosPlatform";
import IOSPrice from "@/components/IOSPrice";
import { useCommerceRefresh } from "@/lib/useCommerceRefresh";
import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Lock, Play, CheckCircle2, RotateCcw, Clock, Award, ShieldCheck, Sparkles, ClipboardCheck, PlayCircle, ShoppingBag, Tag, HelpCircle, FileText, ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import PageHeader from "@/components/PageHeader";
import Spinner from "@/components/Spinner";
import HeartButton from "@/components/HeartButton";
import PaymentButtons from "@/components/PaymentButtons";
import RelatedProducts from "@/components/RelatedProducts";
import BundleOffer from "@/components/BundleOffer";
import SafeYouTube from "@/components/SafeYouTube";
import { AccessTermSummary } from "@/components/AccessTerm";
import { useSeo, SITE_URL } from "@/lib/seo";
import { courseJsonLd } from "@/seo/seoData.mjs";

export default function ProgramDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [p, setP] = useState(null);
  const [progress, setProgress] = useState({}); // video_id -> {seconds, completed}
  const [claiming, setClaiming] = useState(false);
  const [lms, setLms] = useState(null); // course progress from the learning system (signed-in viewers)
  const { t } = useTranslation();

  const loadProgram = () => api.get(`/programs/${id}`).then(({ data }) => setP(data)).catch(() => setP(false));
  useCommerceRefresh(() => loadProgram());
  useEffect(() => { loadProgram(); /* eslint-disable-next-line */ }, [id, user]);
  useEffect(() => {
    const end = p?.viewer?.access?.ends_at;
    if (!end) return;
    const delay = new Date(end).getTime() - Date.now();
    if (delay <= 0 || delay > 2147483647) return;
    const timer = setTimeout(loadProgram, delay + 100);
    return () => clearTimeout(timer);
    /* eslint-disable-next-line */
  }, [p?.viewer?.access?.ends_at]);

  useEffect(() => {
    if (!user) { setProgress({}); return; }
    api.get(`/progress/mine`).then(({ data }) => {
      const m = {};
      for (const r of data) m[r.video_id] = r;
      setProgress(m);
    }).catch(() => {});
  }, [user, id]);

  // Course progress (done lessons, next lesson, certificate) — reloads with the course.
  useEffect(() => {
    if (!user) { setLms(null); return undefined; }
    let live = true;
    api.get(`/lms/programs/${id}/me`).then(({ data }) => { if (live) setLms(data); }).catch(() => { if (live) setLms(null); });
    return () => { live = false; };
  }, [user, id, p]);

  useSeo(p ? {
    title: `${p.title} — Online Yoga Program with Tony Sanchez | Tony Yoga`,
    description: (p.description || `${p.title}: an on-demand yoga program by Tony Sanchez.`).slice(0, 158),
    image: p.cover_image,
    jsonLd: courseJsonLd(p, SITE_URL),
  } : p === false ? { title: "Program not found | Tony Yoga", noindex: true } : null);

  if (p === null) return <><PageHeader back /><Spinner /></>;
  if (p === false) return <><PageHeader back title="Not found" /></>;

  // Lessons are enabled — the lesson-by-lesson curriculum shows on the program page.
  const SHOW_LESSONS = true;
  const lessons = SHOW_LESSONS ? (p.lessons || []) : [];
  const viewer = p.viewer || {};
  const hasAccess = viewer.is_staff || viewer.owns_program || p.price_model === "free" || (p.price_model === "membership" && viewer.has_active_membership);
  const lmsDone = {};
  for (const sec of lms?.sections || []) for (const l of sec.lessons) if (l.done) lmsDone[l.id] = true;
  const isLessonDone = (l) => !!progress[l.video?.id]?.completed || !!lmsDone[l.id];
  const completedCount = lessons.filter(isLessonDone).length;
  const allDone = lessons.length > 0 && completedCount === lessons.length;
  const certificate = lms?.certificate;
  // Group lessons under their sections (keeps the course order).
  const groups = [];
  lessons.forEach((l, idx) => {
    const name = (l.section || "").trim();
    if (!groups.length || groups[groups.length - 1].name !== name) groups.push({ name, items: [] });
    groups[groups.length - 1].items.push({ l, idx });
  });
  const hasSections = lessons.some((l) => (l.section || "").trim());

  const claimCertificate = async () => {
    setClaiming(true);
    try {
      const { data } = await api.post(`/programs/${id}/certificate/claim`);
      if (data.eligible && data.certificate) {
        navigate(`/certificate/${data.certificate.code}`);
      } else {
        toast.error(`Finish all lessons first (${data.completed}/${data.total} done).`);
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not issue certificate");
    } finally { setClaiming(false); }
  };

  return (
    <div data-testid="program-detail" className="pb-6">
      {/* Hero */}
      <div className="relative">
        {p.cover_image && (
          <div className="relative h-72 overflow-hidden">
            <img src={p.cover_image} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-b from-[#1C221F]/40 to-[#FAFAF7]" />
          </div>
        )}
      </div>
      <PageHeader eyebrow={`${p.level} · ${p.duration_weeks} weeks`} title={p.title} back testId="programdetail-header" action={<HeartButton targetType="program" targetId={p.id} />} />

      <div className="mx-auto max-w-2xl px-5 space-y-6">
        <DemoVideo demo={p.demo_video} hasAccess={hasAccess} />
        <MainCourseVideo video={p.main_video} locked={p.main_video_locked} />

        <p className="text-[15px] text-[#545E56] leading-relaxed">{p.description}</p>

        {p.benefits?.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {p.benefits.map((b) => (
              <div key={b} className="flex items-start gap-2 rounded-xl bg-white border border-[#E5E6DF] p-3">
                <CheckCircle2 className="h-4 w-4 text-[#839682] mt-0.5 shrink-0" />
                <span className="text-xs text-[#1C221F] leading-snug">{b}</span>
              </div>
            ))}
          </div>
        )}

        <EnrollCard p={p} user={user} />

        {user && hasAccess && lms && lms.total > 0 && (
          <div data-testid="course-progress-card" className="rounded-3xl bg-white border border-[#E5E6DF] p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="eyebrow !text-[11px]">{t("lms.your_progress", "Your progress")}</div>
              <div data-testid="course-progress-percent" className="text-sm font-semibold text-[#1C221F]">{lms.percent}%</div>
            </div>
            <div className="mt-2 h-2 rounded-full bg-[#EEF1EC] overflow-hidden"><div className="h-full bg-[#B25A45] transition-all" style={{ width: `${lms.percent}%` }} /></div>
            <div className="text-xs text-[#6B7269] mt-1.5">{t("lms.done_of", "{{done}} of {{total}} lessons done", { done: lms.done, total: lms.total })}</div>
            {certificate ? (
              <Link to={`/certificate/${certificate.code}`} data-testid="course-certificate-banner" className="mt-4 flex items-center gap-3 rounded-2xl bg-[#1C221F] text-[#FAFAF7] p-4 hover:opacity-95 transition">
                <span className="h-10 w-10 rounded-full bg-[#B25A45] flex items-center justify-center shrink-0"><Award className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block serif text-lg leading-tight">{t("lms.cert_earned", "Certificate earned")}</span>
                  <span className="block text-xs text-white/70">{t("lms.cert_view", "View and share your certificate")}</span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0" />
              </Link>
            ) : lms.next?.video_id ? (
              <Link to={`/library/${lms.next.video_id}`} data-testid="course-continue" className="pill pill-primary w-full mt-4">
                <Play className="h-4 w-4" /> {lms.done > 0 ? t("lms.continue", "Continue: {{title}}", { title: lms.next.title }) : t("lms.start", "Start: {{title}}", { title: lms.next.title })}
              </Link>
            ) : null}
          </div>
        )}


        {lessons.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="eyebrow">Library · {lessons.length} lessons</div>
            {user && completedCount > 0 && (
              <div data-testid="curriculum-progress" className="text-xs font-semibold text-[#839682]">{completedCount}/{lessons.length} done</div>
            )}
          </div>

          {!hasAccess && lessons.length > 0 && (
            <div data-testid="library-locked-note" className="mb-3 flex items-center gap-2 rounded-2xl bg-[#F7ECE8] border border-[#E7C4B9] px-4 py-3 text-xs text-[#8A4433]">
              <Lock className="h-3.5 w-3.5 shrink-0" />
              <span>Watch the demo above. Enrol to unlock all {lessons.length} lessons in this library.</span>
            </div>
          )}

          {user && allDone && !certificate && (
            <button onClick={claimCertificate} disabled={claiming} data-testid="claim-certificate" className="w-full mb-4 rounded-3xl bg-[#1C221F] text-[#FAFAF7] p-5 flex items-center gap-4 hover:bg-[#0F1211] transition text-left">
              <div className="h-11 w-11 rounded-full bg-[#B25A45] flex items-center justify-center shrink-0"><Award className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1">
                <div className="serif text-lg leading-tight">You finished the course!</div>
                <div className="text-xs text-white/70 mt-0.5">{claiming ? "Preparing your certificate…" : "Get your shareable certificate of completion →"}</div>
              </div>
            </button>
          )}

          <div className="space-y-5" data-testid="program-lessons">
          {groups.map((g, gi) => (
          <div key={`${g.name}-${gi}`} data-testid={hasSections ? `program-section-${gi}` : undefined}>
            {hasSections && g.name && (
              <div className="flex items-center justify-between mb-2 px-1">
                <h3 className="serif text-lg leading-tight" data-testid={`program-section-title-${gi}`}>{g.name}</h3>
                <span className="text-[11px] text-[#6B7269]">{g.items.filter(({ l }) => isLessonDone(l)).length}/{g.items.length}</span>
              </div>
            )}
          <ul className="space-y-2">
            {g.items.map(({ l, idx }) => {
              const vid = l.video?.id;
              const prog = vid ? progress[vid] : null;
              const isDone = isLessonDone(l);
              const resourceCount = (l.resources || []).length || l.resource_count || 0;
              const canResume = prog && !isDone && (prog.seconds || 0) > 5;
              return (
                <li key={l.id} className="rounded-2xl bg-white border border-[#E5E6DF] p-3">
                  <div className="flex items-center gap-3">
                    {/* Lesson thumbnail */}
                    <div className="relative h-14 w-20 min-[400px]:w-24 shrink-0 rounded-lg overflow-hidden bg-[#F2F2EC]">
                      {l.video?.cover_image
                        ? <img src={l.video.cover_image} alt="" className="h-full w-full object-cover" />
                        : <div className="h-full w-full flex items-center justify-center text-[#9AA29B] text-xs">{idx + 1}</div>}
                      <div className="absolute top-1 left-1 h-5 w-5 rounded-full bg-black/60 text-white text-[10px] font-semibold flex items-center justify-center">{idx + 1}</div>
                      {isDone && (
                        <div data-testid={`lesson-done-${l.id}`} className="absolute bottom-1 right-1 h-5 w-5 rounded-full bg-[#839682] text-white flex items-center justify-center">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-semibold leading-tight line-clamp-2 break-words" title={l.video?.title || "Lesson"}>{l.video?.title || "Lesson"}</div>
                      <div className="text-xs text-[#6B7269] mt-0.5 flex items-center gap-2">
                        <span>{l.video?.duration_minutes || 30} min</span>
                        {isDone && <span className="text-[#839682] font-semibold">Completed</span>}
                        {canResume && <span className="text-[#B25A45] font-semibold">Resume</span>}
                        {l.quiz_questions > 0 && <span data-testid={`lesson-quiz-badge-${l.id}`} className="inline-flex items-center gap-0.5 text-[#8A6D3B]"><HelpCircle className="h-3 w-3" /> {t("lms.quiz_badge", "Quiz")}</span>}
                        {resourceCount > 0 && <span data-testid={`lesson-resources-badge-${l.id}`} className="inline-flex items-center gap-0.5"><FileText className="h-3 w-3" /> {resourceCount}</span>}
                      </div>
                    </div>
                    {hasAccess && l.is_unlocked ? (
                      vid && (
                        <Link to={`/library/${vid}`} data-testid={`lesson-play-${l.id}`} className="pill pill-ghost !py-1.5 !px-3 !text-xs shrink-0">
                          {canResume ? <><RotateCcw className="h-3.5 w-3.5" /> Resume</> : <><Play className="h-3.5 w-3.5" /> Play</>}
                        </Link>
                      )
                    ) : l.drip_locked && l.available_on ? (
                      <div data-testid={`lesson-drip-${l.id}`} className="h-8 px-2.5 sm:px-3 rounded-full bg-[#F2F2EC] flex items-center gap-1 text-[10px] text-[#6B7269] shrink-0 whitespace-nowrap">
                        <Clock className="h-3 w-3" /> Unlocks {new Date(l.available_on).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </div>
                    ) : (
                      <div data-testid={`lesson-locked-${l.id}`} aria-label="Locked" title="Locked" className="h-8 w-8 sm:w-auto sm:px-3 justify-center rounded-full bg-[#F2F2EC] flex items-center gap-1 text-[10px] text-[#6B7269] uppercase tracking-widest shrink-0">
                        <Lock className="h-3.5 w-3.5 sm:h-3 sm:w-3" /> <span className="hidden sm:inline">Locked</span>
                      </div>
                    )}
                  </div>
                  {user && l.requires_submission && l.is_unlocked && (
                    <AssignmentPanel lesson={l} onDone={loadProgram} />
                  )}
                </li>
              );
            })}
          </ul>
          </div>
          ))}
          </div>
        </div>
        )}

        <BundleOffer programId={p.id} programTitle={p.title} products={p.related_products} pct={p.bundle_discount_pct} currency={p.related_products?.[0]?.currency} />
        <RelatedProducts products={p.related_products} />
      </div>
    </div>
  );
}

function DemoVideo({ demo, hasAccess }) {
  const yid = demo?.youtube_id;
  const start = demo?.start_seconds || 0;

  if (!yid) {
    return (
      <div data-testid="demo-video-empty" className="rounded-3xl bg-[#1C221F] text-white/80 aspect-video flex flex-col items-center justify-center gap-2">
        <PlayCircle className="h-10 w-10 text-white/40" />
        <div className="text-sm">Demo video coming soon</div>
      </div>
    );
  }

  return (
    <div data-testid="demo-video" className="space-y-2">
      <SafeYouTube videoId={yid} start={start} title="Course demo" badge={hasAccess ? "Course intro" : "Watch the free demo"}
        testId="demo-video-player" className="shadow-lg" />
    </div>
  );
}

function MainCourseVideo({ video, locked }) {
  const yid = video?.youtube_id;
  // Hidden entirely for logged-out / no-access-without-config users.
  if (!yid && !locked) return null;

  if (locked) {
    return (
      <div data-testid="main-course-locked" className="relative aspect-video rounded-3xl overflow-hidden bg-[#1C221F] text-white flex flex-col items-center justify-center gap-3 text-center px-6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(178,90,69,0.35),transparent_60%)]" />
        <div className="relative h-14 w-14 rounded-full bg-white/10 ring-1 ring-white/20 flex items-center justify-center">
          <Lock className="h-6 w-6 text-[#E0A38F]" />
        </div>
        <div className="relative">
          <div className="eyebrow !text-[#E0A38F]">Full course video</div>
          <div className="serif text-xl mt-1">Unlock the complete course</div>
          <p className="text-sm text-white/70 mt-1 max-w-sm">Subscribe or enrol to stream the full guided course from start to finish.</p>
        </div>
        <Link to="/memberships" data-testid="main-course-subscribe" className="relative pill pill-primary mt-1">See plans →</Link>
      </div>
    );
  }

  return (
    <div data-testid="main-course-video" className="space-y-2">
      <div className="eyebrow !text-[#B25A45]">Full course video</div>
      <SafeYouTube videoId={yid} title="Full course video" badge="Full course · unlocked" testId="main-course-player"
        poster={`https://img.youtube.com/vi/${yid}/maxresdefault.jpg`} className="shadow-xl ring-1 ring-[#B25A45]/20" />
    </div>
  );
}


function BundleUpsell({ p }) {
  const navigate = useNavigate();
  const products = (p.related_products || []).filter((x) => x && (x.type ? x.type === "physical" : true));
  if (products.length < 2) return null;
  const pct = p.bundle_discount_pct || 15;
  const cur = (products[0]?.currency || "eur").toLowerCase() === "usd" ? "$" : "€";
  const full = products.reduce((n, x) => n + (Number(x.price) || 0), 0);
  const savings = Math.round((full * pct) / 100 * 100) / 100;
  const bundlePrice = Math.round((full - savings) * 100) / 100;
  const money = (n) => (Number.isInteger(n) ? `${n}` : n.toFixed(2));

  const addBundle = () => {
    products.forEach((x) => cart.add(x, null, 1));
    cart.setPromo({
      program_id: p.id,
      label: `${p.title} bundle`,
      pct,
      product_ids: products.map((x) => x.id),
    });
    toast.success(`Bundle added — you save ${cur}${money(savings)}`);
    navigate("/cart");
  };

  return (
    <div data-testid="bundle-upsell" className="rounded-3xl bg-[#F7F2EC] border border-[#E7D9CB] p-5 space-y-4">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-full bg-[#B25A45] flex items-center justify-center shrink-0">
          <Tag className="h-4 w-4 text-white" />
        </div>
        <div>
          <div className="eyebrow text-[#B25A45]">Complete your practice</div>
          <div className="serif text-xl leading-tight">Add the mat + book &amp; save {pct}%</div>
        </div>
      </div>

      <ul className="flex items-center gap-2" data-testid="bundle-items">
        {products.map((x, i) => (
          <li key={x.id} className="flex items-center gap-2">
            <div className="h-16 w-16 rounded-xl overflow-hidden bg-white border border-[#E5E6DF] shrink-0">
              {x.images?.[0] && <img src={x.images[0]} alt={x.title} className="h-full w-full object-cover" />}
            </div>
            {i < products.length - 1 && <span className="text-[#B25A45] text-lg font-semibold">+</span>}
          </li>
        ))}
      </ul>

      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs text-[#6B7269] line-through">{cur}{money(full)}</div>
          <div className="serif text-3xl text-[#1C221F]" data-testid="bundle-price">{cur}{money(bundlePrice)}</div>
        </div>
        <div className="text-xs font-bold uppercase tracking-widest text-[#839682]">Save {cur}{money(savings)}</div>
      </div>

      <button onClick={addBundle} data-testid="bundle-add" className="pill pill-primary w-full">
        <ShoppingBag className="h-4 w-4" /> Add bundle to cart
      </button>
    </div>
  );
}

function AssignmentPanel({ lesson, onDone }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempts, setAttempts] = useState(null);
  const sub = lesson.my_submission;
  const threshold = lesson.pass_threshold || 60;
  const passed = sub && sub.status === "scored" && (sub.score || 0) >= threshold;

  const loadAttempts = () => api.get(`/submissions/attempts/${lesson.id}`).then(({ data }) => setAttempts(data)).catch(() => {});
  useEffect(() => { loadAttempts(); /* eslint-disable-next-line */ }, [lesson.id]);

  const lockedOut = attempts?.locked_out && !passed;

  const submit = async () => {
    if (!url.trim()) return toast.error("Paste a link to your recording (YouTube/Vimeo/Loom).");
    setBusy(true);
    try {
      await api.post("/submissions/create", { lesson_id: lesson.id, video_url: url.trim() });
      toast.success("Submitted! We'll grade it and unlock the next lesson.");
      setUrl(""); onDone && onDone(); loadAttempts();
    } catch (e) { toast.error(e?.response?.data?.detail || "Submission failed"); }
    finally { setBusy(false); }
  };

  return (
    <div data-testid={`assignment-${lesson.id}`} className="mt-3 rounded-2xl bg-[#F7F7F2] border border-[#E5E6DF] p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest font-bold text-[#B25A45]"><ClipboardCheck className="h-3.5 w-3.5" /> Assignment · pass {threshold}% to continue</div>
        {attempts && attempts.max_attempts > 0 && !passed && (
          <span data-testid={`assignment-attempts-${lesson.id}`} className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-[#6B7269] border border-[#E5E6DF]">
            {attempts.remaining} of {attempts.max_attempts} left
          </span>
        )}
      </div>
      {lesson.assignment_prompt && <p className="text-xs text-[#545E56] leading-snug">{lesson.assignment_prompt}</p>}
      {sub && (
        <div data-testid={`assignment-status-${lesson.id}`} className="text-xs rounded-xl bg-white border border-[#E5E6DF] p-2.5">
          {sub.status === "scored" ? (
            <div>
              <span className={`font-semibold ${passed ? "text-[#5C7355]" : "text-[#B25A45]"}`}>{passed ? "Passed" : "Try again"} · {sub.score}%</span>
              {sub.feedback && <p className="text-[#6B7269] mt-1">{sub.feedback}</p>}
            </div>
          ) : (
            <span className="text-[#6B7269]">{sub.status === "pending_review" ? "Awaiting instructor review." : "Grading your submission…"}</span>
          )}
        </div>
      )}
      {!passed && lockedOut && (
        <div data-testid={`assignment-lockedout-${lesson.id}`} className="rounded-xl bg-[#FBEDE9] border border-[#E7C4B9] p-2.5 text-xs text-[#8A4433]">
          You've used all {attempts.max_attempts} attempts. Please contact your instructor to reset.
        </div>
      )}
      {!passed && !lockedOut && (
        <div className="flex items-center gap-2">
          <input data-testid={`assignment-url-${lesson.id}`} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Link to your practice video" className="flex-1 rounded-xl border border-[#E5E6DF] bg-white px-3 py-2 text-sm focus:outline-none focus:border-[#B25A45]" />
          <button onClick={submit} disabled={busy} data-testid={`assignment-submit-${lesson.id}`} className="pill pill-primary !py-2 !px-3 !text-xs shrink-0">{busy ? "…" : "Submit"}</button>
        </div>
      )}
    </div>
  );
}

function EnrollCard({ p, user }) {
  const viewer = p.viewer || {};
  const model = p.price_model || "subscription";
  const access = viewer.access;
  const hasAccess = viewer.is_staff || viewer.owns_program || (model === "membership" && viewer.has_active_membership);
  const cur = (p.currency || "eur").toLowerCase() === "usd" ? "$" : "€";

  // Already has access — enrolled / member / staff
  if (hasAccess) {
    const label = viewer.is_staff ? "Staff access — full preview" : access?.status === "active" ? "Your course subscription is active" : viewer.owns_program ? "Your existing lifetime access is preserved" : "Unlocked with your membership";
    return (
      <div data-testid="program-enrolled" className="flex items-center gap-3 rounded-3xl bg-[#1C221F] text-[#FAFAF7] p-5">
        <div className="h-10 w-10 rounded-full bg-[#839682] flex items-center justify-center shrink-0"><ShieldCheck className="h-5 w-5" /></div>
        <div>
          <div className="serif text-lg leading-tight">You're in.</div>
          <div className="text-xs text-white/70 mt-0.5">{label} · start with any unlocked lesson below.</div>
          {access?.status === "active" && <AccessTermSummary access={access} prefix="program-active" />}
        </div>
      </div>
    );
  }

  // Free course
  if (model === "free") {
    return (
      <div data-testid="program-free" className="flex items-center justify-between rounded-3xl bg-[#F2F2EC] p-5">
        <div>
          <div className="eyebrow">Free course</div>
          <div className="serif text-2xl mt-1">Start anytime</div>
        </div>
        {!user && <Link to="/login" data-testid="program-login-cta" className="pill pill-primary">Log in to start →</Link>}
      </div>
    );
  }

  // Membership-gated course
  if (model === "membership") {
    return (
      <div data-testid="program-membership" className="rounded-3xl bg-[#F2F2EC] p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="eyebrow flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-[#B25A45]" /> Included with membership</div>
            <div className="serif text-2xl mt-1">Members watch free</div>
          </div>
          <Link to="/memberships" data-testid="program-subscribe" className="pill pill-primary">See plans →</Link>
        </div>
        <p className="text-xs text-[#6B7269]">Subscribe to a membership to unlock this course and the full on-demand library.</p>
      </div>
    );
  }

  // Fixed-term purchase course; legacy owners retain their original rights.
  const ended = p.access_term?.mode === "fixed" && new Date(p.access_term.ends_at) <= new Date();
  const upcoming = access?.status === "upcoming";
  return (
    <div id="course-subscription" data-testid="program-purchase" className="rounded-3xl bg-[#F2F2EC] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="eyebrow" data-testid="program-subscription-heading">Course subscription</div>
          <div data-testid="program-subscription-price" className="serif text-3xl mt-1"><IOSPrice itemType="program" itemId={p.id} fallback={new Intl.NumberFormat(undefined, { style: "currency", currency: p.currency || "usd" }).format(p.price)} /></div>
        </div>
      </div>
      <AccessTermSummary term={p.access_term} access={upcoming ? access : null} prefix="program-purchase" />
      {access?.status === "expired" && <p data-testid="program-subscription-expired" className="text-sm text-[#B25A45]">Your previous subscription has expired.</p>}
      {upcoming ? <p data-testid="program-subscription-upcoming" className="text-sm text-[#5C7355]">Purchased · your course opens on {new Date(access.starts_at).toLocaleString()}.</p> : ended ? <p data-testid="program-subscription-closed" className="text-sm text-[#B25A45]">This subscription window has ended.</p> : user ? (
        <PaymentButtons itemType="program" itemId={p.id} testIdPrefix="program-buy" size="lg" stripeLabel={`Subscribe · ${cur}${p.price}`} />
      ) : (
        <Link to="/login" data-testid="program-login-cta" className="pill pill-primary w-full">Log in to enrol →</Link>
      )}
    </div>
  );
}
