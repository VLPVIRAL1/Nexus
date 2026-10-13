import "server-only";
import { createHash } from "node:crypto";
import type pg from "pg";
import { emptyFederalCreditProfile2025, parseFederalCreditProfile2025, type FederalCreditProfile2025 } from "@/domain/federal-credits-2025";
import { authorize, type AuthorizationContext } from "@/services/authorization";
import { WorkflowError } from "./client-workflow-service";
import { databasePool } from "./database";

export interface FederalCreditState {
  revision: number;
  version: number;
  profile: FederalCreditProfile2025;
  dependents: Array<{ id: string; legalName: string }>;
  source1098TRecords: Array<{ id: string; studentName: string; institutionName: string }>;
}

export async function getFederalCreditState(context: AuthorizationContext, clientId: string, year: number): Promise<FederalCreditState> {
  const client = await databasePool().connect();
  try {
    const scope = await authorizedTaxYear(client, context, clientId, year, false);
    const [saved, dependents, records] = await Promise.all([
      client.query<{ profile: unknown; version: number }>("SELECT profile,version FROM federal_credit_profiles WHERE tax_year_id=$1", [scope.taxYearId]),
      client.query<{ id: string; legal_name: string }>("SELECT id,legal_name FROM dependents WHERE tax_year_id=$1 ORDER BY legal_name,id", [scope.taxYearId]),
      client.query<{ id: string; normalized_data: Record<string, unknown> }>("SELECT id,normalized_data FROM source_form_records WHERE tax_year_id=$1 AND form_type='1098-T' AND effective AND NOT void AND record_disposition NOT IN ('void','duplicate_excluded') ORDER BY created_at,id", [scope.taxYearId]),
    ]);
    return {
      revision: scope.revision,
      version: saved.rows[0]?.version ?? 1,
      profile: saved.rows[0] ? parseFederalCreditProfile2025(saved.rows[0].profile) : emptyFederalCreditProfile2025,
      dependents: dependents.rows.map(({ id, legal_name }) => ({ id, legalName: legal_name })),
      source1098TRecords: records.rows.map(({ id, normalized_data }) => ({ id, studentName: textAt(normalized_data, "student.name") || "Student not named", institutionName: textAt(normalized_data, "institution.name") || "Institution not named" })),
    };
  } finally { client.release(); }
}

