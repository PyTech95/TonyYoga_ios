import { createContext, useContext, useLayoutEffect } from "react";
import { useAuth } from "@/lib/auth";
import NotificationBell from "@/components/NotificationBell";
import LanguageToggle from "@/components/LanguageToggle";
import CreditIndicator from "@/components/CreditIndicator";

/**
 * The member shell shows a small cluster of tools (gift credit, language, notifications)
 * at the top of every screen. It used to float as `position: fixed` over the page,
 * which covered page actions (cart, wishlist heart) and slid over content while
 * scrolling. Now a page header renders the tools inline in its top row; screens
 * without a header (e.g. the Home hero) get the cluster pinned to the top of the
 * page instead, so it scrolls away with the content.
 */
export const ShellContext = createContext(null);

/** Register the calling component as the screen's header. Returns whether the
 *  header should render the shell tools (false outside the tabbed app shell). */
export function useShellHeader() {
  const shell = useContext(ShellContext);
  const register = shell?.registerHeader;
  useLayoutEffect(() => (register ? register() : undefined), [register]);
  return !!shell?.showTools;
}

export function HeaderTools({ className = "" }) {
  const { user } = useAuth();
  const isStaff = user?.role === "admin" || user?.role === "instructor";
  return (
    <div className={`flex items-center gap-2 shrink-0 ${className}`} data-testid="header-tools">
      {/* Gift credit is also shown on Profile; skip it on the narrowest phones so the
          header row never overflows. */}
      {!isStaff && <div className="hidden min-[380px]:block"><CreditIndicator /></div>}
      <LanguageToggle />
      {user && <NotificationBell />}
    </div>
  );
}
