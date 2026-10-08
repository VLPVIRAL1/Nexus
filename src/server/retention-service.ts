import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type pg from "pg";
import { authorize, type AuthorizationContext } from "@/services/authorization";
import { WorkflowError } from "./client-workflow-service";
import { databasePool } from "./database";

export const retentionCategories = ["source_originals", "import_payloads", "calculation_snapshots", "generated_artifacts", "audit_history", "backups"] as const;
export type RetentionCategory = typeof retentionCategories[number];
export type RetentionDisposition = "review" | "archive" | "delete";
export const disposableRetentionCategories = ["source_originals", "import_payloads", "calculation_snapshots", "generated_artifacts"] as const;
export type DisposableRetentionCategory = typeof disposableRetentionCategories[number];

interface DisposalCandidate {
  record_type: string;
  record_id: string;
  client_id: string;
  tax_year_id: string;
  integrity_hash: string | null;
  skip_reason: string | null;
}

export async function getRetentionState(context: AuthorizationContext) {
  const canManage = authorize(context, "integration.configure", { firmId: context.firmId });
  if (!canManage) return { canManage, policies: [], holds: [], scopes: [], disposalRuns: [] };
  const [policies, holds, scopes, disposalRuns] = await Promise.all([
    databasePool().query<{ data_category: RetentionCategory; retention_months: number; disposition_action: RetentionDisposition; policy_basis: string; version: number; updated_at: Date; updated_by: string }>(
      `SELECT p.data_category,p.retention_months,p.disposition_action,p.policy_basis,p.version,p.updated_at,u.display_name updated_by
       FROM firm_retention_policies p JOIN users u ON u.id=p.updated_by_id
       WHERE p.firm_id=$1 ORDER BY p.data_category`, [context.firmId]),
    databasePool().query<{ id: string; client_id: string | null; tax_year_id: string | null; client_code: string; tax_year: number | null; hold_reference: string; reason: string; placed_at: Date; placed_by: string; released_at: Date | null; release_reason: string | null; released_by: string | null; version: number }>(
      `SELECT h.id,h.client_id,h.tax_year_id,c.client_code,ty.tax_year,h.hold_reference,h.reason,h.placed_at,
        placer.display_name placed_by,h.released_at,h.release_reason,releaser.display_name released_by,h.version
       FROM legal_holds h
       LEFT JOIN tax_years ty ON ty.id=h.tax_year_id
       JOIN clients c ON c.id=COALESCE(h.client_id,ty.client_id)
       JOIN users placer ON placer.id=h.placed_by_id
       LEFT JOIN users releaser ON releaser.id=h.released_by_id
       WHERE h.firm_id=$1 ORDER BY (h.released_at IS NULL) DESC,h.placed_at DESC LIMIT 100`, [context.firmId]),
    databasePool().query<{ tax_year_id: string; client_id: string; client_code: string; tax_year: number }>(
      `SELECT ty.id tax_year_id,c.id client_id,c.client_code,ty.tax_year
       FROM clients c JOIN tax_years ty ON ty.client_id=c.id
       WHERE c.firm_id=$1 AND c.archived_at IS NULL ORDER BY c.client_code,ty.tax_year DESC`, [context.firmId]),
    databasePool().query<{ id: string; data_category: DisposableRetentionCategory; cutoff_at: Date; authorization_reference: string; candidate_count: number; disposed_count: number; held_count: number; skipped_count: number; evidence_hash: string; executed_at: Date; executed_by: string }>(
      `SELECT r.id,r.data_category,r.cutoff_at,r.authorization_reference,r.candidate_count,r.disposed_count,r.held_count,r.skipped_count,r.evidence_hash,r.executed_at,u.display_name executed_by
       FROM retention_disposal_runs r JOIN users u ON u.id=r.executed_by_id
       WHERE r.firm_id=$1 ORDER BY r.executed_at DESC,r.id DESC LIMIT 20`, [context.firmId]),
  ]);
  return {
    canManage,
    policies: policies.rows.map((row) => ({ category: row.data_category, retentionMonths: row.retention_months, disposition: row.disposition_action, policyBasis: row.policy_basis, version: row.version, updatedAt: row.updated_at.toISOString(), updatedBy: row.updated_by })),
    holds: holds.rows.map((row) => ({ id: row.id, clientId: row.client_id, taxYearId: row.tax_year_id, clientCode: row.client_code, taxYear: row.tax_year, reference: row.hold_reference, reason: row.reason, placedAt: row.placed_at.toISOString(), placedBy: row.placed_by, releasedAt: row.released_at?.toISOString() ?? null, releaseReason: row.release_reason, releasedBy: row.released_by, version: row.version })),
    scopes: scopes.rows.map((row) => ({ taxYearId: row.tax_year_id, clientId: row.client_id, clientCode: row.client_code, taxYear: row.tax_year })),
    disposalRuns: disposalRuns.rows.map((row) => ({ id: row.id, category: row.data_category, cutoffAt: row.cutoff_at.toISOString(), authorizationReference: row.authorization_reference, candidateCount: row.candidate_count, disposedCount: row.disposed_count, heldCount: row.held_count, skippedCount: row.skipped_count, evidenceHash: row.evidence_hash, executedAt: row.executed_at.toISOString(), executedBy: row.executed_by })),
  };
}

