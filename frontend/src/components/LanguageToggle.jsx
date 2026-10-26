import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Globe, Check } from "lucide-react";
import { LANGUAGES } from "@/i18n";

// Globe dropdown language switcher. Persists via i18next's localStorage detector ('ty_lang').
export default function LanguageToggle({ className = "" }) {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const current = (i18n.resolvedLanguage || i18n.language || "en").split("-")[0];
  const active = LANGUAGES.find((l) => l.code === current) || LANGUAGES[0];

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = (code) => { i18n.changeLanguage(code); setOpen(false); };

  // The iPhone / iPad app offers English and Spanish only: a compact two-way switch.
  if (LANGUAGES.length <= 2) {
    return (
      <div
        data-testid="language-toggle"
        className={`inline-flex items-center rounded-full border border-[#E5E6DF] bg-white/90 backdrop-blur p-0.5 text-[11px] font-semibold ${className}`}
      >
        {LANGUAGES.map((l) => (
          <button
            key={l.code}
            type="button"
            onClick={() => i18n.changeLanguage(l.code)}
            data-testid={`lang-${l.code}`}
            aria-pressed={active.code === l.code}
            className={`rounded-full px-2.5 py-1 transition-colors ${active.code === l.code ? "bg-[#1C221F] text-white" : "text-[#6B7269] hover:text-[#1C221F]"}`}
          >
            {l.code.toUpperCase()}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div ref={ref} className={`relative ${className}`} data-testid="language-toggle">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        data-testid="language-toggle-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Language: ${active.label}`}
        className="inline-flex h-10 items-center gap-1.5 rounded-full border border-[#E5E6DF] bg-white/90 backdrop-blur px-3 text-[12px] font-semibold text-[#1C221F] shadow-sm hover:border-[#B25A45] transition-colors"
      >
        <Globe className="h-3.5 w-3.5 text-[#B25A45]" />
        <span className="hidden min-[400px]:inline max-w-[6.5rem] truncate">{active.native}</span>
        <span className="min-[400px]:hidden uppercase">{active.code}</span>
      </button>

      {open && (
        <div
          role="listbox"
          data-testid="language-menu"
          className="absolute right-0 mt-2 w-52 max-w-[calc(100vw-1.5rem)] max-h-[60vh] overflow-y-auto overscroll-contain rounded-2xl border border-[#E5E6DF] bg-white shadow-xl p-1.5 z-[60]"
        >
          {LANGUAGES.map((l) => {
            const isActive = l.code === current;
            return (
              <button
                key={l.code}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => pick(l.code)}
                data-testid={`lang-${l.code}`}
                className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-[13px] transition-colors ${
                  isActive ? "bg-[#1C221F] text-white" : "text-[#1C221F] hover:bg-[#F2F2EC]"
                }`}
              >
                <span className="flex flex-col leading-tight">
                  <span className="font-semibold" dir={l.dir || "ltr"}>{l.native}</span>
                  <span className={`text-[10px] ${isActive ? "text-white/60" : "text-[#9AA096]"}`}>{l.label}</span>
                </span>
                {isActive && <Check className="h-3.5 w-3.5 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
