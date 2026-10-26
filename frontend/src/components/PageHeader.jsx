import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Logo from "./Logo";
import { HeaderTools, useShellHeader } from "./HeaderTools";
import { isNativeApp } from "@/lib/platform";
import { useAuth } from "@/lib/auth";

export default function PageHeader({ title, eyebrow, action, back = false, testId, showLogo = false, width = "max-w-2xl" }) {
  const nav = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const showTools = useShellHeader();
  const native = isNativeApp();
  const hasHistory = location.key !== "default";
  // In the app there is no web landing page: "home" is the member home (or sign-in).
  const homePath = native ? (user ? "/home" : "/login") : "/";
  // Opened straight from a deep link / app launch with nothing to go back to.
  const showBack = back && (hasHistory || !native || location.pathname !== homePath);

  const left = showBack ? (
    <button
      onClick={() => (hasHistory ? nav(-1) : nav(homePath, { replace: true }))}
      data-testid="header-back"
      className="flex h-10 w-10 items-center justify-center rounded-full -ml-2 hover:bg-[#F2F2EC] active:bg-[#ECECE4] transition-colors"
      aria-label="Back"
    >
      <ArrowLeft className="h-5 w-5" strokeWidth={1.6} />
    </button>
  ) : native || showLogo ? (
    <Link to={homePath} aria-label="Tony Yoga home" data-testid={`${testId || "page"}-home-link`} className="inline-flex items-center">
      <Logo className={showLogo ? "h-14 w-14 sm:h-16 sm:w-16" : "h-10 w-10"} />
    </Link>
  ) : (
    <Link to="/" aria-label="Tony Yoga home" data-testid={`${testId || "page"}-home-link`} className="inline-flex items-center gap-2 text-xs font-semibold text-[#6B7269] py-2">
      ← Tony Yoga home
    </Link>
  );

  return (
    <header
      className="px-5 pb-4"
      style={{ paddingTop: "calc(var(--page-top) + 12px)", paddingLeft: "max(1.25rem, var(--sal))", paddingRight: "max(1.25rem, var(--sar))" }}
      data-testid={testId}
    >
      <div className={`mx-auto ${width}`}>
        <div className="flex min-h-[44px] items-center justify-between gap-3 mb-3">
          <div className="min-w-0 flex items-center">{left}</div>
          {(action || showTools) && (
            <div className="flex min-w-0 items-center justify-end gap-2">
              {action}
              {showTools && <HeaderTools />}
            </div>
          )}
        </div>
        {eyebrow && <div className="eyebrow mb-2" data-testid={`${testId || "page"}-eyebrow`}>{eyebrow}</div>}
        {title && <h1 className="serif text-[2rem] leading-[1.08] min-[380px]:text-4xl sm:text-5xl font-medium break-words" data-testid={`${testId || "page"}-title`}>{title}</h1>}
      </div>
    </header>
  );
}
