import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  MapPin, Globe, Languages, Instagram, Link2, CalendarDays, PlayCircle, Ticket, CheckCircle2, Eye, Users, Clock,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useFeatures } from "@/lib/features";
import { isIOSApp } from "@/lib/iosPlatform";
import { loginPath } from "@/lib/authRouting";
import PageHeader from "@/components/PageHeader";
import { CertBadge, Section, TeacherPayButton, errText, fmtDate, fmtWhen, money } from "./teacherShared";

function priceLabel(o, t) {
  return Number(o.price || 0) > 0 ? money(o.price, o.currency) : t("teachers.free", "Free");
}

export default function TeacherProfile() {
  const { slug } = useParams();
  const { t } = useTranslation();
  const nav = useNavigate();
  const { user } = useAuth();
  const { teacherLabel } = useFeatures();
  const ios = isIOSApp();
  const [p, setP] = useState(null);
  const [missing, setMissing] = useState(false);
  const [mine, setMine] = useState({ items: [], credits: [] });
  const [busy, setBusy] = useState(null);

  const load = useCallback(() => {
    api.get(`/teachers/${slug}`).then(({ data }) => { setP(data); setMissing(false); }).catch(() => setMissing(true));
  }, [slug]);
  const loadMine = useCallback(() => {
    if (!user) { setMine({ items: [], credits: [] }); return; }
    api.get("/me/teacher-classes").then(({ data }) => setMine(data || { items: [], credits: [] })).catch(() => {});
  }, [user]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadMine(); }, [loadMine]);

  const credits = useMemo(() => (mine.credits || []).find((c) => c.teacher_id === p?.id)?.remaining || 0, [mine, p]);
  const bookedSessions = useMemo(() => new Set((mine.items || []).filter((i) => i.session_id).map((i) => i.session_id)), [mine]);
  const enrolledCourses = useMemo(() => new Set((mine.items || []).filter((i) => i.kind === "course").map((i) => i.offering_id)), [mine]);

  const needLogin = () => {
    if (user) return false;
    nav(loginPath(`/teachers/${slug}`));
    return true;
  };

  const book = async (o, sessionId, useCredit = false) => {
    if (needLogin()) return;
    const key = `${o.id}:${sessionId || ""}:${useCredit ? "c" : ""}`;
    setBusy(key);
    try {
      const { data } = await api.post(`/teacher-offerings/${o.id}/book`, { session_id: sessionId || null, use_credit: useCredit });
      if (data?.kind === "pack" && !data?.paid) toast.success(t("teachers.pack_reserved", "Reserved. Pay the teacher and your class credits open once they confirm."));
      else if (data?.payment === "offline" && !data?.paid) toast.success(t("teachers.booked_offline", "Booked! Pay the teacher at the class."));
      else toast.success(o.kind === "course" ? t("teachers.enrolled", "You're in. The course is in My Yoga.") : t("teachers.booked", "Booked! It's in My Yoga."));
      load(); loadMine();
    } catch (e) { toast.error(errText(e)); }
    finally { setBusy(null); }
  };

  if (missing) {
    return (
      <div data-testid="teacher-missing" className="pb-24">
        <PageHeader back title={t("teachers.not_found", "Teacher not found")} />
        <div className="mx-auto max-w-2xl px-5">
          <p className="text-[15px] text-[#545E56]">{t("teachers.not_found_body", "This profile isn't available right now.")}</p>
          <Link to="/teachers" className="pill pill-primary mt-4">{t("teachers.all", "All teachers")}</Link>
        </div>
      </div>
    );
  }
  if (!p) {
    return <div className="mx-auto max-w-2xl px-5 pt-24 space-y-3" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="h-28 rounded-3xl bg-[#F2F2EC] animate-pulse" />)}</div>;
  }

  const online = p.payments === "online";
  const classes = (p.offerings || []).filter((o) => o.kind === "class");
  const courses = (p.offerings || []).filter((o) => o.kind === "course");
  const packs = (p.offerings || []).filter((o) => o.kind === "pack");

  const actionFor = (o, s) => {
    if (ios) return null;
    const paid = Number(o.price || 0) > 0;
    if (s && bookedSessions.has(s.id)) return <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#3E7C57]" data-testid={`teacher-booked-${s.id}`}><CheckCircle2 className="h-4 w-4" />{t("teachers.you_booked", "Booked")}</span>;
    if (!s && o.kind === "course" && enrolledCourses.has(o.id)) return <Link to={`/teacher-course/${o.id}`} className="pill pill-ghost !py-2 !px-4 !text-xs" data-testid={`teacher-open-course-${o.id}`}>{t("teachers.open_course", "Open course")}</Link>;
    if (s && s.spots_left === 0) return <span className="text-[12px] font-semibold text-[#B25A45]">{t("teachers.full", "Full")}</span>;
    const buttons = [];
    if (o.kind === "class" && credits > 0 && paid) {
      buttons.push(<button key="credit" type="button" disabled={!!busy} onClick={() => book(o, s?.id, true)} data-testid={`teacher-credit-${s?.id}`}
        className="pill pill-ghost !py-2 !px-4 !text-xs"><Ticket className="h-3.5 w-3.5" />{t("teachers.use_credit", "Use a class credit")}</button>);
    }
    if (!paid) {
      buttons.push(<button key="free" type="button" disabled={!!busy} onClick={() => book(o, s?.id)} data-testid={`teacher-book-${s?.id || o.id}`}
        className="pill pill-primary !py-2 !px-4 !text-xs">{o.kind === "course" ? t("teachers.enrol_free", "Start free") : t("teachers.book_free", "Book free")}</button>);
    } else if (online) {
      buttons.push(<TeacherPayButton key="pay" offeringId={o.id} sessionId={s?.id} testId={`teacher-pay-${s?.id || o.id}`} onBefore={() => !needLogin()}
        label={o.kind === "pack" ? t("teachers.buy_pack", "Buy · {{price}}", { price: priceLabel(o, t) }) : t("teachers.pay", "Pay {{price}}", { price: priceLabel(o, t) })} />);
    } else if (o.kind === "course") {
      buttons.push(<span key="contact" className="text-[12px] text-[#6B7269]">{t("teachers.course_offline", "Pay the teacher directly; they'll open the course for you.")}</span>);
    } else {
      buttons.push(<button key="offline" type="button" disabled={!!busy} onClick={() => book(o, s?.id)} data-testid={`teacher-book-${s?.id || o.id}`}
        className="pill pill-primary !py-2 !px-4 !text-xs">{o.kind === "pack" ? t("teachers.reserve_pack", "Reserve · pay the teacher") : t("teachers.book_offline", "Book · pay at class")}</button>);
    }
    return <div className="flex flex-wrap items-center justify-end gap-2">{buttons}</div>;
  };

  return (
    <div data-testid="teacher-profile" className="pb-24">
      <PageHeader back eyebrow={teacherLabel} title={p.display_name} testId="teacher-profile-header" />
      <div className="mx-auto max-w-2xl px-5 space-y-7">
        {p.preview && (
          <div data-testid="teacher-preview" className="rounded-2xl bg-[#FBF6EC] border border-[#E0D3B8] p-3 text-[13px] text-[#5C5346] flex gap-2">
            <Eye className="h-4 w-4 text-[#B25A45] shrink-0 mt-0.5" />
            {t("teachers.preview", "Preview: this profile isn't in the public directory yet (waiting for approval or the monthly plan).")}
          </div>
        )}

        <div className="flex gap-4 items-start">
          <div className="h-24 w-24 rounded-3xl bg-[#F2F2EC] overflow-hidden shrink-0 flex items-center justify-center">
            {p.photo ? <img src={p.photo} alt="" className="h-full w-full object-cover" /> : <span className="serif text-4xl text-[#B25A45]">{(p.display_name || "?").slice(0, 1)}</span>}
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            {p.headline && <p className="text-[15px] text-[#1C221F] leading-snug">{p.headline}</p>}
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-[#6B7269]">
              {(p.city || p.country) && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{[p.city, p.country].filter(Boolean).join(", ")}</span>}
              {p.online && <span className="inline-flex items-center gap-1"><Globe className="h-3.5 w-3.5" />{t("teachers.online_short", "Online")}</span>}
              {p.in_person && <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{t("teachers.in_person_short", "In person")}</span>}
              {p.languages?.length > 0 && <span className="inline-flex items-center gap-1"><Languages className="h-3.5 w-3.5" />{p.languages.join(", ")}</span>}
            </div>
            {p.certificate && (
              <div className="flex flex-wrap items-center gap-2">
                <CertBadge label={teacherLabel} level={p.certificate.level} testId="teacher-cert-badge" />
                <Link to={`/teachers/verify/${p.certificate.id}`} data-testid="teacher-cert-verify" className="text-[11px] font-semibold text-[#B25A45] underline-offset-2 hover:underline">
                  {t("teachers.cert_no", "No. {{id}}", { id: p.certificate.id })}
                </Link>
              </div>
            )}
          </div>
        </div>

        {p.styles?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">{p.styles.map((s) => <span key={s} className="rounded-full bg-[#F7F2EC] px-3 py-1 text-[12px] text-[#5C5346]">{s}</span>)}</div>
        )}
        {p.bio && <p className="text-[15px] text-[#545E56] leading-relaxed whitespace-pre-line" data-testid="teacher-bio">{p.bio}</p>}
        {(p.website || p.instagram) && (
          <div className="flex flex-wrap gap-3 text-[13px]">
            {p.website && <a href={p.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-[#B25A45]"><Link2 className="h-4 w-4" />{t("teachers.website", "Website")}</a>}
            {p.instagram && <a href={`https://instagram.com/${String(p.instagram).replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-[#B25A45]"><Instagram className="h-4 w-4" />{p.instagram}</a>}
          </div>
        )}

        {!ios && !online && (p.offerings || []).some((o) => Number(o.price || 0) > 0) && (
          <div className="rounded-2xl bg-white border border-[#E5E6DF] p-3 text-[13px] text-[#545E56]" data-testid="teacher-offline-note">
            {p.offline_payment_note || t("teachers.offline_default", "This teacher takes payment in person or by bank transfer. Book here and pay them directly.")}
          </div>
        )}
        {!user && !ios && (p.offerings || []).length > 0 && (
          <div className="text-[13px] text-[#6B7269]">
            <Link to={loginPath(`/teachers/${slug}`)} className="font-semibold text-[#B25A45]">{t("teachers.sign_in", "Sign in")}</Link> {t("teachers.sign_in_hint", "to book or buy.")}
          </div>
        )}
        {ios && (p.offerings || []).length > 0 && (
          <p className="text-[13px] text-[#6B7269]">{t("teachers.ios_note", "Bookings with independent teachers are made on the Tony Yoga website.")}</p>
        )}

        {classes.length > 0 && (
          <Section icon={CalendarDays} title={t("teachers.classes", "Classes")} testId="teacher-classes">
            <div className="space-y-3">
              {classes.map((o) => (
                <div key={o.id} className="rounded-3xl bg-white border border-[#E5E6DF] p-5" data-testid={`teacher-offering-${o.id}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="serif text-xl leading-tight">{o.title}</div>
                      <div className="text-[12px] text-[#6B7269] mt-1">
                        {o.location_type === "online" ? t("teachers.online_class", "Online (link sent when you book)") : (o.location || t("teachers.in_person_short", "In person"))}
                        {o.level && o.level !== "all" ? ` · ${o.level}` : ""}{o.language ? ` · ${o.language}` : ""}
                      </div>
                    </div>
                    <span className="text-[14px] font-semibold shrink-0">{priceLabel(o, t)}</span>
                  </div>
                  {o.description && <p className="text-[13px] text-[#545E56] mt-2 whitespace-pre-line">{o.description}</p>}
                  {o.sessions?.length > 0 ? (
                    <ul className="mt-4 space-y-2">
                      {o.sessions.map((s) => (
                        <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#FAFAF7] border border-[#EFEFE9] px-3 py-2.5" data-testid={`teacher-session-${s.id}`}>
                          <div className="text-[13px]">
                            <div className="font-semibold">{fmtWhen(s.start_time)}</div>
                            <div className="text-[11px] text-[#6B7269] inline-flex items-center gap-1"><Clock className="h-3 w-3" />{s.duration_min} min
                              {s.spots_left != null && <span> · {t("teachers.spots", "{{n}} spots left", { n: s.spots_left })}</span>}</div>
                          </div>
                          {actionFor(o, s)}
                        </li>
                      ))}
                    </ul>
                  ) : <p className="mt-3 text-[12px] text-[#9AA096]">{t("teachers.no_dates", "No upcoming dates yet.")}</p>}
                </div>
              ))}
            </div>
          </Section>
        )}

        {courses.length > 0 && (
          <Section icon={PlayCircle} title={t("teachers.courses", "Courses")} testId="teacher-courses">
            <div className="space-y-3">
              {courses.map((o) => (
                <div key={o.id} className="rounded-3xl bg-white border border-[#E5E6DF] p-5" data-testid={`teacher-offering-${o.id}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="serif text-xl leading-tight">{o.title}</div>
                      <div className="text-[12px] text-[#6B7269] mt-1">
                        {t("teachers.n_lessons", "{{n}} lessons", { n: o.lesson_count })}
                        {Number(o.access_days) > 0 ? ` · ${t("teachers.access_days", "{{n}} days of access", { n: o.access_days })}` : ` · ${t("teachers.lifetime", "Lifetime access")}`}
                      </div>
                    </div>
                    <span className="text-[14px] font-semibold shrink-0">{priceLabel(o, t)}</span>
                  </div>
                  {o.description && <p className="text-[13px] text-[#545E56] mt-2 whitespace-pre-line">{o.description}</p>}
                  {o.lessons_preview?.length > 0 && (
                    <ol className="mt-3 space-y-1 text-[13px] text-[#545E56] list-decimal list-inside">
                      {o.lessons_preview.map((l, i) => <li key={i}>{l.title}{l.duration_min ? <span className="text-[#9AA096]"> · {l.duration_min} min</span> : null}</li>)}
                    </ol>
                  )}
                  <div className="mt-4 flex justify-end">{actionFor(o, null)}</div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {packs.length > 0 && (
          <Section icon={Ticket} title={t("teachers.packs", "Class packs")} testId="teacher-packs">
            <div className="space-y-3">
              {packs.map((o) => (
                <div key={o.id} className="rounded-3xl bg-white border border-[#E5E6DF] p-5 flex flex-wrap items-center justify-between gap-3" data-testid={`teacher-offering-${o.id}`}>
                  <div className="min-w-0">
                    <div className="serif text-xl leading-tight">{o.title}</div>
                    <div className="text-[12px] text-[#6B7269] mt-1">{t("teachers.pack_n", "{{n}} classes with {{name}}", { n: o.credits, name: p.display_name })} · {priceLabel(o, t)}</div>
                  </div>
                  {actionFor(o, null)}
                </div>
              ))}
            </div>
            {credits > 0 && <p className="mt-2 text-[12px] text-[#3E7C57] font-semibold" data-testid="teacher-my-credits">{t("teachers.your_credits", "You have {{n}} class credit(s) with this teacher.", { n: credits })}</p>}
          </Section>
        )}

        {(p.offerings || []).length === 0 && (
          <p className="text-[14px] text-[#6B7269]" data-testid="teacher-no-offerings">{t("teachers.no_offerings", "This teacher hasn't published classes yet.")}</p>
        )}

        {p.certificate && <p className="text-[11px] text-[#9AA096]">{t("teachers.cert_valid", "Certificate issued {{issued}}, renews {{renews}}.", { issued: fmtDate(p.certificate.issued_at), renews: fmtDate(p.certificate.renews_at) })}</p>}
      </div>
    </div>
  );
}
