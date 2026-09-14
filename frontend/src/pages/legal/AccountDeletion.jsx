import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Trash2, CheckCircle2, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { LegalShell, H2, P, UL, CONTACT_EMAIL, LEGAL_NAME } from "./LegalShell";

export default function AccountDeletion() {
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return toast.error("Please enter your account email.");
    setBusy(true);
    try {
      await api.post("/account/deletion-request", { email: email.trim(), reason: reason.trim() || null });
      setDone(true);
    } catch {
      toast.error("Something went wrong. Please email us instead.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <LegalShell
      testid="account-deletion-page"
      title="Account & Data Deletion"
      subtitle={`Request permanent deletion of your ${LEGAL_NAME} account and personal data.`}
    >
      <div className="rounded-2xl bg-[#F3EEE7] border border-[#E5E6DF] p-5 flex gap-3">
        <ShieldCheck className="h-5 w-5 text-[#B25A45] shrink-0 mt-0.5" />
        <P>
          Deleting your account is permanent. Your account is deactivated immediately and all
          personal data is <strong>permanently erased after a 30-day grace period</strong>. During
          those 30 days you can restore your account simply by signing back in and choosing
          <strong> Cancel deletion</strong> in your profile.
        </P>
      </div>

      <H2>Fastest way — delete in the app</H2>
      <P>If you can sign in, this is the quickest and most secure option:</P>
      <UL items={[
        "Open the TonYoga app or website and sign in.",
        "Go to Profile.",
        "Scroll to \u201CDelete account\u201D and confirm with your password.",
      ]} />
      <Link to="/profile" data-testid="deletion-goto-profile" className="pill pill-primary inline-flex">
        Go to my profile →
      </Link>

      <H2>Can't sign in? Request it here</H2>
      <P>
        Enter the email address linked to your account and we'll delete your account and personal
        data within 30 days. We'll email you to confirm.
      </P>

      {done ? (
        <div data-testid="deletion-request-success" className="rounded-2xl bg-[#EAF3EC] border border-[#CFE6D5] p-5 flex gap-3">
          <CheckCircle2 className="h-5 w-5 text-[#3E7A54] shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-[#1C221F]">Request received</div>
            <P>We've received your deletion request and will process it within 30 days. Check your inbox for a confirmation email.</P>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} data-testid="deletion-request-form" className="rounded-2xl bg-white border border-[#E5E6DF] p-5 space-y-4">
          <div>
            <label className="text-sm font-medium text-[#1C221F]">Account email</label>
            <input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              data-testid="deletion-email-input" placeholder="you@example.com"
              className="mt-1.5 w-full rounded-2xl border border-[#E5E6DF] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#B25A45]"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-[#1C221F]">Reason (optional)</label>
            <textarea
              rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
              data-testid="deletion-reason-input" placeholder="Tell us why you're leaving (optional)"
              className="mt-1.5 w-full rounded-2xl border border-[#E5E6DF] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#B25A45]"
            />
          </div>
          <button type="submit" disabled={busy} data-testid="deletion-request-submit"
            className="pill w-full !bg-[#B25A45] !text-white disabled:opacity-60">
            <Trash2 className="h-4 w-4" /> {busy ? "Submitting…" : "Request account deletion"}
          </button>
        </form>
      )}

      <H2>What gets deleted</H2>
      <UL items={[
        "Your profile, name and email.",
        "Your bookings, course progress, streaks, certificates and wishlist.",
        "Your memberships and store credit.",
        "Messages to the AI assistant and support.",
      ]} />
      <P>
        Anonymised payment and order records may be retained where required by law (tax and
        accounting). These no longer identify you. For anything else, email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="text-[#B25A45] hover:underline">{CONTACT_EMAIL}</a>.
      </P>
    </LegalShell>
  );
}
