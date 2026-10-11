import { AlertTriangle, ArrowRight, CheckCircle2, Download, FileJson } from "lucide-react";
import Link from "next/link";
import type { ClientSummary } from "@/domain/types";
import { sourceFormCatalog2025 } from "@/form-registry/2025/source-form-catalog";

export function ImportStart({ clients }: { clients: ClientSummary[] }) {
  const supported = sourceFormCatalog2025.filter(({ support }) => support === "supported_capture");
  const blocked = sourceFormCatalog2025.filter(({ support }) => support === "document_only_blocking");
  return <div className="simple-page import-start-page">
    <div className="page-header"><div><p className="eyebrow">Canonical JSON · 2025</p><h1>Import client tax data</h1><p>Download the schema-valid template, populate it, then select the existing client return that should receive the staged import.</p></div><a className="button primary" href="/api/templates/2025/1040/canonical.json" download><Download size={14}/> Download 2025 JSON template</a></div>
    <section className="panel import-guidance"><FileJson size={22}/><div><h2>Safe staged workflow</h2><p>Imports never create a client or silently overwrite a return. Create the client and 2025 tax year first; the selected return will show a field-by-field preview and require an explicit decision for every change.</p></div></section>
    <section className="panel work-queue"><div className="panel-heading"><div><h2>Select a client return</h2><p>Only returns assigned to your current firm identity are shown.</p></div><Link className="button secondary" href="/clients/new">New client</Link></div><div className="table-wrap"><table><thead><tr><th>Client</th><th>Tax year</th><th>Status</th><th>Blockers</th><th><span className="sr-only">Open import</span></th></tr></thead><tbody>{clients.map(client=><tr key={`${client.id}:${client.taxYear}`}><td><strong>{client.taxpayer}</strong><small className="cell-subtext">{client.code} · {client.maskedTin}</small></td><td>{client.taxYear}</td><td>{client.status}</td><td>{client.blockers}</td><td><Link className="button secondary" href={`/clients/${client.id}/years/${client.taxYear}/imports`}>Stage JSON <ArrowRight size={13}/></Link></td></tr>)}{clients.length===0?<tr><td colSpan={5}>No assigned tax-year returns are available. Create a client and 2025 tax year first.</td></tr>:null}</tbody></table></div></section>
    <div className="import-support-grid"><section className="panel"><h2><CheckCircle2 size={16}/> Typed Phase 1 source forms</h2><p>{supported.map(({form})=>form).join(", ")}</p><small>Every registered field is retained. A field with an unimplemented tax treatment creates a blocker.</small></section><section className="panel"><h2><AlertTriangle size={16}/> Other 2025 information returns</h2><p>{blocked.map(({form})=>form).join(", ")}</p><small>These can be uploaded as encrypted source evidence, but are not typed/calculated and must block approval. They are never silently ignored.</small></section></div>
  </div>;
}
