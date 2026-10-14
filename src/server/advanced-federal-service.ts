import "server-only";
import { createHash } from "node:crypto";
import type pg from "pg";
import {
  emptyAdvancedFederalProfile2025,
  parseAdvancedFederalProfile2025,
  type AdvancedFederalProfile2025,
} from "@/domain/advanced-federal-2025";
import { authorize, type AuthorizationContext } from "@/services/authorization";
import { WorkflowError } from "./client-workflow-service";
import { databasePool } from "./database";

export interface AdvancedFederalState {
  revision: number;
  versions: { dueDiligence: number; premiumTaxCredit: number; adjustments: number; payments: number; formPackage: number };
  profile: AdvancedFederalProfile2025;
  signatureCurrent: boolean;
  signatures: Array<{ id: string; taxYearRevision: number; profileVersion: number; certification: string; signedAt: string; invalidatedAt: string | null; invalidationReason: string | null }>;
  references: {
    people: Array<{ id: string; label: string }>;
    sourceDocuments: Array<{ id: string; label: string }>;
    form1095ARecords: Array<{ id: string; label: string }>;
    form1098ERecords: Array<{ id: string; label: string }>;
    activities: Array<{ id: string; label: string }>;
  };
}

export async function getAdvancedFederalState(context: AuthorizationContext, clientId: string, year: number): Promise<AdvancedFederalState> {
  const client = await databasePool().connect();
  try {
    const scope = await authorizedTaxYear(client, context, clientId, year, false);
    const [due, ptc, adjustments, payments, packagePrefs, signatures, people, documents, sources, activities] = await Promise.all([
      client.query<{ profile: unknown; version: number }>("SELECT profile,version FROM due_diligence_profiles WHERE tax_year_id=$1", [scope.taxYearId]),
      client.query<{ profile: unknown; version: number }>("SELECT profile,version FROM premium_tax_credit_profiles WHERE tax_year_id=$1", [scope.taxYearId]),
      client.query<{ profile: unknown; version: number }>("SELECT profile,version FROM adjustment_profiles WHERE tax_year_id=$1", [scope.taxYearId]),
      client.query<{ profile: unknown; version: number }>("SELECT profile,version FROM federal_payment_profiles WHERE tax_year_id=$1", [scope.taxYearId]),
      client.query<{ preferences: unknown; version: number }>("SELECT preferences,version FROM output_package_preferences WHERE tax_year_id=$1", [scope.taxYearId]),
      client.query<{ id: string; tax_year_revision: number; profile_version: number; certification: string; signed_at: Date; invalidated_at: Date | null; invalidation_reason: string | null }>("SELECT id,tax_year_revision,profile_version,certification,signed_at,invalidated_at,invalidation_reason FROM due_diligence_signatures WHERE tax_year_id=$1 ORDER BY signed_at DESC,id DESC", [scope.taxYearId]),
      client.query<{ id: string; legal_name: string; role: string }>("SELECT id,legal_name,role FROM people WHERE tax_year_id=$1 ORDER BY role,id", [scope.taxYearId]),
      client.query<{ id: string; file_name: string }>("SELECT id,file_name FROM source_documents WHERE tax_year_id=$1 AND disposed_at IS NULL ORDER BY uploaded_at,id", [scope.taxYearId]),
      client.query<{ id: string; form_type: string; normalized_data: Record<string, unknown> }>("SELECT id,form_type,normalized_data FROM source_form_records WHERE tax_year_id=$1 AND form_type IN ('1095-A','1098-E') AND effective AND NOT void AND record_disposition NOT IN ('void','duplicate_excluded') ORDER BY form_type,created_at,id", [scope.taxYearId]),
      client.query<{ id: string; name: string; activity_type: string }>("SELECT id,name,activity_type FROM activities WHERE tax_year_id=$1 AND active ORDER BY activity_type,name,id", [scope.taxYearId]),
    ]);
    const profile = parseAdvancedFederalProfile2025({
      schemaVersion: "2025.1",
      dueDiligence: parseStored(due.rows[0]?.profile, emptyAdvancedFederalProfile2025.dueDiligence),
      premiumTaxCredit: parseStored(ptc.rows[0]?.profile, emptyAdvancedFederalProfile2025.premiumTaxCredit),
      adjustments: parseStored(adjustments.rows[0]?.profile, emptyAdvancedFederalProfile2025.adjustments),
      payments: parseStored(payments.rows[0]?.profile, emptyAdvancedFederalProfile2025.payments),
      formPackage: parseStored(packagePrefs.rows[0]?.preferences, emptyAdvancedFederalProfile2025.formPackage),
    });
    const dueVersion = due.rows[0]?.version ?? 1;
    const signatureCurrent = signatures.rows.some((row) => row.tax_year_revision === scope.revision && row.profile_version === dueVersion && row.invalidated_at === null);
    const labelForSource = (source: { form_type: string; normalized_data: Record<string, unknown> }) => `${source.form_type} · ${textAt(source.normalized_data, source.form_type === "1095-A" ? "boxes.marketplaceIdentifier" : "payer.name") || "unnamed issuer"}`;
    return {
      revision: scope.revision,
      versions: { dueDiligence: dueVersion, premiumTaxCredit: ptc.rows[0]?.version ?? 1, adjustments: adjustments.rows[0]?.version ?? 1, payments: payments.rows[0]?.version ?? 1, formPackage: packagePrefs.rows[0]?.version ?? 1 },
      profile,
      signatureCurrent,
      signatures: signatures.rows.map((row) => ({ id: row.id, taxYearRevision: row.tax_year_revision, profileVersion: row.profile_version, certification: row.certification, signedAt: row.signed_at.toISOString(), invalidatedAt: row.invalidated_at?.toISOString() ?? null, invalidationReason: row.invalidation_reason })),
      references: {
        people: people.rows.map((row) => ({ id: row.id, label: `${row.legal_name} (${row.role})` })),
        sourceDocuments: documents.rows.map((row) => ({ id: row.id, label: row.file_name })),
        form1095ARecords: sources.rows.filter((row) => row.form_type === "1095-A").map((row) => ({ id: row.id, label: labelForSource(row) })),
        form1098ERecords: sources.rows.filter((row) => row.form_type === "1098-E").map((row) => ({ id: row.id, label: labelForSource(row) })),
        activities: activities.rows.map((row) => ({ id: row.id, label: `${row.activity_type.replace("schedule_", "Schedule ").toUpperCase()} · ${row.name}` })),
      },
    };
  } finally { client.release(); }
}

