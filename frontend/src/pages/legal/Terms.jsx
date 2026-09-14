import { Link } from "react-router-dom";
import { LegalShell, H2, P, UL, CONTACT_EMAIL, LEGAL_NAME } from "./LegalShell";

export default function Terms() {
  return (
    <LegalShell
      testid="terms-page"
      title="Terms of Service"
      subtitle={`The terms that govern your use of ${LEGAL_NAME}. Please read them carefully.`}
    >
      <P>These Terms of Service ("Terms") are a legal agreement between you and {LEGAL_NAME} ("we", "us"), based in Málaga, Spain, governing your use of the TonYoga app and website (the "Service"). By creating an account or using the Service you agree to these Terms.</P>

      <H2>1. Your account</H2>
      <UL items={[
        "You must be at least 16 years old to create an account.",
        "You are responsible for keeping your login credentials secure and for all activity under your account.",
        "Provide accurate information and keep it up to date.",
      ]} />

      <H2>2. Memberships, purchases & billing</H2>
      <UL items={[
        "Memberships renew automatically for the billing cycle you choose until cancelled. You can cancel at any time; access continues until the end of the current paid period.",
        "One-time purchases (courses, passes, products, retreat deposits) are charged at checkout.",
        "Prices are shown in euros (€) unless stated otherwise and include applicable taxes where required.",
        "Payments are processed securely by Stripe and PayPal. We do not store your full card details.",
      ]} />

      <H2>3. Cancellation & refunds</H2>
      <UL items={[
        "Memberships: cancel any time from your profile; no partial refunds for the current cycle, but you keep access until it ends.",
        "Digital content (courses, on-demand videos, e-books): because access is granted immediately, these are generally non-refundable once opened, except where required by law.",
        "Retreats: deposits and balances follow the cancellation window shown at booking. Cancellations 60+ days before the start date are eligible for a refund of the deposit; later cancellations are non-refundable. Refunds, where due, are issued to the original payment method.",
        "Physical products: contact us within 14 days of delivery for returns of unused items in original condition.",
        `To request a refund or cancellation, email ${CONTACT_EMAIL}.`,
      ]} />

      <H2>4. Health & safety disclaimer</H2>
      <P>Yoga and physical exercise carry inherent risks. The Service provides general wellness content and is not medical advice. Consult a qualified healthcare professional before starting any new practice, especially if you are pregnant, injured or have a medical condition. You practise at your own risk and are responsible for exercising within your own limits.</P>

      <H2>5. Acceptable use</H2>
      <UL items={[
        "Do not share, resell or redistribute paid content or your account access.",
        "Do not copy, record or publicly broadcast classes, videos or course materials.",
        "Do not misuse the Service, attempt to breach security, or upload unlawful content.",
      ]} />

      <H2>6. Intellectual property</H2>
      <P>All classes, videos, course materials, text, graphics and the TonYoga brand are owned by {LEGAL_NAME} or its licensors and are protected by law. Your membership grants you a personal, non-transferable, non-exclusive licence to access content for your own practice only.</P>

      <H2>7. Content availability</H2>
      <P>We may add, change or remove content, classes and features. Live class schedules and replay windows may vary. We aim to keep the Service available but do not guarantee uninterrupted access.</P>

      <H2>8. Termination</H2>
      <P>You may stop using the Service and delete your account at any time. We may suspend or terminate accounts that breach these Terms. On termination, your right to access paid content ends.</P>

      <H2>9. Limitation of liability</H2>
      <P>To the fullest extent permitted by law, {LEGAL_NAME} is not liable for indirect or consequential damages arising from your use of the Service. Nothing in these Terms limits liability that cannot be excluded under applicable law, including your statutory consumer rights.</P>

      <H2>10. Governing law</H2>
      <P>These Terms are governed by the laws of Spain and the European Union. Disputes are subject to the competent courts of Málaga, Spain, without prejudice to any mandatory consumer protection rights in your country of residence.</P>

      <H2>11. Contact</H2>
      <P>Questions about these Terms? Email <a href={`mailto:${CONTACT_EMAIL}`} className="text-[#B25A45] hover:underline">{CONTACT_EMAIL}</a>. See also our <Link to="/privacy" className="text-[#B25A45] hover:underline">Privacy Policy</Link>.</P>
    </LegalShell>
  );
}