export async function saveRetentionPolicy(context: AuthorizationContext, input: { category: RetentionCategory; retentionMonths: number; disposition: RetentionDisposition; policyBasis: string; expectedVersion: number | null }) {
  assertAdministrator(context);
  if (!Number.isInteger(input.retentionMonths) || input.retentionMonths < 1 || input.retentionMonths > 1200) throw new WorkflowError("invalid", "Retention must be between 1 and 1,200 months.");
  const basis = input.policyBasis.trim();
  if (!basis) throw new WorkflowError("invalid", "Document the approved legal or operating basis for this policy.");
  if (basis.length > 2000) throw new WorkflowError("invalid", "Policy basis cannot exceed 2,000 characters.");
  return inTransaction(async (client) => {
    await lockRetentionGovernance(client, context.firmId);
    const existing = await client.query<{ id: string; version: number }>("SELECT id,version FROM firm_retention_policies WHERE firm_id=$1 AND data_category=$2 FOR UPDATE", [context.firmId, input.category]);
    const current = existing.rows[0];
    if (!current && input.expectedVersion !== null) throw new WorkflowError("conflict", "The retention policy was removed; reload before saving.");
    if (current && input.expectedVersion !== current.version) throw new WorkflowError("conflict", "The retention policy changed; reload before saving.");
    const saved = current
      ? await client.query<{ id: string; version: number }>("UPDATE firm_retention_policies SET retention_months=$2,disposition_action=$3,policy_basis=$4,version=version+1,updated_by_id=$5,updated_at=now() WHERE id=$1 RETURNING id,version", [current.id, input.retentionMonths, input.disposition, basis, context.userId])
      : await client.query<{ id: string; version: number }>("INSERT INTO firm_retention_policies(firm_id,data_category,retention_months,disposition_action,policy_basis,updated_by_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,version", [context.firmId, input.category, input.retentionMonths, input.disposition, basis, context.userId]);
    const row = saved.rows[0];
    await appendAuditEvent(client, context, "retention.policy_saved", "firm_retention_policy", row.id, { category: input.category, retentionMonths: input.retentionMonths, disposition: input.disposition, version: row.version });
    return { id: row.id, version: row.version };
  });
}

