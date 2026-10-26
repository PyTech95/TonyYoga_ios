import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { Menu, X, ArrowRight } from "lucide-react";
import Logo from "@/components/Logo";
import LanguageToggle from "@/components/LanguageToggle";
import { useAuth } from "@/lib/auth";
import { useCmsPages } from "@/lib/siteData";

const LINKS = [
  { to: "/programs", label: "Programs" },
  { to: "/schedule", label: "Live classes" },
  { to: "/private-sessions", label: "Private sessions" },
  { to: "/workshops", label: "Retreats" },
  { to: "/locations", label: "Locations" },
];

/** Header for public website pages that sit outside the app shell (e.g. Locations). */
export default function SiteHeader() {
  const { user } = useAuth();
  const pages = useCmsPages();
  // Built-in links plus pages marked "Show in website menu" in Admin → Custom pages.
  const links = [...LINKS, ...pages.filter((p) => p.show_in_header).map((p) => ({ to: `/${p.slug}`, label: p.menu_label || p.title }))];
  // With extra pages the full menu needs a wider screen; below that the burger menu is used.
  const wide = links.length > 5;
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header
      data-testid="site-header"
      className={`sticky top-0 z-50 transition-colors ${scrolled || open ? "bg-[#FAFAF7]/95 backdrop-blur-xl border-b border-[#E5E6DF]" : "bg-[#FAFAF7]"}`}
      style={{ paddingTop: "var(--sat, 0px)" }}
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <Link to="/" aria-label="Tony Yoga home" className="flex items-center gap-3 min-w-0">
          <Logo className="h-12 w-12 sm:h-14 sm:w-14" />
          <span className="serif text-lg sm:text-xl text-[#1C221F] hidden min-[380px]:inline">Tony Yoga</span>
        </Link>
        <nav className={`hidden ${wide ? "xl:flex" : "lg:flex"} items-center gap-6 xl:gap-7`} aria-label="Main">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) => `text-sm transition-colors ${isActive ? "text-[#B25A45] font-semibold" : "text-[#545E56] hover:text-[#B25A45]"}`}>{l.label}</NavLink>
          ))}
        </nav>
        <div className={`hidden ${wide ? "xl:flex" : "lg:flex"} items-center gap-3`}>
          <LanguageToggle />
          <Link to={user ? "/home" : "/register"} className="pill pill-primary !py-2 !px-4 !text-[13px]">
            {user ? "Open my practice" : "Start free"} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          className={`${wide ? "xl:hidden" : "lg:hidden"} h-11 w-11 shrink-0 rounded-full border border-[#E5E6DF] bg-white flex items-center justify-center`}
        >
          {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </div>
      {open && (
        <div className={`${wide ? "xl:hidden" : "lg:hidden"} border-t border-[#E5E6DF] px-4 sm:px-6 py-3`}>
          <ul className="space-y-1">
            {links.map((l) => (
              <li key={l.to}><Link to={l.to} onClick={() => setOpen(false)} className="block rounded-xl px-2 py-3 text-[15px] font-medium text-[#1C221F] hover:bg-[#F2F2EC]">{l.label}</Link></li>
            ))}
            <li className="flex items-center justify-between gap-3 pt-3 border-t border-[#E5E6DF] mt-2">
              <LanguageToggle />
              <Link to={user ? "/home" : "/register"} onClick={() => setOpen(false)} className="pill pill-primary !py-2.5 !px-5 !text-[13px]">
                {user ? "Open my practice" : "Start free"} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </li>
          </ul>
        </div>
      )}
    </header>
  );
}
