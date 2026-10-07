"use client";

import {
  AlertCircle,
  ArrowLeft,
  Calculator,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Download,
  ExternalLink,
  FileText,
  Keyboard,
  MoreHorizontal,
  Plus,
  Save,
  Search,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { diagnostics, money, w2Records } from "@/domain/demo-data";
import { SeverityIcon, StatusPill } from "./status";
import type { TaxYearWorkspaceRecord } from "@/server/client-repository";

interface WorkspaceTreeItem { name: string; count: string; active?: boolean; warn?: boolean; href?: string }
const sections: Array<{ label: string; items: WorkspaceTreeItem[] }> = [
  { label: "Overview", items: [{ name: "Return overview", count: "" }, { name: "Intake & completeness", count: "", href: "intake" }] },
  { label: "General", items: [{ name: "Taxpayer information", count: "" }, { name: "Spouse", count: "" }, { name: "Dependents", count: "0" }] },
  { label: "Source data", items: [{ name: "Source documents", count: "14" }, { name: "Imports", count: "2" }, { name: "Mapping center", count: "2", warn: true, href: "mapping" }] },
  { label: "Income", items: [{ name: "W-2", count: "2", active: true }, { name: "1099-INT", count: "3" }, { name: "1099-DIV", count: "2" }, { name: "1099-NEC", count: "2" }, { name: "1099-MISC", count: "2", warn: true }] },
  { label: "Calculation", items: [{ name: "Tax summary", count: "", href: "calculation/summary" }, { name: "Form 1040", count: "" }, { name: "Forms & schedules", count: "3" }] },
  { label: "Review", items: [{ name: "Validation & open points", count: "5", warn: true, href: "review" }, { name: "Manual overrides", count: "", href: "overrides" }, { name: "Reconciliation", count: "2", warn: true }] },
];

export function TaxWorkspace({ context }: { context?: TaxYearWorkspaceRecord }) {
  const [selectedId, setSelectedId] = useState(w2Records[0].id);
  const [comfortable, setComfortable] = useState(false);
  const [saved, setSaved] = useState(true);
  const selected = useMemo(() => w2Records.find((record) => record.id === selectedId) ?? w2Records[0], [selectedId]);
  const index = w2Records.findIndex((record) => record.id === selected.id);
  const totalWages = w2Records.reduce((sum, record) => sum + Number(record.wages), 0);

  const updateSelected = (direction: number) => setSelectedId(w2Records[(index + direction + w2Records.length) % w2Records.length].id);

  return (
    <div className={`tax-workspace ${comfortable ? "comfortable" : ""}`}>
      <header className="workspace-header">
        <div className="workspace-title-row">
          <Link href="/dashboard" className="back-link"><ArrowLeft size={15} /> Work queue</Link>
          <span className="workspace-divider" />
          <div><h1>{context?.taxpayer ?? "John Sample"} <span>{context?.spouse ? `& ${context.spouse}` : context ? "" : "& Jane Sample"}</span></h1><p>Client {context?.code ?? "000123"} · {"***-**-6789"}</p></div>
          <span className="year-chip">TAX YEAR <strong>{context?.year ?? 2025}</strong><ChevronDown size={13} /></span>
          <span className="filing-chip">Married filing jointly</span>
        </div>
        <div className="workspace-meta">
          <span><small>Preparation</small><StatusPill status={context?.status ?? "In Preparation"} /></span>
          <span><small>Calculation</small><strong className="stale-text">{context?.calculationStatus.replaceAll("_", " ") ?? "Partial · stale"}</strong></span>
          <span><small>Blockers</small><strong className="blocker-text">2 blocking</strong></span>
          <span><small>Reviewer</small><strong>{context?.reviewer ?? "David Ross"}</strong></span>
        </div>
      </header>
      <div className="command-bar">
        <label className="screen-search"><Search size={14} /><input aria-label="Screen search" placeholder="Screen search (W2, INT, 1040...)" /><kbd>Ctrl+G</kbd></label>
        <button><Plus size={14} /> Add <ChevronDown size={12} /></button>
        <button onClick={() => { setSaved(false); window.setTimeout(() => setSaved(true), 450); }}><Save size={14} /> {saved ? "Saved" : "Saving…"}</button>
        <span className="command-divider" />
        <button className="command-primary" disabled title="Calculation is disabled until blocking intake and treatment issues are resolved"><Calculator size={14} /> Calculate</button>
        <button><FileText size={14} /> View return</button>
        <button><Download size={14} /> Workpaper</button>
        <button className="icon-command" aria-label="More actions"><MoreHorizontal size={17} /></button>
      </div>
      <div className="workspace-grid">
        <aside className="form-tree" aria-label="Return screens">
          <div className="tree-scroll">
            {sections.map((section) => (
              <section key={section.label}>
                <h2>{section.label}<ChevronDown size={13} /></h2>
                {section.items.map((item) => item.href ? (
                  <Link className="tree-item" href={`/clients/${context?.clientId ?? "sample"}/years/${context?.year ?? 2025}/${item.href}`} key={item.name}>
                    <span>{item.name}</span>
                  </Link>
                ) : (
                  <button className={`tree-item ${item.active ? "active" : ""}`} key={item.name}>
                    <span>{item.warn ? <AlertCircle size={13} className="tree-warning" /> : null}{item.name}</span>
                    {item.count ? <span className="tree-count">{item.count}</span> : null}
                  </button>
                ))}
              </section>
            ))}
          </div>
          <button className="density-toggle" onClick={() => setComfortable((value) => !value)}><span className="density-icon" /> {comfortable ? "Compact density" : "Comfortable density"}</button>
        </aside>
        <aside className="record-list">
          <div className="record-list-heading"><div><h2>W-2</h2><span>2 records</span></div><button aria-label="Add W-2"><Plus size={15} /></button></div>
          <div className="record-total"><span>Total wages</span><strong>{money(totalWages)}</strong></div>
          {w2Records.map((record, recordIndex) => (
            <button key={record.id} onClick={() => setSelectedId(record.id)} className={`record-card ${record.id === selected.id ? "active" : ""}`}>
              <span className="record-index">{recordIndex + 1}</span>
              <span className="record-main"><strong>{record.employer}</strong><small>{record.owner === "TP" ? "Taxpayer" : "Spouse"} · {record.ein}</small><b>{money(record.wages)}</b></span>
              <SeverityIcon severity={record.status} />
            </button>
          ))}
          <button className="add-record"><Plus size={14} /> Add W-2 record</button>
        </aside>
        <main className="entry-panel">
          <div className="entry-heading">
            <div><div className="entry-kicker"><span className="owner-badge">{selected.owner}</span><span>W-2 · Record {index + 1} of {w2Records.length}</span></div><h2>{selected.employer}</h2><p>Source: {selected.source}</p></div>
            <div className="record-nav"><button onClick={() => updateSelected(-1)} aria-label="Previous record"><ChevronLeft size={16} /></button><button onClick={() => updateSelected(1)} aria-label="Next record"><ChevronRight size={16} /></button></div>
          </div>
          <section className="entry-section">
            <h3><span>Employer</span><span className="section-state"><Check size={13} /> Verified</span></h3>
            <div className="field-grid three">
              <label className="span-two"><span>Employer name</span><input defaultValue={selected.employer} onChange={() => setSaved(false)} /></label>
              <label><span>EIN</span><input defaultValue={selected.ein} /></label>
              <label className="span-two"><span>Address</span><input defaultValue="475 Market Street" /></label>
              <label><span>City, state ZIP</span><input defaultValue="Salt Lake City, UT 84101" /></label>
            </div>
          </section>
          <section className="entry-section">
            <h3><span>Federal boxes</span><span className="section-help"><CircleHelp size={13} /> 2025 Form W-2</span></h3>
            <div className="box-grid">
              <MoneyField box="1" label="Wages, tips, other compensation" value={selected.wages} />
              <MoneyField box="2" label="Federal income tax withheld" value={selected.withholding} />
              <MoneyField box="3" label="Social Security wages" value={selected.ssWages} />
              <MoneyField box="4" label="Social Security tax withheld" value={selected.ssWithholding} />
              <MoneyField box="5" label="Medicare wages and tips" value={selected.medicareWages} />
              <MoneyField box="6" label="Medicare tax withheld" value={selected.medicareWithholding} />
            </div>
          </section>
          <section className="entry-section">
            <h3><span>Box 12 — Codes</span><button className="text-button"><Plus size={13} /> Add entry</button></h3>
            <table className="entry-table"><thead><tr><th>Code</th><th>Description</th><th className="num">Amount</th><th>Status</th></tr></thead><tbody><tr><td><span className="code-cell">D</span></td><td>Elective deferrals to 401(k)</td><td className="num">$12,000.00</td><td><span className="verified-inline"><Check size={12} /> Valid 2025 code</span></td></tr><tr><td><span className="code-cell">DD</span></td><td>Cost of employer-sponsored health coverage</td><td className="num">$8,500.00</td><td><span className="verified-inline"><Check size={12} /> Informational</span></td></tr></tbody></table>
          </section>
          <section className="entry-section box14-section">
            <h3><span>Box 14 — Other</span><button className="text-button"><Plus size={13} /> Add entry</button></h3>
            <table className="entry-table"><thead><tr><th>Label</th><th className="num">Amount</th><th>Classification</th><th>Review</th></tr></thead><tbody><tr><td>UT SDI</td><td className="num">$321.10</td><td><span className="empty-value">Not classified</span></td><td><span className="warning-inline"><AlertCircle size={12} /> Needs review</span></td></tr></tbody></table>
          </section>
        </main>
        <aside className="context-panel">
          <div className="context-tabs"><button className="active">Source</button><button>Issues <span>1</span></button><button>Audit</button></div>
          <div className="document-preview">
            <div className="document-toolbar"><span><FileText size={14} /> Page 1 of 1</span><button aria-label="Open source document"><ExternalLink size={14} /></button></div>
            <div className="paper-preview">
              <div className="paper-title"><small>2025</small><strong>W-2</strong><span>Wage and Tax Statement</span></div>
              <div className="paper-lines"><span /><span /><span /><span /><span /><span /></div>
              <p>Secure source preview</p>
            </div>
          </div>
          <section className="context-section"><h3>Provenance</h3><dl><div><dt>Source file</dt><dd>{selected.source}</dd></div><div><dt>Import batch</dt><dd>IMP-00042</dd></div><div><dt>Imported</dt><dd>Oct 6, 2026 · 8:31 AM</dd></div><div><dt>Extraction</dt><dd>Human reviewed</dd></div></dl></section>
          <section className="context-section"><h3>Record issue</h3><div className="issue-card warning"><SeverityIcon severity="warning" /><div><strong>Box 14 classification</strong><p>UT SDI has been preserved but needs a disposition.</p><button>Review field</button></div></div></section>
        </aside>
      </div>
      <footer className="workspace-footer"><span><Check size={13} /> Saved revision {context?.revision ?? 28}</span><span>Calculation: <strong>{context?.calculationStatus.replaceAll("_", " ") ?? "Partial · stale"}</strong></span><span>Engine: 2025 rules not approved</span><button><Keyboard size={14} /> Keyboard shortcuts</button></footer>
    </div>
  );
}

function MoneyField({ box, label, value }: { box: string; label: string; value: string }) {
  return <label className="money-field"><span className="box-number">{box}</span><span className="money-label">{label}</span><span className="money-input"><b>$</b><input defaultValue={Number(value).toLocaleString("en-US", { minimumFractionDigits: 2 })} inputMode="decimal" /></span></label>;
}
