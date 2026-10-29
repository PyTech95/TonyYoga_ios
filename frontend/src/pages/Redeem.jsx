import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Gift, CheckCircle2, AlertCircle, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { loginPath } from "@/lib/authRouting";
import PageHeader from "@/components/PageHeader";

const clean = (v) => String(v || "").replace(/\s+/g, "").toUpperCase();

function fmtDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

/** Open a gift membership with its code. */
export default function Redeem() {
  const { t } = useTranslation();
  const { user, ready } = useAuth();
  const [params] = useSearchParams();
  const [code, setCode] = useState(clean(params.get("code")));
  const [info, setInfo] = useState(null); // {plan_name, days, valid} | {error}
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  const check = async (value) => {
    const c = clean(value ?? code);
    if (c.length < 6) { setInfo({ error: t("redeem.short", "Enter the full code, e.g. GIFT-ABCD-EFGH.") }); return; }
    setChecking(true);
    try {
      const { data } = await api.get(`/gifts/check/${encodeURIComponent(c)}`);
      setInfo(data.valid ? data : { ...data, error: t("redeem.used", "This gift code has already been used or has expired.") });
    } catch (e) {
      setInfo({ error: e?.response?.data?.detail || t("redeem.not_found", "That gift code doesn't exist. Check the letters and try again.") });
    } finally { setChecking(false); }
  };

  useEffect(() => {
    const c = clean(params.get("code"));
    if (c) { setCode(c); check(c); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const redeem = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/gifts/redeem", { code: clean(code) });
      setDone(data);
    } catch (e) {
      setInfo({ error: e?.response?.data?.detail || t("redeem.failed", "We couldn't open this gift.") });
    } finally { setBusy(false); }
  };

  const back = `/redeem?code=${encodeURIComponent(clean(code))}`;

  return (
    <div data-testid="redeem-page" className="pb-24">
      <PageHeader back eyebrow={t("redeem.eyebrow", "A gift for your practice")} title={t("redeem.title", "Open your gift")} testId="redeem-header" />
      <div className="mx-auto max-w-md px-5 space-y-5">
        {done ? (
          <div data-testid="redeem-done" className="rounded-3xl bg-[#1C221F] text-[#FAFAF7] p-6 text-center">
            <CheckCircle2 className="h-9 w-9 text-[#9CC8A8] mx-auto" />
            <div className="serif text-3xl mt-3">{t("redeem.done_title", "Your membership is active")}</div>
            <p className="text-[14px] text-white/75 mt-2">{t("redeem.done_body", "{{plan}} until {{date}}. Enjoy your practice!", { plan: done.plan_name, date: fmtDate(done.ends_at) })}</p>
            <Link to="/my-yoga" className="pill mt-5 bg-[#B25A45] text-white" data-testid="redeem-open-my-yoga">{t("redeem.open", "Go to My Yoga")} <ArrowRight className="h-4 w-4" /></Link>
          </div>
        ) : (
          <>
            <div className="rounded-3xl bg-white border border-[#E5E6DF] p-5 space-y-3">
              <div className="flex items-center gap-2 text-[#B25A45]"><Gift className="h-5 w-5" /><span className="text-[13px] font-semibold">{t("redeem.enter", "Enter your gift code")}</span></div>
              <form onSubmit={(e) => { e.preventDefault(); check(); }} className="flex gap-2">
                <input value={code} onChange={(e) => { setCode(e.target.value.toUpperCase()); setInfo(null); }} placeholder="GIFT-XXXX-XXXX" autoCapitalize="characters" autoComplete="off"
                  className="flex-1 min-w-0 rounded-2xl border border-[#E5E6DF] bg-white px-4 py-3 font-mono text-[16px] tracking-wider focus:outline-none focus:ring-2 focus:ring-[#B25A45]" data-testid="redeem-code" />
                <button type="submit" disabled={checking} className="pill pill-ghost shrink-0" data-testid="redeem-check">{checking ? "…" : t("redeem.check", "Check")}</button>
              </form>
              {info?.error && (
                <div data-testid="redeem-error" className="flex items-start gap-2 rounded-2xl bg-[#FBEFEA] border border-[#EED9D2] p-3 text-[13px] text-[#8A3B2A]">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />{info.error}
                </div>
              )}
              {info && !info.error && (
                <div data-testid="redeem-info" className="rounded-2xl bg-[#E4F0E8] border border-[#CFE3D6] p-4">
                  <div className="text-[11px] uppercase tracking-widest font-semibold text-[#3E7C57]">{t("redeem.valid", "Valid gift")}</div>
                  <div className="serif text-2xl mt-1">{info.plan_name}</div>
                  <div className="text-[13px] text-[#545E56]">{t("redeem.days", "{{n}} days of Tony Yoga, starting when you open it.", { n: info.days })}</div>
                </div>
              )}
            </div>

            {info && !info.error && ready && (
              user ? (
                <button onClick={redeem} disabled={busy} className="pill pill-primary w-full !py-3.5" data-testid="redeem-confirm">
                  {busy ? t("redeem.opening", "Opening…") : t("redeem.start", "Start my membership")}
                </button>
              ) : (
                <div className="rounded-3xl bg-[#FBF6EC] border border-[#E0D3B8] p-5 space-y-3" data-testid="redeem-signin">
                  <p className="text-[14px] text-[#5C5346]">{t("redeem.signin_body", "Create a free account (or sign in) to open your gift. Use the email you want for Tony Yoga.")}</p>
                  <div className="flex flex-wrap gap-2">
                    <Link to={loginPath(back, "register")} className="pill pill-primary" data-testid="redeem-register">{t("redeem.create", "Create free account")}</Link>
                    <Link to={loginPath(back)} className="pill pill-ghost" data-testid="redeem-login">{t("redeem.sign_in", "Sign in")}</Link>
                  </div>
                </div>
              )
            )}
            <p className="text-[12px] text-[#6B7269] text-center">{t("redeem.help", "If you already have a membership, the gift starts when it ends.")}</p>
          </>
        )}
      </div>
    </div>
  );
}
