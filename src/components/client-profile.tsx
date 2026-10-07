"use client";

import { ArrowRight, CalendarPlus, ShieldCheck, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ClientProfileRecord } from "@/server/client-repository";
import type { AssignmentKind, AssignmentState } from "@/server/assignment-service";
import { StatusPill } from "./status";

const assignmentLabels:Record<AssignmentKind,string>={preparer:"Preparer",reviewer:"Reviewer",read_only:"Read only"};

export function ClientProfile({ client,initialAssignmentState }: { client: ClientProfileRecord;initialAssignmentState:AssignmentState }) {
  const router = useRouter();
  const [showCreateYear, setShowCreateYear] = useState(false);
  const [showAssignments,setShowAssignments]=useState(false);
  const [assignments,setAssignments]=useState(initialAssignmentState.assignments);
  const [assignmentSaving,setAssignmentSaving]=useState<string|null>(null);
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
  async function toggleAssignment(userId:string,kind:AssignmentKind,assigned:boolean){const key=`${userId}:${kind}`;setAssignmentSaving(key);setError(null);const response=await fetch(`/api/clients/${client.id}/assignments`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId,kind,assigned})});const body=await response.json();setAssignmentSaving(null);if(!response.ok){setError(body.message??"Unable to update assignment.");return;}setAssignments((current)=>assigned?[...current.filter((item)=>!(item.userId===userId&&item.kind===kind)),{userId,kind}]:current.filter((item)=>!(item.userId===userId&&item.kind===kind)));router.refresh();}
  return (
    <>
      <div className="page-header">
        <div><p className="eyebrow">Client {client.code}</p><h1>{client.displayName}</h1><p>Persisted firm client · version {client.version}</p></div>
        <div className="header-actions"><button className="button secondary" type="button" disabled={!initialAssignmentState.canManage} title={initialAssignmentState.canManage?"Manage firm staff assignments":"Administrator permission required"} onClick={()=>setShowAssignments((value)=>!value)}><ShieldCheck size={14}/> Assignments</button><button className="button primary" type="button" onClick={() => setShowCreateYear((value) => !value)}><CalendarPlus size={14} /> Create tax year</button></div>
      </div>
      {error?<p className="form-error" role="alert">{error}</p>:null}
      {showAssignments&&initialAssignmentState.canManage?<section className="panel work-queue"><div className="panel-heading"><div><h2>Client assignments</h2><p>Assignment scope is enforced on every server request. Firm roles continue to control the actions each assigned user may perform.</p></div></div><div className="table-wrap"><table><thead><tr><th>Firm member</th><th>Firm role</th>{(Object.keys(assignmentLabels) as AssignmentKind[]).map((kind)=><th key={kind}>{assignmentLabels[kind]}</th>)}</tr></thead><tbody>{initialAssignmentState.members.map((member)=><tr key={member.id}><td><strong>{member.displayName}</strong><small className="cell-subtext">{member.email}</small></td><td>{member.role.replaceAll("_"," ")}</td>{(Object.keys(assignmentLabels) as AssignmentKind[]).map((kind)=>{const checked=assignments.some((item)=>item.userId===member.id&&item.kind===kind);const key=`${member.id}:${kind}`;return <td key={kind}><label><span className="sr-only">{assignmentLabels[kind]} assignment for {member.displayName}</span><input type="checkbox" checked={checked} disabled={!member.allowedKinds.includes(kind)||assignmentSaving!==null} onChange={(event)=>toggleAssignment(member.id,kind,event.target.checked)}/>{assignmentSaving===key?<small> Saving…</small>:null}</label></td>})}</tr>)}</tbody></table></div></section>:null}
      {showCreateYear ? <section className="panel inline-create"><label><span>Tax year</span><input type="number" min={2025} max={2200} value={year} onChange={(event) => setYear(Number(event.target.value))} /></label><button className="button primary" type="button" disabled={saving} onClick={createYear}>{saving ? "Creating…" : "Create"}</button><button className="button secondary" type="button" onClick={() => setShowCreateYear(false)}>Cancel</button></section> : null}
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
