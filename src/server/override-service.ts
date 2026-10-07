import "server-only";
import { createHash } from "node:crypto";
import type pg from "pg";
import { money, asDecimalString } from "@/domain/money";
import { authorize, type AuthorizationContext } from "@/services/authorization";
import { WorkflowError } from "./client-workflow-service";
import { databasePool } from "./database";

interface OverrideDefinition { label: string; traceNodeId: string; unit: "USD"; downstreamPaths: string[] }
export const overrideRegistry: Record<string, OverrideDefinition> = {
  "schedule-c.net-profit": { label: "Schedule C aggregate net profit", traceNodeId: "schedule-c.net-profit", unit: "USD", downstreamPaths: ["Schedule 1 business income", "Schedule SE", "Form 8995", "Form 1040 total income"] },
  "schedule-se.tax": { label: "Schedule SE self-employment tax", traceNodeId: "schedule-se.tax", unit: "USD", downstreamPaths: ["Schedule 2 self-employment tax", "Schedule 1 deductible half", "Form 1040 total tax"] },
  "form-8995.deduction": { label: "Simplified Form 8995 deduction", traceNodeId: "form-8995.deduction", unit: "USD", downstreamPaths: ["Form 1040 taxable income", "Income tax", "Refund or amount owed"] },
  "form-1040.income-tax": { label: "Form 1040 income-tax worksheet result", traceNodeId: "form-1040.income-tax", unit: "USD", downstreamPaths: ["Form 1040 total tax", "Refund or amount owed"] },
};

export async function createOverrideRequest(context: AuthorizationContext, clientId: string, year: number, expectedRevision: number, overridePoint: string, overrideValue: string, reason: string, evidence: string) {
  return inTransaction(async (client) => {
    const scope = await authorizedTaxYear(client, context, clientId, year, "source.modify", true);
    assertRevision(scope.revision, expectedRevision);
    const definition = overrideRegistry[overridePoint];
    if (!definition) throw new WorkflowError("invalid", "This calculation point is not registered for override.");
    if (!reason.trim() || !evidence.trim()) throw new WorkflowError("invalid", "Override reason and evidence are required.");
    const value = money(overrideValue);
    if (!value.isFinite() || value.lt(0)) throw new WorkflowError("invalid", "The override must be a nonnegative USD amount.");
    const run = await client.query<{ id: string; input_revision: number; result: { trace?: Array<{ nodeId?: string; result?: string }> } }>("SELECT id,input_revision,result FROM calculation_runs WHERE tax_year_id=$1 AND input_revision=$2 AND calculation_status IN ('complete','partial') ORDER BY created_at DESC LIMIT 1", [scope.taxYearId, scope.revision]);
    const calculation = run.rows[0];
    if (!calculation) throw new WorkflowError("conflict", "A current persisted calculation is required before requesting an override.");
    const trace = calculation.result.trace?.find(({ nodeId }) => nodeId === definition.traceNodeId);
    if (!trace?.result) throw new WorkflowError("conflict", "The current calculation did not evaluate this registered override point.");
    const engineValue = money(trace.result);
    const dependencyHash = createHash("sha256").update(JSON.stringify({ calculationRunId: calculation.id, inputRevision: calculation.input_revision, overridePoint, engineValue: asDecimalString(engineValue), downstreamPaths: definition.downstreamPaths })).digest("hex");
    const prior = await client.query<{ id: string }>("SELECT id FROM manual_overrides WHERE tax_year_id=$1 AND override_point=$2 ORDER BY created_at DESC LIMIT 1", [scope.taxYearId, overridePoint]);
    const inserted = await client.query<{ id: string; version: number }>(`INSERT INTO manual_overrides(tax_year_id,override_point,engine_value,override_value,unit,reason,evidence,actor_id,active,creation_revision,calculation_run_id,override_status,dependency_hash,downstream_paths,supersedes_override_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,false,$9,$10,'pending_review',$11,$12::jsonb,$13) RETURNING id,version`, [scope.taxYearId, overridePoint, asDecimalString(engineValue), asDecimalString(value), definition.unit, reason.trim(), evidence.trim(), context.userId, scope.revision, calculation.id, dependencyHash, JSON.stringify(definition.downstreamPaths), prior.rows[0]?.id ?? null]);
    const created = inserted.rows[0]; if (!created) throw new Error("Override request insert failed.");
    await appendAuditEvent(client, context, scope.taxYearId, "override.requested", "manual_override", created.id, { revision: scope.revision, overridePoint, engineValue: asDecimalString(engineValue), overrideValue: asDecimalString(value), calculationRunId: calculation.id, version: created.version });
    return { id: created.id, version: created.version, revision: scope.revision };
  });
}

