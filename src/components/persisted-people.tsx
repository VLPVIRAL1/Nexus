"use client";

import { ArrowLeft, Plus, Save, Trash2, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PersonProfileRecord } from "@/server/client-workflow-service";

interface PeopleState { revision: number; people: PersonProfileRecord[] }
interface PersonDraft {
  role: "taxpayer" | "spouse";
  legalName: string;
  dateOfBirth: string;
  occupation: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  address: Record<string, unknown>;
  facts: Record<string, unknown>;
  version: number | null;
}

export function PersistedPeople({ clientId, year, clientName, initial }: { clientId: string; year: number; clientName: string; initial: PeopleState }) {
  const router = useRouter();
  const taxpayer = initial.people.find(({ role }) => role === "taxpayer");
  const spouse = initial.people.find(({ role }) => role === "spouse");
  const [drafts, setDrafts] = useState<Record<"taxpayer" | "spouse", PersonDraft>>({ taxpayer: toDraft("taxpayer", taxpayer), spouse: toDraft("spouse", spouse) });
  const [showSpouse, setShowSpouse] = useState(Boolean(spouse));
  const [busy, setBusy] = useState<"taxpayer" | "spouse" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function update(role: "taxpayer" | "spouse", change: Partial<PersonDraft>) {
    setDrafts((current) => ({ ...current, [role]: { ...current[role], ...change } }));
  }

  async function save(role: "taxpayer" | "spouse") {
    const draft = drafts[role];
    setBusy(role);
    setError(null);
    const response = await fetch(`/api/clients/${clientId}/years/${year}/people/${role}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        legalName: draft.legalName,
        dateOfBirth: draft.dateOfBirth || null,
        address: normalizedAddress(draft),
        facts: { ...draft.facts, occupation: draft.occupation || null },
        expectedVersion: draft.version,
      }),
    });
    const body = await response.json();
    setBusy(null);
    if (!response.ok) {
      setError(body.message ?? body.error ?? `Unable to save the ${role} profile.`);
      return;
    }
    router.refresh();
  }

  async function removeSpouse() {
    if (!spouse) return;
    setBusy("remove");
    setError(null);
    const response = await fetch(`/api/clients/${clientId}/years/${year}/people/spouse`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedVersion: spouse.version }),
    });
    const body = await response.json();
    setBusy(null);
    if (!response.ok) {
      setError(body.message ?? body.error ?? "Unable to remove the spouse profile.");
      return;
    }
    router.refresh();
  }

  return <div className="return-page people-page">
    <div className="return-page-top"><Link href={`/clients/${clientId}/years/${year}`}><ArrowLeft size={14}/> {clientName} · {year}</Link><span>Revision {initial.revision}</span><b>Taxpayer identity</b></div>
    <header><div><p>TAXPAYER &amp; SPOUSE · EDITABLE PROFILE</p><h1>Return identity and address</h1><span>Profiles imported from canonical JSON become the same editable records used by calculation and output. Saving invalidates stale calculations and exports.</span></div></header>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <div className="people-grid">
      <PersonCard draft={drafts.taxpayer} title="Taxpayer" required busy={busy !== null} onChange={(change) => update("taxpayer", change)} onSave={() => save("taxpayer")}/>
      {showSpouse ? <PersonCard draft={drafts.spouse} title="Spouse" busy={busy !== null} onChange={(change) => update("spouse", change)} onSave={() => save("spouse")} onRemove={spouse ? removeSpouse : () => { setShowSpouse(false); setDrafts((current) => ({ ...current, spouse: toDraft("spouse") })); }}/>
        : <section className="panel person-empty"><UserRound size={24}/><div><h2>No spouse profile</h2><p>Add a spouse before selecting Married Filing Jointly or Married Filing Separately.</p></div><button className="button secondary" type="button" onClick={() => setShowSpouse(true)}><Plus size={14}/> Add spouse</button></section>}
    </div>
  </div>;
}

function PersonCard({ draft, title, required = false, busy, onChange, onSave, onRemove }: { draft: PersonDraft; title: string; required?: boolean; busy: boolean; onChange: (change: Partial<PersonDraft>) => void; onSave: () => void; onRemove?: () => void }) {
  const complete = Boolean(draft.legalName.trim());
  return <section className="panel person-card">
    <div className="panel-heading"><div><h2>{title}</h2><p>{draft.version ? `Persisted version ${draft.version}` : "Not entered yet"}{required ? " · required for calculation" : ""}</p></div><div className="header-actions">{onRemove ? <button className="button secondary" type="button" disabled={busy} onClick={onRemove}><Trash2 size={13}/> Remove</button> : null}<button className="button primary" type="button" disabled={busy || !complete} onClick={onSave}><Save size={13}/> Save {title.toLowerCase()}</button></div></div>
    <div className="person-fields">
      <label className="span-two"><span>Legal name</span><input value={draft.legalName} maxLength={200} autoComplete="name" onChange={(event) => onChange({ legalName: event.target.value })}/></label>
      <label><span>Date of birth</span><input type="date" max="2025-12-31" value={draft.dateOfBirth} onChange={(event) => onChange({ dateOfBirth: event.target.value })}/></label>
      <label><span>Occupation</span><input value={draft.occupation} maxLength={200} onChange={(event) => onChange({ occupation: event.target.value })}/></label>
      <label className="span-two"><span>Address line 1</span><input value={draft.line1} autoComplete="address-line1" onChange={(event) => onChange({ line1: event.target.value })}/></label>
      <label className="span-two"><span>Address line 2</span><input value={draft.line2} autoComplete="address-line2" onChange={(event) => onChange({ line2: event.target.value })}/></label>
      <label><span>City</span><input value={draft.city} autoComplete="address-level2" onChange={(event) => onChange({ city: event.target.value })}/></label>
      <label><span>State</span><input value={draft.state} maxLength={50} autoComplete="address-level1" onChange={(event) => onChange({ state: event.target.value })}/></label>
      <label><span>ZIP / postal code</span><input value={draft.postalCode} maxLength={20} autoComplete="postal-code" onChange={(event) => onChange({ postalCode: event.target.value })}/></label>
      <label><span>Country</span><input value={draft.country} maxLength={100} autoComplete="country-name" onChange={(event) => onChange({ country: event.target.value })}/></label>
    </div>
    <p className="person-note">Taxpayer identifiers are not exposed on this screen. Use approved protected-data workflows; never place plaintext SSNs in JSON metadata or notes.</p>
  </section>;
}

function toDraft(role: "taxpayer" | "spouse", person?: PersonProfileRecord): PersonDraft {
  const address = person?.address ?? {};
  const facts = person?.facts ?? {};
  return {
    role,
    legalName: person?.legalName ?? "",
    dateOfBirth: person?.dateOfBirth ?? "",
    occupation: stringAt(facts, "occupation"),
    line1: stringAt(address, "line1", "address_line_1", "street"),
    line2: stringAt(address, "line2", "address_line_2"),
    city: stringAt(address, "city"),
    state: stringAt(address, "state", "region"),
    postalCode: stringAt(address, "postalCode", "postal_code", "zip"),
    country: stringAt(address, "country") || "United States",
    address,
    facts,
    version: person?.version ?? null,
  };
}

function normalizedAddress(draft: PersonDraft) {
  const address = { ...draft.address };
  for (const key of ["address_line_1", "street", "address_line_2", "region", "postal_code", "zip"]) delete address[key];
  return { ...address, line1: draft.line1, line2: draft.line2, city: draft.city, state: draft.state, postalCode: draft.postalCode, country: draft.country };
}

function stringAt(value: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) if (typeof value[key] === "string") return value[key] as string;
  return "";
}
