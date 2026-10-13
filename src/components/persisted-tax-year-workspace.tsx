import { AlertTriangle, BadgeDollarSign, BriefcaseBusiness, Calculator, ClipboardCheck, ContactRound, Download, FileJson, FileOutput, FileUp, GitMerge, ListChecks, ShieldCheck, TableProperties, Users } from "lucide-react";
import Link from "next/link";
import type { TaxYearWorkspaceRecord } from "@/server/client-repository";
import { StatusPill } from "./status";

const workflow = [
  { href: "taxpayer-profile", title: "Taxpayer & spouse", description: "Create or edit the identity, date of birth, occupation and address used by the return.", icon: ContactRound },
  { href: "return-profile", title: "Filing status, dependents & Schedule A", description: "Select one of five statuses, classify dependents and enter reviewed itemized deductions.", icon: Users },
  { href: "credits", title: "Federal credits", description: "Complete EITC, child/dependent care and education interviews with Schedule EIC, Form 2441 and Form 8863 facts.", icon: BadgeDollarSign },
  { href: "intake", title: "Intake & completeness", description: "Answer required eligibility questions and attest expected-document evidence.", icon: ClipboardCheck },
  { href: "sources", title: "Source documents", description: "Upload, scan, encrypt and inspect PDF/JPEG/PNG source evidence.", icon: FileUp },
  { href: "source-entry", title: "Typed source entry", description: "Edit every registered field across W-2, Form 1098-T and all nine supported 1099 families.", icon: TableProperties },
  { href: "source-records", title: "Corrections & lineage", description: "Resolve corrected, void and duplicate records without erasing history.", icon: GitMerge },
  { href: "imports", title: "Canonical JSON import", description: "Preview every change, decide explicitly, commit and roll back safely.", icon: FileJson },
  { href: "mapping", title: "Mapping center", description: "Reconcile source amounts to supported activities with cent-perfect allocations.", icon: GitMerge },
  { href: "activities", title: "Schedule C, E & F activities", description: "Enter complete business, rental, royalty and farm schedule data manually or through canonical JSON.", icon: BriefcaseBusiness },
  { href: "review", title: "Review & diagnostics", description: "Resolve machine blockers and assigned human review points.", icon: ListChecks },
  { href: "overrides", title: "Governed overrides", description: "Request independently reviewed, registered calculation overrides.", icon: ShieldCheck },
  { href: "calculation/summary", title: "2025 calculation", description: "Run the deterministic engine and inspect immutable line traces.", icon: Calculator },
  { href: "outputs", title: "Outputs & exports", description: "Generate draft PDF, XLSX and canonical JSON artifacts.", icon: FileOutput },
] as const;

export function PersistedTaxYearWorkspace({ context }: { context: TaxYearWorkspaceRecord }) {
  const base = `/clients/${context.clientId}/years/${context.year}`;
  return <div className="simple-page persisted-workspace-page">
    <div className="return-page-top"><Link href={`/clients/${context.clientId}`}>Client {context.code}</Link><span>Revision {context.revision}</span><b>Tax year {context.year}</b></div>
    <div className="page-header"><div><p className="eyebrow">Form 1040 · professional draft workflow</p><h1>{context.displayName}</h1><p>{context.taxpayer ?? "Taxpayer profile not entered"}{context.spouse?` & ${context.spouse}`:""} · Reviewer: {context.reviewer ?? "Unassigned"}</p></div><div className="header-actions"><a className="button secondary" href="/api/templates/2025/1040/canonical.json" download><Download size={14}/> JSON template</a><Link className="button primary" href={`${base}/imports`}><FileJson size={14}/> Import JSON</Link></div></div>
    <section className="workspace-status panel"><div><span>Preparation</span><StatusPill status={context.status}/></div><div><span>Calculation</span><strong>{context.calculationStatus.replaceAll("_"," ")}</strong></div><div><span>Current revision</span><strong>{context.revision}</strong></div><div><span>Release mode</span><strong>Draft only</strong></div></section>
    <section className="workspace-scope-warning"><AlertTriangle size={18}/><div><strong>2025 supported-envelope return</strong><p>Only the eleven registered source families and implemented federal dependencies can produce a supported draft. Other source forms are retained as evidence and must block approval. Generated PDFs remain “DRAFT — NOT FOR FILING.”</p></div></section>
    <section className="workspace-action-grid">{workflow.map(({href,title,description,icon:Icon},index)=><Link href={`${base}/${href}`} className="panel workspace-action" key={href}><Icon size={20}/><span><small>{String(index+1).padStart(2,"0")}</small><strong>{title}</strong><p>{description}</p></span></Link>)}</section>
  </div>;
}