export async function reviewOverride(context: AuthorizationContext, clientId: string, year: number, overrideId: string, expectedRevision: number, expectedVersion: number, decision: "approved" | "rejected", reviewNote: string) {
  return inTransaction(async (client) => {
    const scope = await authorizedTaxYear(client, context, clientId, year, "return.approve", true);
    assertRevision(scope.revision, expectedRevision);
    if (!reviewNote.trim()) throw new WorkflowError("invalid", "Independent reviewer evidence is required.");
    const current = await client.query<{ actor_id: string; override_point: string; calculation_run_id: string; version: number }>("SELECT actor_id,override_point,calculation_run_id,version FROM manual_overrides WHERE id=$1 AND tax_year_id=$2 AND override_status='pending_review' FOR UPDATE", [overrideId, scope.taxYearId]);
    const row = current.rows[0];
    if (!row) throw new WorkflowError("conflict", "Override request changed or is no longer pending.");
    if (row.version !== expectedVersion) throw new WorkflowError("conflict", "Override request changed; reload before reviewing.");
    if (row.actor_id === context.userId) throw new WorkflowError("forbidden", "The person requesting an override cannot approve it.");
    if (decision === "rejected") {
      const updated = await client.query<{ version: number }>("UPDATE manual_overrides SET override_status='rejected',rejected_by_id=$2,rejected_at=now(),review_note=$3,version=version+1 WHERE id=$1 RETURNING version", [overrideId, context.userId, reviewNote.trim()]);
      await appendAuditEvent(client, context, scope.taxYearId, "override.rejected", "manual_override", overrideId, { revision: scope.revision, overridePoint: row.override_point, version: updated.rows[0]?.version });
      return { revision: scope.revision, version: updated.rows[0]?.version, status: decision };
    }
    await client.query("UPDATE manual_overrides SET active=false,override_status='reverted',reverted_by_id=$3,reverted_at=now(),review_note=COALESCE(review_note,'Superseded by a newly approved override'),version=version+1 WHERE tax_year_id=$1 AND override_point=$2 AND active", [scope.taxYearId, row.override_point, context.userId]);
    const updated = await client.query<{ version: number }>("UPDATE manual_overrides SET override_status='approved',active=true,approved_by_id=$2,approved_at=now(),review_note=$3,version=version+1 WHERE id=$1 RETURNING version", [overrideId, context.userId, reviewNote.trim()]);
    const revision = scope.revision + 1;
    await invalidateTaxYear(client, scope.taxYearId, revision);
    await replaceOverrideDiagnostic(client, scope.taxYearId, revision, row.override_point, "An approved manual override requires a new calculation snapshot before any output can be current.");
    await appendAuditEvent(client, context, scope.taxYearId, "override.approved", "manual_override", overrideId, { revision, overridePoint: row.override_point, calculationRunId: row.calculation_run_id, version: updated.rows[0]?.version });
    return { revision, version: updated.rows[0]?.version, status: decision };
  });
}