export async function placeLegalHold(context: AuthorizationContext, input: { taxYearId: string; reference: string; reason: string }) {
  assertAdministrator(context);
  const reference = input.reference.trim();
  const reason = input.reason.trim();
  if (!reference || !reason) throw new WorkflowError("invalid", "A legal hold requires a reference and reason.");
  if (reference.length > 200 || reason.length > 2000) throw new WorkflowError("invalid", "The hold reference or reason is too long.");
  return inTransaction(async (client) => {
    await lockRetentionGovernance(client, context.firmId);
    const scope = await client.query<{ client_id: string }>("SELECT ty.client_id FROM tax_years ty JOIN clients c ON c.id=ty.client_id WHERE ty.id=$1 AND c.firm_id=$2 AND c.archived_at IS NULL", [input.taxYearId, context.firmId]);
    const clientId = scope.rows[0]?.client_id;
    if (!clientId) throw new WorkflowError("not_found", "The tax-year scope was not found.");
    const duplicate = await client.query("SELECT 1 FROM legal_holds WHERE firm_id=$1 AND tax_year_id=$2 AND released_at IS NULL", [context.firmId, input.taxYearId]);
    if (duplicate.rowCount) throw new WorkflowError("conflict", "This tax year already has an active legal hold.");
    const inserted = await client.query<{ id: string }>("INSERT INTO legal_holds(firm_id,client_id,tax_year_id,hold_reference,reason,placed_by_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id", [context.firmId, clientId, input.taxYearId, reference, reason, context.userId]);
    const id = inserted.rows[0].id;
    await appendAuditEvent(client, context, "retention.legal_hold_placed", "legal_hold", id, { clientId, taxYearId: input.taxYearId, reference });
    return { id, version: 1 };
  });
}

export async function releaseLegalHold(context: AuthorizationContext, input: { holdId: string; expectedVersion: number; reason: string }) {
  assertAdministrator(context);
  const reason = input.reason.trim();
  if (!reason) throw new WorkflowError("invalid", "Document why the legal hold is being released.");
  if (reason.length > 2000) throw new WorkflowError("invalid", "Release reason cannot exceed 2,000 characters.");
  return inTransaction(async (client) => {
    await lockRetentionGovernance(client, context.firmId);
    const hold = await client.query<{ id: string; client_id: string | null; tax_year_id: string | null; version: number; released_at: Date | null }>("SELECT id,client_id,tax_year_id,version,released_at FROM legal_holds WHERE id=$1 AND firm_id=$2 FOR UPDATE", [input.holdId, context.firmId]);
    const current = hold.rows[0];
    if (!current) throw new WorkflowError("not_found", "Legal hold was not found.");
    if (current.released_at || current.version !== input.expectedVersion) throw new WorkflowError("conflict", "The legal hold changed; reload before releasing it.");
    const updated = await client.query<{ version: number }>("UPDATE legal_holds SET released_by_id=$2,released_at=now(),release_reason=$3,version=version+1 WHERE id=$1 RETURNING version", [current.id, context.userId, reason]);
    await appendAuditEvent(client, context, "retention.legal_hold_released", "legal_hold", current.id, { clientId: current.client_id, taxYearId: current.tax_year_id, version: updated.rows[0].version });
    return { id: current.id, version: updated.rows[0].version };
  });
}

export async function previewRetentionDisposal(context: AuthorizationContext, category: DisposableRetentionCategory, now = new Date()) {
  assertAdministrator(context);
  const client = await databasePool().connect();
  try {
    const policy = await loadDeletePolicy(client, context.firmId, category, false);
    const cutoff = retentionCutoff(now, policy.retention_months);
    const candidates = await loadDisposalCandidates(client, context.firmId, category, cutoff);
    const outcomes = await classifyDisposalCandidates(client, context.firmId, candidates);
    return summarizeDisposal(category, cutoff, policy.version, outcomes);
  } finally { client.release(); }
}

