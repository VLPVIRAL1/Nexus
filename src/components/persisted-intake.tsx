"use client";

import { AlertCircle, ArrowLeft, Check, CheckCircle2, Pencil, Plus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type Answer = "yes" | "no" | "unknown";
interface IntakeStateProp {
  revision: number;
  questions: Array<{ id: string; group: string; prompt: string; affirmativeTreatment: string; supportedWhenYes: boolean; answer: { answer: Answer; evidence: string } | null }>;
  missingQuestionIds: string[];
  blockingQuestionIds: string[];
  expectedDocuments: Array<{ id: string; documentKey: string; label: string; status: string; evidence: string | null; sourceDocumentId: string | null; version: number }>;
  sourceDocuments: Array<{ id: string; fileName: string; documentType: string }>;
  attestation: { id: string; revision: number; current: boolean } | null;
}

export function PersistedIntake({ clientId, year, clientName, initial }: { clientId: string; year: number; clientName: string; initial: IntakeStateProp }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Record<string, { answer: Answer; evidence: string }>>(() => Object.fromEntries(initial.questions.map((question) => [question.id, { answer: question.answer?.answer ?? "unknown", evidence: question.answer?.evidence ?? "" }])));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [documentForm, setDocumentForm] = useState({ documentKey: "", label: "", status: "expected", evidence: "", sourceDocumentId: "", expectedVersion: null as number | null });
  const groups = useMemo(() => Map.groupBy(initial.questions, (question) => question.group), [initial.questions]);
  const base = `/api/clients/${clientId}/years/${year}/intake`;

  async function request(url: string, method: string, body: unknown) {
    setSaving(true); setError(null);
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) { setError(result.message ?? result.error ?? "Request failed."); return false; }
    router.refresh(); return true;
  }

  async function saveAnswers() {
    const answers = initial.questions.map(({ id }) => ({ questionId: id, ...draft[id] })).filter(({ evidence }) => evidence.trim());
    if (!answers.length) { setError("Add respondent evidence before saving answers."); return; }
    await request(base, "PUT", { expectedRevision: initial.revision, answers });
  }

  async function saveDocument() {
    const ok = await request(`${base}/expected-documents`, "PUT", {
      expectedTaxYearRevision: initial.revision, documentKey: documentForm.documentKey, label: documentForm.label,
      status: documentForm.status, evidence: documentForm.evidence || null, sourceDocumentId: documentForm.sourceDocumentId || null, expectedVersion: documentForm.expectedVersion,
    });
    if (ok) resetDocumentForm();
  }

  function editDocument(document: IntakeStateProp["expectedDocuments"][number]) {
    setDocumentForm({ documentKey: document.documentKey, label: document.label, status: document.status, evidence: document.evidence ?? "", sourceDocumentId: document.sourceDocumentId ?? "", expectedVersion: document.version });
  }

  function resetDocumentForm() {
    setDocumentForm({ documentKey: "", label: "", status: "expected", evidence: "", sourceDocumentId: "", expectedVersion: null });
  }

  const linkedSourceNames = new Map(initial.sourceDocuments.map((document) => [document.id, document.fileName]));
  const documentFormComplete = Boolean(documentForm.documentKey && documentForm.label)
    && ((documentForm.status === "received" && Boolean(documentForm.sourceDocumentId || documentForm.evidence.trim()))
      || ((documentForm.status === "unavailable" || documentForm.status === "not_applicable") && Boolean(documentForm.evidence.trim()))
      || documentForm.status === "expected");

  return <div className="return-page">
    <div className="return-page-top"><Link href={`/clients/${clientId}/years/${year}`}><ArrowLeft size={14} /> {clientName} · {year}</Link><span>Revision {initial.revision}</span><b>{initial.missingQuestionIds.length + initial.blockingQuestionIds.length} blockers</b></div>
    <header><div><p>CLIENT INTAKE · TAX YEAR {year}</p><h1>Intake &amp; completeness</h1><span>Every answer and document disposition is versioned. Unknown never means no.</span></div><button className="button primary" disabled={saving || initial.missingQuestionIds.length > 0 || initial.blockingQuestionIds.length > 0 || initial.expectedDocuments.length === 0} onClick={() => request(`${base}/attest`, "POST", { expectedRevision: initial.revision, evidence: "Preparer reviewed required intake and expected-document evidence.", missingDocumentExplanation: null })}><Check size={14} /> Attest documents complete</button></header>
    <div className="intake-summary"><div><strong>{initial.questions.length - initial.missingQuestionIds.length}</strong><span>Answered</span></div><div className="warn"><strong>{initial.missingQuestionIds.length}</strong><span>Unknown</span></div><div><strong>{initial.expectedDocuments.filter(({ status }) => status === "received").length} / {initial.expectedDocuments.length}</strong><span>Expected documents received</span></div><p>{initial.attestation?.current ? <><CheckCircle2 size={15} /> Current completeness attestation</> : <><AlertCircle size={15} /> Completeness is not attested for this revision.</>}</p></div>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <div className="screen-grid-main"><section className="panel"><div className="panel-heading"><div><h2>Required screening</h2><p>Evidence is stored with each answer revision.</p></div><button className="button primary" disabled={saving} onClick={saveAnswers}>{saving ? "Saving…" : "Save answers"}</button></div>
      {[...groups.entries()].map(([group, questions]) => <div className="question-group" key={group}><h3>{group.replaceAll("_", " ")}</h3>{questions.map((question) => <div className="question-row persisted-question" key={question.id}><div><strong>{question.prompt}</strong><span>{question.affirmativeTreatment}{question.supportedWhenYes ? " · Yes is supported" : " · Yes blocks supported calculation"}</span><input aria-label={`Evidence for ${question.prompt}`} placeholder="Respondent / evidence note" value={draft[question.id]?.evidence ?? ""} onChange={(event) => setDraft((current) => ({ ...current, [question.id]: { ...current[question.id], evidence: event.target.value } }))} /></div><fieldset aria-label={question.prompt}>{(["yes", "no", "unknown"] as const).map((answer) => <label key={answer} className={draft[question.id]?.answer === answer ? "selected" : ""}><input type="radio" name={question.id} checked={draft[question.id]?.answer === answer} onChange={() => setDraft((current) => ({ ...current, [question.id]: { ...current[question.id], answer } }))} />{answer}</label>)}</fieldset></div>)}</div>)}
    </section><aside className="side-stack"><section className="panel compact-panel"><h2>Expected documents</h2>{initial.expectedDocuments.map((document) => <div className="check-row expected-document-row" key={document.id}>{document.status === "received" ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}<span><span>{document.label}</span>{document.sourceDocumentId ? <small>{linkedSourceNames.get(document.sourceDocumentId) ?? "Linked source document"}</small> : document.evidence ? <small>Evidence note retained</small> : null}</span><b>{document.status.replaceAll("_", " ")}</b><button aria-label={`Edit ${document.label}`} onClick={() => editDocument(document)}><Pencil size={13} /></button></div>)}
      <div className="expected-document-form"><div className="expected-document-form-heading"><h3>{documentForm.expectedVersion ? "Edit expected document" : "Add expected document"}</h3><Link href={`/clients/${clientId}/years/${year}/sources`}>Upload source</Link></div><label><span>Document key</span><input placeholder="w2.employer" disabled={documentForm.expectedVersion !== null} value={documentForm.documentKey} onChange={(event) => setDocumentForm({ ...documentForm, documentKey: event.target.value })} /></label><label><span>Document label</span><input placeholder="Employer W-2" value={documentForm.label} onChange={(event) => setDocumentForm({ ...documentForm, label: event.target.value })} /></label><label><span>Status</span><select value={documentForm.status} onChange={(event) => setDocumentForm({ ...documentForm, status: event.target.value, sourceDocumentId: event.target.value === "received" ? documentForm.sourceDocumentId : "" })}><option value="expected">Expected</option><option value="received">Received</option><option value="unavailable">Unavailable</option><option value="not_applicable">Not applicable</option></select></label>{documentForm.status === "received" ? <label><span>Clean uploaded source</span><select value={documentForm.sourceDocumentId} onChange={(event) => setDocumentForm({ ...documentForm, sourceDocumentId: event.target.value })}><option value="">No source link — use evidence note</option>{initial.sourceDocuments.map((document) => <option value={document.id} key={document.id}>{document.fileName} · {document.documentType}</option>)}</select></label> : null}<label><span>Evidence note</span><input placeholder={documentForm.status === "received" ? "Required when no source is linked" : "Disposition evidence"} value={documentForm.evidence} onChange={(event) => setDocumentForm({ ...documentForm, evidence: event.target.value })} /></label><div className="expected-document-actions">{documentForm.expectedVersion ? <button className="button secondary" disabled={saving} onClick={resetDocumentForm}><X size={13} /> Cancel</button> : null}<button className="button secondary" disabled={saving || !documentFormComplete} onClick={saveDocument}>{documentForm.expectedVersion ? <Check size={13} /> : <Plus size={13} />}{documentForm.expectedVersion ? "Save" : "Add"}</button></div></div>
    </section><section className="panel compact-panel"><h2>Release effect</h2><p>Unknown and affirmative unsupported answers create blocking diagnostics. Any later relevant edit makes the attestation stale.</p></section></aside></div>
  </div>;
}
