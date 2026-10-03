import { isIOSApp } from "@/lib/iosPlatform";
import { useEffect } from "react";
import { NavLink, Link, useLocation, Outlet } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Home, Calendar, GraduationCap, ShoppingBag, Menu as MenuIcon, User, Shield, LayoutDashboard, Play, LifeBuoy } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import NotificationBell from "@/components/NotificationBell";
import LanguageToggle from "@/components/LanguageToggle";
import CreditIndicator from "@/components/CreditIndicator";

const MEMBER_ITEMS = [
  { to: "/home", labelKey: "nav.home", icon: Home, tid: "nav-home" },
  { to: "/schedule", labelKey: "nav.schedule", icon: Calendar, tid: "nav-schedule" },
  { to: "/programs", labelKey: "nav.programs", icon: GraduationCap, tid: "nav-programs" },
  { to: "/shop", labelKey: "nav.shop", icon: ShoppingBag, tid: "nav-shop" },
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

export default function AppShell() {
  const loc = useLocation();
  const { user } = useAuth();
  const { t } = useTranslation();
  const isAdmin = user?.role === "admin";
  const isStaff = isAdmin || user?.role === "instructor";

  // Hide bottom nav on marketing/auth screens
  const hideNav = ["/", "/welcome", "/login", "/register", "/reset-password", "/magic-link"].includes(loc.pathname);

  const items = isAdmin ? ADMIN_ITEMS : user ? MEMBER_ITEMS : GUEST_ITEMS;

  // Reset scroll to top on every route change (deep links / back-forward feel clean).
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }, [loc.pathname]);

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      {/* Staff mode banner — makes it obvious you're not in the member experience */}
      {isStaff && !hideNav && (
        <div
          data-testid="staff-mode-bar"
          className="sticky top-0 z-50 flex items-center justify-between gap-3 bg-[#1C221F] px-4 py-2 text-[#FAFAF7]"
        >
          <div className="flex items-center gap-2 text-[12px]">
            <Shield className="h-3.5 w-3.5 text-[#B25A45]" />
            <span className="font-semibold">{isAdmin ? t("shell.admin_mode") : t("shell.instructor_mode")}</span>
            <span className="hidden sm:inline text-white/55">· {t("shell.signed_in_as")} {user?.email}</span>
          </div>
          <Link
            to={isAdmin ? "/admin" : "/instructor"}
            data-testid="staff-mode-open-console"
            className="rounded-full bg-[#B25A45] px-3 py-1 text-[12px] font-semibold hover:bg-[#9d4d3b] transition"
          >
            {isAdmin ? t("shell.open_console") : t("shell.instructor_studio")}
          </Link>
        </div>
      )}

          {!hideNav && (
            <div className="fixed right-4 z-50 flex items-center gap-2" style={{ top: isStaff ? "3rem" : "0.75rem" }}>
              {!isStaff && <CreditIndicator />}
              <LanguageToggle />
              {user && <NotificationBell />}
            </div>
          )}

      <AnimatePresence mode="wait" initial={false}>
        <motion.main
          key={loc.pathname}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          className={hideNav ? "" : `safe-bottom ${isIOSApp() ? "ios-header-space" : ""}`}
        >
          <Outlet />
        </motion.main>
      </AnimatePresence>

      {!hideNav && (
        <nav
          data-testid="bottom-nav"
          className="fixed bottom-0 inset-x-0 z-40 border-t border-[#E5E6DF] bg-white/85 backdrop-blur-xl"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <ul className={`mx-auto grid max-w-2xl ${COLS[items.length] || "grid-cols-5"} px-2 py-1.5`}>
            {items.map(({ to, label, labelKey, icon: Icon, tid }) => (
              <li key={to}>
                <NavLink to={to} data-testid={tid} className="block">
                  {({ isActive }) => (
                    <div className="relative flex flex-col items-center gap-1 py-2">
                      {isActive && (
                        <motion.span
                          layoutId="nav-pill"
                          className="absolute inset-x-3 inset-y-1 rounded-2xl"
                          style={{ background: "rgba(178,90,69,0.10)" }}
                          transition={{ type: "spring", stiffness: 500, damping: 40 }}
                        />
                      )}
                      <Icon
                        className={`relative h-5 w-5 transition-transform duration-200 ${isActive ? "text-[#B25A45] scale-110" : "text-[#6B7269]"}`}
                        strokeWidth={isActive ? 2 : 1.6}
                      />
                      <span className={`relative text-[10px] transition-colors ${isActive ? "font-semibold text-[#B25A45]" : "font-medium text-[#6B7269]"}`}>
                        {label || t(labelKey)}
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
  );
}
