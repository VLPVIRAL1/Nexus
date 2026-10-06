"use client";

import { AlertCircle, ArrowLeft, CheckCircle2, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type ActivityType = "schedule_c" | "schedule_e" | "schedule_f" | "schedule_1_other";
interface Activity { id: string; type: ActivityType; name: string; ownerRole: string; implementationStatus: "supported" | "mapping_only"; receiptBasis: string | null; additionalReceipts: string; receiptNote: string | null; active: boolean; version: number }
interface MappingRow { id: string; targetType: ActivityType | "excluded"; targetActivityId: string | null; allocationMethod: "amount" | "percentage"; allocatedAmount: string; percentage: string | null; reason: string | null; status: string; version: number; note: string | null; receivesRoundingResidual: boolean }
interface SourceAmount { id: string; formType: string; ownerRole: string; payerName: string; sourceDocumentId: string | null; field: string; label: string; taxCharacter: string; suggestedTarget: ActivityType | null; amount: string; mappings: MappingRow[]; reconciliation: { allocatedAmount: string; excludedAmount: string; unresolvedAmount: string; status: string } }
interface MappingState { revision: number; activities: Activity[]; sources: SourceAmount[] }
interface DraftAllocation { targetActivityId: string; allocationMethod: "amount" | "percentage"; value: string; note: string; residualRecipient: boolean }

export function PersistedMapping({ clientId, year, clientName, initial }: { clientId: string; year: number; clientName: string; initial: MappingState }) {
  const router = useRouter();
  const [selectedKey, setSelectedKey] = useState(initial.sources[0] ? `${initial.sources[0].id}:${initial.sources[0].field}` : "");
  const selected = initial.sources.find((source) => `${source.id}:${source.field}` === selectedKey) ?? initial.sources[0] ?? null;
  const activeActivities = initial.activities.filter(({ active }) => active);
  const [drafts, setDrafts] = useState<Record<string, DraftAllocation[]>>(() => Object.fromEntries(initial.sources.map((source) => [`${source.id}:${source.field}`, source.mappings.filter(({ targetActivityId }) => targetActivityId).map((mapping) => ({ targetActivityId: mapping.targetActivityId!, allocationMethod: mapping.allocationMethod, value: mapping.allocationMethod === "percentage" ? mapping.percentage ?? "" : mapping.allocatedAmount, note: mapping.note ?? "", residualRecipient: mapping.receivesRoundingResidual }))])));
  const [activityForm, setActivityForm] = useState({ type: "schedule_c" as ActivityType, name: "", ownerRole: "taxpayer", implementationStatus: "supported" as "supported" | "mapping_only", additionalReceipts: "0.00", receiptNote: "" });
  const [showActivity, setShowActivity] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const currentDrafts = selected ? drafts[`${selected.id}:${selected.field}`] ?? [] : [];
  const previewAllocated = useMemo(() => selected ? currentDrafts.reduce((sum, row) => sum + (row.allocationMethod === "percentage" ? Number(selected.amount) * Number(row.value || 0) / 100 : Number(row.value || 0)), 0) : 0, [currentDrafts, selected]);

  async function request(url: string, method: string, body: unknown) {
    setSaving(true); setError(null);
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) { setError(result.message ?? result.error ?? "Request failed."); return false; }
    router.refresh(); return true;
  }

  async function createNewActivity() {
    const mappingOnly = activityForm.type !== "schedule_c" || activityForm.implementationStatus === "mapping_only";
    const ok = await request(`/api/clients/${clientId}/years/${year}/mapping`, "POST", {
      expectedRevision: initial.revision, ...activityForm,
      implementationStatus: mappingOnly ? "mapping_only" : "supported",
      receiptBasis: mappingOnly ? null : "source_plus_additional_receipts",
      additionalReceipts: normalizeMoney(activityForm.additionalReceipts),
      receiptNote: activityForm.receiptNote || null,
    });
    if (ok) { setShowActivity(false); setActivityForm({ type: "schedule_c", name: "", ownerRole: "taxpayer", implementationStatus: "supported", additionalReceipts: "0.00", receiptNote: "" }); }
  }

  async function saveCurrentAllocations() {
    if (!selected) return;
    await request(`/api/clients/${clientId}/years/${year}/mapping/allocations`, "PUT", {
      expectedRevision: initial.revision, sourceRecordId: selected.id, sourceField: selected.field,
      allocations: currentDrafts.map((row) => {
        const activity = activeActivities.find(({ id }) => id === row.targetActivityId);
        return { targetType: activity?.type, targetActivityId: row.targetActivityId, allocationMethod: row.allocationMethod, allocatedAmount: row.allocationMethod === "amount" ? normalizeMoney(row.value) : null, percentage: row.allocationMethod === "percentage" ? row.value : null, reason: null, note: row.note || null, status: "accepted", residualRecipient: row.residualRecipient };
      }),
    });
  }

  function updateDraft(index: number, patch: Partial<DraftAllocation>) {
    if (!selected) return;
    const key = `${selected.id}:${selected.field}`;
    setDrafts((current) => ({ ...current, [key]: (current[key] ?? []).map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row) }));
  }

  function addAllocation() {
    if (!selected || !activeActivities[0]) { setError("Create an active destination activity first."); return; }
    const key = `${selected.id}:${selected.field}`;
    setDrafts((current) => ({ ...current, [key]: [...(current[key] ?? []), { targetActivityId: activeActivities[0].id, allocationMethod: "amount", value: "0.00", note: "", residualRecipient: false }] }));
  }

  function removeAllocation(index: number) {
    if (!selected) return;
    const key = `${selected.id}:${selected.field}`;
    setDrafts((current) => ({ ...current, [key]: (current[key] ?? []).filter((_, rowIndex) => rowIndex !== index) }));
  }

  return <div className="return-page persisted-mapping-page">
    <div className="return-page-top"><Link href={`/clients/${clientId}/years/${year}`}><ArrowLeft size={14} /> {clientName} · {year}</Link><span>Revision {initial.revision}</span><b>{initial.sources.filter(({ reconciliation }) => reconciliation.status !== "fully_mapped" && reconciliation.status !== "not_applicable").length} unresolved</b></div>
    <header><div><p>SOURCE DATA · ALLOCATIONS</p><h1>Mapping center</h1><span>Effective source amounts are reconciled at the cent. Suggestions require preparer confirmation.</span></div><button className="button primary" onClick={() => setShowActivity((value) => !value)}><Plus size={14} /> Add activity</button></header>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {showActivity ? <section className="panel activity-create"><div className="panel-heading"><div><h2>New return activity</h2><p>Supported Schedule C uses source forms plus separately stated additional receipts.</p></div><button className="button primary" disabled={saving} onClick={createNewActivity}>{saving ? "Saving…" : "Create activity"}</button></div><div className="mapping-form-grid">
      <label><span>Name</span><input value={activityForm.name} onChange={(event) => setActivityForm({ ...activityForm, name: event.target.value })} /></label>
      <label><span>Destination</span><select value={activityForm.type} onChange={(event) => { const type = event.target.value as ActivityType; setActivityForm({ ...activityForm, type, implementationStatus: type === "schedule_c" ? activityForm.implementationStatus : "mapping_only" }); }}><option value="schedule_c">Schedule C</option><option value="schedule_e">Schedule E</option><option value="schedule_f">Schedule F</option><option value="schedule_1_other">Schedule 1 · Other income</option></select></label>
      <label><span>Owner</span><select value={activityForm.ownerRole} onChange={(event) => setActivityForm({ ...activityForm, ownerRole: event.target.value })}><option value="taxpayer">Taxpayer</option><option value="spouse">Spouse</option></select></label>
      <label><span>Calculation coverage</span><select value={activityForm.implementationStatus} disabled={activityForm.type !== "schedule_c"} onChange={(event) => setActivityForm({ ...activityForm, implementationStatus: event.target.value as "supported" | "mapping_only" })}><option value="supported">Supported Phase 1 path</option><option value="mapping_only">Mapping only</option></select></label>
      <label><span>Additional receipts excluding these sources</span><input inputMode="decimal" value={activityForm.additionalReceipts} onChange={(event) => setActivityForm({ ...activityForm, additionalReceipts: event.target.value })} /></label>
      <label className="span-two"><span>Receipt evidence / difference explanation</span><input value={activityForm.receiptNote} onChange={(event) => setActivityForm({ ...activityForm, receiptNote: event.target.value })} /></label>
    </div></section> : null}
    <div className="mapping-layout">
      <section className="panel mapping-sources"><div className="panel-heading"><div><h2>Effective source amounts</h2><p>{initial.sources.length} tax-relevant fields</p></div></div>{initial.sources.length ? initial.sources.map((source) => { const key = `${source.id}:${source.field}`; return <button className={`mapping-source ${selectedKey === key ? "active" : ""}`} onClick={() => setSelectedKey(key)} key={key}><span>{source.formType} · {source.ownerRole}</span><strong>{source.payerName}</strong><small>{source.label}</small><b>{formatMoney(source.amount)}</b><em>{source.reconciliation.status.replaceAll("_", " ")}</em></button>; }) : <p className="empty-panel">No effective 1099-NEC or 1099-MISC income amounts are available to map.</p>}</section>
      <section className="panel mapping-editor"><div className="panel-heading"><div><h2>{selected ? `${selected.payerName} · ${selected.formType}` : "Select a source amount"}</h2><p>{selected ? `${selected.label} · Owner: ${selected.ownerRole}` : "Import or enter an effective source record first."}</p></div>{selected ? <button className="button primary" disabled={saving || selected.mappings.some(({ targetType }) => targetType === "excluded")} onClick={saveCurrentAllocations}>{saving ? "Saving…" : "Save allocations"}</button> : null}</div>
        {selected ? <><div className="mapping-source-total"><span>Effective source amount</span><strong>{formatMoney(selected.amount)}</strong></div><p className="mapping-tax-character"><b>Tax character:</b> {selected.taxCharacter}{selected.suggestedTarget ? ` · Suggested destination: ${labelType(selected.suggestedTarget)} · Needs preparer confirmation` : " · No automated suggestion"}</p>{selected.mappings.some(({ targetType }) => targetType === "excluded") ? <p className="mapping-exclusion"><AlertCircle size={14} /> This field has a reviewer-approved exclusion. Allocation editing is locked to preserve that reviewed disposition.</p> : null}<div className="allocation-table"><div className="allocation-head"><span>Destination activity</span><span>Method</span><span>Amount / %</span><span /></div>{currentDrafts.map((row, index) => <div className="allocation-row" key={`${index}-${row.targetActivityId}`}><div className="allocation-destination"><select aria-label={`Destination ${index + 1}`} value={row.targetActivityId} onChange={(event) => updateDraft(index, { targetActivityId: event.target.value })}>{activeActivities.map((activity) => <option value={activity.id} key={activity.id}>{activity.name} · {labelType(activity.type)}{activity.implementationStatus === "mapping_only" ? " · unsupported" : ""}</option>)}</select>{row.allocationMethod === "percentage" ? <label className="residual-choice"><input type="checkbox" checked={row.residualRecipient} onChange={(event) => updateDraft(index, { residualRecipient: event.target.checked })} /> Receive disclosed cent residual</label> : null}</div><select aria-label={`Method ${index + 1}`} value={row.allocationMethod} onChange={(event) => updateDraft(index, { allocationMethod: event.target.value as "amount" | "percentage", value: event.target.value === "amount" ? "0.00" : "0", residualRecipient: false })}><option value="amount">Amount</option><option value="percentage">Percentage</option></select><label><span>{row.allocationMethod === "amount" ? "$" : "%"}</span><input inputMode="decimal" value={row.value} onChange={(event) => updateDraft(index, { value: event.target.value })} /></label><button aria-label="Remove allocation" onClick={() => removeAllocation(index)}><Trash2 size={15} /></button></div>)}<button className="add-allocation" onClick={addAllocation}><Plus size={13} /> Add allocation</button></div></> : null}
      </section>
      <aside className="panel reconciliation"><h2>Reconciliation</h2>{selected ? <><dl><div><dt>Source amount</dt><dd>{formatMoney(selected.amount)}</dd></div><div><dt>Draft allocations</dt><dd>{formatMoney(previewAllocated.toFixed(2))}</dd></div><div className={Number(selected.amount) - previewAllocated === 0 ? "total good" : "total bad"}><dt>Draft remainder</dt><dd>{formatMoney((Number(selected.amount) - previewAllocated).toFixed(2))}</dd></div></dl><p className={Number(selected.amount) - previewAllocated === 0 ? "reconcile-state good" : "reconcile-state bad"}>{Number(selected.amount) - previewAllocated === 0 ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}{Number(selected.amount) - previewAllocated === 0 ? "Fully mapped draft" : Number(selected.amount) - previewAllocated < 0 ? "Over-allocated draft" : "Partially mapped draft"}</p><hr /><h3>Persisted status</h3><p>{selected.reconciliation.status.replaceAll("_", " ")} · {formatMoney(selected.reconciliation.unresolvedAmount)} unresolved.</p></> : <p>Select a source amount to review its reconciliation.</p>}
        <hr /><h3>Activities</h3>{initial.activities.map((activity) => <div className="activity-summary" key={activity.id}><b>{activity.name}</b><span>{labelType(activity.type)} · {activity.implementationStatus.replaceAll("_", " ")}</span>{activity.type === "schedule_c" ? <small>{formatMoney(activity.additionalReceipts)} additional receipts</small> : null}</div>)}</aside>
    </div>
  </div>;
}

function normalizeMoney(value: string): string {
  const number = Number(value.replaceAll(",", ""));
  return Number.isFinite(number) && number >= 0 ? number.toFixed(2) : value;
}
function formatMoney(value: string): string { return Number(value).toLocaleString("en-US", { style: "currency", currency: "USD" }); }
function labelType(type: ActivityType): string { return ({ schedule_c: "Schedule C", schedule_e: "Schedule E", schedule_f: "Schedule F", schedule_1_other: "Schedule 1 · Other income" })[type]; }
