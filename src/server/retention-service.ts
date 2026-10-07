import "server-only";
import { createHash } from "node:crypto";
import type pg from "pg";
import { authorize, type AuthorizationContext } from "@/services/authorization";
import { WorkflowError } from "./client-workflow-service";
import { databasePool } from "./database";

export const retentionCategories = ["source_originals", "import_payloads", "calculation_snapshots", "generated_artifacts", "audit_history", "backups"] as const;
export type RetentionCategory = typeof retentionCategories[number];
export type RetentionDisposition = "review" | "archive" | "delete";

export async function getRetentionState(context: AuthorizationContext) {
  const canManage = authorize(context, "integration.configure", { firmId: context.firmId });
  if (!canManage) return { canManage, policies: [], holds: [], scopes: [] };
  const [policies, holds, scopes] = await Promise.all([
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
  ]);
  return {
    canManage,
    policies: policies.rows.map((row) => ({ category: row.data_category, retentionMonths: row.retention_months, disposition: row.disposition_action, policyBasis: row.policy_basis, version: row.version, updatedAt: row.updated_at.toISOString(), updatedBy: row.updated_by })),
    holds: holds.rows.map((row) => ({ id: row.id, clientId: row.client_id, taxYearId: row.tax_year_id, clientCode: row.client_code, taxYear: row.tax_year, reference: row.hold_reference, reason: row.reason, placedAt: row.placed_at.toISOString(), placedBy: row.placed_by, releasedAt: row.released_at?.toISOString() ?? null, releaseReason: row.release_reason, releasedBy: row.released_by, version: row.version })),
    scopes: scopes.rows.map((row) => ({ taxYearId: row.tax_year_id, clientId: row.client_id, clientCode: row.client_code, taxYear: row.tax_year })),
  };
}

export async function saveRetentionPolicy(context: AuthorizationContext, input: { category: RetentionCategory; retentionMonths: number; disposition: RetentionDisposition; policyBasis: string; expectedVersion: number | null }) {
  assertAdministrator(context);
  if (!Number.isInteger(input.retentionMonths) || input.retentionMonths < 1 || input.retentionMonths > 1200) throw new WorkflowError("invalid", "Retention must be between 1 and 1,200 months.");
  const basis = input.policyBasis.trim();
  if (!basis) throw new WorkflowError("invalid", "Document the approved legal or operating basis for this policy.");
  if (basis.length > 2000) throw new WorkflowError("invalid", "Policy basis cannot exceed 2,000 characters.");
  return inTransaction(async (client) => {
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
    const hold = await client.query<{ id: string; client_id: string | null; tax_year_id: string | null; version: number; released_at: Date | null }>("SELECT id,client_id,tax_year_id,version,released_at FROM legal_holds WHERE id=$1 AND firm_id=$2 FOR UPDATE", [input.holdId, context.firmId]);
    const current = hold.rows[0];
    if (!current) throw new WorkflowError("not_found", "Legal hold was not found.");
    if (current.released_at || current.version !== input.expectedVersion) throw new WorkflowError("conflict", "The legal hold changed; reload before releasing it.");
    const updated = await client.query<{ version: number }>("UPDATE legal_holds SET released_by_id=$2,released_at=now(),release_reason=$3,version=version+1 WHERE id=$1 RETURNING version", [current.id, context.userId, reason]);
    await appendAuditEvent(client, context, "retention.legal_hold_released", "legal_hold", current.id, { clientId: current.client_id, taxYearId: current.tax_year_id, version: updated.rows[0].version });
    return { id: current.id, version: updated.rows[0].version };
  });
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
