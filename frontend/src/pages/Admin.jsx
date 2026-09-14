import { Suspense, useEffect, useState } from "react";
import { Navigate, Link, useNavigate, useSearchParams } from "react-router-dom";
import { Menu, ArrowUpRight, ChevronRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import NotificationBell from "@/components/NotificationBell";
import { AdminSidebar } from "./admin/AdminSidebar";
import { ADMIN_NAV } from "./admin/adminNavigation";
import { ADMIN_PANES } from "./admin/adminPanes";
import "./admin/admin.css";

export default function Admin() {
  const { user, ready, logout } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const [desktop, setDesktop] = useState(() => window.matchMedia("(min-width: 1024px)").matches);
  const active = ADMIN_NAV.find(item => item.key === params.get("tab")) || ADMIN_NAV[0];
  const Pane = ADMIN_PANES[active.key];
  const selectTab = key => { setParams(key === "stats" ? {} : { tab: key }); setOpen(false); };
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => { setDesktop(media.matches); setOpen(false); };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [active.key]);
  if (!ready) return <p data-testid="admin-session-loading">Checking session…</p>;
  if (!user || user.role !== "admin") return <Navigate to="/home" replace />;
  const sidebar = <AdminSidebar tab={active.key} selectTab={selectTab} user={user} onLogout={async () => { await logout(); navigate("/login", { replace: true }); }} />;

  return <div className="admin-workspace" data-testid="admin-page">
    {desktop ? <aside className="admin-desktop-sidebar">{sidebar}</aside> : <Sheet open={open} onOpenChange={setOpen}><SheetContent side="left" className="admin-mobile-sheet" data-testid="admin-menu-drawer" closeTestId="admin-menu-close" aria-describedby={undefined}><SheetTitle className="sr-only">Admin navigation</SheetTitle>{sidebar}</SheetContent></Sheet>}
    <div className="admin-main">
      <header className="admin-topbar">
        <div className="admin-breadcrumb">{!desktop && <button className="admin-icon-button" data-testid="admin-menu-open" aria-label="Open admin menu" title="Open menu" onClick={() => setOpen(true)}><Menu size={21} /></button>}<span className="hidden sm:inline">Workspace</span><ChevronRight size={13} className="hidden sm:inline" /><strong data-testid="admin-current-section">{active.label}</strong></div>
        <div className="admin-top-actions"><Link to="/" data-testid="admin-view-website" className="admin-website-link">View website <ArrowUpRight size={15} /></Link><NotificationBell /></div>
      </header>
      <main className="admin-content" data-testid="admin-main-content">
        {active.key !== "stats" && <div className="admin-page-heading"><p className="admin-kicker">MANAGEMENT</p><h1 data-testid="admin-header">{active.label}</h1></div>}
        <Suspense fallback={<p data-testid="admin-pane-loading" className="py-10 text-sm">Loading workspace…</p>}><Pane key={active.key} /></Suspense>
      </main>
    </div>
  </div>;
}