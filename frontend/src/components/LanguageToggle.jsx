import { useTranslation } from "react-i18next";

// Compact EN/ES switch. Persists via i18next's localStorage detector ('ty_lang').
export default function LanguageToggle({ className = "" }) {
  const { i18n } = useTranslation();
  const active = (i18n.resolvedLanguage || i18n.language || "en").startsWith("es") ? "es" : "en";
  return (
    <div
      data-testid="language-toggle"
      className={`inline-flex items-center rounded-full border border-[#E5E6DF] bg-white/90 backdrop-blur p-0.5 text-[11px] font-semibold ${className}`}
    >
      {["en", "es"].map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => i18n.changeLanguage(l)}
          data-testid={`lang-${l}`}
          aria-pressed={active === l}
          className={`rounded-full px-2.5 py-1 transition-colors ${active === l ? "bg-[#1C221F] text-white" : "text-[#6B7269] hover:text-[#1C221F]"}`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
