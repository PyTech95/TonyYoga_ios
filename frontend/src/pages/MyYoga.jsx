import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  Sparkles, GraduationCap, CalendarDays, Ticket, Package, Truck, CheckCircle2, Clock, ArrowRight,
  PlayCircle, MountainSnow, Loader2, ExternalLink, AlertTriangle, CreditCard, Map as MapIcon, CalendarCheck, BookOpenCheck, Receipt,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import PageHeader from "@/components/PageHeader";
import { useCommerceRefresh } from "@/lib/useCommerceRefresh";
import MembershipManage, { openBillingPortal } from "@/components/MembershipManage";
import TeacherClassesSection from "@/components/TeacherClassesSection";
import { isIOSApp } from "@/lib/iosPlatform";

const QUICK_LINKS = [
  ["/my-plan", "myyoga.link_plan", "My plan", MapIcon],
  ["/my-classes", "myyoga.link_classes", "My classes", CalendarCheck],
  ["/my-learning", "myyoga.link_learning", "My learning", BookOpenCheck],
  ["/my-payments", "myyoga.link_payments", "Payments & receipts", Receipt],
];

const STATE_CHIP = {
  active: "bg-[#E4F0E8] text-[#3E7C57]", upcoming: "bg-[#F3E7C9] text-[#8A6D3B]", paused: "bg-[#F3E7C9] text-[#8A6D3B]",
  past_due: "bg-[#FBEFEA] text-[#B25A45]",
};

const LIFETIME = "2099";

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function fmtWhen(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) + " · " +
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function Until({ iso, t }) {
  if (!iso) return null;
  if (String(iso).startsWith(LIFETIME)) return <span>{t("myyoga.lifetime", "Lifetime access")}</span>;
  return <span>{t("myyoga.until", "Until")} {fmtDate(iso)}</span>;
}

/** The membership's "includes" lines come from the server in English; show them in the reader's language. */
function includeLabel(x, t) {
  let m;
  if (x === "All courses") return t("myyoga.inc_all_courses", "All courses");
  if (x === "On-demand library") return t("myyoga.inc_library", "On-demand library");
  if (x === "Unlimited live classes") return t("myyoga.inc_live_unlimited", "Unlimited live classes");
  if ((m = x.match(/^(\d+) course\(s\) of your choice$/))) return t("myyoga.inc_choose", "{{n}} course(s) of your choice", { n: m[1] });
  if ((m = x.match(/^(\d+) course\(s\)$/))) return t("myyoga.inc_courses", "{{n}} course(s)", { n: m[1] });
  if ((m = x.match(/^(\d+) live classes \/ week$/))) return t("myyoga.inc_live_week", "{{n}} live classes / week", { n: m[1] });
  return x;
}

const ORDER_STEPS = ["paid", "processing", "shipped", "delivered"];
const ORDER_LABEL = {
  paid: "Received", processing: "In production", fulfilled: "In production", shipped: "Shipped",
  delivered: "Delivered", completed: "Delivered", cancelled: "Cancelled", refunded: "Refunded",
};

