import { Link } from "react-router-dom";
import { useState } from "react";
import { LegalShell, H2, P, UL, CONTACT_EMAIL, LEGAL_NAME } from "./LegalShell";

export default function Privacy() {
  const [analyticsOff, setAnalyticsOff] = useState(() => {
    try { return localStorage.getItem("ty_usage_opt_out") === "1"; } catch { return false; }
  });
  const setAnalyticsPreference = value => {
    try { localStorage.setItem("ty_usage_opt_out", value ? "1" : "0"); } catch {}
    setAnalyticsOff(value);
    window.dispatchEvent(new Event("tony-analytics-preference"));
  };
  return (
    <LegalShell
      testid="privacy-page"
      title="Privacy Policy"
      subtitle={`How ${LEGAL_NAME} collects, uses and protects your personal data, in line with the EU General Data Protection Regulation (GDPR).`}
    >
      <P>{LEGAL_NAME} ("we", "us", "our") operates the TonYoga mobile application and website (the "Service"). This policy explains what personal data we process and your rights over it. We are based in Málaga, Spain, and act as the data controller for your information.</P>

      <H2>1. Information we collect</H2>
      <UL items={[
        "Account data: your name, email address and password (stored only as a secure one-way hash).",
        "Profile & practice data: your level, goals, class bookings, course progress, streaks, certificates and wishlist.",
        "Purchase data: memberships, orders, retreat reservations and store credit. Card details are handled directly by our payment processors — we never see or store your full card number.",
        "Usage data: pages viewed, features used and device information needed to run and improve the Service.",
        "Optional content: messages you send to our AI assistant or support, and any enquiries you submit.",
      ]} />

      <H2>2. How we use your data</H2>
      <UL items={[
        "To create and manage your account and deliver the classes, courses and content you sign up for.",
        "To process payments, memberships and retreat bookings.",
        "To send transactional emails (receipts, booking confirmations, reminders, password resets).",
        "To personalise recommendations (e.g. the Find Your Path quiz) and improve the Service.",
        "To keep the Service secure and prevent fraud or abuse.",
      ]} />

      <H2>3. Legal bases (GDPR Art. 6)</H2>
      <P>We process your data under the following legal bases: <strong>performance of a contract</strong> (to provide the Service you signed up for), <strong>legitimate interests</strong> (to secure and improve the Service), <strong>consent</strong> (for optional marketing emails, which you can withdraw at any time), and <strong>legal obligation</strong> (to retain financial records for tax purposes).</P>

      <H2>4. Sharing & processors</H2>
      <P>We share data only with trusted service providers who process it on our behalf, including: Apple (In-App Purchase transactions), Stripe and PayPal (eligible external payments), our email provider (transactional email), Printful (order fulfilment for physical goods), Zoom (live classes), and OpenAI (the AI assistant). Each processes data under its own agreement and only as needed to provide its service. We never sell your personal data.</P>

      <H2>5. International transfers</H2>
      <P>Some processors may be located outside the European Economic Area. Where that happens, transfers are protected by appropriate safeguards such as the European Commission's Standard Contractual Clauses.</P>

      <H2>6. Data retention</H2>
      <P>We keep your personal data for as long as your account is active. When you delete your account, it is deactivated immediately and permanently erased after a 30-day grace period. Anonymised financial records may be retained where required by law (e.g. tax and accounting obligations).</P>
      <div data-testid="privacy-usage-analytics" className="my-5 space-y-3 text-sm text-[#545E56]">
        <p>First-party usage analytics records public page categories, website or app platform, and available page-load times. A random tab-session identifier expires after 30 minutes of inactivity. Analytics events are automatically removed after 90 days and do not contain account details, IP addresses, search parameters or page record IDs. Do Not Track and Global Privacy Control signals disable this collection.</p>
        <label className="flex items-center gap-3"><input type="checkbox" data-testid="privacy-analytics-opt-out" checked={analyticsOff} onChange={e => setAnalyticsPreference(e.target.checked)} className="h-4 w-4" /> Disable usage analytics in this browser</label>
      </div>

      <H2>7. Your rights</H2>
      <UL items={[
        "Access — request a copy of the data we hold about you.",
        "Rectification — correct inaccurate or incomplete data.",
        "Erasure — delete your account and data (see below).",
        "Restriction & objection — limit or object to certain processing.",
        "Portability — receive your data in a portable format.",
        "Withdraw consent — opt out of marketing at any time.",
      ]} />
      <P>You can exercise most of these rights directly in the app, or by emailing <a href={`mailto:${CONTACT_EMAIL}`} className="text-[#B25A45] hover:underline">{CONTACT_EMAIL}</a>. You also have the right to lodge a complaint with the Spanish Data Protection Agency (AEPD).</P>

      <H2>8. Deleting your account</H2>
      <P>You can permanently delete your account and personal data at any time from <strong>Profile → Delete account</strong> in the app, or via our <Link to="/account-deletion" className="text-[#B25A45] hover:underline">Account & Data Deletion</Link> page. Deletion takes effect after a 30-day grace period during which you can sign back in and explicitly select Profile → Cancel deletion before the deadline.</P>

      <H2>9. Children</H2>
      <P>The Service is not directed at children under 16. We do not knowingly collect data from children. If you believe a child has provided us data, contact us and we will remove it.</P>

      <H2>10. Security</H2>
      <P>We use industry-standard measures — encryption in transit, hashed passwords and access controls — to protect your data. No method of transmission is 100% secure, but we work hard to safeguard your information.</P>

      <H2>11. Changes</H2>
      <P>We may update this policy from time to time. Material changes will be notified in the app or by email. Continued use of the Service after changes take effect constitutes acceptance.</P>

      <H2>12. Contact</H2>
      <P>{LEGAL_NAME}, Málaga, Spain. Email: <a href={`mailto:${CONTACT_EMAIL}`} className="text-[#B25A45] hover:underline">{CONTACT_EMAIL}</a>.</P>
    <H2>Apple purchases and optional AI</H2><P>For App Store purchases we retain the Apple transaction identifier, product identifier, purchase/expiry/refund state and a random purchase-account token linked to your TonYoga account to deliver and restore access. We never receive your Apple password or full card details. The iOS version does not send the website analytics events. Using the AI assistant on iOS is optional and requires consent before questions or audio are sent to TonYoga and OpenAI.</P>
    </LegalShell>
  );
}
