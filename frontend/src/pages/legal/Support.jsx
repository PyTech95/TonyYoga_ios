import { Mail, LifeBuoy, HelpCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { LegalShell, H2, P, CONTACT_EMAIL, LEGAL_NAME } from "./LegalShell";

const FAQS = [
  { q: "How do I cancel my membership?", a: "Open Profile → Membership and cancel any time. You keep access until the end of your current billing period." },
  { q: "How do I get a refund?", a: "Email us with your order details. Refund eligibility follows our Terms of Service (retreats have a 60-day deposit window; digital content is generally non-refundable once opened)." },
  { q: "A class recording won't play.", a: "Recordings are available for a limited replay window after the live class. If it's within the window and still won't load, contact us with the class name and date." },
  { q: "How do I delete my account?", a: "Go to Profile → Delete account, or use the Account & Data Deletion page. Deletion is permanent after a 30-day grace period." },
];

export default function Support() {
  return (
    <LegalShell
      testid="support-page"
      title="Support & Contact"
      subtitle={`We're here to help you keep your practice steady. Reach the ${LEGAL_NAME} team below.`}
    >
      <div className="grid sm:grid-cols-2 gap-4">
        <a href={`mailto:${CONTACT_EMAIL}`} data-testid="support-email"
           className="rounded-2xl bg-white border border-[#E5E6DF] p-5 hover:border-[#B25A45] transition block">
          <Mail className="h-5 w-5 text-[#B25A45] mb-2" />
          <div className="font-semibold text-[#1C221F]">Email us</div>
          <div className="text-sm text-[#6B7269] mt-0.5">{CONTACT_EMAIL}</div>
          <div className="text-xs text-[#839682] mt-2">We reply within 1–2 business days.</div>
        </a>
        <Link to="/account-deletion" data-testid="support-deletion"
              className="rounded-2xl bg-white border border-[#E5E6DF] p-5 hover:border-[#B25A45] transition block">
          <LifeBuoy className="h-5 w-5 text-[#B25A45] mb-2" />
          <div className="font-semibold text-[#1C221F]">Account & data</div>
          <div className="text-sm text-[#6B7269] mt-0.5">Delete your account or data</div>
          <div className="text-xs text-[#839682] mt-2">Manage your privacy rights.</div>
        </Link>
      </div>

      <H2>Frequently asked</H2>
      <div className="space-y-3">
        {FAQS.map((f, i) => (
          <div key={i} className="rounded-2xl bg-white border border-[#E5E6DF] p-4" data-testid={`support-faq-${i}`}>
            <div className="flex items-start gap-2">
              <HelpCircle className="h-4 w-4 text-[#B25A45] shrink-0 mt-1" />
              <div>
                <div className="font-semibold text-[#1C221F] text-[15px]">{f.q}</div>
                <P>{f.a}</P>
              </div>
            </div>
          </div>
        ))}
      </div>

      <H2>Company</H2>
      <P>{LEGAL_NAME} · Málaga, Spain · <a href={`mailto:${CONTACT_EMAIL}`} className="text-[#B25A45] hover:underline">{CONTACT_EMAIL}</a></P>
      <P>
        See our <Link to="/privacy" className="text-[#B25A45] hover:underline">Privacy Policy</Link> and{" "}
        <Link to="/terms" className="text-[#B25A45] hover:underline">Terms of Service</Link>.
      </P>
    </LegalShell>
  );
}
