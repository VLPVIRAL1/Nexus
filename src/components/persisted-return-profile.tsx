"use client";

import { AlertCircle, ArrowLeft, CheckCircle2, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ReturnProfileState } from "@/server/return-profile-service";

type Dependent = ReturnProfileState["dependents"][number];
type ScheduleA = ReturnProfileState["scheduleA"];
const statusLabels: Record<ReturnProfileState["filingStatus"], string> = {
  single: "Single",
  married_filing_jointly: "Married filing jointly",
  married_filing_separately: "Married filing separately",
  head_of_household: "Head of household",
  qualifying_surviving_spouse: "Qualifying surviving spouse",
};
const moneyFields: Array<[keyof ScheduleA, string]> = [
  ["medicalAndDentalExpenses", "Medical and dental expenses"], ["stateLocalIncomeOrSalesTaxes", "State/local income or sales taxes"],
  ["realEstateTaxes", "Real estate taxes"], ["personalPropertyTaxes", "Personal property taxes"], ["otherTaxes", "Other deductible taxes"],
  ["homeMortgageInterestAndPoints", "Home mortgage interest and points"], ["investmentInterest", "Investment interest"],
  ["cashCharitableContributions", "Cash charitable contributions"], ["noncashCharitableContributions", "Noncash charitable contributions"],
  ["casualtyAndTheftLosses", "Eligible disaster casualty/theft loss (computed)"], ["otherItemizedDeductions", "Other itemized deductions"],
];