export async function saveFederalCreditProfile(context: AuthorizationContext, clientId: string, year: number, input: { expectedRevision: number; expectedVersion: number; profile: unknown }) {
  const profile = parseFederalCreditProfile2025(input.profile);
  const client = await databasePool().connect();
  try {
    await client.query("BEGIN");
    const scope = await authorizedTaxYear(client, context, clientId, year, true);
    if (scope.revision !== input.expectedRevision) throw new WorkflowError("conflict", `The return changed from revision ${input.expectedRevision} to ${scope.revision}; reload before saving.`);
    await validateReferences(client, scope.taxYearId, profile);
    const saved = await client.query<{ version: number }>(
      `INSERT INTO federal_credit_profiles(tax_year_id,profile,version) VALUES($1,$2::jsonb,1)
       ON CONFLICT(tax_year_id) DO UPDATE SET profile=EXCLUDED.profile,version=federal_credit_profiles.version+1
       WHERE federal_credit_profiles.version=$3 RETURNING version`,
      [scope.taxYearId, JSON.stringify(profile), input.expectedVersion],
    );
    const version = saved.rows[0]?.version;
    if (!version) throw new WorkflowError("conflict", "The federal credit profile changed; reload before saving.");
    await client.query("INSERT INTO federal_credit_profile_revisions(tax_year_id,profile,version,changed_by_id,change_source) VALUES($1,$2::jsonb,$3,$4,'manual')", [scope.taxYearId, JSON.stringify(profile), version, context.userId]);
    const canonical = { ...scope.canonicalSnapshot, credits: profile };
    const updated = await client.query<{ revision: number }>(`UPDATE tax_years SET revision=revision+1,canonical_snapshot=$2::jsonb,validation_status='not_run',calculation_status='stale',
      preparation_status=CASE WHEN preparation_status IN ('ready_for_review','reviewed_draft') THEN 'changes_requested' ELSE preparation_status END
      WHERE id=$1 RETURNING revision`, [scope.taxYearId, JSON.stringify(canonical)]);
    const revision = updated.rows[0]?.revision;
    if (!revision) throw new Error("Tax-year revision update failed.");
    await appendAuditEvent(client, context, scope.taxYearId, "federal_credits.updated", "federal_credit_profile", scope.taxYearId, { version, revision, eitcEnabled: profile.eitc.enabled, dependentCareEnabled: profile.dependentCare.enabled, educationEnabled: profile.education.enabled, eitcChildCount: profile.eitc.qualifyingChildren.length, carePersonCount: profile.dependentCare.qualifyingPersons.length, educationStudentCount: profile.education.students.length });
    await client.query("COMMIT");
    return { revision, version };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

async function validateReferences(client: pg.PoolClient, taxYearId: string, profile: FederalCreditProfile2025) {
  const dependentIds = new Set((await client.query<{ id: string }>("SELECT id FROM dependents WHERE tax_year_id=$1", [taxYearId])).rows.map(({ id }) => id));
  const sourceIds = new Set((await client.query<{ id: string }>("SELECT id FROM source_form_records WHERE tax_year_id=$1 AND form_type='1098-T' AND effective AND NOT void", [taxYearId])).rows.map(({ id }) => id));
  const rowIds = [...profile.eitc.qualifyingChildren, ...profile.dependentCare.providers, ...profile.dependentCare.qualifyingPersons, ...profile.education.students].map(({ id }) => id);
  if (new Set(rowIds).size !== rowIds.length) throw new WorkflowError("invalid", "Every federal-credit interview row must have a unique identifier.");
  const eitcDependentIds = profile.eitc.qualifyingChildren.map(({ dependentId }) => dependentId);
  if (new Set(eitcDependentIds).size !== eitcDependentIds.length) throw new WorkflowError("invalid", "A dependent can appear only once on Schedule EIC.");
  const carePersonKeys = profile.dependentCare.qualifyingPersons.map(({ dependentId, name }) => dependentId ?? `name:${name.toLocaleLowerCase()}`);
  if (new Set(carePersonKeys).size !== carePersonKeys.length) throw new WorkflowError("invalid", "A qualifying person can appear only once on Form 2441.");
  const educationPersonKeys = profile.education.students.map(({ personRole, dependentId }) => personRole === "dependent" ? `dependent:${dependentId}` : personRole);
  if (new Set(educationPersonKeys).size !== educationPersonKeys.length) throw new WorkflowError("invalid", "A student can appear only once on Form 8863.");
  for (const child of profile.eitc.qualifyingChildren) if (!dependentIds.has(child.dependentId)) throw new WorkflowError("invalid", "Every Schedule EIC child must reference a dependent on this return.");
  for (const person of profile.dependentCare.qualifyingPersons) if (person.dependentId && !dependentIds.has(person.dependentId)) throw new WorkflowError("invalid", "Every Form 2441 dependent must reference a dependent on this return.");
  for (const student of profile.education.students) {
    if (student.personRole === "dependent" && (!student.dependentId || !dependentIds.has(student.dependentId))) throw new WorkflowError("invalid", "A dependent education student must reference a dependent on this return.");
    if (student.personRole !== "dependent" && student.dependentId) throw new WorkflowError("invalid", "Only a dependent student may have a dependent reference.");
    if (student.form1098TRecordId && !sourceIds.has(student.form1098TRecordId)) throw new WorkflowError("invalid", "Every linked Form 1098-T must be an effective record on this return.");
  }
}

async function authorizedTaxYear(client: pg.PoolClient, context: AuthorizationContext, clientId: string, year: number, lock: boolean) {
  const result = await client.query<{ tax_year_id: string; revision: number; canonical_snapshot: Record<string, unknown>; firm_id: string }>(`SELECT ty.id tax_year_id,ty.revision,ty.canonical_snapshot,c.firm_id FROM tax_years ty JOIN clients c ON c.id=ty.client_id WHERE c.id=$1 AND ty.tax_year=$2 AND c.firm_id=$3 AND c.archived_at IS NULL ${lock ? "FOR UPDATE OF ty" : ""}`, [clientId, year, context.firmId]);
  const row = result.rows[0];
  if (!row) throw new WorkflowError("not_found", "Tax year was not found.");
  if (!authorize(context, lock ? "person.modify" : "client.view", { firmId: row.firm_id, clientId })) throw new WorkflowError("forbidden", "Federal-credit access is not permitted.");
  return { taxYearId: row.tax_year_id, revision: row.revision, canonicalSnapshot: row.canonical_snapshot };
}

function textAt(value: Record<string, unknown>, path: string) {
  const found = path.split(".").reduce<unknown>((current, key) => current && typeof current === "object" && !Array.isArray(current) ? (current as Record<string, unknown>)[key] : undefined, value);
  return typeof found === "string" ? found.trim() : "";
}

async function appendAuditEvent(client: pg.PoolClient, context: AuthorizationContext, taxYearId: string, eventType: string, recordType: string, recordId: string, metadata: Record<string, unknown>) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [context.firmId]);
  const previous = await client.query<{ event_hash: string }>("SELECT event_hash FROM audit_events WHERE firm_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1", [context.firmId]);
  const previousHash = previous.rows[0]?.event_hash ?? null;
  const payload = JSON.stringify({ firmId: context.firmId, taxYearId, actorId: context.userId, eventType, recordType, recordId, metadata, previousHash });
  const eventHash = createHash("sha256").update(payload).digest("hex");
  await client.query("INSERT INTO audit_events(firm_id,tax_year_id,actor_id,event_type,record_type,record_id,metadata,previous_hash,event_hash) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)", [context.firmId, taxYearId, context.userId, eventType, recordType, recordId, JSON.stringify(metadata), previousHash, eventHash]);
}
