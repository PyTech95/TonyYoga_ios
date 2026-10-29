import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { BadgeCheck, Clock, ExternalLink } from "lucide-react";
import { api } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { errText } from "./teacherShared";
import Overview from "./hub/Overview";
import Offerings from "./hub/Offerings";
import Students from "./hub/Students";
import Payments from "./hub/Payments";
import Billing from "./hub/Billing";
import CertificateTab from "./hub/CertificateTab";
import ProfileTab from "./hub/ProfileTab";

const TABS = [
  ["overview", "Overview"], ["classes", "Classes & courses"], ["students", "Students"], ["payments", "Payments"],
  ["billing", "Plan & billing"], ["certificate", "Certificate"], ["profile", "Profile"],
];

export default function TeachHub() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([k]) => k === params.get("tab")) ? params.get("tab") : "overview";
  const [me, setMe] = useState(undefined);
  const [error, setError] = useState(false);
  const confirmed = useRef(false);

  const load = useCallback(() => {
    return api.get("/teacher/me").then(({ data }) => { setMe(data || null); setError(false); }).catch(() => setError(true));
  }, []);
  useEffect(() => { load(); }, [load]);

  // Back from Stripe Checkout (monthly plan) or Stripe onboarding (payouts).
  useEffect(() => {
    const billing = params.get("billing_session");
    const stripe = params.get("stripe");
    if (!billing && !stripe) return;
    if (confirmed.current) return;
    confirmed.current = true;
    const clean = () => {
      const next = new URLSearchParams(params);
      next.delete("billing_session"); next.delete("stripe");
      setParams(next, { replace: true });
    };
    if (billing) {
      api.post(`/teacher/billing/confirm/${encodeURIComponent(billing)}`)
        .then(({ data }) => toast[data?.active ? "success" : "message"](data?.active ? t("hub.plan_active", "Your plan is active. Thank you!") : t("hub.plan_pending", "We're still confirming your payment. Refresh in a minute.")))
        .catch((e) => toast.error(errText(e)))
        .finally(() => { clean(); load(); });
    } else {
      api.get("/teacher/stripe/status")
        .then(({ data }) => toast[data?.charges_enabled ? "success" : "message"](data?.charges_enabled ? t("hub.stripe_ready", "Stripe is connected. You can take card payments.") : t("hub.stripe_unfinished", "Stripe still needs a few details. Finish the setup to take card payments.")))
        .catch(() => {})
        .finally(() => { clean(); load(); });
    }
  }, [params, setParams, load, t]);

  const selectTab = (k) => {
    const next = new URLSearchParams(params);
    if (k === "overview") next.delete("tab"); else next.set("tab", k);
    setParams(next, { replace: true });
  };

  if (error) {
    return (
      <div className="pb-24"><PageHeader title={t("hub.title", "Teacher Hub")} />
        <div className="mx-auto max-w-2xl px-5 text-sm text-[#8A3B2A]">{t("hub.load_error", "We couldn't load your Teacher Hub.")} <button className="underline font-semibold" onClick={load}>{t("common.retry", "Try again")}</button></div>
      </div>
    );
  }
  if (me === undefined) return <div className="mx-auto max-w-2xl px-5 pt-24 space-y-3" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="h-24 rounded-3xl bg-[#F2F2EC] animate-pulse" />)}</div>;

  if (me === null || me.status === "declined") {
    return (
      <div data-testid="hub-no-profile" className="pb-24">
        <PageHeader eyebrow={t("teachers.for_teachers", "For teachers")} title={t("hub.title", "Teacher Hub")} />
        <div className="mx-auto max-w-2xl px-5">
          <div className="rounded-3xl bg-white border border-[#E5E6DF] p-8 text-center">
            <BadgeCheck className="h-9 w-9 text-[#B25A45] mx-auto" />
            <div className="serif text-2xl mt-3">{t("hub.no_profile", "Teach your own students on Tony Yoga")}</div>
            <p className="text-sm text-[#6B7269] mt-2">{me?.status === "declined" ? t("hub.declined", "Your last application wasn't approved. You can apply again.") : t("hub.no_profile_body", "For teachers trained by Tony and colleagues he approves.")}</p>
            <Link to="/teachers/apply" className="pill pill-primary mt-5" data-testid="hub-apply">{t("teachers.apply", "Apply to teach")}</Link>
          </div>
        </div>
      </div>
    );
  }
  if (me.status === "applied") {
    return (
      <div data-testid="hub-waiting" className="pb-24">
        <PageHeader eyebrow={t("hub.title", "Teacher Hub")} title={me.display_name} />
        <div className="mx-auto max-w-2xl px-5 space-y-4">
          <div className="rounded-3xl bg-white border border-[#E5E6DF] p-8 text-center">
            <Clock className="h-9 w-9 text-[#B25A45] mx-auto" />
            <div className="serif text-2xl mt-3">{t("hub.waiting", "Your application is being reviewed")}</div>
            <p className="text-sm text-[#6B7269] mt-2">{t("hub.waiting_body", "We'll email you when Tony's team approves your profile. Meanwhile you can log continuing-education hours and fill in your details.")}</p>
          </div>
          <CertificateTab me={me} reload={load} />
        </div>
      </div>
    );
  }

  return (
    <div data-testid="teach-hub" className="pb-24">
      <PageHeader eyebrow={t("hub.title", "Teacher Hub")} title={me.display_name} testId="hub-header" width="max-w-3xl"
        action={<Link to={`/teachers/${me.slug}`} className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#B25A45]" data-testid="hub-public-profile">{t("hub.public_profile", "Public profile")}<ExternalLink className="h-3.5 w-3.5" /></Link>} />
      <div className="mx-auto max-w-3xl px-5 space-y-5">
        <div className="-mx-5 px-5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          <div className="flex gap-1.5 w-max" role="tablist">
            {TABS.map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => selectTab(k)} data-testid={`hub-tab-${k}`}
                className={`whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] font-semibold border ${tab === k ? "bg-[#1C221F] text-white border-[#1C221F]" : "bg-white border-[#E5E6DF] text-[#1C221F]"}`}>
                {t(`hub.tab_${k}`, label)}
              </button>
            ))}
          </div>
        </div>
        {tab === "overview" && <Overview me={me} go={selectTab} />}
        {tab === "classes" && <Offerings me={me} reload={load} />}
        {tab === "students" && <Students me={me} />}
        {tab === "payments" && <Payments me={me} reload={load} />}
        {tab === "billing" && <Billing me={me} reload={load} />}
        {tab === "certificate" && <CertificateTab me={me} reload={load} />}
        {tab === "profile" && <ProfileTab me={me} reload={load} />}
      </div>
    </div>
  );
}
