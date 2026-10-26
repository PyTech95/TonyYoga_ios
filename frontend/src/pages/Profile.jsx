import { useCommerceRefresh } from "@/lib/useCommerceRefresh";
import { isIOSApp } from "@/lib/iosPlatform";
import IOSPurchaseSettings from "@/components/IOSPurchaseSettings";
import PaymentButtons from "@/components/PaymentButtons";
import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { LogOut, User as UserIcon, Sparkles, ShoppingBag, GraduationCap, Gift, Shield, Flame, MountainSnow, Ticket, Heart, Trophy, BookOpen, Download, Trash2, AlertTriangle, RotateCcw } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { usePaymentProviders } from "@/lib/providers";
import { checkoutContext, markExternalCheckout } from "@/lib/platform";
import PageHeader from "@/components/PageHeader";
import Spinner from "@/components/Spinner";
import PushToggle from "@/components/PushToggle";
import { MyAccess } from "@/components/MyAccess";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";

function formatWhen(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) + " · " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function Profile() {
  const { user, logout, refresh } = useAuth();
  const nav = useNavigate();
  const [bookings, setBookings] = useState(null);
  const [sub, setSub] = useState(null);
  const [retreats, setRetreats] = useState([]);
  const [payBusy, setPayBusy] = useState(null);
  const [credit, setCredit] = useState(0);
  const [gcCode, setGcCode] = useState("");
  const [gcBusy, setGcBusy] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [downloads, setDownloads] = useState([]);
  const [delOpen, setDelOpen] = useState(false);
  const [delPassword, setDelPassword] = useState("");
  const [delReason, setDelReason] = useState("");
  const [delBusy, setDelBusy] = useState(false);
  const [delScheduledAt, setDelScheduledAt] = useState(null);
  const { paypal: paypalAvailable } = usePaymentProviders();

  const refundPreview = (r) => {
    const days = Math.ceil((new Date(r.workshop_start_date) - Date.now()) / 86400000);
    const paid = ["deposit_paid", "paid_in_full"].includes(r.status);
    return { days, refundable: days >= 60, paid };
  };

  const cancelRetreat = async (r) => {
    setCancelBusy(true);
    try {
      const { data } = await api.post(`/retreats/${r.id}/cancel`);
      setRetreats((rs) => rs.map((x) => x.id === r.id ? { ...x, status: "cancelled", refund_status: data.refund_status } : x));
      toast.success(data.message || "Reservation cancelled");
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not cancel"); }
    finally { setCancelBusy(false); setCancelTarget(null); }
  };

  const loadProfile = async () => {
      api.get("/me/account/status").then(({ data }) => setDelScheduledAt(data?.deletion_scheduled_at || null)).catch(() => {});
      try {
        const [b, s, r, c] = await Promise.all([
          api.get("/bookings/mine"),
          api.get("/subscriptions/mine").catch(() => ({ data: null })),
          api.get("/retreats/mine").catch(() => ({ data: [] })),
          api.get("/me/store-credit").catch(() => ({ data: { store_credit: 0 } })),
        ]);
        setBookings(b.data);
        setSub(s.data);
        setRetreats(r.data || []);
        setCredit(c.data?.store_credit || 0);
        api.get("/me/downloads").then(({ data }) => setDownloads(data || [])).catch(() => setDownloads([]));
      } catch { setBookings([]); }
  };
  useEffect(() => { loadProfile(); }, []);
  useCommerceRefresh(loadProfile);

  const requestDeletion = async () => {
    setDelBusy(true);
    try {
      const { data } = await api.delete("/me/account", { data: { password: delPassword || null, reason: delReason || null } });
      setDelScheduledAt(data?.deletion_scheduled_at || null);
      await refresh();
      setDelOpen(false); setDelPassword(""); setDelReason("");
      toast.success("Account scheduled for deletion. You can cancel within 30 days.");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not delete account");
    } finally { setDelBusy(false); }
  };

  const cancelDeletion = async () => {
    setDelBusy(true);
    try {
      await api.post("/me/account/cancel-deletion");
      setDelScheduledAt(null);
      await refresh();
      loadProfile();
      toast.success("Welcome back — your account is active again.");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not cancel");
    } finally { setDelBusy(false); }
  };

  const redeemGift = async () => {
    if (!gcCode.trim()) return toast.error("Enter a gift card code.");
    setGcBusy(true);
    try {
      const { data } = await api.post("/gift-cards/redeem", { code: gcCode.trim() });
      setCredit(data.store_credit);
      setGcCode("");
      toast.success(`Redeemed €${data.redeemed} · added to your store credit`);
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not redeem this code"); }
    finally { setGcBusy(false); }
  };

  const payBalance = async (r) => {
    setPayBusy(r.id);
    try {
      // PayPal is the primary method sitewide; fall back to card (Stripe) if not configured.
      const endpoint = paypalAvailable ? "/paypal/create-order" : "/checkout/session";
      const { data } = await api.post(endpoint, {
        item_type: "workshop_balance",
        item_id: r.id,
        ...checkoutContext(),
      });
      if (data?.url) { markExternalCheckout(); window.location.href = data.url; }
      else toast.error("Could not start balance checkout");
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
    finally { setPayBusy(null); }
  };

  const cancel = async (id) => {
    try {
      await api.delete(`/bookings/${id}`);
      setBookings((bs) => bs.map((b) => b.id === id ? { ...b, status: "cancelled" } : b));
      toast.success("Booking cancelled");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not cancel");
    }
  };

  const handleLogout = async () => {
    await logout();
    toast.success("See you on the mat.");
    nav("/");
  };

  return (
    <div data-testid="profile-page">
      <PageHeader eyebrow="Your practice" title="Profile" testId="profile-header" />

      <div className="mx-auto max-w-2xl px-5 space-y-6">
        {/* User card */}
        <div className="rounded-3xl bg-white border border-[#E5E6DF] p-6 flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-[#F2F2EC] flex items-center justify-center">
            {user?.photo_url ? (
              <img src={user.photo_url} alt="" className="h-full w-full rounded-full object-cover" />
            ) : (
              <UserIcon className="h-6 w-6 text-[#B25A45]" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="serif text-xl leading-tight" data-testid="profile-name">{user?.name || "Yogi"}</div>
            <div className="text-xs text-[#6B7269] truncate" data-testid="profile-email">{user?.email}</div>
            <div className="mt-1 inline-block text-[10px] uppercase tracking-widest text-[#B25A45] font-semibold">
              {user?.role === "admin" ? "Instructor / Admin" : sub ? "Member" : "Student"}
            </div>
          </div>
        </div>

        {/* Bookings */}
        <MyAccess />
        <section>
          <div className="eyebrow mb-3">Your bookings</div>
          {bookings === null ? <Spinner /> : bookings.length === 0 ? (
            <p className="text-sm text-[#6B7269] rounded-2xl bg-[#F2F2EC] p-5">No bookings yet. Try a class →</p>
          ) : (
            <ul className="space-y-2" data-testid="profile-bookings">
              {bookings.map((b) => (
                <li key={b.id} className="rounded-2xl bg-white border border-[#E5E6DF] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-semibold truncate">{b.class?.title || "Class"}</div>
                      <div className="text-xs text-[#6B7269] mt-0.5">{b.class ? formatWhen(b.class.start_time) : ""}</div>
                      <Link data-testid={`profile-class-${b.id}`} to={`/schedule/${b.class_instance_id}`} className="text-xs text-[#B25A45] hover:underline">View class →</Link>
                      <div className="text-[10px] uppercase tracking-widest mt-1.5 font-semibold" style={{ color: b.status === "confirmed" ? "#839682" : b.status === "waitlist" ? "#B25A45" : "#6B7269" }}>
                        {b.status}
                      </div>
                    </div>
                    {b.status !== "cancelled" && (
                      <button
                        onClick={() => cancel(b.id)}
                        data-testid={`profile-cancel-${b.id}`}
                        className="text-xs text-[#B25A45] hover:underline shrink-0"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Reminders */}
        <PushToggle />

        {/* Gift card / store credit */}
        {!isIOSApp() && (<section data-testid="gift-card-section" className="rounded-3xl bg-white border border-[#E5E6DF] p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Gift className="h-4 w-4 text-[#B25A45]" />
              <span className="text-sm font-semibold text-[#1C221F]">Gift cards & credit</span>
            </div>
            <span data-testid="store-credit-balance" className="text-sm font-bold text-[#B25A45]">€{credit.toFixed(2)}</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              data-testid="gift-card-input"
              value={gcCode}
              onChange={(e) => setGcCode(e.target.value.toUpperCase())}
              placeholder="GIFT-XXXXXXXX"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-xl border border-[#E5E6DF] bg-[#FAFAF7] px-3 py-2 text-sm tracking-wide focus:outline-none focus:border-[#B25A45]"
            />
            <button onClick={redeemGift} disabled={gcBusy} data-testid="gift-card-redeem" className="pill pill-primary !py-2 !px-4 !text-xs shrink-0">
              {gcBusy ? "…" : "Redeem"}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-[#9AA096]">Redeem a gift card to add store credit to your account.</p>
          {credit > 0 && (
            <Link to="/shop" data-testid="profile-credit-apply" className="mt-3 flex items-center justify-between rounded-2xl bg-[#FBF6EC] border border-[#E0D3B8] px-4 py-2.5 hover:bg-[#F5EDDD] transition-colors">
              <span className="text-[13px] text-[#5C5346]">Your <span className="font-bold text-[#1C221F]">€{credit.toFixed(2)}</span> is ready — apply it at checkout</span>
              <span className="text-[13px] font-semibold text-[#B25A45]">Shop →</span>
            </Link>
          )}
        </section>)}

        {/* Digital library — purchased eBooks */}
        {downloads.length > 0 && (
          <section data-testid="profile-downloads" className="rounded-3xl bg-white border border-[#E5E6DF] p-5">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="h-4 w-4 text-[#B25A45]" />
              <span className="text-sm font-semibold text-[#1C221F]">My library</span>
            </div>
            <ul className="space-y-2">
              {downloads.map((d) => (
                <li key={d.product_id} data-testid={`download-${d.product_id}`} className="flex items-center gap-3 rounded-2xl bg-[#F7F2EC] border border-[#E7D9CB] p-2.5">
                  <div className="h-14 w-11 shrink-0 rounded-md overflow-hidden bg-white">
                    {d.images?.[0] && <img src={d.images[0]} alt="" className="h-full w-full object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-[#1C221F] leading-tight line-clamp-2">{d.title}</div>
                    {d.author && <div className="text-[11px] text-[#9AA096]">by {d.author}</div>}
                  </div>
                  <a href={d.ebook_file_url} target="_blank" rel="noopener noreferrer" download data-testid={`download-btn-${d.product_id}`} className="pill pill-primary !py-2 !px-3.5 !text-xs shrink-0">
                    <Download className="h-3.5 w-3.5" /> Download
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Retreats */}
        {retreats.length > 0 && (
          <section data-testid="profile-retreats">
            <div className="eyebrow mb-3">Your retreats</div>
            <ul className="space-y-2">
              {retreats.map((r) => (
                <li key={r.id} className="rounded-2xl bg-white border border-[#E5E6DF] p-4">
                  <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-full bg-[#F2F2EC] flex items-center justify-center shrink-0">
                      <MountainSnow className="h-4 w-4 text-[#B25A45]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-semibold truncate">{r.workshop_title}</div>
                      <div className="text-xs text-[#6B7269] mt-0.5">{new Date(r.workshop_start_date).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</div>
                      <div className="text-[10px] uppercase tracking-widest mt-1.5 font-semibold" style={{ color: r.status === "cancelled" ? "#9AA096" : r.status === "paid_in_full" ? "#839682" : r.status === "deposit_paid" ? "#B25A45" : "#6B7269" }}>
                        {r.status === "cancelled"
                          ? `Cancelled${r.refund_status === "refund_pending" ? " · refund pending" : r.refund_status === "non_refundable" ? " · non-refundable" : ""}`
                          : r.status === "paid_in_full" ? "Paid in full"
                          : r.status === "deposit_paid" ? `Deposit paid · balance €${Math.round(r.balance_eur)} due ${new Date(r.balance_due_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
                          : `Pending deposit €${Math.round(r.deposit_eur)}`}
                      </div>
                    </div>
                    {r.status === "deposit_paid" && (isIOSApp() ? (
                      <PaymentButtons itemType="workshop_balance" itemId={r.id} testIdPrefix={`retreat-balance-${r.id}`} />
                    ) : (
                      <button
                        onClick={() => payBalance(r)}
                        disabled={payBusy === r.id}
                        data-testid={`retreat-pay-balance-${r.id}`}
                        className="pill pill-primary !py-1.5 !px-3 !text-xs shrink-0"
                      >
                        {payBusy === r.id ? "…" : `Pay €${Math.round(r.balance_eur)}`}
                      </button>
                    ))}
                  </div>
                  {!["cancelled", "waitlisted", "seat_offered"].includes(r.status) && (
                    <button
                      onClick={() => setCancelTarget(r)}
                      data-testid={`retreat-cancel-${r.id}`}
                      className="mt-3 text-xs font-semibold text-[#B25A45] hover:underline"
                    >
                      Cancel reservation
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Cancel + refund policy dialog */}
        <AlertDialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
          <AlertDialogContent data-testid="retreat-cancel-dialog">
            {cancelTarget && (() => {
              const { days, refundable, paid } = refundPreview(cancelTarget);
              return (
                <>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancel {cancelTarget.workshop_title}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      <span className="block mb-2">Your retreat starts in <strong>{days} day{days === 1 ? "" : "s"}</strong>.</span>
                      {paid ? (
                        refundable ? (
                          <span className="block rounded-xl bg-[#EEF1EC] text-[#5C7355] px-3 py-2" data-testid="refund-note-refundable">
                            You're cancelling more than 60 days out — your deposit is <strong>fully refundable</strong>. Tony will process the refund to your original payment method.
                          </span>
                        ) : (
                          <span className="block rounded-xl bg-[#F7ECE8] text-[#B25A45] px-3 py-2" data-testid="refund-note-nonrefundable">
                            You're within 60 days of the start — per policy the deposit is <strong>non-refundable</strong>. Your seat will be released to the waitlist.
                          </span>
                        )
                      ) : (
                        <span className="block rounded-xl bg-[#F2F2EC] text-[#6B7269] px-3 py-2">
                          No payment has been taken yet — cancelling simply releases your seat.
                        </span>
                      )}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel data-testid="retreat-cancel-dismiss">Keep my seat</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => cancelRetreat(cancelTarget)}
                      disabled={cancelBusy}
                      data-testid="retreat-cancel-confirm"
                      className="!bg-[#B25A45]"
                    >
                      {cancelBusy ? "Cancelling…" : "Cancel reservation"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </>
              );
            })()}
          </AlertDialogContent>
        </AlertDialog>

        {/* Links */}
        <section className="grid grid-cols-2 gap-3">
          <Link to="/streak" data-testid="profile-link-streak" className="rounded-2xl bg-white border border-[#E5E6DF] p-4 hover:border-[#B25A45] transition">
            <Flame className="h-5 w-5 text-[#B25A45] mb-2" />
            <div className="text-sm font-semibold">Practice streak</div>
          </Link>
          <Link to="/leaderboard" data-testid="profile-link-leaderboard" className="rounded-2xl bg-white border border-[#E5E6DF] p-4 hover:border-[#B25A45] transition">
            <Trophy className="h-5 w-5 text-[#B25A45] mb-2" />
            <div className="text-sm font-semibold">Leaderboard</div>
          </Link>
          <Link to="/wishlist" data-testid="profile-link-wishlist" className="rounded-2xl bg-white border border-[#E5E6DF] p-4 hover:border-[#B25A45] transition">
            <Heart className="h-5 w-5 text-[#B25A45] mb-2" />
            <div className="text-sm font-semibold">Wishlist</div>
          </Link>
          <Link to="/passes" data-testid="profile-link-passes" className="rounded-2xl bg-white border border-[#E5E6DF] p-4 hover:border-[#B25A45] transition">
            <Ticket className="h-5 w-5 text-[#B25A45] mb-2" />
            <div className="text-sm font-semibold">Class passes</div>
          </Link>
          <Link to="/memberships" data-testid="profile-link-memberships" className="rounded-2xl bg-white border border-[#E5E6DF] p-4 hover:border-[#B25A45] transition">
            <Sparkles className="h-5 w-5 text-[#B25A45] mb-2" />
            <div className="text-sm font-semibold">Memberships</div>
          </Link>
          {!isIOSApp() && (<Link to="/referrals" data-testid="profile-link-referrals" className="rounded-2xl bg-white border border-[#E5E6DF] p-4 hover:border-[#B25A45] transition">
            <Gift className="h-5 w-5 text-[#B25A45] mb-2" />
            <div className="text-sm font-semibold">Invite a friend</div>
          </Link>)}
          <Link to="/shop" data-testid="profile-link-shop" className="rounded-2xl bg-white border border-[#E5E6DF] p-4 hover:border-[#B25A45] transition">
            <ShoppingBag className="h-5 w-5 text-[#B25A45] mb-2" />
            <div className="text-sm font-semibold">Shop</div>
          </Link>
          <Link to="/workshops" data-testid="profile-link-workshops" className="rounded-2xl bg-white border border-[#E5E6DF] p-4 hover:border-[#B25A45] transition">
            <GraduationCap className="h-5 w-5 text-[#B25A45] mb-2" />
            <div className="text-sm font-semibold">Retreats</div>
          </Link>
          {(user?.role === "instructor" || user?.role === "admin") && (
            <Link to="/instructor" data-testid="profile-link-instructor" className="rounded-2xl bg-white border border-[#E5E6DF] p-4 hover:border-[#B25A45] transition">
              <GraduationCap className="h-5 w-5 text-[#B25A45] mb-2" />
              <div className="text-sm font-semibold">Instructor studio</div>
              <div className="text-[11px] text-[#6B7269] mt-0.5">Earnings & your classes</div>
            </Link>
          )}
          {user?.role === "admin" && (
            <Link to="/admin" data-testid="profile-link-admin" className="rounded-2xl bg-[#1C221F] text-[#FAFAF7] p-4 hover:opacity-90 transition">
              <Shield className="h-5 w-5 text-[#B25A45] mb-2" />
              <div className="text-sm font-semibold">Admin console</div>
              <div className="text-[11px] text-white/60 mt-0.5">Manage everything</div>
            </Link>
          )}
        </section>

        <IOSPurchaseSettings />

        {/* Danger zone — account deletion (GDPR / store compliance) */}
        <section data-testid="profile-danger-zone" className="rounded-3xl bg-white border border-[#EED9D2] p-6">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-[#B25A45]" />
            <h3 className="serif text-lg text-[#1C221F]">Delete account</h3>
          </div>
          {delScheduledAt ? (
            <div data-testid="deletion-scheduled-banner">
              <p className="text-sm text-[#6B7269]">
                {"Your account is scheduled for permanent deletion on "}
                <strong className="text-[#1C221F]">{new Date(delScheduledAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</strong>
                {". You can cancel any time before then."}
              </p>
              <button onClick={cancelDeletion} disabled={delBusy} data-testid="cancel-deletion-btn"
                className="pill pill-primary mt-4 disabled:opacity-60">
                <RotateCcw className="h-4 w-4" /> Cancel deletion
              </button>
            </div>
          ) : (
            <div>
              <p className="text-sm text-[#6B7269]">
                Permanently delete your account and personal data. Your account is deactivated
                immediately and erased after a 30-day grace period. You can restore it by signing
                back in within 30 days.
              </p>
              <button onClick={() => setDelOpen(true)} data-testid="delete-account-btn"
                className="pill mt-4 !bg-white !border !border-[#B25A45] !text-[#B25A45] hover:!bg-[#FBF1EE]">
                <Trash2 className="h-4 w-4" /> Delete my account
              </button>
            </div>
          )}
        </section>

        <button
          onClick={handleLogout}
          data-testid="profile-signout"
          className="pill pill-ghost w-full !text-[#B25A45]"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>

      <AlertDialog open={delOpen} onOpenChange={setDelOpen}>
        <AlertDialogContent data-testid="delete-account-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              This deactivates your account now and permanently deletes it and your personal data
              after 30 days. You can cancel by signing back in before then. Confirm with your password.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-1">
            <input
              type="password" value={delPassword} onChange={(e) => setDelPassword(e.target.value)}
              data-testid="delete-account-password" placeholder="Your password"
              className="w-full rounded-2xl border border-[#E5E6DF] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#B25A45]"
            />
            <textarea
              rows={2} value={delReason} onChange={(e) => setDelReason(e.target.value)}
              data-testid="delete-account-reason" placeholder="Reason (optional)"
              className="w-full rounded-2xl border border-[#E5E6DF] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#B25A45]"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="delete-account-cancel">Keep my account</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); requestDeletion(); }}
              disabled={delBusy}
              data-testid="delete-account-confirm"
              className="!bg-[#B25A45] hover:!bg-[#9C4A38]"
            >
              {delBusy ? "Deleting…" : "Delete account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