export async function revertOverride(context: AuthorizationContext, clientId: string, year: number, overrideId: string, expectedRevision: number, expectedVersion: number, reason: string) {
  return inTransaction(async (client) => {
    const scope = await authorizedTaxYear(client, context, clientId, year, "review.resolve", true);
    assertRevision(scope.revision, expectedRevision);
    if (!reason.trim()) throw new WorkflowError("invalid", "Revert evidence is required.");
    const updated = await client.query<{ override_point: string; version: number }>("UPDATE manual_overrides SET override_status='reverted',active=false,reverted_by_id=$4,reverted_at=now(),review_note=$5,version=version+1 WHERE id=$1 AND tax_year_id=$2 AND version=$3 AND override_status='approved' AND active RETURNING override_point,version", [overrideId, scope.taxYearId, expectedVersion, context.userId, reason.trim()]);
    const row = updated.rows[0]; if (!row) throw new WorkflowError("conflict", "Active override changed; reload before reverting.");
    const revision = scope.revision + 1;
    await invalidateTaxYear(client, scope.taxYearId, revision);
    await replaceOverrideDiagnostic(client, scope.taxYearId, revision, row.override_point, "The override was reverted; run a current calculation using the engine value.");
    await appendAuditEvent(client, context, scope.taxYearId, "override.reverted", "manual_override", overrideId, { revision, overridePoint: row.override_point, version: row.version });
    return { revision, version: row.version, status: "reverted" as const };
  });
}

export async function getOverrideState(context: AuthorizationContext, clientId: string, year: number) {
  const client = await databasePool().connect();
  try {
    const scope = await authorizedTaxYear(client, context, clientId, year, "client.view", false);
    const [runs, records] = await Promise.all([
      client.query<{ id: string; input_revision: number; calculation_status: string; result: { trace?: Array<{ nodeId?: string; result?: string }> }; created_at: Date }>("SELECT id,input_revision,calculation_status,result,created_at FROM calculation_runs WHERE tax_year_id=$1 ORDER BY created_at DESC LIMIT 1", [scope.taxYearId]),
      client.query<{ id: string; override_point: string; engine_value: string; override_value: string; unit: string; reason: string; evidence: string; actor_name: string; approved_by_name: string | null; override_status: string; active: boolean; creation_revision: number; version: number; downstream_paths: string[]; review_note: string | null; created_at: Date }>(`SELECT mo.id,mo.override_point,mo.engine_value::text,mo.override_value::text,mo.unit,mo.reason,mo.evidence,actor.display_name AS actor_name,approver.display_name AS approved_by_name,mo.override_status,mo.active,mo.creation_revision,mo.version,mo.downstream_paths,mo.review_note,mo.created_at FROM manual_overrides mo JOIN users actor ON actor.id=mo.actor_id LEFT JOIN users approver ON approver.id=mo.approved_by_id WHERE mo.tax_year_id=$1 ORDER BY mo.created_at DESC`, [scope.taxYearId]),
    ]);
    const run = runs.rows[0];
    const trace = new Map(run?.result.trace?.map((item) => [item.nodeId, item.result]) ?? []);
    return { revision: scope.revision, canReview: authorize(context, "return.approve", { firmId: context.firmId, clientId }), canRevert: authorize(context, "review.resolve", { firmId: context.firmId, clientId }), currentCalculation: run ? { id: run.id, inputRevision: run.input_revision, status: run.calculation_status, current: run.input_revision === scope.revision, createdAt: run.created_at.toISOString() } : null, registeredPoints: Object.entries(overrideRegistry).map(([id, definition]) => ({ id, ...definition, engineValue: trace.get(definition.traceNodeId) ?? null, available: run?.input_revision === scope.revision && trace.has(definition.traceNodeId) })), overrides: records.rows.map((row) => ({ id: row.id, overridePoint: row.override_point, label: overrideRegistry[row.override_point]?.label ?? row.override_point, engineValue: asDecimalString(row.engine_value), overrideValue: asDecimalString(row.override_value), unit: row.unit, reason: row.reason, evidence: row.evidence, actorName: row.actor_name, approvedByName: row.approved_by_name, status: row.override_status, active: row.active, creationRevision: row.creation_revision, version: row.version, downstreamPaths: row.downstream_paths, reviewNote: row.review_note, createdAt: row.created_at.toISOString() })) };
  } finally { client.release(); }
}

