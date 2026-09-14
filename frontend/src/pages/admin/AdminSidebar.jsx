import { useState } from "react";
import { Link } from "react-router-dom";
import { Search, LogOut, ArrowUpRight, X, ShieldCheck } from "lucide-react";
import Logo from "@/components/Logo";
import { ADMIN_GROUPS } from "./adminNavigation";

export const AdminSidebar = ({ tab, selectTab, user, onLogout }) => {
  const [search, setSearch] = useState("");
  const groups = ADMIN_GROUPS.map(group => ({ ...group, items: group.items.filter(item => `${group.label} ${item.label}`.toLowerCase().includes(search.toLowerCase())) })).filter(group => group.items.length);
  return <div className="admin-sidebar-inner" data-testid="admin-sidebar">
    <Link to="/admin" className="admin-brand" data-testid="admin-brand"><Logo className="h-11 w-11" /><span><strong>Tony Yoga</strong><small>ADMIN WORKSPACE</small></span></Link>
    <div className="admin-nav-search"><Search size={15} aria-hidden="true" /><input data-testid="admin-menu-search" aria-label="Find a menu" value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a menu…" />{search && <button data-testid="admin-menu-search-clear" onClick={() => setSearch("")} aria-label="Clear menu search" title="Clear search"><X size={14} /></button>}</div>
    <nav className="admin-navigation" data-testid="admin-tabs" aria-label="Admin management">
      {groups.map(group => <section key={group.label} className="admin-nav-group">
        <h2>{group.label}</h2>
        {group.items.map(({ key, label, icon: Icon }) => <button key={key} data-testid={`admin-tab-${key}`} aria-current={tab === key ? "page" : undefined} onClick={() => selectTab(key)} className={`admin-nav-item ${tab === key ? "is-active" : ""}`}><Icon size={17} strokeWidth={1.7} /><span>{label}</span>{tab === key && <span className="admin-active-dot" aria-hidden="true" />}</button>)}
      </section>)}
      {!groups.length && <p data-testid="admin-menu-empty" className="p-3 text-sm text-white/70">No matching menus.</p>}
    </nav>
    <div className="admin-sidebar-footer">
      <Link to="/home" className="admin-preview-link" data-testid="admin-preview-member"><ArrowUpRight size={16} /> View member app</Link>
      <div className="admin-account"><div className="admin-avatar" aria-hidden="true">{(user.name || user.email).slice(0, 1).toUpperCase()}</div><div className="min-w-0"><strong data-testid="admin-account-name">{user.name || "Administrator"}</strong><span data-testid="admin-account-role"><ShieldCheck size={11} /> Administrator</span></div><button onClick={onLogout} data-testid="admin-logout" aria-label="Sign out" title="Sign out"><LogOut size={17} /></button></div>
    </div>
  </div>;
};