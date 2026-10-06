import "server-only";
import { createHash } from "node:crypto";
import type pg from "pg";
import { authorize, type AuthorizationContext } from "@/services/authorization";
import { WorkflowError } from "./client-workflow-service";
import { databasePool } from "./database";

export type ReviewCategory = "confirm" | "fyi" | "pending" | "correction" | "information_required";
export type ReviewStatus = "open" | "waiting" | "resolved" | "not_applicable";

export interface CreateReviewPointInput {
  category: ReviewCategory;
  subject: string;
  description: string;
  sourceRecordId: string | null;
  relatedForm: string | null;
  relatedActivityId: string | null;
  ownerRole: "taxpayer" | "spouse" | "return" | null;
  assignedUserId: string | null;
  dueDate: string | null;
}

export async function createReviewPoint(context: AuthorizationContext, clientId: string, year: number, expectedRevision: number, input: CreateReviewPointInput) {
  return inTransaction(async (client) => {
    const scope = await authorizedTaxYear(client, context, clientId, year, "review.create", true);
    assertRevision(scope.revision, expectedRevision);
    const subject = input.subject.trim();
    const description = input.description.trim();
    if (!subject || !description) throw new WorkflowError("invalid", "Review point subject and description are required.");
    await validateReferences(client, scope.taxYearId, scope.clientId, context.firmId, input);
    const dependencyHash = hashDependency(scope.taxYearId, scope.revision, input.sourceRecordId, input.relatedActivityId, input.relatedForm);
    const inserted = await client.query<{ id: string; version: number }>(
      `INSERT INTO review_points(tax_year_id,category,subject,description,review_status,source_record_id,related_form,related_activity_id,assigned_user_id,created_by_id,due_date,creation_revision,owner_role,dependency_hash)
       VALUES($1,$2,$3,$4,'open',$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id,version`,
      [scope.taxYearId, input.category, subject, description, input.sourceRecordId, input.relatedForm?.trim() || null, input.relatedActivityId, input.assignedUserId, context.userId, input.dueDate, scope.revision, input.ownerRole, dependencyHash],
    );
    const point = inserted.rows[0];
    if (!point) throw new Error("Review point insert failed.");
    await appendAuditEvent(client, context, scope.taxYearId, "review_point.created", "review_point", point.id, { revision: scope.revision, category: input.category, assignedUserId: input.assignedUserId, version: point.version });
    return { id: point.id, version: point.version, revision: scope.revision };
  });
}

export async function updateReviewPointStatus(context: AuthorizationContext, clientId: string, year: number, reviewPointId: string, expectedRevision: number, expectedVersion: number, status: Exclude<ReviewStatus, "open">, resolution: string | null) {
  return inTransaction(async (client) => {
    const action = status === "waiting" ? "review.create" : "review.resolve";
    const scope = await authorizedTaxYear(client, context, clientId, year, action, true);
    assertRevision(scope.revision, expectedRevision);
    if (status !== "waiting" && !resolution?.trim()) throw new WorkflowError("invalid", "A resolution is required to close a review point.");
    const updated = status === "waiting"
      ? await client.query<{ version: number }>("UPDATE review_points SET review_status='waiting',version=version+1 WHERE id=$1 AND tax_year_id=$2 AND version=$3 AND review_status IN ('open','waiting') RETURNING version", [reviewPointId, scope.taxYearId, expectedVersion])
      : await client.query<{ version: number }>("UPDATE review_points SET review_status=$4,resolution=$5,resolved_by_id=$6,resolved_at=now(),resolution_revision=$7,version=version+1 WHERE id=$1 AND tax_year_id=$2 AND version=$3 AND review_status IN ('open','waiting') RETURNING version", [reviewPointId, scope.taxYearId, expectedVersion, status, resolution?.trim(), context.userId, scope.revision]);
    if (!updated.rows[0]) throw new WorkflowError("conflict", "Review point changed or is already closed; reload before saving.");
    await appendAuditEvent(client, context, scope.taxYearId, `review_point.${status}`, "review_point", reviewPointId, { revision: scope.revision, version: updated.rows[0].version });
    return { revision: scope.revision, version: updated.rows[0].version, status };
  });
}

export async function requestChanges(context: AuthorizationContext, clientId: string, year: number, reviewPointId: string, expectedRevision: number, expectedVersion: number) {
  return inTransaction(async (client) => {
    const scope = await authorizedTaxYear(client, context, clientId, year, "return.approve", true);
    assertRevision(scope.revision, expectedRevision);
    const point = await client.query<{ assigned_user_id: string | null; review_status: ReviewStatus; version: number }>("SELECT assigned_user_id,review_status,version FROM review_points WHERE id=$1 AND tax_year_id=$2 FOR UPDATE", [reviewPointId, scope.taxYearId]);
    const row = point.rows[0];
    if (!row) throw new WorkflowError("not_found", "Review point was not found.");
    if (row.version !== expectedVersion) throw new WorkflowError("conflict", "Review point changed; reload before requesting changes.");
    if (row.assigned_user_id !== context.userId || !["open", "waiting"].includes(row.review_status)) throw new WorkflowError("forbidden", "An open review point assigned to the current reviewer is required.");
    await client.query("UPDATE tax_years SET preparation_status='changes_requested' WHERE id=$1", [scope.taxYearId]);
    await appendAuditEvent(client, context, scope.taxYearId, "review.changes_requested", "review_point", reviewPointId, { revision: scope.revision, version: row.version });
    return { revision: scope.revision, status: "changes_requested" as const };
  });
}

