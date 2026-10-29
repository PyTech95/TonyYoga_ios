import { useEffect, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import Spinner from "@/components/Spinner";
import { isNativeApp } from "@/lib/platform";

export function CheckoutSuccess() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [status, setStatus] = useState("checking");
  const [tries, setTries] = useState(0);
  const sessionId = params.get("session_id");
  const isPaypal = params.get("paypal") === "1";
  const mobileReturn = params.get("mobile_return") === "ios";
  const isCredit = params.get("credit") === "1";
  const paypalToken = params.get("token"); // PayPal appends ?token=<order_id> on return
  // Started inside the iOS / Android app, finished here in the phone's browser:
  // confirm the payment, then send the member back to the app instead of the website.
  const fromApp = params.get("app") === "1" && !isNativeApp();
  // After paying, go straight to what was bought (a course page or My Yoga).
  const done = (path) => { if (!fromApp && !mobileReturn) setTimeout(() => nav(path || "/my-yoga", { replace: true }), 1500); };

  useEffect(() => {
    let cancelled = false;

    // Gift-card credit-only purchase — already fulfilled server-side.
    if (isCredit) {
      setStatus("paid");
      toast.success("You're in.");
      done();
      return () => { cancelled = true; };
    }

    // PayPal capture flow
    if (isPaypal && paypalToken) {
      (async () => {
        try {
          const { data } = await api.post(`/paypal/capture/${paypalToken}`);
          if (cancelled) return;
          if (data.status === "captured" || data.status === "already_captured") {
            setStatus("paid");
            toast.success("Welcome to Tony Yoga.");
            done();
          } else {
            setStatus("error");
          }
        } catch (e) {
          if (!cancelled) setStatus("error");
        }
      })();
      return () => { cancelled = true; };
    }

    // Stripe polling flow
    if (!sessionId) { setStatus("bad"); return; }
    const poll = async () => {
      try {
        const { data } = await api.get(`/checkout/status/${sessionId}`);
        if (cancelled) return;
        if (data.payment_status === "paid") {
          setStatus("paid");
          toast.success("Welcome to Tony Yoga.");
          done(data.return_path);
          return;
        }
        if (data.status === "expired") { setStatus("expired"); return; }
        if (tries >= 20) { setStatus("timeout"); return; }
        setTimeout(() => setTries((n) => n + 1), 2000);
      } catch { if (!cancelled) setStatus("error"); }
    };
    poll();
    return () => { cancelled = true; };
  }, [sessionId, tries, nav, isPaypal, paypalToken, isCredit, mobileReturn]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div data-testid="checkout-success">
      <PageHeader eyebrow="Membership" title="Confirming…" testId="checkout-success-header" />
      <div className="mx-auto max-w-md px-6 py-8 text-center">
        {status === "checking" && <Spinner label="Confirming your payment" />}
        {status === "paid" && (
          <div className="animate-fade-up">
            <CheckCircle2 className="h-14 w-14 text-[#839682] mx-auto mb-4" />
            <div className="serif text-2xl">You're in.</div>
            {mobileReturn ? (
              <>
                <p className="text-sm text-[#6B7269] mt-2">Payment is confirmed for the TonYoga account you used to book.</p>
                <a className="pill pill-primary mt-5" href="com.tonyoga.app://checkout-return">Return to TonYoga</a>
                <p className="text-xs mt-3">You can also reopen TonYoga manually. The app checks the payment with our server.</p>
              </>
            ) : fromApp ? (
              <p className="text-sm text-[#6B7269] mt-2" data-testid="checkout-return-to-app">Payment complete. You can close this page and go back to the Tony Yoga app — your purchase is ready there.</p>
            ) : (
              <p className="text-sm text-[#6B7269] mt-2">Taking you to your purchase…</p>
            )}
          </div>
        )}
        {status === "timeout" && (
          <>
            <div className="serif text-xl mb-2">Still confirming your payment…</div>
            <p className="text-sm text-[#6B7269]">Your bank is taking a little longer. Your purchase will appear in My Yoga automatically within a few minutes — you don't need to pay again.</p>
            {mobileReturn ? <a className="pill pill-primary mt-6" href="com.tonyoga.app://checkout-return">Return to TonYoga</a> : <Link to="/my-yoga" className="pill pill-primary mt-6 inline-flex">Open My Yoga</Link>}
          </>
        )}
        {(status === "error" || status === "bad") && (
          <>
            <div className="serif text-xl mb-2">Something didn't finish.</div>
            <p className="text-sm text-[#6B7269]">If you were charged, don't pay again — we check every payment automatically and your purchase will appear in My Yoga. Questions: tony@tonysanchezyoga.com.</p>
            {mobileReturn ? <a className="pill pill-ghost mt-6" href="com.tonyoga.app://checkout-return">Return to TonYoga</a> : <Link to="/memberships" className="pill pill-ghost mt-6 inline-flex">Back to memberships</Link>}
          </>
        )}
      </div>
    </div>
  );
}

export function CheckoutCancel() {
  const [params] = useSearchParams();
  const [released, setReleased] = useState(null);
  const sessionId = params.get("session_id") || params.get("token"); // Stripe session or PayPal order id

  useEffect(() => {
    if (!sessionId) return;
    api.post("/checkout/credit-release", { session_id: sessionId })
      .then(({ data }) => { if (data?.released > 0) setReleased(data.released); })
      .catch(() => {});
  }, [sessionId]);

  return (
    <div data-testid="checkout-cancel">
      <PageHeader eyebrow="Checkout" title="Payment cancelled." testId="checkout-cancel-header" />
      <div className="mx-auto max-w-md px-6 py-4 text-center">
        <XCircle className="h-14 w-14 text-[#B25A45] mx-auto mb-4" />
        <p className="text-sm text-[#6B7269] mb-3">No charge was made. {params.get("app") === "1" && !isNativeApp() ? "You can close this page and go back to the Tony Yoga app." : "Come back anytime."}</p>
        {released != null && (
          <p className="text-sm text-[#3E5B3E] mb-6" data-testid="checkout-credit-restored">
            Your €{released.toFixed(2)} gift-card credit has been returned to your account.
          </p>
        )}
        {params.get("mobile_return") === "ios" ? <a className="pill pill-primary" href="com.tonyoga.app://checkout-return">Return to TonYoga</a> : <Link to="/memberships" className="pill pill-primary inline-flex">See plans again</Link>}
      </div>
    </div>
  );
}