export async function saveAdvancedFederalProfile(context: AuthorizationContext, clientId: string, year: number, input: { expectedRevision: number; expectedVersions: AdvancedFederalState["versions"]; profile: unknown }) {
  const profile = parseAdvancedFederalProfile2025(input.profile);
  const client = await databasePool().connect();
  try {
    await client.query("BEGIN");
    const scope = await authorizedTaxYear(client, context, clientId, year, true);
    if (scope.revision !== input.expectedRevision) throw new WorkflowError("conflict", `The return changed from revision ${input.expectedRevision} to ${scope.revision}; reload before saving.`);
    await validateReferences(client, scope.taxYearId, profile);
    const dueVersion = await saveProfile(client, "due_diligence_profiles", "profile", "due_diligence_profile_revisions", scope.taxYearId, profile.dueDiligence, input.expectedVersions.dueDiligence, context.userId);
    const ptcVersion = await saveProfile(client, "premium_tax_credit_profiles", "profile", "premium_tax_credit_profile_revisions", scope.taxYearId, profile.premiumTaxCredit, input.expectedVersions.premiumTaxCredit, context.userId);
    const adjustmentVersion = await saveProfile(client, "adjustment_profiles", "profile", "adjustment_profile_revisions", scope.taxYearId, profile.adjustments, input.expectedVersions.adjustments, context.userId);
    const paymentVersion = await saveProfile(client, "federal_payment_profiles", "profile", "federal_payment_profile_revisions", scope.taxYearId, profile.payments, input.expectedVersions.payments, context.userId);
    const packageVersion = await saveProfile(client, "output_package_preferences", "preferences", "output_package_preference_revisions", scope.taxYearId, profile.formPackage, input.expectedVersions.formPackage, context.userId);
    await client.query("UPDATE due_diligence_signatures SET invalidated_at=COALESCE(invalidated_at,now()),invalidation_reason=COALESCE(invalidation_reason,'Return facts changed after certification') WHERE tax_year_id=$1 AND invalidated_at IS NULL", [scope.taxYearId]);
    const canonical = { ...scope.canonicalSnapshot, advanced_federal: profile };
    const updated = await client.query<{ revision: number }>(`UPDATE tax_years SET revision=revision+1,canonical_snapshot=$2::jsonb,validation_status='not_run',calculation_status='stale',preparation_status=CASE WHEN preparation_status IN ('ready_for_review','reviewed_draft') THEN 'changes_requested' ELSE preparation_status END WHERE id=$1 RETURNING revision`, [scope.taxYearId, JSON.stringify(canonical)]);
    const revision = updated.rows[0]?.revision;
    if (!revision) throw new Error("Tax-year revision update failed.");
    await appendAuditEvent(client, context, scope.taxYearId, "advanced_federal.updated", "tax_year", scope.taxYearId, { revision, dueVersion, ptcVersion, adjustmentVersion, paymentVersion, packageVersion });
    await client.query("COMMIT");
    return { revision, versions: { dueDiligence: dueVersion, premiumTaxCredit: ptcVersion, adjustments: adjustmentVersion, payments: paymentVersion, formPackage: packageVersion } };
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export async function signDueDiligence(context: AuthorizationContext, clientId: string, year: number, input: { expectedRevision: number; expectedProfileVersion: number; certification: string }) {
  const certification = input.certification.trim();
  if (certification.length < 20 || certification.length > 1000) throw new WorkflowError("invalid", "Certification must contain 20 to 1,000 characters.");
  const client = await databasePool().connect();
  try {
    await client.query("BEGIN");
    const scope = await authorizedTaxYear(client, context, clientId, year, true);
    if (scope.revision !== input.expectedRevision) throw new WorkflowError("conflict", "The return changed; reload and review Form 8867 again.");
    const due = await client.query<{ profile: unknown; version: number }>("SELECT profile,version FROM due_diligence_profiles WHERE tax_year_id=$1 FOR UPDATE", [scope.taxYearId]);
    if (!due.rows[0] || due.rows[0].version !== input.expectedProfileVersion) throw new WorkflowError("conflict", "The due-diligence interview changed; reload before signing.");
    const profile = parseAdvancedFederalProfile2025({ ...emptyAdvancedFederalProfile2025, dueDiligence: parseStored(due.rows[0].profile, emptyAdvancedFederalProfile2025.dueDiligence) });
    if (!profile.dueDiligence.paidPreparer) throw new WorkflowError("invalid", "Form 8867 certification is only available for a paid-preparer return.");
    const applied = Object.values(profile.dueDiligence.sections).filter(({ applies }) => applies);
    if (!applied.length || applied.some((section) => !section.interviewComplete || !section.knowledgeDocumented || !section.documentsReviewed || !section.consistencyResolved)) throw new WorkflowError("invalid", "Every applicable Form 8867 section must be complete before certification.");
    if (!profile.dueDiligence.clientInterviewDate || !profile.dueDiligence.preparerNotes.trim()) throw new WorkflowError("invalid", "The client interview date and preparer notes are required before certification.");
    if (!profile.dueDiligence.evidence.some(({ verified }) => verified)) throw new WorkflowError("invalid", "At least one verified evidence reference is required before certification.");
    const signatureHash = createHash("sha256").update(JSON.stringify({ taxYearId: scope.taxYearId, revision: scope.revision, profileVersion: due.rows[0].version, userId: context.userId, certification, profile: profile.dueDiligence })).digest("hex");
    const inserted = await client.query<{ id: string; signed_at: Date }>("INSERT INTO due_diligence_signatures(tax_year_id,tax_year_revision,profile_version,signed_by_id,signature_hash,certification) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(tax_year_id,tax_year_revision,profile_version) DO NOTHING RETURNING id,signed_at", [scope.taxYearId, scope.revision, due.rows[0].version, context.userId, signatureHash, certification]);
    if (!inserted.rows[0]) throw new WorkflowError("conflict", "This exact Form 8867 revision is already certified.");
    await appendAuditEvent(client, context, scope.taxYearId, "form_8867.signed", "due_diligence_signature", inserted.rows[0].id, { revision: scope.revision, profileVersion: due.rows[0].version, signatureHash });
    await client.query("COMMIT");
    return { id: inserted.rows[0].id, signedAt: inserted.rows[0].signed_at.toISOString(), signatureHash };
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

async function saveProfile(client: pg.PoolClient, table: string, column: string, revisionTable: string, taxYearId: string, value: unknown, expectedVersion: number, userId: string) {
  const saved = await client.query<{ version: number }>(`INSERT INTO ${table}(tax_year_id,${column},version) VALUES($1,$2::jsonb,1) ON CONFLICT(tax_year_id) DO UPDATE SET ${column}=EXCLUDED.${column},version=${table}.version+1 WHERE ${table}.version=$3 RETURNING version`, [taxYearId, JSON.stringify(value), expectedVersion]);
  const version = saved.rows[0]?.version;
  if (!version) throw new WorkflowError("conflict", "A profile section changed; reload before saving.");
  const revisionColumn = column === "preferences" ? "preferences" : "profile";
  await client.query(`INSERT INTO ${revisionTable}(tax_year_id,${revisionColumn},version,changed_by_id,change_source) VALUES($1,$2::jsonb,$3,$4,'manual')`, [taxYearId, JSON.stringify(value), version, userId]);
  return version;
}

async function validateReferences(client: pg.PoolClient, taxYearId: string, profile: AdvancedFederalProfile2025) {
  const [people, documents, sources, activities] = await Promise.all([
    client.query<{ id: string }>("SELECT id FROM people WHERE tax_year_id=$1", [taxYearId]),
    client.query<{ id: string }>("SELECT id FROM source_documents WHERE tax_year_id=$1 AND disposed_at IS NULL", [taxYearId]),
    client.query<{ id: string; form_type: string }>("SELECT id,form_type FROM source_form_records WHERE tax_year_id=$1 AND effective AND NOT void", [taxYearId]),
    client.query<{ id: string }>("SELECT id FROM activities WHERE tax_year_id=$1 AND active", [taxYearId]),
  ]);
  const personIds = new Set(people.rows.map(({ id }) => id));
  const documentIds = new Set(documents.rows.map(({ id }) => id));
  const sourceTypes = new Map(sources.rows.map(({ id, form_type }) => [id, form_type]));
  const activityIds = new Set(activities.rows.map(({ id }) => id));
  for (const evidence of profile.dueDiligence.evidence) if (evidence.sourceDocumentId && !documentIds.has(evidence.sourceDocumentId)) throw new WorkflowError("invalid", "Form 8867 evidence must reference an active source document on this return.");
  for (const policy of profile.premiumTaxCredit.policies) {
    if (policy.form1095ARecordId && sourceTypes.get(policy.form1095ARecordId) !== "1095-A") throw new WorkflowError("invalid", "A marketplace policy must reference an effective Form 1095-A record.");
    if (policy.coveredPersonIds.some((id) => !personIds.has(id))) throw new WorkflowError("invalid", "Every marketplace covered person must belong to this return.");
  }
  if (profile.adjustments.studentLoan.form1098ERecordId && sourceTypes.get(profile.adjustments.studentLoan.form1098ERecordId) !== "1098-E") throw new WorkflowError("invalid", "Student-loan interest must reference an effective Form 1098-E record.");
  for (const id of [profile.adjustments.selfEmployedHealthInsurance.activityId, profile.adjustments.retirementPlan.activityId]) if (id && !activityIds.has(id)) throw new WorkflowError("invalid", "The selected self-employed activity is not active on this return.");
  for (const payment of profile.payments.payments) if (payment.sourceDocumentId && !documentIds.has(payment.sourceDocumentId)) throw new WorkflowError("invalid", "Payment evidence must reference an active source document on this return.");
}

async function authorizedTaxYear(client: pg.PoolClient, context: AuthorizationContext, clientId: string, year: number, lock: boolean) {
  const result = await client.query<{ tax_year_id: string; revision: number; canonical_snapshot: Record<string, unknown>; firm_id: string }>(`SELECT ty.id tax_year_id,ty.revision,ty.canonical_snapshot,c.firm_id FROM tax_years ty JOIN clients c ON c.id=ty.client_id WHERE c.id=$1 AND ty.tax_year=$2 AND c.firm_id=$3 AND c.archived_at IS NULL ${lock ? "FOR UPDATE OF ty" : ""}`, [clientId, year, context.firmId]);
  const row = result.rows[0];
  if (!row) throw new WorkflowError("not_found", "Tax year was not found.");
  if (!authorize(context, lock ? "person.modify" : "client.view", { firmId: row.firm_id, clientId })) throw new WorkflowError("forbidden", "Advanced federal workflow access is not permitted.");
  return { taxYearId: row.tax_year_id, revision: row.revision, canonicalSnapshot: row.canonical_snapshot };
}

function parseStored<T>(value: unknown, fallback: T): T {
  if (Array.isArray(fallback)) return (Array.isArray(value) ? value : fallback) as T;
  if (fallback && typeof fallback === "object") { const supplied = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; return Object.fromEntries(Object.entries(fallback as Record<string, unknown>).map(([key, child]) => [key, parseStored(supplied[key], child)])) as T; }
  return (value === undefined ? fallback : value) as T;
}
function textAt(value: Record<string, unknown>, path: string) { const result = path.split(".").reduce<unknown>((current, key) => current && typeof current === "object" && !Array.isArray(current) ? (current as Record<string, unknown>)[key] : undefined, value); return typeof result === "string" ? result.trim() : ""; }
async function appendAuditEvent(client: pg.PoolClient, context: AuthorizationContext, taxYearId: string, eventType: string, recordType: string, recordId: string, metadata: Record<string, unknown>) { await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [context.firmId]); const previous = await client.query<{ event_hash: string }>("SELECT event_hash FROM audit_events WHERE firm_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1", [context.firmId]); const previousHash = previous.rows[0]?.event_hash ?? null; const payload = JSON.stringify({ firmId: context.firmId, taxYearId, actorId: context.userId, eventType, recordType, recordId, metadata, previousHash }); const eventHash = createHash("sha256").update(payload).digest("hex"); await client.query("INSERT INTO audit_events(firm_id,tax_year_id,actor_id,event_type,record_type,record_id,metadata,previous_hash,event_hash) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)", [context.firmId, taxYearId, context.userId, eventType, recordType, recordId, JSON.stringify(metadata), previousHash, eventHash]); }
