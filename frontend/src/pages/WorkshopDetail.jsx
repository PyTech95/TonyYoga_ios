import { isIOSApp } from "@/lib/iosPlatform";
import { useCommerceRefresh } from "@/lib/useCommerceRefresh";
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Calendar, MapPin, Users, Utensils, ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { isYouTube } from "@/lib/youtube";
import SafeYouTube from "@/components/SafeYouTube";
import PageHeader from "@/components/PageHeader";
import Spinner from "@/components/Spinner";
import HeartButton from "@/components/HeartButton";
import PaymentButtons from "@/components/PaymentButtons";
import { useSeo, SITE_URL } from "@/lib/seo";
import { retreatJsonLd } from "@/seo/seoData.mjs";

function RetreatGallery({ images }) {
  const [i, setI] = useState(0);
  if (!images?.length) return null;
  const go = (d) => setI((prev) => (prev + d + images.length) % images.length);
  return (
    <div data-testid="workshop-gallery">
      <div className="eyebrow mb-2">The villa &amp; practice</div>
      <div className="relative rounded-2xl overflow-hidden bg-[#F2F2EC] aspect-[16/10]">
        {images.map((src, idx) => (
          <img key={idx} src={src} alt="" loading={idx === 0 ? "eager" : "lazy"}
            data-testid={`workshop-gallery-img-${idx}`}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${idx === i ? "opacity-100" : "opacity-0 pointer-events-none"}`} />
        ))}
        {images.length > 1 && (
          <>
            <button type="button" onClick={() => go(-1)} data-testid="workshop-gallery-prev"
              className="absolute left-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-white/85 backdrop-blur flex items-center justify-center text-[#1C221F] shadow hover:bg-white transition">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button type="button" onClick={() => go(1)} data-testid="workshop-gallery-next"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-white/85 backdrop-blur flex items-center justify-center text-[#1C221F] shadow hover:bg-white transition">
              <ChevronRight className="h-5 w-5" />
            </button>
            <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
              {images.map((_, idx) => (
                <button key={idx} type="button" onClick={() => setI(idx)} aria-label={`Photo ${idx + 1}`}
                  data-testid={`workshop-gallery-dot-${idx}`}
                  className={`h-1.5 rounded-full transition-all ${idx === i ? "w-5 bg-white" : "w-1.5 bg-white/60"}`} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StudentVideo({ url }) {
  if (!url) return null;
  return (
    <div data-testid="workshop-student-video">
      <div className="eyebrow mb-2">Hear from our students</div>
      {isYouTube(url) ? <SafeYouTube url={url} title="Student testimonial" rounded="rounded-2xl" testId="workshop-video" /> : (
        <div className="relative rounded-2xl overflow-hidden bg-black aspect-video">
          <iframe src={url} title="Student testimonial" loading="lazy"
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen />
        </div>
      )}
    </div>
  );
}

export default function WorkshopDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [w, setW] = useState(null);
  const [step, setStep] = useState("view");
  const [reservationId, setReservationId] = useState(null);
  const [avail, setAvail] = useState(null);
  const [myReg, setMyReg] = useState(null);
  const [form, setForm] = useState({
    name: user?.name || "",
    email: user?.email || "",
    phone: "",
    yoga_status: "Perpetual Yogi",
    years_of_practice: 0,
    wants_teacher_training: false,
    notes: "",
  });

  useCommerceRefresh(() => { refreshAvail(); if (user) api.get("/retreats/mine").then(({data}) => setMyReg((data || []).find(r => r.workshop_id === id && r.status !== "cancelled") || null)); });
  const refreshAvail = () => api.get(`/retreats/${id}/availability`).then(({ data }) => setAvail(data)).catch(() => {});
  useEffect(() => {
    // Sync reserve form with the auth user once it hydrates (avoids blank name/email).
    if (user) setForm((f) => ({ ...f, name: f.name || user.name || "", email: f.email || user.email || "" }));
  }, [user]);
  useEffect(() => {
    api.get(`/workshops/${id}`).then(({ data }) => setW(data)).catch(() => setW(false));
    refreshAvail();
    if (user) {
      api.get("/retreats/mine").then(({ data }) => {
        setMyReg((data || []).find((r) => r.workshop_id === id && r.status !== "cancelled") || null);
      }).catch(() => {});
    }
  }, [id, user]);

  const joinWaitlist = async () => {
    if (!user) { toast("Sign in to join the waitlist."); nav("/login"); return; }
    try {
      const { data } = await api.post("/retreats/waitlist", { workshop_id: id });
      setMyReg(data);
      toast.success("You're on the waitlist — we'll notify you the moment a seat opens.");
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not join waitlist"); }
  };

  const beforeReservationCheckout = async () => {
    if (!user) { toast("Sign in to reserve."); nav("/login"); return false; }
    if (!form.name || !form.email) { toast.error("Name and email required"); return false; }
    if (reservationId) return { itemId: reservationId };
    try {
      const { data: reg } = await api.post("/retreats/reserve", { workshop_id: id, ...form });
      setReservationId(reg.id);
      return { itemId: reg.id };
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Reservation failed");
      return false;
    }
  };

  useSeo(w ? {
    title: `${w.title} — Yoga Retreat in Málaga, Spain | Tony Yoga`,
    description: ([w.subtitle, w.description].filter(Boolean).join(" ") || w.title).slice(0, 158),
    image: w.cover_image,
    jsonLd: retreatJsonLd(w, SITE_URL),
  } : w === false ? { title: "Retreat not found | Tony Yoga", noindex: true } : null);

  if (w === null) return <><PageHeader back /><Spinner /></>;
  if (w === false) return <><PageHeader back title="Not found" /></>;

  const spotsLeft = avail ? avail.seats_left : Math.max(0, (w.capacity || 14) - (w.registered_count || 0));
  const isFull = avail ? avail.is_full : spotsLeft === 0;
  const myStatus = myReg?.status;
  const offerHoursLeft = myReg?.seat_offer_expires_at
    ? Math.max(0, Math.ceil((new Date(myReg.seat_offer_expires_at) - Date.now()) / 3600000))
    : null;

  return (
    <div data-testid="workshop-detail" className="pb-6">
      {w.cover_image && (
        <div className="relative h-72 overflow-hidden">
          <img src={w.cover_image} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#1C221F]/40 to-[#FAFAF7]" />
        </div>
      )}
      <PageHeader eyebrow={w.system} title={w.title} back testId="workshop-detail-header" action={<HeartButton targetType="workshop" targetId={w.id} />} />

      <div className="mx-auto max-w-2xl px-5 space-y-5">
        {step === "view" && (
          <>
            {w.subtitle && <p className="serif text-lg text-[#545E56] italic leading-relaxed">{w.subtitle}</p>}
            <p className="text-[15px] text-[#545E56] leading-relaxed">{w.description}</p>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white border border-[#E5E6DF] p-4">
                <Calendar className="h-4 w-4 text-[#B25A45] mb-2" />
                <div className="eyebrow !text-[10px]">Dates</div>
                <div className="text-sm mt-1 font-semibold">{new Date(w.start_date).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</div>
              </div>
              <div className="rounded-2xl bg-white border border-[#E5E6DF] p-4">
                <MapPin className="h-4 w-4 text-[#B25A45] mb-2" />
                <div className="eyebrow !text-[10px]">Where</div>
                <div className="text-sm mt-1 font-semibold clamp-2">{w.location}</div>
              </div>
              <div className="rounded-2xl bg-white border border-[#E5E6DF] p-4">
                <Users className="h-4 w-4 text-[#B25A45] mb-2" />
                <div className="eyebrow !text-[10px]">Capacity</div>
                <div className="text-sm mt-1 font-semibold" data-testid="workshop-spots-left">{spotsLeft} of {w.capacity} spots</div>
              </div>
              <div className="rounded-2xl bg-white border border-[#E5E6DF] p-4">
                <Utensils className="h-4 w-4 text-[#B25A45] mb-2" />
                <div className="eyebrow !text-[10px]">Included</div>
                <div className="text-sm mt-1 font-semibold">{w.nights} nights · {w.meals_included ? "meals" : ""}</div>
              </div>
            </div>

            <RetreatGallery images={w.gallery} />
            <StudentVideo url={w.student_video_url} />

            <div className="rounded-3xl bg-[#1C221F] text-[#FAFAF7] p-6">
              <div className="eyebrow !text-[#B25A45] mb-2">Reserve your seat</div>
              <div className="flex items-baseline gap-3">
                <span className="serif text-4xl" data-testid="workshop-full-price">€{Math.round(w.price_eur)}</span>
                <span className="text-sm text-white/60">full price</span>
              </div>
              <p className="text-xs text-white/60 mt-2" data-testid="workshop-deposit-note">
                Reserve today with a <strong className="text-white/90">€{w.deposit_eur ?? 500} deposit</strong> · balance of €{Math.round(w.price_eur - (w.deposit_eur ?? 500))} due 30 days before start.
              </p>
              {myStatus === "waitlisted" ? (
                <div data-testid="workshop-waitlisted-note" className="mt-5 rounded-2xl bg-white/10 px-4 py-3 text-sm text-white/80">
                  You're <strong>#{myReg.waitlist_position}</strong> on the waitlist. We'll email &amp; notify you the moment a seat opens.
                </div>
              ) : myStatus === "seat_offered" ? (
                <button onClick={() => setStep("form")} data-testid="workshop-claim-seat-btn" className="pill !bg-[#B25A45] !text-white w-full mt-5">
                  🎉 A seat opened — reserve now{offerHoursLeft != null ? ` (${offerHoursLeft}h left)` : ""} <ArrowRight className="h-4 w-4" />
                </button>
              ) : isFull ? (
                <button onClick={joinWaitlist} data-testid="workshop-join-waitlist-btn" className="pill !bg-white/15 !text-white w-full mt-5">
                  Full — join the waitlist{avail?.waitlist_count ? ` (${avail.waitlist_count} waiting)` : ""}
                </button>
              ) : (
                <button onClick={() => setStep("form")} data-testid="workshop-reserve-btn" className="pill !bg-[#B25A45] !text-white w-full mt-5">
                  Reserve with €{w.deposit_eur ?? 500} deposit <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </>
        )}

        {step === "form" && (
          <div className="space-y-3" data-testid="workshop-reserve-form">
            <div className="rounded-2xl bg-[#F2F2EC] p-4 text-xs text-[#545E56] leading-relaxed">
              You'll pay €{w.deposit_eur ?? 500} now. Balance of <strong>€{Math.round(w.price_eur - (w.deposit_eur ?? 500))}</strong> is due 30 days before the retreat starts. Fully refundable up to 60 days out.
            </div>
            <input required data-testid="reserve-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" className="w-full rounded-2xl border border-[#E5E6DF] px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#B25A45]" />
            <input required type="email" data-testid="reserve-email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" className="w-full rounded-2xl border border-[#E5E6DF] px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#B25A45]" />
            <input data-testid="reserve-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone (optional)" className="w-full rounded-2xl border border-[#E5E6DF] px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#B25A45]" />
            <div className="grid grid-cols-2 gap-3">
              <select data-testid="reserve-status" value={form.yoga_status} onChange={(e) => setForm({ ...form, yoga_status: e.target.value })} className="w-full rounded-2xl border border-[#E5E6DF] px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#B25A45]">
                <option>Perpetual Yogi</option>
                <option>Instructor</option>
                <option>Aspiring Instructor</option>
              </select>
              <input type="number" min="0" max="80" data-testid="reserve-years" value={form.years_of_practice} onChange={(e) => setForm({ ...form, years_of_practice: parseInt(e.target.value || "0") })} placeholder="Years of practice" className="w-full rounded-2xl border border-[#E5E6DF] px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#B25A45]" />
            </div>
            {!isIOSApp() && w.teacher_training_price_eur && (
              <label className="flex items-center gap-3 rounded-2xl bg-white border border-[#E5E6DF] p-3">
                <input type="checkbox" data-testid="reserve-tt" checked={form.wants_teacher_training} onChange={(e) => setForm({ ...form, wants_teacher_training: e.target.checked })} />
                <span className="text-sm">Add teacher training (+€{Math.round(w.teacher_training_price_eur)})</span>
              </label>
            )}
            <textarea rows={2} data-testid="reserve-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Anything Tony should know?" className="w-full rounded-2xl border border-[#E5E6DF] px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#B25A45]" />

            <PaymentButtons
              itemType="workshop_deposit"
              quoteItemId={id}
              itemId={reservationId || "pending"}
              stripeLabel={`Pay €${w.deposit_eur ?? 500} deposit`}
              onBeforeCheckout={beforeReservationCheckout}
              testIdPrefix="reserve-pay"
              size="lg"
            />
            <button type="button" onClick={() => setStep("view")} className="text-center w-full text-sm text-[#6B7269] py-2">← Back</button>
          </div>
        )}
      </div>
    </div>
  );
}