export async function executeRetentionDisposal(context: AuthorizationContext, input: { category: DisposableRetentionCategory; expectedPolicyVersion: number; previewCutoffAt: string; authorizationReference: string; confirmation: string }, now = new Date()) {
  assertAdministrator(context);
  const authorizationReference = input.authorizationReference.trim();
  if (!authorizationReference || authorizationReference.length > 200) throw new WorkflowError("invalid", "Provide an authorization reference of at most 200 characters.");
  if (input.confirmation !== `DELETE ${input.category}`) throw new WorkflowError("invalid", `Type DELETE ${input.category} to confirm disposal.`);
  return inTransaction(async (client) => {
    await lockRetentionGovernance(client, context.firmId);
    const policy = await loadDeletePolicy(client, context.firmId, input.category, true);
    if (policy.version !== input.expectedPolicyVersion) throw new WorkflowError("conflict", "The retention policy changed; preview disposal again.");
    const currentCutoff = retentionCutoff(now, policy.retention_months);
    const cutoff = new Date(input.previewCutoffAt);
    if (!Number.isFinite(cutoff.getTime()) || cutoff > currentCutoff || currentCutoff.getTime() - cutoff.getTime() > 15 * 60 * 1000) throw new WorkflowError("conflict", "The disposal preview expired; preview again before executing.");
    const candidates = await loadDisposalCandidates(client, context.firmId, input.category, cutoff);
    const outcomes = await classifyDisposalCandidates(client, context.firmId, candidates);
    const runId = randomUUID();
    const disposableIds = outcomes.filter((item) => item.outcome === "disposed").map((item) => item.record_id);
    await disposeCategoryPayloads(client, input.category, disposableIds, context.userId);
    const summary = summarizeDisposal(input.category, cutoff, policy.version, outcomes);
    const evidenceHash = createHash("sha256").update(JSON.stringify({ firmId: context.firmId, policyId: policy.id, policyVersion: policy.version, authorizationReference, category: input.category, cutoffAt: cutoff.toISOString(), items: outcomes.map((item) => ({ recordType: item.record_type, recordId: item.record_id, outcome: item.outcome, integrityHash: item.integrity_hash, reasonCode: item.reason_code })) })).digest("hex");
    await client.query(
      `INSERT INTO retention_disposal_runs(id,firm_id,policy_id,data_category,cutoff_at,policy_version,authorization_reference,candidate_count,disposed_count,held_count,skipped_count,evidence_hash,executed_by_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [runId, context.firmId, policy.id, input.category, cutoff, policy.version, authorizationReference, summary.candidateCount, summary.disposedCount, summary.heldCount, summary.skippedCount, evidenceHash, context.userId],
    );
    for (const item of outcomes) {
      await client.query(
        `INSERT INTO retention_disposal_items(run_id,client_id,tax_year_id,record_type,record_id,outcome,integrity_hash,reason_code)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [runId, item.client_id, item.tax_year_id, item.record_type, item.record_id, item.outcome, item.integrity_hash, item.reason_code],
      );
    }
    await linkDisposedRecords(client, input.category, disposableIds, runId);
    await appendAuditEvent(client, context, "retention.disposal_executed", "retention_disposal_run", runId, { category: input.category, cutoffAt: cutoff.toISOString(), policyVersion: policy.version, authorizationReference, candidateCount: summary.candidateCount, disposedCount: summary.disposedCount, heldCount: summary.heldCount, skippedCount: summary.skippedCount, evidenceHash });
    return { id: runId, ...summary, evidenceHash };
  });
}

type ClassifiedCandidate = DisposalCandidate & { outcome: "disposed" | "held" | "skipped"; reason_code: string };

async function loadDeletePolicy(client: pg.PoolClient, firmId: string, category: DisposableRetentionCategory, lock: boolean) {
  const result = await client.query<{ id: string; retention_months: number; disposition_action: RetentionDisposition; version: number }>(
    `SELECT id,retention_months,disposition_action,version FROM firm_retention_policies WHERE firm_id=$1 AND data_category=$2${lock ? " FOR UPDATE" : ""}`,
    [firmId, category],
  );
  const policy = result.rows[0];
  if (!policy) throw new WorkflowError("conflict", "Configure an approved retention policy before previewing disposal.");
  if (policy.disposition_action !== "delete") throw new WorkflowError("conflict", "This policy is not configured for authorized deletion.");
  return policy;
}

function retentionCutoff(now: Date, retentionMonths: number) {
  const cutoff = new Date(now);
  const day = cutoff.getUTCDate();
  cutoff.setUTCDate(1);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - retentionMonths);
  const lastDay = new Date(Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() + 1, 0)).getUTCDate();
  cutoff.setUTCDate(Math.min(day, lastDay));
  return cutoff;
}

