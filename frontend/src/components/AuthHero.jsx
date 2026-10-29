import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Logo from "@/components/Logo";
import LanguageToggle from "@/components/LanguageToggle";
import { useSiteImagesState, siteImage } from "@/lib/siteData";
import { isNativeApp } from "@/lib/platform";

/** Photo header for the sign-in / sign-up screens (Tony's photo from Admin → Site images). */
export default function AuthHero({ eyebrow, title, testId }) {
  const { images, ready } = useSiteImagesState();
  const photo = siteImage(images, "app_home") || siteImage(images, "hero");
  const [loaded, setLoaded] = useState(false);
  const nav = useNavigate();
  const location = useLocation();
  const canGoBack = location.key !== "default";
  const home = "/";

  return (
    <header data-testid={testId} className="relative h-[34vh] min-h-[230px] max-h-[340px] overflow-hidden bg-[#2B332E] text-[#FAFAF7] rounded-b-[32px]">
      {ready && photo && (
        <img src={photo} alt="" onLoad={() => setLoaded(true)}
          className={`absolute inset-0 h-full w-full object-cover object-[center_22%] transition-opacity duration-700 ${loaded ? "opacity-100" : "opacity-0"}`} />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/15 to-black/75" />
      <div className="relative z-10 flex items-center justify-between px-4" style={{ paddingTop: "calc(var(--sat, 0px) + 10px)" }}>
        {canGoBack || !isNativeApp() ? (
          <button type="button" onClick={() => (canGoBack ? nav(-1) : nav(home, { replace: true }))} data-testid="header-back" aria-label="Back"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/25 backdrop-blur-sm">
            <ArrowLeft className="h-5 w-5" strokeWidth={1.8} />
          </button>
        ) : <Link to={home} aria-label="Tony Yoga"><Logo className="h-11 w-11 ring-2 ring-white/70" /></Link>}
        <LanguageToggle />
      </div>
      <div className="absolute inset-x-0 bottom-0 z-10 px-6 pb-6">
        <div className="mx-auto max-w-md flex items-end gap-3">
          <Logo className="h-12 w-12 ring-2 ring-white/70 hidden sm:block" />
          <div>
            {eyebrow && <div className="text-[11px] uppercase tracking-[0.26em] font-semibold text-[#E8B8A8]">{eyebrow}</div>}
            <h1 className="serif text-[32px] leading-tight mt-1">{title}</h1>
          </div>
        </div>
      </div>
    </header>
  );
}