async function replaceOverrideDiagnostic(client: pg.PoolClient, taxYearId: string, revision: number, overridePoint: string, message: string) {
  await client.query("UPDATE validation_issues SET resolved_revision=$2,resolved_at=now(),resolution='Superseded by override workflow revision' WHERE tax_year_id=$1 AND code='OVERRIDE_RECALCULATION_REQUIRED' AND field_path=$3 AND resolved_at IS NULL", [taxYearId, revision, overridePoint]);
  await client.query("INSERT INTO validation_issues(tax_year_id,code,severity,category,field_path,message,resolution_action,creation_revision) VALUES($1,'OVERRIDE_RECALCULATION_REQUIRED','blocking','calculation_support',$2,$3,'Run and review a new calculation snapshot for this revision.',$4)", [taxYearId, overridePoint, message, revision]);
}
async function authorizedTaxYear(client: pg.PoolClient, context: AuthorizationContext, clientId: string, year: number, action: "client.view" | "source.modify" | "return.approve" | "review.resolve", lock: boolean) { const result = await client.query<{ id: string; revision: number; firm_id: string }>(`SELECT ty.id,ty.revision,c.firm_id FROM tax_years ty JOIN clients c ON c.id=ty.client_id WHERE c.id=$1 AND ty.tax_year=$2 AND c.firm_id=$3 AND c.archived_at IS NULL ${lock ? "FOR UPDATE OF ty" : ""}`, [clientId, year, context.firmId]); const row=result.rows[0]; if(!row) throw new WorkflowError("not_found","Tax year was not found."); if(!authorize(context,action,{firmId:row.firm_id,clientId})) throw new WorkflowError("forbidden","Override access is not permitted."); return {taxYearId:row.id,revision:row.revision}; }
async function invalidateTaxYear(client: pg.PoolClient,taxYearId:string,revision:number){await client.query("UPDATE tax_years SET revision=$2,validation_status='not_run',calculation_status='stale',preparation_status=CASE WHEN preparation_status IN ('ready_for_review','reviewed_draft') THEN 'changes_requested' ELSE preparation_status END WHERE id=$1",[taxYearId,revision]);}
function assertRevision(current:number,expected:number){if(current!==expected)throw new WorkflowError("conflict",`Tax year changed from revision ${expected} to ${current}; reload before saving.`);}
async function appendAuditEvent(client:pg.PoolClient,context:AuthorizationContext,taxYearId:string,eventType:string,recordType:string,recordId:string,metadata:Record<string,unknown>){await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[context.firmId]);const previous=await client.query<{event_hash:string}>("SELECT event_hash FROM audit_events WHERE firm_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1",[context.firmId]);const previousHash=previous.rows[0]?.event_hash??null;const payload=JSON.stringify({firmId:context.firmId,taxYearId,actorId:context.userId,eventType,recordType,recordId,metadata,previousHash});const eventHash=createHash("sha256").update(payload).digest("hex");await client.query("INSERT INTO audit_events(firm_id,tax_year_id,actor_id,event_type,record_type,record_id,metadata,previous_hash,event_hash) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)",[context.firmId,taxYearId,context.userId,eventType,recordType,recordId,JSON.stringify(metadata),previousHash,eventHash]);}
async function inTransaction<T>(work:(client:pg.PoolClient)=>Promise<T>){const client=await databasePool().connect();try{await client.query("BEGIN");const result=await work(client);await client.query("COMMIT");return result;}catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}}
