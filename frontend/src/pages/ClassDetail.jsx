import { useCommerceRefresh } from "@/lib/useCommerceRefresh";
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { MapPin, Video, Users, Clock, User as UserIcon } from "lucide-react";
import { api } from "@/lib/api";
import { contentImageUrl } from "@/components/ContentImageInput";
import { useAuth } from "@/lib/auth";
import PageHeader from "@/components/PageHeader";
import Spinner from "@/components/Spinner";
import { ClassPurchaseOptions } from "@/components/ClassPurchaseOptions";
import { useSeo, SITE_URL } from "@/lib/seo";
import { eventJsonLd } from "@/seo/seoData.mjs";

export default function ClassDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [c, setC] = useState(null);
  const [booking, setBooking] = useState(null);
  const [rec, setRec] = useState(null);
  const [busy, setBusy] = useState(false);
  const isStaff = !!user && ["admin", "instructor"].includes(user.role);

  const loadClass = () => {
    api.get(`/class-instances/${id}`).then(({ data }) => setC(data)).catch(() => setC(false));
    if (user && !isStaff) {
      api.get("/bookings/mine").then(({ data }) => {
        const b = data.find((x) => x.class_instance_id === id && x.status !== "cancelled");
        setBooking(b || null);
      }).catch(() => {});
    }
  };
  useEffect(loadClass, [id, user, isStaff]);
  useCommerceRefresh(loadClass);

  // Fetch the gated recording status once we know the viewer may access it.
  useEffect(() => {
    if (!user) return;
    if (!isStaff && !booking) return;
    api.get(`/class-instances/${id}/recording`).then(({ data }) => setRec(data)).catch(() => setRec(null));
  }, [id, user, isStaff, booking]);

  const book = async () => {
    if (!user) { toast("Please sign in first."); nav("/login"); return; }
    setBusy(true);
    try {
      const { data } = await api.post("/bookings", { class_instance_id: id });
      setBooking(data);
      api.get(`/class-instances/${id}`).then(({ data }) => setC(data));
      toast.success(data.status === "confirmed" ? "You're booked." : "Added to waitlist.");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not book");
    } finally { setBusy(false); }
  };

  useSeo(c ? {
    title: `${c.title} — Live ${c.location_type === "online" ? "Online " : ""}Yoga Class | Tony Yoga`,
    description: `${c.title} with Tony Yoga: ${c.style || "yoga"} · ${c.level || "all levels"} · ${c.duration_minutes || 60} min${c.location_type === "online" ? " on Zoom" : " in Málaga"}. Book your place.`,
    jsonLd: eventJsonLd(c, SITE_URL),
  } : c === false ? { title: "Class not found | Tony Yoga", noindex: true } : null);

  if (c === null) return <><PageHeader back /><Spinner /></>;
  if (c === false) return <><PageHeader back title="Not found" /></>;

  const start = new Date(c.start_time);
  const spotsLeft = Math.max(0, (c.capacity || 0) - (c.bookings_count || 0));

  return (
    <div data-testid="class-detail" className="pb-6">
      <PageHeader eyebrow={c.style} title={c.title} back testId="classdetail-header" />

      <div className="mx-auto max-w-2xl px-5 space-y-6">
        <div className="rounded-3xl bg-white border border-[#E5E6DF] p-5 sm:p-6 space-y-3">
          <div className="flex items-start gap-2.5 text-sm text-[#545E56]">
            <Clock className="h-4 w-4 mt-0.5 shrink-0 text-[#B25A45]" />
            <span className="min-w-0">
              {start.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} · <span className="whitespace-nowrap">{start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>{" "}
              <span className="whitespace-nowrap text-[#839682]">· {c.duration_minutes} min</span>
            </span>
          </div>
          <div className="flex items-start gap-2.5 text-sm text-[#545E56]">
            {c.location_type === "online" ? <Video className="h-4 w-4 mt-0.5 shrink-0 text-[#B25A45]" /> : <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-[#B25A45]" />}
            <span className="min-w-0 break-words">{c.location_detail || (c.location_type === "online" ? "Online (Zoom)" : "Studio")}</span>
          </div>
          <div className="flex items-start gap-2.5 text-sm text-[#545E56]">
            <Users className="h-4 w-4 mt-0.5 shrink-0 text-[#B25A45]" />
            <span>{spotsLeft} of {c.capacity} spots open</span>
          </div>
        </div>

        {c.instructor && (
          <div className="rounded-3xl bg-[#F2F2EC] p-6">
            <div className="eyebrow mb-3">Instructor</div>
            <div className="flex gap-4 items-start">
              <div className="h-14 w-14 rounded-full bg-white overflow-hidden shrink-0 flex items-center justify-center">
                {c.instructor.photo_url ? (
                  <img src={contentImageUrl(c.instructor.photo_url)} alt={c.instructor.name || ""} className="h-full w-full object-cover object-top" />
                ) : <UserIcon className="h-5 w-5 text-[#B25A45]" />}
              </div>
              <div className="min-w-0">
                <div className="serif text-lg">{c.instructor.name}</div>
                {c.instructor.bio && <p className="text-sm text-[#545E56] mt-1 leading-relaxed clamp-3">{c.instructor.bio}</p>}
              </div>
            </div>
          </div>
        )}

        {/* Live join + recording (Zoom) */}
        {c.location_type === "online" && (isStaff || booking?.status === "confirmed") && c.zoom_join_url && (
          <a
            href={c.zoom_join_url}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="class-join-zoom"
            className="pill pill-primary w-full !bg-[#2D8CFF] !border-[#2D8CFF]"
          >
            <Video className="h-4 w-4" /> Join on Zoom
          </a>
        )}

        {(isStaff || booking) && (
          <div data-testid="class-recording" className="rounded-3xl bg-[#F2F2EC] border border-[#E5E6DF] p-6">
            <div className="eyebrow mb-2">Class recording</div>
            {rec?.available ? (
              <div className="space-y-2">
                <a
                  href={rec.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="class-watch-recording"
                  className="pill pill-primary w-full"
                >
                  <Video className="h-4 w-4" /> Watch recording
                </a>
                {rec.expires_at && (
                  <p data-testid="class-recording-expiry" className="text-xs text-[#6B7269] text-center">
                    Available until {new Date(rec.expires_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </p>
                )}
              </div>
            ) : rec?.reason === "expired" ? (
              <p data-testid="class-recording-expired" className="text-sm text-[#B25A45]">
                This recording is no longer available — the replay window has closed.
              </p>
            ) : (
              <p data-testid="class-recording-pending" className="text-sm text-[#545E56]">
                The recording will appear here for a limited time after the live class.
              </p>
            )}
          </div>
        )}

        {isStaff ? (
          <div data-testid="class-staff-note" className="rounded-2xl bg-[#F2F2EC] border border-[#E5E6DF] p-4 text-sm text-[#545E56]">
            You're viewing this as {user.role}. Booking is for members — manage classes from the{" "}
            {user.role === "admin" ? (
              <button onClick={() => nav("/admin")} className="underline text-[#1C221F]" data-testid="class-staff-admin-link">Admin console</button>
            ) : (
              <button onClick={() => nav("/instructor")} className="underline text-[#1C221F]" data-testid="class-staff-instructor-link">Instructor studio</button>
            )}.
          </div>
        ) : (c.status === "cancelled" || start <= new Date()) ? <p data-testid="class-booking-closed" className="text-sm text-[#6B7269]">Booking is closed for this class.</p> : <>
          {!booking && <ClassPurchaseOptions instance={c} user={user} />}
          {c.viewer?.access?.ends_at && <p data-testid="class-access-expiry" className="text-xs text-[#5C7355]">{c.viewer.access.source === "one_time" ? "Class ticket" : "Subscription"} · valid until {new Date(c.viewer.access.ends_at).toLocaleString()}</p>}
          <button
            onClick={book}
            disabled={busy || !!booking || (!!user && !c.viewer?.can_book)}
            data-testid="class-book"
            className={`pill w-full ${booking ? "pill-ghost" : "pill-primary"}`}
          >
            {busy ? "Booking…" : booking?.status === "confirmed" ? "You're booked ✓" : booking?.status === "waitlist" ? "On waitlist" : spotsLeft === 0 ? "Join waitlist" : "Book class"}
          </button>
        </>}
      </div>
    </div>
  );
}
