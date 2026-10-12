import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type pg from "pg";
import type { AuthorizationContext } from "@/services/authorization";
import { authorize } from "@/services/authorization";
import type { DependentInput2025, FilingStatus2025, ScheduleAInput2025 } from "@/tax-engine/2025";
import { databasePool } from "./database";
import { WorkflowError } from "./client-workflow-service";

export interface ReturnProfileState {
  revision: number;
  version: number;
  hasSpouse: boolean;
  filingStatus: FilingStatus2025;
  filingStatusEligibilityConfirmed: boolean;
  scheduleA: ScheduleAInput2025;
  dependents: DependentInput2025[];
}

export interface SaveReturnProfileInput extends Omit<ReturnProfileState, "revision" | "version" | "hasSpouse"> {
  expectedRevision: number;
  expectedVersion: number;
}

export const emptyScheduleA2025: ScheduleAInput2025 = {
  enabled: false,
  marriedFilingSeparatelySpouseItemizes: null,
  medicalAndDentalExpenses: "0.00",
  stateLocalIncomeOrSalesTaxes: "0.00",
  realEstateTaxes: "0.00",
  personalPropertyTaxes: "0.00",
  otherTaxes: "0.00",
  homeMortgageInterestAndPoints: "0.00",
  investmentInterest: "0.00",
  cashCharitableContributions: "0.00",
  noncashCharitableContributions: "0.00",
  casualtyAndTheftLosses: "0.00",
  otherItemizedDeductions: "0.00",
  saltEligibilityConfirmed: false,
  mortgageLimitsApplied: false,
  charityLimitsApplied: false,
  casualtyLimitsApplied: false,
};

export async function getReturnProfileState(context: AuthorizationContext, clientId: string, year: number): Promise<ReturnProfileState> {
  const client = await databasePool().connect();
  try {
    const scope = await authorizedTaxYear(client, context, clientId, year, false);
    const [profile, dependents, spouse] = await Promise.all([
      client.query<{ filing_status: FilingStatus2025; filing_status_eligibility_confirmed: boolean; schedule_a: ScheduleAInput2025; version: number }>("SELECT filing_status,filing_status_eligibility_confirmed,schedule_a,version FROM return_profiles WHERE tax_year_id=$1", [scope.taxYearId]),
      client.query<{ id: string; legal_name: string; facts: Record<string, unknown> }>("SELECT id,legal_name,facts FROM dependents WHERE tax_year_id=$1 ORDER BY legal_name,id", [scope.taxYearId]),
      client.query("SELECT 1 FROM people WHERE tax_year_id=$1 AND role='spouse'", [scope.taxYearId]),
    ]);
    const row = profile.rows[0];
    return {
      revision: scope.revision,
      version: row?.version ?? 1,
      hasSpouse: Boolean(spouse.rowCount),
      filingStatus: row?.filing_status ?? "single",
      filingStatusEligibilityConfirmed: row?.filing_status_eligibility_confirmed ?? false,
      scheduleA: { ...emptyScheduleA2025, ...(row?.schedule_a ?? {}) },
      dependents: dependents.rows.map(toDependent),
    };
  } finally { client.release(); }
}

