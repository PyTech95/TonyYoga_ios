import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, Link, useLocation, useOutlet } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Home, Calendar, GraduationCap, ShoppingBag, Menu as MenuIcon, User, Shield, LayoutDashboard, LifeBuoy, Flower2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import { HeaderTools, ShellContext } from "@/components/HeaderTools";
import ErrorBoundary from "@/components/ErrorBoundary";

const MEMBER_ITEMS = [
  { to: "/home", labelKey: "nav.home", icon: Home, tid: "nav-home" },
  { to: "/schedule", labelKey: "nav.schedule", icon: Calendar, tid: "nav-schedule" },
  { to: "/programs", labelKey: "nav.programs", icon: GraduationCap, tid: "nav-programs" },
  { to: "/my-yoga", labelKey: "nav.my_yoga", label: "My Yoga", icon: Flower2, tid: "nav-my-yoga" },
  { to: "/menu", labelKey: "nav.menu", icon: MenuIcon, tid: "nav-menu" },
  { to: "/profile", labelKey: "nav.profile", icon: User, tid: "nav-profile" },
];

// Admins get a content-management focused nav so the app behaves like an admin
// console, not the member app. Library stays hidden for now (lessons come later).
const ADMIN_ITEMS = [
  { to: "/admin", labelKey: "nav.console", icon: LayoutDashboard, tid: "nav-admin" },
  { to: "/schedule", labelKey: "nav.classes", icon: Calendar, tid: "nav-schedule" },
  { to: "/programs", labelKey: "nav.programs", icon: GraduationCap, tid: "nav-programs" },
  { to: "/profile", labelKey: "nav.profile", icon: User, tid: "nav-profile" },
];

const COLS = { 4: "grid-cols-4", 5: "grid-cols-5", 6: "grid-cols-6" };
const GUEST_ITEMS = [
  { to: '/', labelKey: 'nav.home', icon: Home, tid: 'nav-home' },
  { to: '/schedule', labelKey: 'nav.schedule', icon: Calendar, tid: 'nav-schedule' },
  { to: '/programs', labelKey: 'nav.programs', icon: GraduationCap, tid: 'nav-programs' },
  { to: '/shop', labelKey: 'nav.shop', icon: ShoppingBag, tid: 'nav-shop' },
  { to: '/support', label: 'Help', icon: LifeBuoy, tid: 'nav-help' },
  { to: '/login', label: 'Sign in', icon: User, tid: 'nav-signin' },
];

// The page that is fading out keeps showing itself (not the next page) during the transition,
// so the next page mounts once — no double data loading and no lost typing.
function FrozenOutlet() {
  const outlet = useOutlet();
  const [frozen] = useState(outlet);
  return frozen;
}