export async function getReviewState(context: AuthorizationContext, clientId: string, year: number) {
  const client = await databasePool().connect();
  try {
    const scope = await authorizedTaxYear(client, context, clientId, year, "client.view", false);
    const [points, issues, people, audit] = await Promise.all([
      client.query<{ id: string; category: ReviewCategory; subject: string; description: string; review_status: ReviewStatus; source_record_id: string | null; related_form: string | null; related_activity_id: string | null; owner_role: string | null; assigned_user_id: string | null; assigned_name: string | null; created_by_name: string; due_date: string | null; resolution: string | null; resolved_by_name: string | null; creation_revision: number; resolution_revision: number | null; version: number; created_at: Date; resolved_at: Date | null }>(`SELECT rp.id,rp.category,rp.subject,rp.description,rp.review_status,rp.source_record_id,rp.related_form,rp.related_activity_id,rp.owner_role,rp.assigned_user_id,assignee.display_name AS assigned_name,creator.display_name AS created_by_name,rp.due_date::text,rp.resolution,resolver.display_name AS resolved_by_name,rp.creation_revision,rp.resolution_revision,rp.version,rp.created_at,rp.resolved_at FROM review_points rp JOIN users creator ON creator.id=rp.created_by_id LEFT JOIN users assignee ON assignee.id=rp.assigned_user_id LEFT JOIN users resolver ON resolver.id=rp.resolved_by_id WHERE rp.tax_year_id=$1 ORDER BY CASE rp.review_status WHEN 'open' THEN 0 WHEN 'waiting' THEN 1 ELSE 2 END,rp.created_at DESC`, [scope.taxYearId]),
      client.query<{ id: string; code: string; severity: string; category: string; record_id: string | null; field_path: string | null; message: string; resolution_action: string; creation_revision: number; created_at: Date }>("SELECT id,code,severity,category,record_id,field_path,message,resolution_action,creation_revision,created_at FROM validation_issues WHERE tax_year_id=$1 AND resolved_at IS NULL ORDER BY CASE severity WHEN 'blocking' THEN 0 WHEN 'error' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,created_at", [scope.taxYearId]),
      client.query<{ id: string; display_name: string }>(`SELECT DISTINCT u.id,u.display_name FROM users u JOIN client_assignments ca ON ca.user_id=u.id JOIN memberships m ON m.user_id=u.id AND m.firm_id=$2 WHERE ca.client_id=$1 ORDER BY u.display_name`, [scope.clientId, context.firmId]),
      client.query<{ id: string; event_type: string; record_type: string; record_id: string; metadata: Record<string, unknown>; event_hash: string; previous_hash: string | null; created_at: Date; actor_name: string }>(`SELECT ae.id,ae.event_type,ae.record_type,ae.record_id,ae.metadata,ae.event_hash,ae.previous_hash,ae.created_at,u.display_name AS actor_name FROM audit_events ae JOIN users u ON u.id=ae.actor_id WHERE ae.firm_id=$1 AND ae.tax_year_id=$2 ORDER BY ae.created_at DESC,ae.id DESC LIMIT 100`, [context.firmId, scope.taxYearId]),
    ]);
    return {
      revision: scope.revision,
      preparationStatus: scope.preparationStatus,
      currentUserId: context.userId,
      canResolve: authorize(context, "review.resolve", { firmId: context.firmId, clientId }),
      canRequestChanges: authorize(context, "return.approve", { firmId: context.firmId, clientId }),
      points: points.rows.map((row) => ({ id: row.id, category: row.category, subject: row.subject, description: row.description, status: row.review_status, sourceRecordId: row.source_record_id, relatedForm: row.related_form, relatedActivityId: row.related_activity_id, ownerRole: row.owner_role, assignedUserId: row.assigned_user_id, assignedName: row.assigned_name, createdByName: row.created_by_name, dueDate: row.due_date, resolution: row.resolution, resolvedByName: row.resolved_by_name, creationRevision: row.creation_revision, resolutionRevision: row.resolution_revision, current: row.resolution_revision == null || row.resolution_revision === scope.revision, changedAfterReview: row.resolution_revision != null && row.resolution_revision !== scope.revision, version: row.version, createdAt: row.created_at.toISOString(), resolvedAt: row.resolved_at?.toISOString() ?? null })),
      issues: issues.rows.map((row) => ({ id: row.id, code: row.code, severity: row.severity, category: row.category, recordId: row.record_id, fieldPath: row.field_path, message: row.message, resolutionAction: row.resolution_action, creationRevision: row.creation_revision, createdAt: row.created_at.toISOString() })),
      assignees: people.rows.map((row) => ({ id: row.id, name: row.display_name })),
      auditEvents: audit.rows.map((row) => ({ id: row.id, eventType: row.event_type, recordType: row.record_type, recordId: row.record_id, metadata: safeAuditMetadata(row.metadata), hash: row.event_hash.slice(0, 12), previousHash: row.previous_hash?.slice(0, 12) ?? null, createdAt: row.created_at.toISOString(), actorName: row.actor_name })),
    };
  } finally { client.release(); }
}

