"use client";

import {
  Bell,
  BookOpenCheck,
  BriefcaseBusiness,
  Building2,
  ChevronDown,
  FileClock,
  FileSpreadsheet,
  LayoutDashboard,
  Search,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/clients", label: "Clients", icon: Users, count: 4 },
  { href: "/imports", label: "Imports", icon: FileClock },
  { href: "/review", label: "Review Queue", icon: BookOpenCheck, count: 7 },
  { href: "/workpapers", label: "Workpapers", icon: FileSpreadsheet },
  { href: "/integrations", label: "Integrations", icon: BriefcaseBusiness },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/dashboard" aria-label="Nexus Tax dashboard">
          <span className="brand-mark">N</span>
          <span>
            <strong>Nexus Tax</strong>
            <small>Professional</small>
          </span>
        </Link>
        <label className="global-search">
          <Search size={15} aria-hidden="true" />
          <span className="sr-only">Search clients and returns</span>
          <input placeholder="Search clients, returns, or screens" />
          <kbd>⌘ K</kbd>
        </label>
        <div className="topbar-actions">
          <span className="environment"><span /> Development</span>
          <button className="icon-button" aria-label="Notifications"><Bell size={17} /><span className="notification-dot" /></button>
          <button className="user-menu">
            <span className="avatar">MC</span>
            <span className="user-copy"><strong>Maya Chen</strong><small>Preparer</small></span>
            <ChevronDown size={14} />
          </button>
        </div>
      </header>
      <aside className="sidebar">
        <nav aria-label="Primary navigation">
          <span className="nav-heading">Workspace</span>
          {nav.map(({ href, label, icon: Icon, count }) => {
            const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
            return (
              <Link className={`nav-link ${active ? "active" : ""}`} href={href} key={href}>
                <Icon size={17} aria-hidden="true" /><span>{label}</span>{count ? <span className="nav-count">{count}</span> : null}
              </Link>
            );
          })}
          <span className="nav-heading nav-heading-spaced">System</span>
          <Link className="nav-link" href="/administration"><ShieldCheck size={17} /><span>Administration</span></Link>
          <Link className="nav-link" href="/settings"><Settings size={17} /><span>Settings</span></Link>
        </nav>
        <div className="firm-card">
          <Building2 size={17} />
          <span><strong>Meridian Tax Group</strong><small>Firm workspace</small></span>
          <ChevronDown size={14} />
        </div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}