export default function AppShell() {
  const loc = useLocation();
  const { user } = useAuth();
  const { t } = useTranslation();
  const isAdmin = user?.role === "admin";
  const isStaff = isAdmin || user?.role === "instructor";

  // Hide bottom nav on marketing/auth screens
  const hideNav = ["/", "/welcome", "/login", "/register", "/reset-password", "/magic-link"].includes(loc.pathname);
  const showStaffBar = isStaff && !hideNav;

  const items = isAdmin ? ADMIN_ITEMS : user ? MEMBER_ITEMS : GUEST_ITEMS;

  // Screens with a PageHeader render the tools in their own top row; count them so the
  // shell only shows its pinned cluster on screens without one (e.g. the Home hero).
  const [headers, setHeaders] = useState(0);
  const registerHeader = useCallback(() => {
    setHeaders((n) => n + 1);
    return () => setHeaders((n) => Math.max(0, n - 1));
  }, []);
  const shell = useMemo(() => ({ registerHeader, showTools: !hideNav }), [registerHeader, hideNav]);

  // On phones, hide the tab bar while the keyboard is up. Android resizes the web view
  // for the keyboard, which pushed the fixed tab bar up over the field being typed in.
  useEffect(() => {
    if (!window.matchMedia?.("(pointer: coarse)").matches) return undefined;
    const NON_TEXT = ["checkbox", "radio", "range", "button", "submit", "reset", "file", "color", "image"];
    const isField = (el) => !!el && (el.tagName === "TEXTAREA" || el.isContentEditable || (el.tagName === "INPUT" && !NON_TEXT.includes(el.type)));
    let timer;
    const onIn = (e) => { if (isField(e.target)) { clearTimeout(timer); document.body.classList.add("ty-typing"); } };
    const onOut = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { if (!isField(document.activeElement)) document.body.classList.remove("ty-typing"); }, 80);
    };
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("focusout", onOut);
      document.body.classList.remove("ty-typing");
    };
  }, []);

  // On notched phones content scrolls up under the transparent status bar. Fade in a
  // cream backing behind the clock / battery icons once the page is scrolled.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  // Lets floating buttons (Ask Tony, app downloads) sit above the tab bar only when it exists.
  useEffect(() => {
    document.body.classList.toggle("ty-has-tabbar", !hideNav);
    return () => document.body.classList.remove("ty-has-tabbar");
  }, [hideNav]);

  // Reset scroll to top on every route change (deep links / back-forward feel clean).
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }, [loc.pathname]);

  return (
    <ShellContext.Provider value={shell}>
      <div className="min-h-screen bg-[#FAFAF7]" style={showStaffBar ? { "--page-top": "0px" } : undefined}>
        {/* Staff mode banner — makes it obvious you're not in the member experience */}
        {showStaffBar && (
          <div
            data-testid="staff-mode-bar"
            className="sticky top-0 z-50 bg-[#1C221F] text-[#FAFAF7]"
            style={{ paddingTop: "var(--sat)" }}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-2" style={{ paddingLeft: "max(1rem, var(--sal))", paddingRight: "max(1rem, var(--sar))" }}>
              <div className="flex min-w-0 items-center gap-2 text-[12px]">
                <Shield className="h-3.5 w-3.5 shrink-0 text-[#B25A45]" />
                <span className="font-semibold truncate">{isAdmin ? t("shell.admin_mode") : t("shell.instructor_mode")}</span>
                <span className="hidden sm:inline truncate text-white/55">· {t("shell.signed_in_as")} {user?.email}</span>
              </div>
              <Link
                to={isAdmin ? "/admin" : "/instructor"}
                data-testid="staff-mode-open-console"
                className="shrink-0 rounded-full bg-[#B25A45] px-3 py-1.5 text-[12px] font-semibold hover:bg-[#9d4d3b] transition-colors"
              >
                {isAdmin ? t("shell.open_console") : t("shell.instructor_studio")}
              </Link>
            </div>
          </div>
        )}

        {!showStaffBar && (
          <div
            aria-hidden="true"
            data-testid="status-bar-scrim"
            className={`pointer-events-none fixed inset-x-0 top-0 z-[45] bg-[#FAFAF7]/90 backdrop-blur-md transition-opacity duration-200 ${scrolled ? "opacity-100" : "opacity-0"}`}
            style={{ height: "var(--sat)" }}
          />
        )}

        <AnimatePresence mode="wait" initial={false}>
          <motion.main
            key={loc.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] } }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            className={`relative ${hideNav ? "" : "safe-bottom"}`}
          >
            {!hideNav && headers === 0 && (
              <div
                className="absolute z-30 flex items-center gap-2"
                style={{ top: "calc(var(--page-top) + 12px)", right: "max(1rem, var(--sar))" }}
              >
                <HeaderTools />
              </div>
            )}
            <ErrorBoundary resetKey={loc.pathname}>
              <FrozenOutlet />
            </ErrorBoundary>
          </motion.main>
        </AnimatePresence>

        {!hideNav && (
          <nav
            data-testid="bottom-nav"
            className="fixed bottom-0 inset-x-0 z-40 border-t border-[#E5E6DF] bg-white/90 backdrop-blur-xl"
            style={{ paddingBottom: "var(--sab)", paddingLeft: "var(--sal)", paddingRight: "var(--sar)" }}
          >
            <ul className={`mx-auto grid max-w-2xl ${COLS[items.length] || "grid-cols-5"} px-1.5 py-1.5`}>
              {items.map(({ to, label, labelKey, icon: Icon, tid }) => (
                <li key={to} className="min-w-0">
                  <NavLink to={to} end={to === "/"} data-testid={tid} className="block">
                    {({ isActive }) => (
                      <div className="relative flex min-h-[52px] flex-col items-center justify-center gap-1 py-1.5">
                        {isActive && (
                          <motion.span
                            layoutId="nav-pill"
                            className="absolute inset-x-1.5 inset-y-0.5 rounded-2xl"
                            style={{ background: "rgba(178,90,69,0.10)" }}
                            transition={{ type: "spring", stiffness: 500, damping: 40 }}
                          />
                        )}
                        <Icon
                          className={`relative h-5 w-5 transition-transform duration-200 ${isActive ? "text-[#B25A45] scale-110" : "text-[#6B7269]"}`}
                          strokeWidth={isActive ? 2 : 1.6}
                        />
                        <span className={`relative block max-w-full truncate px-0.5 text-[10px] leading-tight transition-colors ${isActive ? "font-semibold text-[#B25A45]" : "font-medium text-[#6B7269]"}`}>
                          {labelKey ? t(labelKey, label) : label}
                        </span>
                      </div>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    </ShellContext.Provider>
  );
}