function Section({ icon: Icon, title, children, id, action }) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-[#B25A45]" />
          <h2 className="eyebrow !text-[11px]">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function MyYoga() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [picking, setPicking] = useState(null); // `${plan_id}:${program_id}` awaiting confirm
  const [busy, setBusy] = useState(false);
  const ordersRef = useRef(null);

  const load = useCallback(() => {
    api.get("/me/library").then(({ data }) => { setData(data); setError(false); }).catch(() => setError(true));
  }, []);
  useEffect(() => { load(); }, [load]);
  useCommerceRefresh(load);

  // Payment still being confirmed: look again every 15 seconds for a few minutes.
  useEffect(() => {
    if (!data?.pending_payments?.length) return undefined;
    let n = 0;
    const id = setInterval(() => { n += 1; if (n > 16) clearInterval(id); load(); }, 15000);
    return () => clearInterval(id);
  }, [data?.pending_payments?.length, load]);

  useEffect(() => {
    if (data && params.get("tab") === "orders") ordersRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [data, params]);

  const choose = async (planId, programId) => {
    setBusy(true);
    try {
      await api.post("/me/plan-picks", { plan_id: planId, program_id: programId });
      toast.success(t("myyoga.chosen", "Your course is ready."));
      setPicking(null);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || t("myyoga.choose_failed", "Could not save your choice."));
    } finally { setBusy(false); }
  };

  const first = (user?.name || "").split(" ")[0];
  const pastDue = (data?.memberships || []).filter((m) => m.state === "past_due");
  const fixCard = params.get("fix") === "card";
  const stateLabel = (m) => (m.state === "active" ? t("myyoga.active", "Active")
    : m.state === "upcoming" ? t("myyoga.starts", "Starts {{date}}", { date: fmtDate(m.start_date) })
      : m.state === "paused" ? t("myyoga.paused", "Paused")
        : m.state === "past_due" ? t("myyoga.past_due", "Payment failed")
          : t("myyoga.ended", "Ended"));
  const nothing = data && !data.memberships.length && !data.courses.length && !data.credits && !data.upcoming_bookings.length &&
    !data.trainings.length && !data.retreats.length && !data.orders.length && !data.class_access.length;

  return (
    <div data-testid="my-yoga-page" className="pb-24">
      <PageHeader eyebrow={first ? t("myyoga.hello", "Namaste, {{name}}", { name: first }) : t("myyoga.eyebrow", "Your practice")} title={t("myyoga.title", "My Yoga")} testId="my-yoga-header" />
      <div className="mx-auto max-w-2xl px-5 space-y-8">
        {error && (
          <div className="rounded-2xl bg-[#FBEFEA] border border-[#EED9D2] p-4 text-sm text-[#8A3B2A]">
            {t("myyoga.load_error", "We couldn't load your yoga right now.")}{" "}
            <button onClick={load} className="underline font-semibold">{t("common.retry", "Try again")}</button>
          </div>
        )}
        {!data && !error && (
          <div className="space-y-3" aria-busy="true">
            {[0, 1, 2].map((i) => <div key={i} className="h-24 rounded-3xl bg-[#F2F2EC] animate-pulse" />)}
          </div>
        )}

        <nav className="grid grid-cols-2 sm:grid-cols-4 gap-2" data-testid="my-yoga-links">
          {QUICK_LINKS.map(([to, key, label, Icon]) => (
            <Link key={to} to={to} data-testid={`my-yoga-link-${to.slice(4)}`}
              className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-white border border-[#E5E6DF] px-3 py-2.5 text-[13px] font-semibold text-[#1C221F] hover:border-[#B25A45] text-center">
              <Icon className="h-4 w-4 text-[#B25A45]" />{t(key, label)}
            </Link>
          ))}
        </nav>

        {data && (pastDue.length > 0 || fixCard) && (
          <div data-testid="my-yoga-past-due" className="rounded-2xl bg-[#FBEFEA] border border-[#EED9D2] p-4 flex gap-3">
            <AlertTriangle className="h-5 w-5 text-[#B25A45] shrink-0 mt-0.5" />
            <div className="text-[13px] text-[#5C3328] leading-relaxed">
              <div className="font-semibold text-[#1C221F]">{pastDue.length ? t("myyoga.card_failed", "Your card payment didn't go through") : t("myyoga.card_update", "Update your card")}</div>
              {pastDue.length
                ? t("myyoga.card_failed_body", "You still have access for a few days. Update your card so your classes and courses continue.")
                : t("myyoga.card_update_body", "Change the card used for your membership and see your invoices.")}
              <div className="mt-2">
                {isIOSApp() ? (
                  <span className="text-[12px] text-[#6B7269]">{t("myyoga.card_on_web", "Update it on tonyoga.com → My Yoga.")}</span>
                ) : (pastDue.some((m) => m.managed_by === "stripe") || (!pastDue.length && data.memberships.some((m) => m.managed_by === "stripe"))) ? (
                  <button onClick={openBillingPortal} data-testid="my-yoga-update-card" className="pill pill-primary !py-2 !px-4 !text-xs"><CreditCard className="h-3.5 w-3.5" />{t("myyoga.update_card", "Update card")}</button>
                ) : (
                  <Link to="/memberships" className="pill pill-primary !py-2 !px-4 !text-xs">{t("myyoga.renew", "Renew")}</Link>
                )}
              </div>
            </div>
          </div>
        )}

        {data?.pending_payments?.length > 0 && (
          <div data-testid="my-yoga-pending" className="rounded-2xl bg-[#FBF6EC] border border-[#E0D3B8] p-4 flex gap-3">
            <Loader2 className="h-5 w-5 text-[#B25A45] animate-spin shrink-0 mt-0.5" />
            <div className="text-[13px] text-[#5C5346] leading-relaxed">
              <div className="font-semibold text-[#1C221F]">{t("myyoga.pending_title", "We're confirming your payment")}</div>
              {t("myyoga.pending_body", "This usually takes a minute. Your purchase appears here automatically. If it isn't here within 15 minutes, write to us and we'll fix it right away.")}
            </div>
          </div>
        )}

        {/* Course of your choice included in a membership */}
        {data?.choose_courses?.map((c) => (
          <section key={c.plan_id} data-testid="my-yoga-choose" className="rounded-3xl bg-[#1C221F] text-[#FAFAF7] p-5 sm:p-6">
            <div className="flex items-center gap-2 text-[#E8B8A8]"><Sparkles className="h-4 w-4" /><span className="text-[11px] uppercase tracking-[0.2em] font-semibold">{c.plan_name}</span></div>
            <h2 className="serif text-2xl mt-2 leading-tight">
              {c.remaining === 1 ? t("myyoga.choose_one", "Choose the course included in your membership") : t("myyoga.choose_n", "Choose {{n}} courses included in your membership", { n: c.remaining })}
            </h2>
            <p className="text-[13px] text-white/70 mt-1">{t("myyoga.choose_hint", "It opens right away and stays open while your membership is active.")}</p>
            <ul className="mt-4 space-y-2">
              {c.options.map((o) => {
                const key = `${c.plan_id}:${o.id}`;
                return (
                  <li key={o.id} className="flex items-center gap-3 rounded-2xl bg-white/5 border border-white/10 p-3">
                    <div className="h-14 w-14 rounded-xl bg-white/10 overflow-hidden shrink-0">
                      {o.cover_image && <img src={o.cover_image} alt="" className="h-full w-full object-cover" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-semibold truncate">{o.title}</div>
                      {o.level && <div className="text-[11px] uppercase tracking-widest text-white/50">{o.level}</div>}
                    </div>
                    {picking === key ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => setPicking(null)} className="text-xs text-white/60 px-2">{t("common.cancel", "Cancel")}</button>
                        <button disabled={busy} onClick={() => choose(c.plan_id, o.id)} data-testid={`my-yoga-confirm-${o.id}`} className="pill !py-2 !px-4 !text-xs bg-[#B25A45] text-white">
                          {busy ? "…" : t("myyoga.confirm", "Confirm")}
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setPicking(key)} data-testid={`my-yoga-choose-${o.id}`} className="pill !py-2 !px-4 !text-xs bg-white text-[#1C221F] shrink-0">
                        {t("myyoga.choose", "Choose")}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        {data?.memberships?.length > 0 && (
          <Section icon={Sparkles} title={t("myyoga.membership", "Membership")}>
            <div className="space-y-3">
              {data.memberships.map((m) => (
                <div key={m.id} data-testid="my-yoga-membership" className="rounded-3xl bg-white border border-[#E5E6DF] p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="serif text-2xl leading-tight">{m.plan_name}</div>
                      <div className="text-[13px] text-[#6B7269] mt-1"><Until iso={m.end_date} t={t} /></div>
                    </div>
                    <span data-testid="my-yoga-membership-state" className={`text-[10px] uppercase tracking-widest font-bold rounded-full px-2.5 py-1 shrink-0 ${STATE_CHIP[m.state] || "bg-[#F2F2EC] text-[#6B7269]"}`}>
                      {stateLabel(m)}
                    </span>
                  </div>
                  {m.includes?.length > 0 && (
                    <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {m.includes.map((x) => (
                        <li key={x} className="flex items-center gap-2 text-[13px] text-[#1C221F]"><CheckCircle2 className="h-4 w-4 text-[#839682] shrink-0" />{includeLabel(x, t)}</li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {m.state === "active" && <Link to="/schedule" className="pill pill-primary !py-2 !px-4 !text-xs">{t("myyoga.book_live", "Book a live class")}</Link>}
                    {m.state === "active" && <Link to="/library" className="pill pill-ghost !py-2 !px-4 !text-xs">{t("myyoga.open_library", "On-demand library")}</Link>}
                    {["expired", "cancelled"].includes(m.state) && <Link to="/memberships" className="pill pill-primary !py-2 !px-4 !text-xs">{t("myyoga.renew", "Renew")}</Link>}
                  </div>
                  <MembershipManage membership={m} onChanged={load} />
                </div>
              ))}
            </div>
          </Section>
        )}

        {data?.courses?.length > 0 && (
          <Section icon={GraduationCap} title={t("myyoga.courses", "My courses")}>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="my-yoga-courses">
              {data.courses.map((c) => (
                <li key={c.program_id}>
                  <Link to={`/programs/${c.program_id}`} data-testid={`my-yoga-course-${c.program_id}`}
                    className={`block rounded-3xl bg-white border border-[#E5E6DF] overflow-hidden hover:border-[#B25A45] transition ${c.has_access ? "" : "opacity-70"}`}>
                    <div className="aspect-[16/9] bg-[#F2F2EC] relative">
                      {c.cover_image && <img src={c.cover_image} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />}
                      {c.has_access && <PlayCircle className="absolute bottom-3 right-3 h-9 w-9 text-white drop-shadow" />}
                    </div>
                    <div className="p-4">
                      <div className="text-[15px] font-semibold leading-snug">{c.title}</div>
                      <div className="text-[12px] text-[#6B7269] mt-1">
                        {c.has_access ? <Until iso={c.ends_at} t={t} /> : c.state === "upcoming" ? t("myyoga.starts", "Starts {{date}}", { date: fmtDate(c.starts_at) }) : t("myyoga.course_ended", "Access ended")}
                        {c.sources?.some((s) => s.includes("membership")) && <span> · {t("myyoga.in_membership", "included in your membership")}</span>}
                      </div>
                      {c.has_access && c.total_lessons > 0 && (
                        <div className="mt-3">
                          <div className="h-1.5 rounded-full bg-[#EEF1EC] overflow-hidden"><div className="h-full bg-[#B25A45]" style={{ width: `${c.percent}%` }} /></div>
                          <div className="text-[11px] text-[#6B7269] mt-1">{c.completed_lessons}/{c.total_lessons} {t("myyoga.lessons", "lessons")} · {c.percent}%</div>
                        </div>
                      )}
                      <div className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-[#B25A45]">
                        {c.has_access ? (c.completed_lessons > 0 ? t("myyoga.continue", "Continue") : t("myyoga.start", "Start")) : t("myyoga.renew", "Renew")}
                        <ArrowRight className="h-4 w-4" />
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {data && (data.credits > 0 || data.upcoming_bookings.length > 0 || data.class_access.length > 0) && (
          <Section icon={CalendarDays} title={t("myyoga.live", "Live classes")} action={<Link to="/schedule" className="text-xs font-semibold text-[#B25A45]">{t("myyoga.schedule", "Schedule")} →</Link>}>
            <div className="space-y-2">
              {data.credits > 0 && (
                <div className="rounded-2xl bg-white border border-[#E5E6DF] p-4 flex items-center gap-3">
                  <Ticket className="h-5 w-5 text-[#B25A45]" />
                  <div className="text-sm"><span className="font-semibold">{data.credits}</span> {t("myyoga.credits", "class credit(s) to use")}</div>
                </div>
              )}
              {data.class_access.map((g) => (
                <div key={g.id} className="rounded-2xl bg-white border border-[#E5E6DF] p-4 text-sm flex items-center justify-between gap-3">
                  <span className="font-semibold">{g.title}</span><span className="text-xs text-[#6B7269]"><Until iso={g.ends_at} t={t} /></span>
                </div>
              ))}
              {data.upcoming_bookings.map((b) => (
                <Link key={b.id} to={`/schedule/${b.class_instance_id}`} className="rounded-2xl bg-white border border-[#E5E6DF] p-4 flex items-center justify-between gap-3 hover:border-[#B25A45]">
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold truncate">{b.title}</div>
                    <div className="text-xs text-[#6B7269]">{fmtWhen(b.start_time)}</div>
                  </div>
                  <span className={`text-[10px] uppercase tracking-widest font-bold ${b.status === "confirmed" ? "text-[#3E7C57]" : "text-[#B25A45]"}`}>{b.status === "confirmed" ? t("myyoga.booked", "Booked") : t("myyoga.waitlist", "Waitlist")}</span>
                </Link>
              ))}
            </div>
          </Section>
        )}

        <TeacherClassesSection />

        {data && (data.trainings.length > 0 || data.retreats.length > 0) && (
          <Section icon={MountainSnow} title={t("myyoga.trainings", "Trainings & retreats")}>
            <div className="space-y-2">
              {data.trainings.map((tr) => (
                <div key={tr.id} className="rounded-2xl bg-white border border-[#E5E6DF] p-4">
                  <div className="text-[14px] font-semibold">{tr.training_name}</div>
                  <div className="text-xs text-[#6B7269]">{tr.dates} · <span className="text-[#3E7C57] font-semibold">{t("myyoga.confirmed", "Confirmed")}</span></div>
                </div>
              ))}
              {data.retreats.map((r) => (
                <Link key={r.id} to="/profile" className="block rounded-2xl bg-white border border-[#E5E6DF] p-4">
                  <div className="text-[14px] font-semibold">{r.workshop_title}</div>
                  <div className="text-xs text-[#6B7269]">{fmtDate(r.workshop_start_date)} · {String(r.status || "").replace(/_/g, " ")}</div>
                </Link>
              ))}
            </div>
          </Section>
        )}

        {data?.orders?.length > 0 && (
          <div ref={ordersRef}>
            <Section icon={Package} title={t("myyoga.orders", "Orders")} id="orders">
              <ul className="space-y-3" data-testid="my-yoga-orders">
                {data.orders.map((o) => {
                  const step = ORDER_STEPS.indexOf(o.status === "fulfilled" ? "processing" : o.status === "completed" ? "delivered" : o.status);
                  return (
                    <li key={o.id} className="rounded-3xl bg-white border border-[#E5E6DF] p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[14px] font-semibold truncate">{(o.items || []).map((i) => `${i.quantity}× ${i.title}`).join(", ")}</div>
                          <div className="text-xs text-[#6B7269] mt-0.5">{fmtDate(o.created_at)} · {Number(o.total || 0).toFixed(2)} {String(o.currency || "").toUpperCase()}</div>
                        </div>
                        <span className="text-[10px] uppercase tracking-widest font-bold text-[#B25A45] shrink-0">{ORDER_LABEL[o.status] || o.status}</span>
                      </div>
                      {step >= 0 && (
                        <div className="mt-4 grid grid-cols-4 gap-1">
                          {ORDER_STEPS.map((s, i) => (
                            <div key={s}>
                              <div className={`h-1.5 rounded-full ${i <= step ? "bg-[#B25A45]" : "bg-[#EEF1EC]"}`} />
                              <div className={`text-[10px] mt-1 ${i <= step ? "text-[#1C221F] font-semibold" : "text-[#9AA096]"}`}>{ORDER_LABEL[s]}</div>
                            </div>
                          ))}
                        </div>
                      )}
                      {(o.tracking_url || o.tracking_number) && (
                        <div className="mt-3 flex items-center gap-2 text-[13px]">
                          <Truck className="h-4 w-4 text-[#839682]" />
                          {o.tracking_url ? (
                            <a href={o.tracking_url} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#B25A45] inline-flex items-center gap-1">
                              {t("myyoga.track", "Track parcel")} {o.tracking_number ? `(${o.tracking_number})` : ""} <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          ) : <span>{t("myyoga.tracking", "Tracking number")}: <span className="font-semibold">{o.tracking_number}</span></span>}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Section>
          </div>
        )}

        {nothing && (
          <div data-testid="my-yoga-empty" className="rounded-3xl bg-white border border-[#E5E6DF] p-8 text-center">
            <Clock className="h-8 w-8 text-[#839682] mx-auto" />
            <div className="serif text-2xl mt-3">{t("myyoga.empty_title", "Your practice starts here")}</div>
            <p className="text-sm text-[#6B7269] mt-2">{t("myyoga.empty_body", "Courses, memberships, classes and orders you buy will all appear on this page.")}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Link to="/programs" className="pill pill-primary">{t("myyoga.browse_courses", "Browse courses")}</Link>
              <Link to="/memberships" className="pill pill-ghost">{t("myyoga.see_plans", "See memberships")}</Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