export function PersistedReturnProfile({ clientId, year, clientName, initial }: { clientId: string; year: number; clientName: string; initial: ReturnProfileState }) {
  const router = useRouter();
  const [filingStatus, setFilingStatus] = useState(initial.filingStatus);
  const [eligibilityConfirmed, setEligibilityConfirmed] = useState(initial.filingStatusEligibilityConfirmed);
  const [standardDeductionFacts, setStandardDeductionFacts] = useState(initial.standardDeductionFacts);
  const [dependents, setDependents] = useState(initial.dependents);
  const [scheduleA, setScheduleA] = useState(initial.scheduleA);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addDependent() {
    setDependents((current) => [...current, { id: crypto.randomUUID(), legalName: "", dateOfBirth: "", relationship: "", monthsLivedWithTaxpayer: 12, qualifiesAsDependent: false, qualifiesForChildTaxCredit: false, hasValidSsnForChildTaxCredit: false, qualifiesForOtherDependentCredit: false, eligibilityReviewed: false }]);
  }
  function updateDependent(index: number, patch: Partial<Dependent>) { setDependents((current) => current.map((dependent, row) => row === index ? { ...dependent, ...patch } : dependent)); }

  async function save() {
    setSaving(true); setError(null);
    const normalizedScheduleA = moneyFields.reduce((current, [field]) => ({ ...current, [field]: formatMoneyDraft(String(current[field])) }), { ...scheduleA });
    const response = await fetch(`/api/clients/${clientId}/years/${year}/return-profile`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedRevision: initial.revision, expectedVersion: initial.version, filingStatus, filingStatusEligibilityConfirmed: eligibilityConfirmed, standardDeductionFacts, dependents, scheduleA: normalizedScheduleA }) });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) { setError(result.message ?? result.error ?? "Unable to save the return profile."); return; }
    router.refresh();
  }

  const marriedStatus = filingStatus === "married_filing_jointly" || filingStatus === "married_filing_separately";
  const needsQualifyingPerson = filingStatus === "head_of_household" || filingStatus === "qualifying_surviving_spouse";
  const dependentFactsComplete = dependents.every((dependent) => dependent.legalName.trim() && dependent.dateOfBirth && dependent.relationship.trim() && dependent.qualifiesAsDependent && dependent.eligibilityReviewed
    && !(dependent.qualifiesForChildTaxCredit && dependent.qualifiesForOtherDependentCredit)
    && (!dependent.qualifiesForChildTaxCredit || (dependent.hasValidSsnForChildTaxCredit && Number(dependent.dateOfBirth.slice(0, 4)) > 2008)));
  const scheduleAmountsValid = moneyFields.every(([field]) => /^\d+(?:\.\d{0,2})?$/.test(String(scheduleA[field])));
  const scheduleReviewsComplete = !scheduleA.enabled
    || ((!hasAmount(scheduleA.stateLocalIncomeOrSalesTaxes) && !hasAmount(scheduleA.realEstateTaxes) && !hasAmount(scheduleA.personalPropertyTaxes) && !hasAmount(scheduleA.otherTaxes)) || scheduleA.saltEligibilityConfirmed)
      && (!hasAmount(scheduleA.homeMortgageInterestAndPoints) || scheduleA.mortgageLimitsApplied)
      && ((!hasAmount(scheduleA.cashCharitableContributions) && !hasAmount(scheduleA.noncashCharitableContributions)) || scheduleA.charityLimitsApplied)
      && (!hasAmount(scheduleA.casualtyAndTheftLosses) || scheduleA.casualtyLimitsApplied);
  const ageBlindnessApplies = standardDeductionFacts.taxpayerAge65OrOlder || standardDeductionFacts.taxpayerBlind || standardDeductionFacts.spouseAge65OrOlder || standardDeductionFacts.spouseBlind;
  const standardDeductionFactsComplete = (!standardDeductionFacts.taxpayerClaimableAsDependent || standardDeductionFacts.form8615ApplicabilityReviewed)
    && (!ageBlindnessApplies || standardDeductionFacts.ageBlindnessFactsReviewed)
    && (marriedStatus || (!standardDeductionFacts.spouseAge65OrOlder && !standardDeductionFacts.spouseBlind))
    && (filingStatus !== "married_filing_separately" || (!standardDeductionFacts.spouseAge65OrOlder && !standardDeductionFacts.spouseBlind) || standardDeductionFacts.mfsSpouseAdditionalDeductionEligible);
  const complete = eligibilityConfirmed && (!marriedStatus || initial.hasSpouse) && (!needsQualifyingPerson || dependents.length > 0) && dependentFactsComplete && scheduleAmountsValid && scheduleReviewsComplete
    && standardDeductionFactsComplete && (filingStatus !== "married_filing_separately" || scheduleA.marriedFilingSeparatelySpouseItemizes !== null);

  return <div className="return-page return-profile-page">
    <div className="return-page-top"><Link href={`/clients/${clientId}/years/${year}`}><ArrowLeft size={14}/> {clientName} · {year}</Link><span>Revision {initial.revision}</span><b>{complete ? "Profile complete" : "Review required"}</b></div>
    <header><div><p>RETURN PROFILE · TAX YEAR {year}</p><h1>Filing status, dependents &amp; Schedule A</h1><span>Explicit reviewed facts drive Form 1040, Schedule 8812 and Schedule A calculations.</span></div><button className="button primary" disabled={saving || !complete} onClick={save}>{saving ? "Saving…" : "Save return profile"}</button></header>
    {error ? <p className="form-error" role="alert"><AlertCircle size={15}/>{error}</p> : null}

    <section id="filing-status" className="panel return-profile-section"><div className="panel-heading"><div><h2>Filing status</h2><p>All five federal Form 1040 filing statuses are available. Eligibility must be reviewed, not inferred from marital status alone.</p></div>{eligibilityConfirmed ? <span className="success-badge"><CheckCircle2 size={14}/> Eligibility confirmed</span> : null}</div>
      <div className="filing-status-grid">{Object.entries(statusLabels).map(([value, label]) => <label className={filingStatus === value ? "selected" : ""} key={value}><input type="radio" name="filing-status" value={value} checked={filingStatus === value} onChange={() => { const next = value as ReturnProfileState["filingStatus"]; setFilingStatus(next); setEligibilityConfirmed(false); if (next !== "married_filing_jointly" && next !== "married_filing_separately") setStandardDeductionFacts((current) => ({ ...current, spouseAge65OrOlder: false, spouseBlind: false, mfsSpouseAdditionalDeductionEligible: false })); }}/><strong>{label}</strong></label>)}</div>
      <label className="check-control"><input type="checkbox" checked={eligibilityConfirmed} onChange={(event) => setEligibilityConfirmed(event.target.checked)}/><span>I reviewed marital status, living-apart rules, household costs, qualifying-person requirements and any spouse-death facts supporting this status.</span></label>
      {filingStatus === "married_filing_separately" ? <label className="field-control"><span>Does the spouse itemize deductions?</span><select value={scheduleA.marriedFilingSeparatelySpouseItemizes == null ? "unknown" : String(scheduleA.marriedFilingSeparatelySpouseItemizes)} onChange={(event) => setScheduleA({ ...scheduleA, marriedFilingSeparatelySpouseItemizes: event.target.value === "unknown" ? null : event.target.value === "true", enabled: event.target.value === "true" ? true : scheduleA.enabled })}><option value="unknown">Select after review</option><option value="false">No</option><option value="true">Yes — taxpayer must itemize</option></select></label> : null}
    </section>

    <section id="standard-deduction" className="panel return-profile-section"><div className="panel-heading"><div><h2>Standard-deduction facts</h2><p>These reviewed facts drive the dependent worksheet and the person-specific age/blindness addition. Form 8615 remains an explicit blocker when required.</p></div></div>
      <div className="return-profile-checks"><Check label="Another person can claim the taxpayer as a dependent" value={standardDeductionFacts.taxpayerClaimableAsDependent} onChange={(value) => setStandardDeductionFacts({ ...standardDeductionFacts, taxpayerClaimableAsDependent: value, form8615ApplicabilityReviewed: value ? standardDeductionFacts.form8615ApplicabilityReviewed : false, form8615Required: value ? standardDeductionFacts.form8615Required : false })}/><Check label="Form 8615 applicability reviewed" value={standardDeductionFacts.form8615ApplicabilityReviewed} disabled={!standardDeductionFacts.taxpayerClaimableAsDependent} onChange={(value) => setStandardDeductionFacts({ ...standardDeductionFacts, form8615ApplicabilityReviewed: value })}/><Check label="Form 8615 is required — return will remain blocked" value={standardDeductionFacts.form8615Required} disabled={!standardDeductionFacts.taxpayerClaimableAsDependent} onChange={(value) => setStandardDeductionFacts({ ...standardDeductionFacts, form8615Required: value })}/></div>
      <div className="return-profile-checks"><Check label="Taxpayer age 65 or older" value={standardDeductionFacts.taxpayerAge65OrOlder} onChange={(value) => setStandardDeductionFacts({ ...standardDeductionFacts, taxpayerAge65OrOlder: value, ageBlindnessFactsReviewed: false })}/><Check label="Taxpayer blind" value={standardDeductionFacts.taxpayerBlind} onChange={(value) => setStandardDeductionFacts({ ...standardDeductionFacts, taxpayerBlind: value, ageBlindnessFactsReviewed: false })}/><Check label="Spouse age 65 or older" value={standardDeductionFacts.spouseAge65OrOlder} disabled={!marriedStatus || !initial.hasSpouse} onChange={(value) => setStandardDeductionFacts({ ...standardDeductionFacts, spouseAge65OrOlder: value, ageBlindnessFactsReviewed: false })}/><Check label="Spouse blind" value={standardDeductionFacts.spouseBlind} disabled={!marriedStatus || !initial.hasSpouse} onChange={(value) => setStandardDeductionFacts({ ...standardDeductionFacts, spouseBlind: value, ageBlindnessFactsReviewed: false })}/><Check label="Age and blindness evidence reviewed" value={standardDeductionFacts.ageBlindnessFactsReviewed} disabled={!ageBlindnessApplies} onChange={(value) => setStandardDeductionFacts({ ...standardDeductionFacts, ageBlindnessFactsReviewed: value })}/>{filingStatus === "married_filing_separately" && (standardDeductionFacts.spouseAge65OrOlder || standardDeductionFacts.spouseBlind) ? <Check label="Spouse had no income, is not filing, and cannot be claimed by another person" value={standardDeductionFacts.mfsSpouseAdditionalDeductionEligible} onChange={(value) => setStandardDeductionFacts({ ...standardDeductionFacts, mfsSpouseAdditionalDeductionEligible: value })}/> : null}</div>
    </section>

    <section id="dependents" className="panel return-profile-section"><div className="panel-heading"><div><h2>Dependents and credits</h2><p>Classify each person after applying the qualifying-child or qualifying-relative tests. Child tax credit and other-dependent credit are mutually exclusive.</p></div><button className="button secondary" onClick={addDependent}><Plus size={14}/> Add dependent</button></div>
      {!dependents.length ? <p className="empty-panel">No dependents entered.</p> : <div className="dependent-list">{dependents.map((dependent, index) => <article className="dependent-card" key={dependent.id}>
        <div className="dependent-card-heading"><strong>Dependent {index + 1}</strong><button aria-label={`Remove ${dependent.legalName || `dependent ${index + 1}`}`} onClick={() => setDependents((current) => current.filter((_, row) => row !== index))}><Trash2 size={15}/></button></div>
        <div className="return-profile-fields"><label><span>Legal name</span><input value={dependent.legalName} onChange={(event) => updateDependent(index, { legalName: event.target.value })}/></label><label><span>Date of birth</span><input type="date" max="2025-12-31" value={dependent.dateOfBirth} onChange={(event) => updateDependent(index, { dateOfBirth: event.target.value })}/></label><label><span>Relationship</span><input placeholder="Child, parent, sibling…" value={dependent.relationship} onChange={(event) => updateDependent(index, { relationship: event.target.value })}/></label><label><span>Months lived with taxpayer</span><input type="number" min="0" max="12" value={dependent.monthsLivedWithTaxpayer} onChange={(event) => updateDependent(index, { monthsLivedWithTaxpayer: Number(event.target.value) })}/></label></div>
        <div className="return-profile-checks"><Check label="Qualifies as a dependent" value={dependent.qualifiesAsDependent} onChange={(value) => updateDependent(index, { qualifiesAsDependent: value })}/><Check label="Qualifies for child tax credit" value={dependent.qualifiesForChildTaxCredit} onChange={(value) => updateDependent(index, { qualifiesForChildTaxCredit: value, qualifiesForOtherDependentCredit: value ? false : dependent.qualifiesForOtherDependentCredit })}/><Check label="Valid SSN for child tax credit" value={dependent.hasValidSsnForChildTaxCredit} onChange={(value) => updateDependent(index, { hasValidSsnForChildTaxCredit: value })}/><Check label="Qualifies for credit for other dependents" value={dependent.qualifiesForOtherDependentCredit} onChange={(value) => updateDependent(index, { qualifiesForOtherDependentCredit: value, qualifiesForChildTaxCredit: value ? false : dependent.qualifiesForChildTaxCredit })}/><Check label="Eligibility tests reviewed and documented" value={dependent.eligibilityReviewed} onChange={(value) => updateDependent(index, { eligibilityReviewed: value })}/></div>
      </article>)}</div>}
    </section>

    <section id="schedule-a" className="panel return-profile-section"><div className="panel-heading"><div><h2>Schedule A itemized deductions</h2><p>The engine applies the 7.5% medical floor and the 2025 SALT limitation. Enter only substantiated, reviewed deductible amounts.</p></div><label className="switch-control"><input type="checkbox" checked={scheduleA.enabled} onChange={(event) => setScheduleA({ ...scheduleA, enabled: event.target.checked })}/><span>Use Schedule A</span></label></div>
      <div className="schedule-a-grid">{moneyFields.map(([field, label]) => <label key={field}><span>{label}</span><input inputMode="decimal" value={String(scheduleA[field])} disabled={!scheduleA.enabled} onChange={(event) => setScheduleA({ ...scheduleA, [field]: sanitizeMoneyDraft(event.target.value) })} onBlur={() => setScheduleA((current) => ({ ...current, [field]: formatMoneyDraft(String(current[field])) }))}/></label>)}</div>
      <div className="return-profile-checks"><Check label="SALT amounts and eligibility reviewed" value={scheduleA.saltEligibilityConfirmed} disabled={!scheduleA.enabled} onChange={(value) => setScheduleA({ ...scheduleA, saltEligibilityConfirmed: value })}/><Check label="Mortgage debt/use limits applied" value={scheduleA.mortgageLimitsApplied} disabled={!scheduleA.enabled} onChange={(value) => setScheduleA({ ...scheduleA, mortgageLimitsApplied: value })}/><Check label="Charitable eligibility and AGI limits applied" value={scheduleA.charityLimitsApplied} disabled={!scheduleA.enabled} onChange={(value) => setScheduleA({ ...scheduleA, charityLimitsApplied: value })}/><Check label="Disaster-loss limits already applied" value={scheduleA.casualtyLimitsApplied} disabled={!scheduleA.enabled} onChange={(value) => setScheduleA({ ...scheduleA, casualtyLimitsApplied: value })}/></div>
    </section>
  </div>;
}

function Check({ label, value, onChange, disabled = false }: { label: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <label className="check-control"><input type="checkbox" checked={value} disabled={disabled} onChange={(event) => onChange(event.target.checked)}/><span>{label}</span></label>;
}

function sanitizeMoneyDraft(value: string) {
  const cleaned = value.replace(/[^0-9.]/g, "");
  const [whole = "", ...fractions] = cleaned.split(".");
  if (!fractions.length) return whole;
  return `${whole}.${fractions.join("").slice(0, 2)}`;
}

function formatMoneyDraft(value: string) {
  const cleaned = sanitizeMoneyDraft(value);
  const [whole = "0", fraction = ""] = cleaned.split(".");
  return `${whole || "0"}.${fraction.padEnd(2, "0").slice(0, 2)}`;
}

function hasAmount(value: string) {
  return Number(value) !== 0;
}