export async function saveReturnProfile(context: AuthorizationContext, clientId: string, year: number, input: SaveReturnProfileInput) {
  const client = await databasePool().connect();
  try {
    await client.query("BEGIN");
    const scope = await authorizedTaxYear(client, context, clientId, year, true);
    if (scope.revision !== input.expectedRevision) throw new WorkflowError("conflict", `The return changed from revision ${input.expectedRevision} to ${scope.revision}; reload before saving.`);
    const spouse = await client.query("SELECT 1 FROM people WHERE tax_year_id=$1 AND role='spouse'", [scope.taxYearId]);
    validateStatusFacts(input.filingStatus, input.dependents, input.scheduleA, Boolean(spouse.rowCount));
    const profile = await client.query<{ version: number }>(
      `INSERT INTO return_profiles(tax_year_id,filing_status,filing_status_eligibility_confirmed,schedule_a,version)
       VALUES($1,$2,$3,$4::jsonb,1)
       ON CONFLICT(tax_year_id) DO UPDATE SET filing_status=EXCLUDED.filing_status,filing_status_eligibility_confirmed=EXCLUDED.filing_status_eligibility_confirmed,
       schedule_a=EXCLUDED.schedule_a,version=return_profiles.version+1 WHERE return_profiles.version=$5
       RETURNING version`,
      [scope.taxYearId, input.filingStatus, input.filingStatusEligibilityConfirmed, JSON.stringify(input.scheduleA), input.expectedVersion],
    );
    if (!profile.rows[0]) throw new WorkflowError("conflict", "The filing profile changed; reload before saving.");

    const ids = input.dependents.map(({ id }) => id);
    if (new Set(ids).size !== ids.length) throw new WorkflowError("invalid", "Each dependent must have a unique identifier.");
    if (ids.length) {
      const conflicts = await client.query("SELECT id FROM dependents WHERE id=ANY($1::uuid[]) AND tax_year_id<>$2 LIMIT 1", [ids, scope.taxYearId]);
      if (conflicts.rowCount) throw new WorkflowError("invalid", "A dependent identifier already belongs to another return.");
    }
    await client.query("DELETE FROM dependents WHERE tax_year_id=$1 AND NOT(id=ANY($2::uuid[]))", [scope.taxYearId, ids]);
    for (const dependent of input.dependents) {
      const facts = dependentFacts(dependent);
      const savedDependent = await client.query(
        `INSERT INTO dependents(id,tax_year_id,legal_name,facts) VALUES($1,$2,$3,$4::jsonb)
         ON CONFLICT(id) DO UPDATE SET legal_name=EXCLUDED.legal_name,facts=EXCLUDED.facts,version=dependents.version+1,updated_at=now()
         WHERE dependents.tax_year_id=$2 RETURNING id`,
        [dependent.id || randomUUID(), scope.taxYearId, dependent.legalName, JSON.stringify(facts)],
      );
      if (!savedDependent.rowCount) throw new WorkflowError("conflict", "A dependent changed on another return; reload before saving.");
    }
    const canonicalSnapshot = { ...scope.canonicalSnapshot, filing_profile: { status: input.filingStatus, eligibility_confirmed: input.filingStatusEligibilityConfirmed }, dependents: input.dependents.map(toCanonicalDependent), schedule_a: toCanonicalScheduleA(input.scheduleA) };
    const next = await client.query<{ revision: number }>(`UPDATE tax_years SET revision=revision+1,canonical_snapshot=$2::jsonb,validation_status='not_run',calculation_status='stale',
      preparation_status=CASE WHEN preparation_status IN ('ready_for_review','reviewed_draft') THEN 'changes_requested' ELSE preparation_status END
      WHERE id=$1 RETURNING revision`, [scope.taxYearId, JSON.stringify(canonicalSnapshot)]);
    const revision = next.rows[0]?.revision;
    if (!revision) throw new Error("Tax-year revision update failed.");
    await appendAuditEvent(client, context, scope.taxYearId, "return_profile.updated", "return_profile", scope.taxYearId, { filingStatus: input.filingStatus, dependentCount: input.dependents.length, scheduleAEnabled: input.scheduleA.enabled, version: profile.rows[0].version, revision });
    await client.query("COMMIT");
    return { revision, version: profile.rows[0].version };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

function validateStatusFacts(status: FilingStatus2025, dependents: DependentInput2025[], scheduleA: ScheduleAInput2025, hasSpouse: boolean) {
  if ((status === "married_filing_jointly" || status === "married_filing_separately") && !hasSpouse) throw new WorkflowError("invalid", "Add the spouse profile before selecting a married filing status.");
  if ((status === "head_of_household" || status === "qualifying_surviving_spouse") && dependents.length === 0) throw new WorkflowError("invalid", "The selected filing status requires a reviewed qualifying person.");
  if (status === "married_filing_separately" && scheduleA.marriedFilingSeparatelySpouseItemizes == null) throw new WorkflowError("invalid", "Confirm whether the spouse itemizes deductions for Married Filing Separately.");
  for (const dependent of dependents) {
    if (!dependent.eligibilityReviewed || !dependent.qualifiesAsDependent) throw new WorkflowError("invalid", `Complete the dependent eligibility review for ${dependent.legalName}.`);
    if (dependent.qualifiesForChildTaxCredit && dependent.qualifiesForOtherDependentCredit) throw new WorkflowError("invalid", `${dependent.legalName} cannot be classified for both dependent credits.`);
    if (dependent.qualifiesForChildTaxCredit && !dependent.hasValidSsnForChildTaxCredit) throw new WorkflowError("invalid", `${dependent.legalName} needs a valid SSN for the child tax credit.`);
    if (dependent.qualifiesForChildTaxCredit && Number(dependent.dateOfBirth.slice(0, 4)) <= 2008) throw new WorkflowError("invalid", `${dependent.legalName} was not under age 17 at the end of 2025.`);
  }
}

function toDependent(row: { id: string; legal_name: string; facts: Record<string, unknown> }): DependentInput2025 {
  return {
    id: row.id,
    legalName: row.legal_name,
    dateOfBirth: String(row.facts.dateOfBirth ?? ""),
    relationship: String(row.facts.relationship ?? ""),
    monthsLivedWithTaxpayer: Number(row.facts.monthsLivedWithTaxpayer ?? 0),
    qualifiesAsDependent: row.facts.qualifiesAsDependent === true,
    qualifiesForChildTaxCredit: row.facts.qualifiesForChildTaxCredit === true,
    hasValidSsnForChildTaxCredit: row.facts.hasValidSsnForChildTaxCredit === true,
    qualifiesForOtherDependentCredit: row.facts.qualifiesForOtherDependentCredit === true,
    eligibilityReviewed: row.facts.eligibilityReviewed === true,
  };
}

function dependentFacts(dependent: DependentInput2025) {
  const { id: _id, legalName: _legalName, ...facts } = dependent;
  return facts;
}

async function authorizedTaxYear(client: pg.PoolClient, context: AuthorizationContext, clientId: string, year: number, lock: boolean) {
  const result = await client.query<{ tax_year_id: string; revision: number; canonical_snapshot: Record<string, unknown>; firm_id: string }>(`SELECT ty.id tax_year_id,ty.revision,ty.canonical_snapshot,c.firm_id FROM tax_years ty JOIN clients c ON c.id=ty.client_id WHERE c.id=$1 AND ty.tax_year=$2 AND c.firm_id=$3 AND c.archived_at IS NULL ${lock ? "FOR UPDATE OF ty" : ""}`, [clientId, year, context.firmId]);
  const row = result.rows[0];
  if (!row) throw new WorkflowError("not_found", "Tax year was not found.");
  if (!authorize(context, lock ? "person.modify" : "client.view", { firmId: row.firm_id, clientId })) throw new WorkflowError("forbidden", "Tax-year access is not permitted.");
  return { taxYearId: row.tax_year_id, revision: row.revision, canonicalSnapshot: row.canonical_snapshot };
}

function toCanonicalDependent(dependent: DependentInput2025) {
  return { id: dependent.id, legal_name: dependent.legalName, date_of_birth: dependent.dateOfBirth, relationship: dependent.relationship, months_lived_with_taxpayer: dependent.monthsLivedWithTaxpayer, qualifies_as_dependent: dependent.qualifiesAsDependent, qualifies_for_child_tax_credit: dependent.qualifiesForChildTaxCredit, has_valid_ssn_for_child_tax_credit: dependent.hasValidSsnForChildTaxCredit, qualifies_for_other_dependent_credit: dependent.qualifiesForOtherDependentCredit, eligibility_reviewed: dependent.eligibilityReviewed };
}

function toCanonicalScheduleA(schedule: ScheduleAInput2025) {
  return { enabled: schedule.enabled, married_filing_separately_spouse_itemizes: schedule.marriedFilingSeparatelySpouseItemizes, medical_and_dental_expenses: schedule.medicalAndDentalExpenses, state_local_income_or_sales_taxes: schedule.stateLocalIncomeOrSalesTaxes, real_estate_taxes: schedule.realEstateTaxes, personal_property_taxes: schedule.personalPropertyTaxes, other_taxes: schedule.otherTaxes, home_mortgage_interest_and_points: schedule.homeMortgageInterestAndPoints, investment_interest: schedule.investmentInterest, cash_charitable_contributions: schedule.cashCharitableContributions, noncash_charitable_contributions: schedule.noncashCharitableContributions, casualty_and_theft_losses: schedule.casualtyAndTheftLosses, other_itemized_deductions: schedule.otherItemizedDeductions, salt_eligibility_confirmed: schedule.saltEligibilityConfirmed, mortgage_limits_applied: schedule.mortgageLimitsApplied, charity_limits_applied: schedule.charityLimitsApplied, casualty_limits_applied: schedule.casualtyLimitsApplied };
}

async function appendAuditEvent(client: pg.PoolClient, context: AuthorizationContext, taxYearId: string, eventType: string, recordType: string, recordId: string, metadata: Record<string, unknown>) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [context.firmId]);
  const previous = await client.query<{ event_hash: string }>("SELECT event_hash FROM audit_events WHERE firm_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1", [context.firmId]);
  const previousHash = previous.rows[0]?.event_hash ?? null;
  const payload = JSON.stringify({ firmId: context.firmId, taxYearId, actorId: context.userId, eventType, recordType, recordId, metadata, previousHash });
  const eventHash = createHash("sha256").update(payload).digest("hex");
  await client.query("INSERT INTO audit_events(firm_id,tax_year_id,actor_id,event_type,record_type,record_id,metadata,previous_hash,event_hash) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)", [context.firmId, taxYearId, context.userId, eventType, recordType, recordId, JSON.stringify(metadata), previousHash, eventHash]);
}