async function loadDisposalCandidates(client: pg.PoolClient, firmId: string, category: DisposableRetentionCategory, cutoff: Date): Promise<DisposalCandidate[]> {
  const query = category === "source_originals"
    ? `SELECT 'source_document' record_type,sd.id::text record_id,c.id client_id,ty.id tax_year_id,sd.checksum integrity_hash,NULL::text skip_reason FROM source_documents sd JOIN tax_years ty ON ty.id=sd.tax_year_id JOIN clients c ON c.id=ty.client_id WHERE c.firm_id=$1 AND sd.uploaded_at<$2 AND sd.disposed_at IS NULL ORDER BY sd.uploaded_at,sd.id LIMIT 500`
    : category === "import_payloads"
      ? `SELECT 'import_batch' record_type,b.id::text record_id,c.id client_id,ty.id tax_year_id,b.batch_hash integrity_hash,NULL::text skip_reason FROM import_batches b JOIN tax_years ty ON ty.id=b.tax_year_id JOIN clients c ON c.id=ty.client_id WHERE c.firm_id=$1 AND b.created_at<$2 AND b.disposed_at IS NULL AND (b.raw_payload IS NOT NULL OR b.parsed_payload IS NOT NULL OR b.previous_snapshot IS NOT NULL OR b.committed_snapshot IS NOT NULL) ORDER BY b.created_at,b.id LIMIT 500`
      : category === "calculation_snapshots"
        ? `SELECT 'calculation_run' record_type,r.id::text record_id,c.id client_id,ty.id tax_year_id,r.result_hash integrity_hash,CASE WHEN EXISTS(SELECT 1 FROM generated_artifacts a WHERE a.calculation_run_id=r.id) OR EXISTS(SELECT 1 FROM artifact_jobs j WHERE j.calculation_run_id=r.id) OR EXISTS(SELECT 1 FROM manual_overrides o WHERE o.calculation_run_id=r.id) THEN 'referenced_calculation' END skip_reason FROM calculation_runs r JOIN tax_years ty ON ty.id=r.tax_year_id JOIN clients c ON c.id=ty.client_id WHERE c.firm_id=$1 AND r.created_at<$2 ORDER BY r.created_at,r.id LIMIT 500`
        : `SELECT 'generated_artifact' record_type,a.id::text record_id,c.id client_id,ty.id tax_year_id,a.content_hash integrity_hash,CASE WHEN r.input_revision=ty.revision AND a.stale_at IS NULL THEN 'current_artifact' WHEN a.artifact_status IN ('queued','generating') OR EXISTS(SELECT 1 FROM artifact_jobs j WHERE j.artifact_id=a.id AND j.job_status IN ('queued','running')) THEN 'active_artifact_job' END skip_reason FROM generated_artifacts a JOIN tax_years ty ON ty.id=a.tax_year_id JOIN clients c ON c.id=ty.client_id LEFT JOIN calculation_runs r ON r.id=a.calculation_run_id WHERE c.firm_id=$1 AND a.created_at<$2 AND a.disposed_at IS NULL ORDER BY a.created_at,a.id LIMIT 500`;
  return (await client.query<DisposalCandidate>(query, [firmId, cutoff])).rows;
}

async function classifyDisposalCandidates(client: pg.PoolClient, firmId: string, candidates: DisposalCandidate[]): Promise<ClassifiedCandidate[]> {
  if (!candidates.length) return [];
  const taxYearIds = [...new Set(candidates.map((item) => item.tax_year_id))];
  const clientIds = [...new Set(candidates.map((item) => item.client_id))];
  const holds = await client.query<{ tax_year_id: string | null; client_id: string | null }>(
    `SELECT tax_year_id,client_id FROM legal_holds WHERE firm_id=$1 AND released_at IS NULL AND (tax_year_id=ANY($2::uuid[]) OR client_id=ANY($3::uuid[]))`,
    [firmId, taxYearIds, clientIds],
  );
  const heldYears = new Set(holds.rows.flatMap((row) => row.tax_year_id ? [row.tax_year_id] : []));
  const heldClients = new Set(holds.rows.flatMap((row) => row.client_id ? [row.client_id] : []));
  return candidates.map((item) => {
    if (heldYears.has(item.tax_year_id) || heldClients.has(item.client_id)) return { ...item, outcome: "held", reason_code: "active_legal_hold" };
    if (item.skip_reason) return { ...item, outcome: "skipped", reason_code: item.skip_reason };
    return { ...item, outcome: "disposed", reason_code: "retention_period_elapsed" };
  });
}

