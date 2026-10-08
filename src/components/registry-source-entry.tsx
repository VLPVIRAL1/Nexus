"use client";
import { AlertCircle, ArrowLeft, CheckCircle2, Database, Plus, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formRegistries2025, readPath, registryEntryFields, registryFieldPath, type RegistryField } from "@/form-registry/2025";

type EvidenceMode = "attached_document" | "manual_attestation";
interface DocumentRow { id: string; fileName: string; documentType: string; scanState: string; disposition: string }
interface RecordRow { id: string; sourceDocumentId: string | null; sourceFileName: string | null; formType: string; externalSourceId: string | null; ownerRole: string; normalizedData: Record<string, unknown>; rawFieldCount: number; unmappedFieldCount: number; effective: boolean; disposition: string; version: number }
interface State { revision: number; canRevealIdentifiers: boolean; documents: DocumentRow[]; records: RecordRow[] }

export function RegistrySourceEntry({ clientId, year, clientName, initial }: { clientId: string; year: number; clientName: string; initial: State }) {
  const router = useRouter();
  const records = useMemo(() => initial.records.filter((record) => record.effective && ["original", "corrected"].includes(record.disposition) && formRegistries2025[record.formType]), [initial.records]);
  const [selectedId, setSelectedId] = useState(records[0]?.id ?? "");
  const selected = records.find((record) => record.id === selectedId) ?? records[0];
  const registry = selected ? formRegistries2025[selected.formType] : null;
  const fields = selected ? registryEntryFields(selected.formType) : [];
  const [values, setValues] = useState<Record<string, string>>(() => selected ? valuesFor(selected, registryEntryFields(selected.formType)) : {});
  const [reason, setReason] = useState("");
  const [ownerRole, setOwnerRole] = useState(selected?.ownerRole ?? "unknown");
  const [evidenceMode, setEvidenceMode] = useState<EvidenceMode>("manual_attestation");
  const [evidenceDocumentId, setEvidenceDocumentId] = useState("");
  const [evidenceNote, setEvidenceNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const evidenceDocuments = selected ? eligibleEvidenceDocuments(initial.documents, selected) : [];
  const evidenceComplete = evidenceMode === "attached_document" ? Boolean(evidenceDocumentId) : Boolean(evidenceNote.trim());

  function select(record: RecordRow) {
    setSelectedId(record.id);
    setValues(valuesFor(record, registryEntryFields(record.formType)));
    setOwnerRole(record.ownerRole);
    setReason("");
    setEvidenceMode("manual_attestation");
    setEvidenceDocumentId("");
    setEvidenceNote("");
    setError(null);
  }

  async function save() {
    if (!selected || !registry) return;
    let data: Record<string, unknown> = structuredClone(selected.normalizedData);
    try {
      for (const field of fields) {
        const raw = values[field.key] ?? "";
        let value: unknown = null;
        if (field.type === "boolean") value = raw === "" ? null : raw === "true";
        else if (field.type.startsWith("repeatable_") || field.type === "checkbox_group") {
          value = raw.trim() ? JSON.parse(raw) : field.type === "checkbox_group" ? {} : [];
          if (field.type.startsWith("repeatable_") && !Array.isArray(value)) throw new Error(`${field.label} must be an array.`);
          if (field.type === "checkbox_group" && (!value || typeof value !== "object" || Array.isArray(value))) throw new Error(`${field.label} must be an object.`);
        } else value = raw.trim() || null;
        data = writePath(data, registryFieldPath(selected.formType, field.key), value);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A repeatable field is invalid.");
      return;
    }
    setSaving(true);
    setError(null);
    const response = await fetch(`/api/clients/${clientId}/years/${year}/source-records/${selected.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expectedRevision: initial.revision,
        expectedVersion: selected.version,
        action: "correct",
        reason,
        normalizedData: data,
        ownerRole,
        correctionEvidenceMode: evidenceMode,
        correctionSourceDocumentId: evidenceMode === "attached_document" ? evidenceDocumentId : null,
        correctionEvidenceNote: evidenceMode === "manual_attestation" ? evidenceNote : null,
      }),
    });
    const body = await response.json();
    setSaving(false);
    if (!response.ok) {
      setError(body.message ?? body.error ?? "Source record save failed.");
      return;
    }
    router.refresh();
  }

  return <div className="return-page registry-entry-page">
    <div className="return-page-top"><Link href={`/clients/${clientId}/years/${year}`}><ArrowLeft size={14}/> {clientName} · {year}</Link><span>Revision {initial.revision}</span><b>2025 registry {registry?.registry_version ?? "year-pinned"}</b></div>
    <header><div><p>SOURCE ENTRY · YEAR-VERSIONED REGISTRY</p><h1>W-2 and information-return fields</h1><span>All registered fields are captured even when calculation treatment is conditional or future. Saving creates an immutable corrected version tied to explicit evidence.</span></div><button className="button primary" disabled={!selected || saving || !reason.trim() || !evidenceComplete} onClick={save}><Save size={13}/>{saving ? "Saving…" : "Save correction"}</button></header>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <div className="registry-entry-layout">
      <aside className="panel registry-record-list"><div className="panel-heading"><div><h2>Effective records</h2><p>{records.length} supported source forms</p></div></div>{records.map((record) => <button className={record.id === selected?.id ? "active" : ""} key={record.id} onClick={() => select(record)}><Database size={14}/><span><b>{record.formType} · {issuer(record)}</b><small>{record.ownerRole} · v{record.version} · {record.sourceFileName ?? "no attached original"}</small></span>{record.unmappedFieldCount ? <AlertCircle size={13}/> : <CheckCircle2 size={13}/>}</button>)}</aside>
      <main className="panel registry-fields">{selected && registry ? <>
        <div className="panel-heading"><div><h2>{selected.formType} · version {selected.version}</h2><p>{fields.length} metadata and year-defined fields · raw {selected.rawFieldCount} · unmapped {selected.unmappedFieldCount}</p></div><span className="registry-support">PDF {registry.pdf_output.replaceAll("_", " ")}</span></div>
        {!initial.canRevealIdentifiers ? <p className="registry-privacy">TIN and account values are masked and preserved unchanged. Sensitive-identifier permission is required to edit them.</p> : null}
        <label className="registry-owner"><span>Source owner</span><select value={ownerRole} onChange={(event) => setOwnerRole(event.target.value)}><option value="taxpayer">Taxpayer</option><option value="spouse">Spouse</option><option value="joint">Joint</option><option value="dependent">Dependent</option><option value="unknown">Unknown / requires review</option></select></label>
        <div className="registry-field-grid">{fields.map((field) => <RegistryControl key={field.key} field={field} formType={selected.formType} value={values[field.key] ?? ""} protectedValue={!initial.canRevealIdentifiers && /(?:tin|accountNumber)/i.test(field.key)} onChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))}/>)}</div>
        <section className="registry-evidence" aria-labelledby="correction-evidence-heading">
          <div><b id="correction-evidence-heading">Correction evidence</b><small>Attach a different, scanned source document or record a manual attestation.</small></div>
          <label><span>Evidence type</span><select value={evidenceMode} onChange={(event) => { setEvidenceMode(event.target.value as EvidenceMode); setError(null); }}><option value="attached_document" disabled={!evidenceDocuments.length}>Attached corrected document{evidenceDocuments.length ? "" : " (none eligible)"}</option><option value="manual_attestation">Manual attestation</option></select></label>
          {evidenceMode === "attached_document" ? <label><span>Corrected source document</span><select value={evidenceDocumentId} onChange={(event) => setEvidenceDocumentId(event.target.value)}><option value="">Select a clean compatible document</option>{evidenceDocuments.map((document) => <option key={document.id} value={document.id}>{document.fileName} · {document.documentType}</option>)}</select></label> : <label><span>Evidence attestation</span><textarea value={evidenceNote} onChange={(event) => setEvidenceNote(event.target.value)} maxLength={2000} placeholder="Describe the authoritative evidence reviewed, its date, and where it is retained."/></label>}
        </section>
        <label className="registry-reason"><span>Correction reason</span><input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} placeholder="Required; explain what changed and why"/></label>
      </> : <p className="empty-panel">No effective W-2 or supported 1099 source records are available.</p>}</main>
    </div>
  </div>;
}

function RegistryControl({ field, formType, value, protectedValue, onChange }: { field: RegistryField; formType: string; value: string; protectedValue: boolean; onChange: (value: string) => void }) {
  const structured = field.type.startsWith("repeatable_") || field.type === "checkbox_group";
  const heading = <span>{field.label}<small className={`support-${field.calculation}`}>{field.calculation.replaceAll("_", " ")}</small></span>;
  if (structured) return <div className="registry-structured">{heading}<StructuredEditor field={field} formType={formType} value={value} disabled={protectedValue} onChange={onChange}/></div>;
  return <label>{heading}{field.type === "boolean" ? <select disabled={protectedValue} value={value} onChange={(event) => onChange(event.target.value)}><option value="">Blank / unknown</option><option value="true">Yes</option><option value="false">No</option></select> : <input disabled={protectedValue} inputMode={field.type === "money" ? "decimal" : "text"} value={value} onChange={(event) => onChange(event.target.value)} placeholder={field.type === "money" ? "0.00" : ""}/>}</label>;
}

function StructuredEditor({ field, formType, value, disabled, onChange }: { field: RegistryField; formType: string; value: string; disabled: boolean; onChange: (value: string) => void }) {
  if (field.type === "checkbox_group") {
    const flags = safeObject(value);
    const keys = [...new Set(["statutoryEmployee", "retirementPlan", "thirdPartySickPay", ...Object.keys(flags)])];
    return <div className="registry-checkboxes">{keys.map((key) => <label key={key}><input type="checkbox" disabled={disabled} checked={flags[key] === true} onChange={(event) => onChange(JSON.stringify({ ...flags, [key]: event.target.checked }))}/><span>{humanize(key)}</span></label>)}</div>;
  }
  const rows = safeRows(value);
  const columns = rowColumns(field.type, formType, rows);
  const update = (rowIndex: number, key: string, nextValue: string) => onChange(JSON.stringify(rows.map((row, index) => index === rowIndex ? { ...row, [key]: nextValue } : row)));
  const remove = (rowIndex: number) => onChange(JSON.stringify(rows.filter((_, index) => index !== rowIndex)));
  const add = () => onChange(JSON.stringify([...rows, Object.fromEntries(columns.map((column) => [column.key, ""]))]));
  return <div className="registry-row-editor">
    {rows.length ? <div className="registry-row-head" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(105px, 1fr)) 32px` }}>{columns.map((column) => <span key={column.key}>{column.label}</span>)}<span>Remove</span></div> : <p>No rows entered.</p>}
    {rows.map((row, rowIndex) => <div className="registry-row" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(105px, 1fr)) 32px` }} key={rowIndex}>{columns.map((column) => <input key={column.key} disabled={disabled} inputMode={column.money ? "decimal" : "text"} aria-label={`${field.label} row ${rowIndex + 1} ${column.label}`} value={stringValue(row[column.key])} onChange={(event) => update(rowIndex, column.key, event.target.value)} placeholder={column.money ? "0.00" : column.placeholder}/>) }<button type="button" disabled={disabled} aria-label={`Remove ${field.label} row ${rowIndex + 1}`} onClick={() => remove(rowIndex)}><Trash2 size={13}/></button></div>)}
    <button type="button" className="registry-add-row" disabled={disabled} onClick={add}><Plus size={13}/> Add row</button>
  </div>;
}

interface RowColumn { key: string; label: string; money?: boolean; placeholder?: string }
function rowColumns(type: RegistryField["type"], formType: string, rows: Record<string, unknown>[]): RowColumn[] {
  if (type === "repeatable_state") {
    const wageKey = formType === "W2" || rows.some((row) => "stateWages" in row) ? "stateWages" : "stateIncome";
    return [{ key: "state", label: "State", placeholder: "IL" }, { key: "payerStateId", label: "State ID" }, { key: wageKey, label: formType === "W2" ? "State wages" : "State income", money: true }, { key: "stateTaxWithheld", label: "State tax withheld", money: true }];
  }
  if (type === "repeatable_local") return [{ key: "localWages", label: "Local wages", money: true }, { key: "localTaxWithheld", label: "Local tax withheld", money: true }, { key: "localityName", label: "Locality" }];
  if (type === "repeatable_code_money") return [{ key: "code", label: "Code", placeholder: "DD" }, { key: "amount", label: "Amount", money: true }];
  return [{ key: "label", label: "Label" }, { key: "amount", label: "Amount", money: true }, { key: "classification", label: "Classification" }];
}

function eligibleEvidenceDocuments(documents: DocumentRow[], record: RecordRow) {
  return documents.filter((document) => document.id !== record.sourceDocumentId && document.scanState === "clean" && ["original", "corrected"].includes(document.disposition) && (document.documentType === record.formType || (record.formType === "W2" && document.documentType === "W2C")));
}
function safeRows(value: string): Record<string, unknown>[] { try { const parsed = JSON.parse(value || "[]"); return Array.isArray(parsed) ? parsed.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row)) : []; } catch { return []; } }
function safeObject(value: string): Record<string, unknown> { try { const parsed = JSON.parse(value || "{}"); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; } }
function stringValue(value: unknown) { return value === undefined || value === null ? "" : String(value); }
function humanize(value: string) { return value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase()); }
function valuesFor(record: RecordRow, fields: RegistryField[]) { return Object.fromEntries(fields.map((field) => { const value = readPath(record.normalizedData, registryFieldPath(record.formType, field.key)); return [field.key, value === undefined || value === null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value)]; })); }
function writePath(root: Record<string, unknown>, path: string[], value: unknown) { const copy = structuredClone(root); let cursor = copy; for (const key of path.slice(0, -1)) { const next = cursor[key]; if (!next || typeof next !== "object" || Array.isArray(next)) cursor[key] = {}; cursor = cursor[key] as Record<string, unknown>; } cursor[path.at(-1)!] = value; return copy; }
function issuer(record: RecordRow) { const data = record.normalizedData; const payer = data.payer && typeof data.payer === "object" && !Array.isArray(data.payer) ? (data.payer as Record<string, unknown>).name : null; const employer = data.employer && typeof data.employer === "object" && !Array.isArray(data.employer) ? (data.employer as Record<string, unknown>).name : null; return typeof payer === "string" ? payer : typeof employer === "string" ? employer : "Unnamed issuer"; }
