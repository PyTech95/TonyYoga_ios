import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Video, PlayCircle, Flame } from "lucide-react";
import Logo from "@/components/Logo";
import LanguageToggle from "@/components/LanguageToggle";
import { useSiteImagesState, siteImage } from "@/lib/siteData";

/** First screen of the Android / iPhone app for someone who isn't signed in:
 *  Tony's photo, what the app offers, and clear "Create account" / "Sign in" buttons. */
export default function AppWelcome() {
  const { t } = useTranslation();
  const { images, ready } = useSiteImagesState();
  const photo = siteImage(images, "app_home") || siteImage(images, "hero");
  const [loaded, setLoaded] = useState(false);

  const features = [
    { icon: Video, label: t("welcome.f_live", "Live classes") },
    { icon: PlayCircle, label: t("welcome.f_courses", "Tony's courses") },
    { icon: Flame, label: t("welcome.f_track", "Your progress") },
  ];

  return (
    <div data-testid="app-welcome" className="relative min-h-[100dvh] overflow-hidden bg-[#1C221F] text-[#FAFAF7] flex flex-col">
      {/* Photo from Admin → Site images; a calm dark background until it has loaded */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#2B332E] via-[#1F2622] to-[#141815]" />
      {ready && photo && (
        <img
          src={photo}
          alt=""
          onLoad={() => setLoaded(true)}
          className={`absolute inset-0 h-full w-full object-cover object-[center_20%] transition-opacity duration-700 ${loaded ? "opacity-100" : "opacity-0"}`}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/5 to-black/90" />
      <div className="absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-t from-black/85 via-black/60 to-transparent" />

      <div className="relative z-10 flex items-center justify-between px-5" style={{ paddingTop: "calc(var(--sat, 0px) + 14px)" }}>
        <div className="flex items-center gap-3">
          <Logo className="h-12 w-12 ring-2 ring-white/70" />
          <div className="text-[11px] uppercase tracking-[0.28em] font-semibold text-white/85">Tony Yoga</div>
        </div>
        <LanguageToggle />
      </div>

      <div className="relative z-10 mt-auto px-6" style={{ paddingBottom: "calc(var(--sab, 0px) + 28px)" }}>
        <p className="text-[11px] uppercase tracking-[0.3em] text-[#F3C9BB] font-semibold [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">{t("welcome.eyebrow", "Since 1986 · Ghosh lineage")}</p>
        <h1 className="serif text-[40px] leading-[1.05] mt-3" data-testid="app-welcome-title">
          {t("welcome.title", "Your mat is ready.")}
        </h1>
        <p className="text-[15px] leading-relaxed text-white/80 mt-3 max-w-sm">
          {t("welcome.subtitle", "Practice with Tony Sanchez — live classes, guided courses and the 84 asanas, wherever you are.")}
        </p>

        <ul className="mt-5 flex flex-wrap gap-2">
          {features.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 px-3 py-1.5 text-[12px] font-medium">
              <Icon className="h-3.5 w-3.5 text-[#E8B8A8]" />{label}
            </li>
          ))}
        </ul>

        <div className="mt-7 space-y-3">
          <Link to="/register" data-testid="app-welcome-register" className="flex w-full items-center justify-center rounded-full bg-[#B25A45] py-4 text-[15px] font-semibold text-white shadow-lg shadow-black/20 active:scale-[0.99] transition">
            {t("welcome.create", "Create free account")}
          </Link>
          <Link to="/login" data-testid="app-welcome-login" className="flex w-full items-center justify-center rounded-full border border-white/50 bg-white/10 backdrop-blur-sm py-4 text-[15px] font-semibold text-white active:scale-[0.99] transition">
            {t("welcome.signin", "I already have an account")}
          </Link>
          <Link to="/programs" data-testid="app-welcome-explore" className="block w-full text-center py-2 text-[13px] font-medium text-white/75 underline-offset-4 hover:underline">
            {t("welcome.explore", "Look around first")}
          </Link>
        </div>
      </div>
    </div>
  );
}
