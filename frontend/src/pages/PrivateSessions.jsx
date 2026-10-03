import { useCommerceRefresh } from "@/lib/useCommerceRefresh";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { User, Video, Clock, Check, ArrowRight, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import PageHeader from "@/components/PageHeader";
import Spinner from "@/components/Spinner";
import PaymentButtons from "@/components/PaymentButtons";

import { contentImageUrl } from "@/components/ContentImageInput";
import { PrivateSlotPicker } from "@/components/PrivateSlotPicker";


const STATUS_LABEL = {
  paid: "Paid — Tony will schedule your times",
  scheduled: "Scheduled",
  completed: "Completed",
  pending_payment: "Awaiting payment",
};

export default function PrivateSessions() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState("view");
  const [form, setForm] = useState({ sessions: 1, focus_area: "", preferred_time: "", notes: "" });
  const [reqId, setReqId] = useState(null);
  const [mine, setMine] = useState(null);
  const [priceEach, setPriceEach] = useState(120);
  const [durationMin, setDurationMin] = useState(60);
  const [heroImg, setHeroImg] = useState("");
  const [packages, setPackages] = useState([]);
  const [selectedSlots, setSelectedSlots] = useState([]);
  const [slotRefresh, setSlotRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [hold, setHold] = useState(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  useCommerceRefresh(() => loadMine());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);

  useEffect(() => {
    api.get("/settings/public").then(({ data }) => {
      if (data?.private_session_price != null && Number(data.private_session_price) > 0) setPriceEach(Number(data.private_session_price));
      if (data?.private_session_duration_min) setDurationMin(Number(data.private_session_duration_min));
      if (data?.private_session_image) setHeroImg(data.private_session_image);
      if (Array.isArray(data?.private_session_packages)) setPackages(data.private_session_packages);
    }).catch(() => {});
  }, []);

  const loadMine = () => {
    if (!user) { setMine([]); return; }
    api.get("/private-sessions/mine").then(({ data }) => setMine(data || [])).catch(() => setMine([]));
  };
  useEffect(() => { loadMine(); /* eslint-disable-next-line */ }, [user]);

  const pkgFor = (n) => packages.find((p) => Number(p.sessions) === Number(n));
  const priceFor = (n) => { const p = pkgFor(n); return p ? Number(p.price) : priceEach * n; };
  const options = Array.from(new Set([1, 2, 3, ...packages.map((p) => Number(p.sessions))]))
    .filter((n) => n > 0).sort((a, b) => a - b);
  const total = priceFor(form.sessions);

  const holdExpired = hold && new Date(hold.hold_until).getTime() <= now;
  const backToSlots = async () => {
    setBusy(true);
    try {
      if (reqId) await api.post(`/private-sessions/${reqId}/release`);
      setStep("view"); setReqId(null); setHold(null); setSelectedSlots([]); setSlotRefresh((n) => n + 1);
    } catch (e) { setError(e?.response?.data?.detail || "Could not release the openings."); }
    finally { setBusy(false); }
  };

  const startBooking = async () => {
    if (!user) { toast("Sign in to book a private session."); nav("/login"); return; }
    setBusy(true); setError("");
    try {
      const { data } = await api.post("/private-sessions/request", {
        sessions: form.sessions,
        focus_area: form.focus_area,
        notes: form.notes,
        preferred_time: form.preferred_time,
        slot_ids: selectedSlots.map((s) => s.id),
      });
      setReqId(data.id);
      setHold(data);
      setStep("pay");
    } catch (e) {
      setError(typeof e?.response?.data?.detail === "string" ? e.response.data.detail : "Could not start booking");
      setSelectedSlots([]); setSlotRefresh((n) => n + 1);
    } finally { setBusy(false); }
  };

  return (
    <div data-testid="private-sessions-page" className="pb-8">
      <PageHeader eyebrow="1:1 with Tony" title="Private sessions" back testId="private-sessions-header" />

      <div className="mx-auto max-w-2xl px-5 space-y-6">
        <div className="rounded-3xl bg-[#1C221F] text-[#FAFAF7] p-6 sm:p-8 overflow-hidden">
          {heroImg && (
            <div className="mb-5 -mx-6 -mt-6 sm:-mx-8 sm:-mt-8 aspect-[16/7] overflow-hidden">
              <img src={contentImageUrl(heroImg)} alt="Private session with Tony" data-testid="private-hero-image" className="h-full w-full object-cover" />
            </div>
          )}
          <div className="eyebrow !text-[#E0A38F] mb-2">Personal guidance</div>
          <h2 className="serif text-2xl sm:text-3xl leading-tight">One-to-one practice, built around you.</h2>
          <p className="text-white/70 text-sm leading-relaxed mt-3">
            Work directly with Tony over Zoom — posture refinement, breath, and a plan for your body.
            Choose a single session or a package, with times reserved from Tony’s available openings.
          </p>
          <div className="flex items-baseline gap-2 mt-5">
            <span className="serif text-4xl" data-testid="private-price-each">€{priceEach}</span>
            <span className="text-sm text-white/60">per session · {durationMin} min · live on Zoom</span>
          </div>
        </div>

        {step === "view" && (
          <div className="rounded-3xl bg-white border border-[#E5E6DF] p-6 space-y-5" data-testid="private-booking-form">
            <div>
              <div className="eyebrow mb-2">Choose your sessions</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {options.map((n) => {
                  const pkg = pkgFor(n);
                  const listPrice = priceEach * n;
                  const price = priceFor(n);
                  const saving = pkg ? Math.round(listPrice - price) : 0;
                  return (
                    <button key={n} type="button" onClick={() => { setForm({ ...form, sessions: n }); setSelectedSlots((s) => s.slice(0, n)); }}
                      data-testid={`private-count-${n}`}
                      className={`relative rounded-2xl border p-4 text-center transition ${form.sessions === n ? "border-[#B25A45] bg-[#FBF1EE]" : "border-[#E5E6DF] hover:border-[#D8D9CF]"}`}>
                      {pkg?.label && <span className="block break-words text-[9px] font-bold uppercase text-[#B25A45] mb-1">{pkg.label}</span>}
                      <div className="serif text-2xl">{n}</div>
                      <div className="text-[11px] text-[#6B7269] mt-0.5">session{n > 1 ? "s" : ""}</div>
                      <div className="text-[11px] font-semibold text-[#B25A45] mt-1">€{Math.round(price)}</div>
                      {saving > 0 && <div className="text-[10px] text-[#5C7355] font-semibold">save €{saving}</div>}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="block">
              <span className="eyebrow">What would you like to focus on?</span>
              <input data-testid="private-focus" value={form.focus_area} onChange={(e) => setForm({ ...form, focus_area: e.target.value })}
                placeholder="e.g. backbends, breath, recovering from injury"
                className="mt-1.5 w-full rounded-2xl border border-[#E5E6DF] px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#B25A45]" />
            </label>

            <PrivateSlotPicker selected={selectedSlots} onChange={setSelectedSlots} count={form.sessions} refreshKey={slotRefresh} />

            <label className="block">
              <span className="eyebrow">Anything else for Tony? (optional)</span>
              <textarea rows={2} data-testid="private-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Injuries, goals, experience level…"
                className="mt-1.5 w-full rounded-2xl border border-[#E5E6DF] px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#B25A45]" />
            </label>

            {error && <p role="alert" data-testid="private-booking-error" className="text-sm text-[#B25A45]">{error}</p>}
            <button onClick={startBooking} disabled={busy || selectedSlots.length !== form.sessions} data-testid="private-continue" className="pill pill-primary w-full !py-3.5 disabled:opacity-50">
              {busy ? "Reserving…" : `Continue to payment · €${total}`} <ArrowRight className="h-4 w-4" />
            </button>
            <p className="text-[11px] text-[#6B7269] text-center" data-testid="private-hold-policy">Openings are held for 35 minutes during checkout. Zoom links follow after confirmation.</p>
          </div>
        )}

        {step === "pay" && (
          <div className="rounded-3xl bg-white border border-[#E5E6DF] p-6 space-y-4" data-testid="private-pay">
            <div className="rounded-2xl bg-[#F2F2EC] p-4 text-sm text-[#545E56]">
              <div className="flex items-center justify-between">
                <span>{form.sessions} private session{form.sessions > 1 ? "s" : ""} with Tony</span>
                <strong data-testid="private-pay-total" className="text-[#1C221F]">€{hold?.amount_eur}</strong>
              </div>
              {form.focus_area && <div className="text-xs text-[#6B7269] mt-2">Focus: {form.focus_area}</div>}
            </div>
            <p data-testid="private-hold-status" className={`text-xs ${holdExpired ? "text-[#B25A45]" : "text-[#5C7355]"}`}>{holdExpired ? "Your hold expired. Please choose openings again." : `Reserved until ${new Date(hold.hold_until).toLocaleTimeString()}`}</p>
            <ul className="space-y-1 text-xs text-[#545E56]" data-testid="private-reserved-times">{(hold?.selected_slots || []).map((s) => <li key={s.id} data-testid={`private-reserved-${s.id}`}>{new Date(s.start_time).toLocaleString()} · {s.duration_minutes} min</li>)}</ul>
            <PaymentButtons
              disabled={holdExpired || busy}
              itemType="private_session"
              itemId={reqId}
              quantity={form.sessions}
              metadata={{ focus_area: form.focus_area.slice(0, 400), notes: form.notes.slice(0, 400), preferred_time: form.preferred_time.slice(0, 120) }}
              stripeLabel={`Pay €${hold?.amount_eur}`}
              testIdPrefix="private-pay"
              size="lg"
            />
            {error && <p data-testid="private-pay-error" role="alert" className="text-sm text-[#B25A45]">{error}</p>}
            <button type="button" disabled={busy} data-testid="private-back-to-slots" onClick={backToSlots} className="text-center w-full text-sm text-[#6B7269] py-1">← Choose different times</button>
          </div>
        )}

        {/* My sessions */}
        {user && (
          <div data-testid="private-mine">
            <div className="eyebrow mb-2">Your private sessions</div>
            {mine === null ? <Spinner /> : mine.length === 0 ? (
              <p className="text-sm text-[#6B7269] rounded-2xl bg-[#F2F2EC] p-5">No private sessions yet — book your first above.</p>
            ) : (
              <ul className="space-y-3">
                {mine.map((r) => (
                  <li key={r.id} className="rounded-2xl bg-white border border-[#E5E6DF] p-4" data-testid={`private-mine-${r.id}`}>
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold">{r.sessions_total} session{r.sessions_total > 1 ? "s" : ""}{r.focus_area ? ` · ${r.focus_area}` : ""}</div>
                      <span className="text-[11px] font-semibold rounded-full px-2.5 py-1 bg-[#EEF1EC] text-[#5C7355]">{STATUS_LABEL[r.status] || r.status}</span>
                    </div>
                    {!!r.slot_conflicts?.length && <p data-testid={`private-slot-conflict-${r.id}`} className="text-xs text-[#B25A45] mt-2">Payment received after the hold ended. Tony will arrange replacement times; your paid sessions are محفوظ.</p>}
                    {!!r.selected_slots?.length && <ul data-testid={`private-booked-openings-${r.id}`} className="text-xs text-[#545E56] mt-2 space-y-1">{r.selected_slots.map((s) => <li key={s.id} data-testid={`private-booked-opening-${s.id}`}>{new Date(s.start_time).toLocaleString()} · {s.duration_minutes} min</li>)}</ul>}
                    {(r.sessions || []).length > 0 && (
                      <ul className="mt-3 space-y-2">
                        {r.sessions.map((s) => (
                          <li key={s.session_id} className="flex items-center justify-between gap-3 rounded-xl bg-[#FAFAF7] border border-[#E5E6DF] px-3 py-2">
                            <div className="flex items-center gap-2 text-sm text-[#1C221F]">
                              <Clock className="h-4 w-4 text-[#B25A45]" />
                              {String(s.start_time).slice(0, 16).replace("T", " ")} UTC
                            </div>
                            {s.join_url && (
                              <a href={s.join_url} target="_blank" rel="noopener noreferrer" data-testid={`private-join-${s.session_id}`}
                                className="pill pill-primary !py-1.5 !px-3 text-xs"><Video className="h-3.5 w-3.5" /> Join Zoom</a>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    {(r.sessions || []).length === 0 && r.status === "paid" && (
                      <p className="text-xs text-[#6B7269] mt-2 flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-[#B25A45]" /> Paid — Tony will schedule your time(s) shortly.</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
