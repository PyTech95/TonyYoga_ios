import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { CalendarDays, CalendarPlus, Copy, RefreshCw, Video, MapPin, Clock, Ticket, CheckCircle2, XCircle, History, Ban } from "lucide-react";
import { api } from "@/lib/api";
import PageHeader from "@/components/PageHeader";

function fmtWhen(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} · ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

function Section({ icon: Icon, title, children, tid }) {
  return (
    <section data-testid={tid}>
      <div className="flex items-center gap-2 mb-3"><Icon className="h-4 w-4 text-[#B25A45]" /><h2 className="eyebrow !text-[11px]">{title}</h2></div>
      {children}
    </section>
  );
}

function Stat({ label, value, tid }) {
  return (
    <div className="rounded-2xl bg-white border border-[#E5E6DF] p-3 text-center" data-testid={tid}>
      <div className="serif text-2xl leading-none">{value}</div>
      <div className="text-[10px] uppercase tracking-widest text-[#839682] font-semibold mt-1.5">{label}</div>
    </div>
  );
}

function CalendarLink({ t }) {
  const [link, setLink] = useState(null);
  const [busy, setBusy] = useState(false);
  const get = async (rotate = false) => {
    setBusy(true);
    try {
      const { data } = await api.get(`/me/calendar${rotate ? "?rotate=true" : ""}`);
      setLink(data);
      if (rotate) toast.success(t("myclasses.new_link_done", "New link made. The old one stops working."));
    } catch { toast.error(t("myclasses.cal_failed", "Could not make your calendar link.")); }
    finally { setBusy(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(link.url); toast.success(t("myclasses.copied", "Link copied.")); }
    catch { toast.error(t("myclasses.copy_failed", "Copy didn't work — select the link and copy it.")); }
  };
  return (
    <div className="rounded-3xl bg-white border border-[#E5E6DF] p-5" data-testid="my-classes-calendar">
      <div className="flex items-start gap-3">
        <span className="h-10 w-10 rounded-full bg-[#FBF1EE] flex items-center justify-center shrink-0"><CalendarPlus className="h-5 w-5 text-[#B25A45]" /></span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold">{t("myclasses.cal_title", "Add your classes to your calendar")}</div>
          <p className="text-[13px] text-[#6B7269] mt-0.5">{t("myclasses.cal_body", "Google, Apple or Outlook calendar keeps your booked classes up to date automatically. Keep this link private.")}</p>
        </div>
      </div>
      {!link ? (
        <button onClick={() => get(false)} disabled={busy} className="pill pill-primary !py-2 !px-4 !text-[13px] mt-4" data-testid="my-classes-cal-get">{busy ? "…" : t("myclasses.cal_get", "Get my calendar link")}</button>
      ) : (
        <div className="mt-4 space-y-2">
          <input readOnly value={link.url} onFocus={(e) => e.target.select()} className="w-full rounded-2xl border border-[#E5E6DF] bg-[#F7F6F1] px-3 py-2 text-[12px] text-[#545E56]" data-testid="my-classes-cal-url" />
          <div className="flex flex-wrap gap-2">
            <button onClick={copy} className="pill pill-primary !py-2 !px-4 !text-[13px]" data-testid="my-classes-cal-copy"><Copy className="h-4 w-4" />{t("myclasses.copy", "Copy link")}</button>
            <a href={link.webcal} className="pill pill-ghost !py-2 !px-4 !text-[13px]" data-testid="my-classes-cal-open"><CalendarDays className="h-4 w-4" />{t("myclasses.open_cal", "Open in calendar")}</a>
            <button onClick={() => get(true)} disabled={busy} className="pill pill-ghost !py-2 !px-4 !text-[13px]" data-testid="my-classes-cal-rotate"><RefreshCw className="h-4 w-4" />{t("myclasses.new_link", "New link")}</button>
          </div>
          <p className="text-[11px] text-[#6B7269]">{t("myclasses.cal_google", "Google Calendar: Other calendars → + → From URL, and paste the link.")}</p>
        </div>
      )}
    </div>
  );
}

export default function MyClasses() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [confirming, setConfirming] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get("/me/classes").then(({ data: d }) => { setData(d); setError(false); }).catch(() => setError(true));
  }, []);
  useEffect(() => { load(); }, [load]);

  const cancel = async (item) => {
    setBusy(true);
    try {
      await api.delete(`/bookings/${item.booking_id}`);
      toast.success(item.status === "waitlist" ? t("myclasses.left_waitlist", "You left the waitlist.") : t("myclasses.cancelled_ok", "Booking cancelled."));
      setConfirming(null);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || t("myclasses.cancel_failed", "Could not cancel. Please try again.")); }
    finally { setBusy(false); }
  };

  const empty = data && !data.upcoming.length && !data.past.length && !data.cancelled.length;

  return (
    <div data-testid="my-classes-page" className="pb-24">
      <PageHeader eyebrow={t("myclasses.eyebrow", "Your practice")} title={t("myclasses.title", "My classes")} back testId="my-classes-header" />
      <div className="mx-auto max-w-2xl px-5 space-y-8">
        {error && (
          <div className="rounded-2xl bg-[#FBEFEA] border border-[#EED9D2] p-4 text-sm text-[#8A3B2A]">
            {t("myclasses.load_error", "We couldn't load your classes right now.")} <button onClick={load} className="underline font-semibold">{t("common.retry", "Try again")}</button>
          </div>
        )}
        {!data && !error && <div className="space-y-3" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="h-20 rounded-3xl bg-[#F2F2EC] animate-pulse" />)}</div>}

        {data && (
          <div className="grid grid-cols-4 gap-2" data-testid="my-classes-stats">
            <Stat label={t("myclasses.attended", "Attended")} value={data.stats.attended} tid="my-classes-stat-attended" />
            <Stat label={t("myclasses.this_month", "This month")} value={data.stats.this_month} tid="my-classes-stat-month" />
            <Stat label={t("myclasses.no_shows", "No-shows")} value={data.stats.no_show} tid="my-classes-stat-noshow" />
            <Stat label={t("myclasses.credits", "Credits")} value={data.credits} tid="my-classes-stat-credits" />
          </div>
        )}

        {empty && (
          <div className="rounded-3xl bg-white border border-[#E5E6DF] p-8 text-center" data-testid="my-classes-empty">
            <CalendarDays className="h-8 w-8 text-[#839682] mx-auto" />
            <div className="serif text-2xl mt-3">{t("myclasses.empty_title", "No classes booked yet")}</div>
            <p className="text-sm text-[#6B7269] mt-2">{t("myclasses.empty_body", "Book a live class and it appears here, with reminders and a join link.")}</p>
            <Link to="/schedule" className="pill pill-primary mt-5 inline-flex" data-testid="my-classes-browse">{t("myclasses.see_schedule", "See the schedule")}</Link>
          </div>
        )}

        {data?.upcoming?.length > 0 && (
          <Section icon={Clock} title={t("myclasses.upcoming", "Coming up")} tid="my-classes-upcoming">
            <ul className="space-y-2">
              {data.upcoming.map((c) => (
                <li key={c.booking_id} className="rounded-3xl bg-white border border-[#E5E6DF] p-4" data-testid={`my-class-${c.booking_id}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[15px] font-semibold leading-snug">{c.title}</div>
                      <div className="text-[13px] text-[#6B7269] mt-0.5">{fmtWhen(c.start_time)}</div>
                      <div className="text-[12px] text-[#6B7269] mt-1 flex flex-wrap items-center gap-x-3">
                        <span className="inline-flex items-center gap-1">{c.location_type === "online" ? <Video className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}{c.location || (c.location_type === "online" ? "Online" : "")}</span>
                        {c.instructor && <span>{t("myclasses.with", "with")} {c.instructor}</span>}
                      </div>
                    </div>
                    {c.status === "waitlist" ? (
                      <span className="text-[10px] uppercase tracking-widest font-bold rounded-full px-2.5 py-1 bg-[#F3E7C9] text-[#8A6D3B] shrink-0" data-testid={`my-class-waitlist-${c.booking_id}`}>
                        {t("myclasses.waitlist_pos", "Waitlist #{{n}}", { n: c.position || 1 })}
                      </span>
                    ) : (
                      <span className="text-[10px] uppercase tracking-widest font-bold rounded-full px-2.5 py-1 bg-[#E4F0E8] text-[#3E7C57] shrink-0">{t("myclasses.booked", "Booked")}</span>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Link to={`/schedule/${c.class_id}`} className="pill pill-primary !py-2 !px-4 !text-xs" data-testid={`my-class-open-${c.booking_id}`}>
                      {c.location_type === "online" && c.status !== "waitlist" ? t("myclasses.join", "Join / details") : t("myclasses.details", "Details")}
                    </Link>
                    {confirming === c.booking_id ? (
                      <>
                        <span className="text-[12px] text-[#6B7269]">{t("myclasses.sure", "Cancel this booking?")}</span>
                        <button onClick={() => setConfirming(null)} className="text-xs text-[#6B7269] px-2">{t("myclasses.no", "No")}</button>
                        <button onClick={() => cancel(c)} disabled={busy} className="pill !py-2 !px-4 !text-xs bg-[#B25A45] text-white" data-testid={`my-class-cancel-confirm-${c.booking_id}`}>{busy ? "…" : t("myclasses.yes_cancel", "Yes, cancel")}</button>
                      </>
                    ) : (
                      <button onClick={() => setConfirming(c.booking_id)} className="pill pill-ghost !py-2 !px-4 !text-xs" data-testid={`my-class-cancel-${c.booking_id}`}>
                        {c.status === "waitlist" ? t("myclasses.leave_waitlist", "Leave waitlist") : t("myclasses.cancel", "Cancel booking")}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {data && !empty && <CalendarLink t={t} />}

        {data?.cancelled?.length > 0 && (
          <Section icon={Ban} title={t("myclasses.cancelled", "Cancelled")} tid="my-classes-cancelled">
            <ul className="space-y-2">
              {data.cancelled.map((c) => (
                <li key={c.booking_id} className="rounded-2xl bg-white border border-[#E5E6DF] p-4 opacity-80" data-testid={`my-class-cancelled-${c.booking_id}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[14px] font-semibold truncate">{c.title}</div>
                      <div className="text-xs text-[#6B7269]">{fmtWhen(c.start_time)}</div>
                      {c.class_status === "cancelled" && (
                        <div className="text-[12px] text-[#B25A45] mt-1">{t("myclasses.class_cancelled", "Class cancelled by the studio.")} {c.cancel_reason || ""}</div>
                      )}
                    </div>
                    <XCircle className="h-5 w-5 text-[#C3C6BE] shrink-0" />
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {data?.past?.length > 0 && (
          <Section icon={History} title={t("myclasses.history", "History")} tid="my-classes-history">
            <ul className="rounded-3xl bg-white border border-[#E5E6DF] divide-y divide-[#EFEFE9] overflow-hidden">
              {data.past.map((c) => (
                <li key={c.booking_id} className="flex items-center justify-between gap-3 px-4 py-3" data-testid={`my-class-past-${c.booking_id}`}>
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold truncate">{c.title}</div>
                    <div className="text-xs text-[#6B7269]">{fmtWhen(c.start_time)}{c.instructor ? ` · ${c.instructor}` : ""}</div>
                  </div>
                  {c.attendance === "attended" ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest text-[#3E7C57] shrink-0"><CheckCircle2 className="h-4 w-4" />{t("myclasses.att_yes", "Attended")}</span>
                  ) : c.attendance === "no_show" ? (
                    <span className="text-[11px] font-bold uppercase tracking-widest text-[#B25A45] shrink-0">{t("myclasses.att_no", "Missed")}</span>
                  ) : (
                    <span className="text-[11px] font-bold uppercase tracking-widest text-[#9AA096] shrink-0">{t("myclasses.att_booked", "Booked")}</span>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {data && (
          <div className="flex flex-wrap gap-2 justify-center pt-2">
            <Link to="/schedule" className="pill pill-ghost !text-[13px]" data-testid="my-classes-schedule"><CalendarDays className="h-4 w-4" />{t("myclasses.book_more", "Book another class")}</Link>
            {data.credits === 0 && <Link to="/passes" className="pill pill-ghost !text-[13px]"><Ticket className="h-4 w-4" />{t("myclasses.get_credits", "Get class credits")}</Link>}
          </div>
        )}
      </div>
    </div>
  );
}
