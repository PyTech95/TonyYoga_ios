import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const CONTACT_EMAIL = "tonyoga.online@gmail.com";
const LEGAL_NAME = "TonYoga";
const LAST_UPDATED = "June 2026";

export { CONTACT_EMAIL, LEGAL_NAME, LAST_UPDATED };

export function LegalShell({ title, subtitle, children, testid }) {
  return (
    <div className="min-h-screen bg-[#FAFAF7]" data-testid={testid}>
      <div className="bg-[#1C221F] text-[#FAFAF7]">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-10 sm:py-14">
          <Link to="/" data-testid="legal-back-home" className="inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition mb-6">
            <ArrowLeft className="h-4 w-4" /> Back to TonYoga
          </Link>
          <div className="eyebrow !text-[#E0A38F]">Legal</div>
          <h1 className="serif text-3xl sm:text-4xl mt-2">{title}</h1>
          {subtitle && <p className="text-white/60 text-sm mt-3 max-w-xl">{subtitle}</p>}
          <p className="text-white/40 text-xs mt-4">Last updated: {LAST_UPDATED}</p>
        </div>
      </div>
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-10 sm:py-14">
        <div className="prose-legal space-y-6 text-[15px] leading-relaxed text-[#3A403A]">
          {children}
        </div>
        <div className="mt-12 pt-6 border-t border-[#E5E6DF] text-sm text-[#6B7269]">
          Questions? Email <a href={`mailto:${CONTACT_EMAIL}`} className="text-[#B25A45] hover:underline">{CONTACT_EMAIL}</a>.
          <div className="mt-3 flex flex-wrap gap-4 text-[13px]">
            <Link to="/privacy" className="text-[#B25A45] hover:underline">Privacy Policy</Link>
            <Link to="/terms" className="text-[#B25A45] hover:underline">Terms of Service</Link>
            <Link to="/account-deletion" className="text-[#B25A45] hover:underline">Delete your account</Link>
            <Link to="/support" className="text-[#B25A45] hover:underline">Support</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export function H2({ children }) {
  return <h2 className="serif text-xl text-[#1C221F] pt-2">{children}</h2>;
}

export function P({ children }) {
  return <p>{children}</p>;
}

export function UL({ items }) {
  return (
    <ul className="list-disc pl-5 space-y-1.5 text-[#545E56]">
      {items.map((it, i) => <li key={i}>{it}</li>)}
    </ul>
  );
}
