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
  LogOut,
  Search,
  Settings,
  ShieldCheck,
  ListChecks,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ClientSummary } from "@/domain/types";

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
  const [identity, setIdentity] = useState({ displayName: "Workspace user", firmName: "Firm workspace", role: "member" });
  useEffect(() => { const controller = new AbortController(); void fetch("/api/auth/me", { cache: "no-store", signal: controller.signal }).then(async (response) => response.ok ? response.json() : null).then((value) => { if (value) setIdentity(value); }).catch(() => undefined); return () => controller.abort(); }, []);
  async function signOut() { await fetch("/api/auth/logout", { method: "POST" }); window.location.assign("/login"); }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header className="topbar">
        <Link className="brand" href="/dashboard" aria-label="Nexus Tax dashboard">
          <span className="brand-mark">N</span>
          <span>
            <strong>Nexus Tax</strong>
            <small>Professional</small>
          </span>
        </Link>
        <ClientSearch />
        <div className="topbar-actions">
          <span className="environment"><span /> Secure session</span>
          <button className="icon-button" aria-label="Notifications"><Bell size={17} /><span className="notification-dot" /></button>
          <button className="user-menu" onClick={signOut} aria-label={`Sign out ${identity.displayName}`} title="Sign out">
            <span className="avatar">{initials(identity.displayName)}</span>
            <span className="user-copy"><strong>{identity.displayName}</strong><small>{identity.role.replaceAll("_", " ")}</small></span>
            <LogOut size={14} />
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
          <Link className={`nav-link ${pathname === "/administration" ? "active" : ""}`} href="/administration"><ShieldCheck size={17} /><span>Administration</span></Link>
          <Link className={`nav-link ${pathname.startsWith("/administration/release-closure") ? "active" : ""}`} href="/administration/release-closure"><ListChecks size={17} /><span>Release closure</span></Link>
          <Link className="nav-link" href="/settings"><Settings size={17} /><span>Settings</span></Link>
        </nav>
        <div className="firm-card">
          <Building2 size={17} />
          <span><strong>{identity.firmName}</strong><small>Firm workspace</small></span>
          <ChevronDown size={14} />
        </div>
      </aside>
      <main className="main-content" id="main-content" tabIndex={-1}>{children}</main>
    </div>
  );
}

function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "NU"; }

function ClientSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClientSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestSequence = useRef(0);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault(); inputRef.current?.focus(); setOpen(true);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const clean = query.trim();
    if (clean.length < 2) { setResults([]); setLoading(false); setError(null); return; }
    const sequence = ++requestSequence.current;
    setLoading(true); setError(null);
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/search/clients", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: clean }), signal: controller.signal });
        const body = await response.json();
        if (sequence !== requestSequence.current) return;
        if (!response.ok) { setResults([]); setError(body.message ?? "Search unavailable."); }
        else { setResults(body.clients ?? []); setOpen(true); }
      } catch (caught) {
        if ((caught as Error).name !== "AbortError" && sequence === requestSequence.current) { setResults([]); setError("Search unavailable."); }
      } finally { if (sequence === requestSequence.current) setLoading(false); }
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);

  const listId = "global-client-search-results";
  return <div className="global-search-wrap" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <label className="global-search">
      <Search size={15} aria-hidden="true" />
      <span className="sr-only">Search assigned clients and returns</span>
      <input ref={inputRef} role="combobox" aria-label="Search assigned clients and returns" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" autoComplete="off" placeholder="Search assigned clients" value={query} onFocus={() => setOpen(true)} onChange={(event) => setQuery(event.target.value)} />
      <kbd>⌘ K</kbd>
    </label>
    {open && query.trim().length >= 2 ? <div className="global-search-results" id={listId} role="listbox" aria-label="Client search results">
      {loading ? <p role="status">Searching…</p> : error ? <p role="alert">{error}</p> : results.length ? results.map((client) => <Link key={`${client.id}:${client.taxYear}`} role="option" aria-selected="false" href={`/clients/${client.id}/years/${client.taxYear}`} onClick={() => setOpen(false)}><span><strong>{client.taxpayer}</strong><small>{client.code} · {client.maskedTin}</small></span><span>{client.taxYear}<small>{client.status}</small></span></Link>) : <p>No assigned clients found.</p>}
    </div> : null}
  </div>;
}