function summarizeDisposal(category: DisposableRetentionCategory, cutoff: Date, policyVersion: number, items: ClassifiedCandidate[]) {
  return { category, cutoffAt: cutoff.toISOString(), policyVersion, candidateCount: items.length, disposedCount: items.filter((item) => item.outcome === "disposed").length, heldCount: items.filter((item) => item.outcome === "held").length, skippedCount: items.filter((item) => item.outcome === "skipped").length, batchLimit: 500 };
}

async function disposeCategoryPayloads(client: pg.PoolClient, category: DisposableRetentionCategory, ids: string[], userId: string) {
  if (!ids.length) return;
  if (category === "source_originals") {
    const storage = await client.query<{ storage_id: string }>("SELECT storage_id FROM source_documents WHERE id=ANY($1::uuid[]) AND storage_id IS NOT NULL FOR UPDATE", [ids]);
    await client.query("UPDATE source_documents SET storage_id=NULL,scan_state='disposed',disposed_at=now(),disposed_by_id=$2 WHERE id=ANY($1::uuid[])", [ids, userId]);
    const storageIds = storage.rows.map((row) => row.storage_id);
    if (storageIds.length) await client.query("DELETE FROM source_object_blobs WHERE id::text=ANY($1::text[])", [storageIds]);
  } else if (category === "import_payloads") {
    await client.query("UPDATE import_batches SET raw_payload=NULL,parsed_payload=NULL,previous_snapshot=NULL,committed_snapshot=NULL,disposed_at=now(),disposed_by_id=$2 WHERE id=ANY($1::uuid[])", [ids, userId]);
  } else if (category === "calculation_snapshots") {
    await client.query("DELETE FROM calculation_runs WHERE id=ANY($1::uuid[])", [ids]);
  } else {
    await client.query("UPDATE generated_artifacts SET artifact_status='disposed',artifact_bytes=NULL,storage_id=NULL,disposed_at=now(),disposed_by_id=$2 WHERE id=ANY($1::uuid[])", [ids, userId]);
  }
}

async function linkDisposedRecords(client: pg.PoolClient, category: DisposableRetentionCategory, ids: string[], runId: string) {
  if (!ids.length || category === "calculation_snapshots") return;
  const table = category === "source_originals" ? "source_documents" : category === "import_payloads" ? "import_batches" : "generated_artifacts";
  await client.query(`UPDATE ${table} SET disposal_run_id=$2 WHERE id=ANY($1::uuid[])`, [ids, runId]);
}

async function lockRetentionGovernance(client: pg.PoolClient, firmId: string) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`retention:${firmId}`]);
}

function assertAdministrator(context: AuthorizationContext) {
  if (!authorize(context, "integration.configure", { firmId: context.firmId })) throw new WorkflowError("forbidden", "Retention governance requires administrator permission.");
}

async function appendAuditEvent(client: pg.PoolClient, context: AuthorizationContext, eventType: string, recordType: string, recordId: string, metadata: Record<string, unknown>) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [context.firmId]);
  const previous = await client.query<{ event_hash: string }>("SELECT event_hash FROM audit_events WHERE firm_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1", [context.firmId]);
  const previousHash = previous.rows[0]?.event_hash ?? null;
  const payload = JSON.stringify({ firmId: context.firmId, taxYearId: null, actorId: context.userId, eventType, recordType, recordId, metadata, previousHash });
  const eventHash = createHash("sha256").update(payload).digest("hex");
  await client.query("INSERT INTO audit_events(firm_id,tax_year_id,actor_id,event_type,record_type,record_id,metadata,previous_hash,event_hash) VALUES($1,NULL,$2,$3,$4,$5,$6::jsonb,$7,$8)", [context.firmId, context.userId, eventType, recordType, recordId, JSON.stringify(metadata), previousHash, eventHash]);
}

async function inTransaction<T>(work: (client: pg.PoolClient) => Promise<T>) {
  const client = await databasePool().connect();
  try { await client.query("BEGIN"); const result = await work(client); await client.query("COMMIT"); return result; }
  catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