async function validateReferences(client: pg.PoolClient, taxYearId: string, clientId: string, firmId: string, input: CreateReviewPointInput) {
  if (input.sourceRecordId && !(await client.query("SELECT 1 FROM source_form_records WHERE id=$1 AND tax_year_id=$2", [input.sourceRecordId, taxYearId])).rowCount) throw new WorkflowError("invalid", "Source record does not belong to this tax year.");
  if (input.relatedActivityId && !(await client.query("SELECT 1 FROM activities WHERE id=$1 AND tax_year_id=$2", [input.relatedActivityId, taxYearId])).rowCount) throw new WorkflowError("invalid", "Activity does not belong to this tax year.");
  if (input.assignedUserId && !(await client.query("SELECT 1 FROM client_assignments ca JOIN memberships m ON m.user_id=ca.user_id WHERE ca.client_id=$1 AND ca.user_id=$2 AND m.firm_id=$3", [clientId, input.assignedUserId, firmId])).rowCount) throw new WorkflowError("invalid", "Assignee is not a firm member assigned to this client.");
}

async function authorizedTaxYear(client: pg.PoolClient, context: AuthorizationContext, clientId: string, year: number, action: "client.view" | "review.create" | "review.resolve" | "return.approve", lock: boolean) {
  const result = await client.query<{ id: string; revision: number; firm_id: string; preparation_status: string }>(`SELECT ty.id,ty.revision,c.firm_id,ty.preparation_status FROM tax_years ty JOIN clients c ON c.id=ty.client_id WHERE c.id=$1 AND ty.tax_year=$2 AND c.firm_id=$3 AND c.archived_at IS NULL ${lock ? "FOR UPDATE OF ty" : ""}`, [clientId, year, context.firmId]);
  const row = result.rows[0];
  if (!row) throw new WorkflowError("not_found", "Tax year was not found.");
  if (!authorize(context, action, { firmId: row.firm_id, clientId })) throw new WorkflowError("forbidden", "Review access is not permitted.");
  return { taxYearId: row.id, clientId, revision: row.revision, preparationStatus: row.preparation_status };
}

function assertRevision(current: number, expected: number) { if (current !== expected) throw new WorkflowError("conflict", `Tax year changed from revision ${expected} to ${current}; reload before saving.`); }
function hashDependency(taxYearId: string, revision: number, sourceRecordId: string | null, activityId: string | null, relatedForm: string | null) { return createHash("sha256").update(JSON.stringify({ taxYearId, revision, sourceRecordId, activityId, relatedForm })).digest("hex"); }
function safeAuditMetadata(metadata: Record<string, unknown>) { return Object.fromEntries(Object.entries(metadata).filter(([key]) => !/tin|ssn|token|payload|snapshot|raw/i.test(key)).slice(0, 12)); }

async function appendAuditEvent(client: pg.PoolClient, context: AuthorizationContext, taxYearId: string, eventType: string, recordType: string, recordId: string, metadata: Record<string, unknown>) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [context.firmId]);
  const previous = await client.query<{ event_hash: string }>("SELECT event_hash FROM audit_events WHERE firm_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1", [context.firmId]);
  const previousHash = previous.rows[0]?.event_hash ?? null;
  const payload = JSON.stringify({ firmId: context.firmId, taxYearId, actorId: context.userId, eventType, recordType, recordId, metadata, previousHash });
  const eventHash = createHash("sha256").update(payload).digest("hex");
  await client.query("INSERT INTO audit_events(firm_id,tax_year_id,actor_id,event_type,record_type,record_id,metadata,previous_hash,event_hash) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)", [context.firmId, taxYearId, context.userId, eventType, recordType, recordId, JSON.stringify(metadata), previousHash, eventHash]);
}

async function inTransaction<T>(work: (client: pg.PoolClient) => Promise<T>) {
  const client = await databasePool().connect();
  try { await client.query("BEGIN"); const result = await work(client); await client.query("COMMIT"); return result; }
  catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
