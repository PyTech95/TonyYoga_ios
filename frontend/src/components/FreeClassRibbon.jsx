import { useState, useEffect } from "react";
import { toast } from "sonner";
import { X, Gift, ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";

const RIBBON_VARIANTS = ["free", "try", "meet"];

function pickVariant() {
  try {
    const saved = localStorage.getItem("ty_ribbon_variant");
    if (saved && RIBBON_VARIANTS.includes(saved)) return saved;
    const v = RIBBON_VARIANTS[Math.floor(Math.random() * RIBBON_VARIANTS.length)];
    localStorage.setItem("ty_ribbon_variant", v);
    return v;
  } catch {
    return RIBBON_VARIANTS[0];
  }
}

/** Sticky ribbon at the top of the marketing site offering a free class. */
export default function FreeClassRibbon() {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [variant] = useState(pickVariant);

  useEffect(() => {
    try {
      if (localStorage.getItem("ty_free_class_dismissed") === "1") setDismissed(true);
      if (localStorage.getItem("ty_free_class_claimed") === "1") setClaimed(true);
    } catch {}
  }, []);

  const close = () => {
    try { localStorage.setItem("ty_free_class_dismissed", "1"); } catch {}
    setDismissed(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const { data } = await api.post("/marketing/free-class-signup", {
        email: email.trim(),
        name: name.trim() || undefined,
        source: `ribbon_${variant}`,
      });
      try { localStorage.setItem("ty_free_class_claimed", "1"); } catch {}
      setClaimed(true);
      setExpanded(false);
      toast.success(data.already_granted ? t("fc.toast_claimed") : t("fc.toast_added"));
    } catch (e) {
      toast.error(e?.response?.data?.detail || t("fc.toast_fail"));
    } finally { setBusy(false); }
  };

  if (dismissed) return null;

  return (
    <div data-testid="free-class-ribbon" data-variant={variant} className="fixed top-0 inset-x-0 z-[60] safe-top">
      <div className="bg-[#B25A45] text-[#FAFAF7]">
        <div className="mx-auto max-w-6xl px-4 py-2.5 flex items-center gap-3">
          <Gift className="h-4 w-4 text-[#FAFAF7] shrink-0" />
          {claimed ? (
            <span className="text-[13px] flex-1 min-w-0 truncate">{t("ribbon.claimed")}</span>
          ) : (
            <>
              <span className="text-[13px] flex-1 min-w-0 truncate">
                <span className="hidden sm:inline">{t(`ribbon.${variant}_h`)} </span><strong>{t(`ribbon.${variant}_a`)}</strong>
              </span>
              <button
                onClick={() => setExpanded(true)}
                data-testid="ribbon-claim-btn"
                className="text-[12px] font-semibold underline underline-offset-4 hover:no-underline shrink-0"
              >
                {t("ribbon.claim")}
              </button>
            </>
          )}
          <button onClick={close} data-testid="ribbon-close" aria-label="Close" className="text-white/70 hover:text-white shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Expanded email capture panel */}
      {expanded && !claimed && (
        <>
          <div className="fixed inset-0 bg-[#1C221F]/50 z-[70] animate-fade-up" onClick={() => setExpanded(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[71] w-[92%] max-w-md rounded-3xl bg-[#FAFAF7] shadow-2xl p-6 animate-fade-up">
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="eyebrow mb-2">{t("fc.gift")}</div>
                <h3 className="serif text-2xl leading-tight">{t("fc.title1")}<br/>{t("fc.title2")}</h3>
              </div>
              <button onClick={() => setExpanded(false)} aria-label="Close" className="rounded-full h-8 w-8 flex items-center justify-center hover:bg-[#F2F2EC]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-[#545E56] mt-3 mb-5 leading-relaxed">
              {t("fc.desc")}
            </p>
            <form onSubmit={submit} className="space-y-3" data-testid="ribbon-form">
              <input
                data-testid="ribbon-name"
                value={name} onChange={(e) => setName(e.target.value)}
                placeholder={t("fc.name_ph")}
                className="w-full rounded-2xl border border-[#E5E6DF] px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#B25A45]"
              />
              <input
                required type="email" autoFocus
                data-testid="ribbon-email"
                value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-2xl border border-[#E5E6DF] px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#B25A45]"
              />
              <button type="submit" disabled={busy} data-testid="ribbon-submit" className="pill pill-primary w-full">
                {busy ? t("fc.claiming") : t("fc.submit")} <ArrowRight className="h-4 w-4" />
              </button>
              <p className="text-[11px] text-[#6B7269] text-center mt-1">{t("fc.note")}</p>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
