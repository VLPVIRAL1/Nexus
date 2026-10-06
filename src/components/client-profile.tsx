"use client";

import { ArrowRight, CalendarPlus, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ClientProfileRecord } from "@/server/client-repository";
import { StatusPill } from "./status";

export function ClientProfile({ client }: { client: ClientProfileRecord }) {
  const router = useRouter();
  const [showCreateYear, setShowCreateYear] = useState(false);
  const [year, setYear] = useState(2025);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function createYear() {
    setSaving(true); setError(null);
    const response = await fetch(`/api/clients/${client.id}/years`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ year }) });
    const body = await response.json();
    setSaving(false);
    if (!response.ok) { setError(body.message ?? "Unable to create tax year."); return; }
    setShowCreateYear(false);
    router.refresh();
  }
  return (
    <>
      <div className="page-header">
        <div><p className="eyebrow">Client {client.code}</p><h1>{client.displayName}</h1><p>Persisted firm client · version {client.version}</p></div>
        <div className="header-actions"><button className="button secondary" type="button" disabled title="Assignment management UI is pending">Assignments</button><button className="button primary" type="button" onClick={() => setShowCreateYear((value) => !value)}><CalendarPlus size={14} /> Create tax year</button></div>
      </div>
      {showCreateYear ? <section className="panel inline-create"><label><span>Tax year</span><input type="number" min={2025} max={2200} value={year} onChange={(event) => setYear(Number(event.target.value))} /></label><button className="button primary" type="button" disabled={saving} onClick={createYear}>{saving ? "Creating…" : "Create"}</button><button className="button secondary" type="button" onClick={() => setShowCreateYear(false)}>Cancel</button>{error ? <p role="alert">{error}</p> : null}</section> : null}
      <section className="panel work-queue">
        <div className="panel-heading"><div><h2>Tax years</h2><p>Each year has an isolated revision and calculation state.</p></div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Year</th><th>Taxpayer</th><th>Spouse</th><th>Status</th><th>Preparer</th><th>Reviewer</th><th>Calculation</th><th>Revision</th><th><span className="sr-only">Open</span></th></tr></thead>
            <tbody>
              {client.years.map((taxYear) => (
                <tr key={taxYear.id}>
                  <td><strong>{taxYear.year}</strong><small className="cell-subtext">Form 1040</small></td>
                  <td>{taxYear.taxpayer ?? "Not entered"}</td><td>{taxYear.spouse ?? "—"}</td><td><StatusPill status={taxYear.status} /></td>
                  <td>{taxYear.preparer ?? "Unassigned"}</td><td>{taxYear.reviewer ?? "Unassigned"}</td><td>{taxYear.calculationStatus.replaceAll("_", " ")}</td><td>{taxYear.revision}</td>
                  <td><Link className="icon-button" aria-label={`Open ${taxYear.year} return`} href={`/clients/${client.id}/years/${taxYear.year}`}><ArrowRight size={16} /></Link></td>
                </tr>
              ))}
              {client.years.length === 0 ? <tr><td colSpan={9}><span className="empty-value"><UserRound size={14} /> No tax years created</span></td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
