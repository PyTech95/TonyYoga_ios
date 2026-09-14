import { Video, GraduationCap, Mountain, ShoppingBag, ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";
import { useTranslation } from "react-i18next";

// -------- Feature Strip (4 tiles: Live · Programs · Retreats · Shop) --------
export function FeatureStrip() {
  const { t } = useTranslation();
  const items = [
    { icon: Video, label: t("fs.live_label"), desc: t("fs.live_desc"), to: "/schedule" },
    { icon: GraduationCap, label: t("fs.programs_label"), desc: t("fs.programs_desc"), to: "/programs" },
    { icon: Mountain, label: t("fs.retreats_label"), desc: t("fs.retreats_desc"), to: "/workshops" },
    { icon: ShoppingBag, label: t("fs.shop_label"), desc: t("fs.shop_desc"), to: "/shop" },
  ];
  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 py-8 sm:py-12" data-testid="feature-strip">
      <ul className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {items.map(({ icon: Icon, label, desc, to }) => (
          <li key={label}>
            <Link to={to} className="block rounded-2xl bg-white border border-[#E5E6DF] hover:border-[#B25A45] transition p-4 sm:p-5">
              <Icon className="h-5 w-5 text-[#B25A45] mb-2" strokeWidth={1.8} />
              <div className="text-sm font-semibold">{label}</div>
              <div className="text-xs text-[#6B7269] mt-1 leading-snug">{desc}</div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// -------- Stats Bar --------
export function StatsBar() {
  const { t } = useTranslation();
  const stats = [
    ["50+", t("sb.years")],
    ["84", t("sb.postures")],
    ["3", t("sb.programs")],
    ["6 / week", t("sb.live")],
  ];
  return (
    <section className="border-y border-[#E5E6DF] bg-[#FAFAF7]" data-testid="stats-bar">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 sm:py-10 grid grid-cols-2 md:grid-cols-4 gap-6">
        {stats.map(([n, l]) => (
          <div key={l} className="text-center md:text-left">
            <div className="serif text-3xl sm:text-4xl leading-none">{n}</div>
            <div className="eyebrow mt-2 !text-[10px]">{l}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// -------- Three Value Props --------
export function ValueProps() {
  const { t } = useTranslation();
  const props = [
    { n: "01", h: t("vp.h1"), p: t("vp.p1") },
    { n: "02", h: t("vp.h2"), p: t("vp.p2") },
    { n: "03", h: t("vp.h3"), p: t("vp.p3") },
  ];
  return (
    <section className="bg-[#B25A45] text-[#FAFAF7] py-14 sm:py-20 lg:py-24" data-testid="value-props">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2 className="serif text-3xl sm:text-4xl lg:text-5xl leading-tight mb-10 max-w-3xl">{t("vp.title")}</h2>
        <ul className="grid md:grid-cols-3 gap-6 md:gap-10">
          {props.map((v) => (
            <li key={v.n}>
              <div className="serif text-4xl opacity-40">{v.n}</div>
              <div className="serif text-xl mt-3 mb-2">{v.h}</div>
              <p className="text-[15px] text-white/85 leading-relaxed">{v.p}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// -------- FAQ ("Before you begin") --------
export function FAQ() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(0);
  const FAQS = [
    { q: t("faq.q1"), a: t("faq.a1") },
    { q: t("faq.q2"), a: t("faq.a2") },
    { q: t("faq.q3"), a: t("faq.a3") },
    { q: t("faq.q4"), a: t("faq.a4") },
    { q: t("faq.q5"), a: t("faq.a5") },
  ];
  return (
    <section id="faq" className="bg-[#1C221F] text-[#FAFAF7] py-14 sm:py-20 lg:py-24" data-testid="marketing-faq">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <div className="eyebrow !text-[#B25A45] mb-3">{t("faq.eyebrow")}</div>
        <h2 className="serif text-3xl sm:text-4xl lg:text-5xl leading-tight mb-8 sm:mb-10">{t("faq.title")}</h2>
        <ul className="divide-y divide-white/10 border-y border-white/10">
          {FAQS.map((f, i) => (
            <li key={i}>
              <button
                onClick={() => setOpen(open === i ? -1 : i)}
                data-testid={`faq-toggle-${i}`}
                className="w-full flex items-center justify-between py-5 sm:py-6 text-left gap-4 hover:text-[#B25A45] transition"
              >
                <span className="serif text-base sm:text-lg">{f.q}</span>
                <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open === i ? "rotate-180 text-[#B25A45]" : "text-white/60"}`} />
              </button>
                <div hidden={open !== i} data-testid={`faq-answer-${i}`} className="pb-6 text-white/70 text-[15px] leading-relaxed max-w-3xl">
                  {f.a}
                </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
