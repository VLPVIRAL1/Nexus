import "server-only";
import { createHash } from "node:crypto";
import type pg from "pg";
import { activityFormDataSchema2025, parseActivityForm2025, type ActivityFormData2025 } from "@/domain/activity-forms-2025";
import { asDecimalString, money } from "@/domain/money";
import { authorize, type AuthorizationContext } from "@/services/authorization";
import { refreshMappingDiagnosticsForTaxYear, type ActivityType } from "./mapping-persistence-service";
import { WorkflowError } from "./client-workflow-service";
import { databasePool } from "./database";

type ScheduleActivityType = Exclude<ActivityType, "schedule_1_other">;

export interface SaveActivityFormInput {
  expectedRevision: number;
  expectedVersion: number;
  name: string;
  ownerRole: "taxpayer" | "spouse";
  additionalReceipts: string;
  receiptNote: string | null;
  changeReason: string;
  formData: ActivityFormData2025;
}

export async function getActivityFormState(context: AuthorizationContext, clientId: string, year: number) {
  const client = await databasePool().connect();
  try {
    const scope = await authorizedTaxYear(client, context, clientId, year, "client.view", false);
    const [activities, mapped, revisions] = await Promise.all([
      client.query<{ id: string; activity_type: ScheduleActivityType; name: string; owner_role: "taxpayer" | "spouse"; implementation_status: "supported" | "mapping_only"; additional_receipts: string; receipt_note: string | null; details: unknown; active: boolean; version: number; updated_at: Date }>(
        "SELECT id,activity_type,name,owner_role,implementation_status,additional_receipts::text,receipt_note,details,active,version,updated_at FROM activities WHERE tax_year_id=$1 AND activity_type IN ('schedule_c','schedule_e','schedule_f') ORDER BY active DESC,activity_type,name,id", [scope.taxYearId],
      ),
      client.query<{ target_activity_id: string; total: string }>(`SELECT sm.target_activity_id,COALESCE(SUM(sm.allocated_amount),0)::text AS total
        FROM source_mappings sm JOIN source_form_records sfr ON sfr.id=sm.source_record_id
        WHERE sm.tax_year_id=$1 AND sm.effective AND sm.mapping_status IN ('accepted','reviewed') AND sm.target_activity_id IS NOT NULL
          AND sfr.effective AND NOT sfr.void AND sfr.record_disposition NOT IN ('void','duplicate_excluded')
        GROUP BY sm.target_activity_id`, [scope.taxYearId]),
      client.query<{ activity_id: string; activity_version: number; change_reason: string; created_at: Date }>(
        "SELECT activity_id,activity_version,change_reason,created_at FROM activity_form_revisions WHERE tax_year_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100", [scope.taxYearId],
      ),
    ]);
    const mappedByActivity = new Map(mapped.rows.map((row) => [row.target_activity_id, asDecimalString(row.total)]));
    const historyByActivity = Map.groupBy(revisions.rows, (row) => row.activity_id);
    return {
      revision: scope.revision,
      activities: activities.rows.map((row) => ({
        id: row.id, type: row.activity_type, name: row.name, ownerRole: row.owner_role, implementationStatus: row.implementation_status,
        mappedReceipts: mappedByActivity.get(row.id) ?? "0.00", additionalReceipts: asDecimalString(row.additional_receipts), receiptNote: row.receipt_note,
        formData: parseActivityForm2025(row.activity_type, row.details), active: row.active, version: row.version, updatedAt: row.updated_at.toISOString(),
        history: (historyByActivity.get(row.id) ?? []).map((item) => ({ version: item.activity_version, reason: item.change_reason, createdAt: item.created_at.toISOString() })),
      })),
    };
  } finally { client.release(); }
}

export async function saveActivityForm(context: AuthorizationContext, clientId: string, year: number, activityId: string, input: SaveActivityFormInput) {
  return inTransaction(async (client) => {
    const scope = await authorizedTaxYear(client, context, clientId, year, "mapping.modify", true);
    assertRevision(scope.revision, input.expectedRevision);
    const current = await client.query<{ activity_type: ScheduleActivityType; version: number; active: boolean }>(
      "SELECT activity_type,version,active FROM activities WHERE id=$1 AND tax_year_id=$2 AND activity_type IN ('schedule_c','schedule_e','schedule_f') FOR UPDATE", [activityId, scope.taxYearId],
    );
    const row = current.rows[0];
    if (!row || !row.active) throw new WorkflowError("not_found", "The active Schedule C, E, or F activity was not found.");
    if (row.version !== input.expectedVersion) throw new WorkflowError("conflict", "The activity changed; reload before saving.");
    const name = input.name.trim();
    const reason = input.changeReason.trim();
    if (!name) throw new WorkflowError("invalid", "Activity name is required.");
    if (!reason) throw new WorkflowError("invalid", "A change reason is required for the activity revision history.");
    const parsed = activityFormDataSchema2025.parse(input.formData);
    if (parsed.scheduleType !== row.activity_type) throw new WorkflowError("invalid", "The form data does not match the activity schedule.");
    const additional = money(input.additionalReceipts);
    if (!additional.isFinite() || additional.lt(0)) throw new WorkflowError("invalid", "Additional receipts must be nonnegative.");
    if (additional.gt(0) && !input.receiptNote?.trim()) throw new WorkflowError("invalid", "Additional receipts require reconciliation evidence confirming that mapped source amounts are excluded.");
    if (row.activity_type !== "schedule_c" && !additional.isZero()) throw new WorkflowError("invalid", "Schedule E and F manual income belongs on the schedule income lines; additional receipts are reserved for Schedule C reconciliation.");
    const updated = await client.query<{ version: number }>(`UPDATE activities SET name=$3,owner_role=$4,implementation_status='supported',receipt_basis='source_plus_additional_receipts',additional_receipts=$5,receipt_note=$6,details=$7::jsonb,version=version+1
      WHERE id=$1 AND tax_year_id=$2 AND version=$8 RETURNING version`, [activityId, scope.taxYearId, name, input.ownerRole, asDecimalString(additional), input.receiptNote?.trim() || null, JSON.stringify(parsed), input.expectedVersion]);
    const version = updated.rows[0]?.version;
    if (!version) throw new WorkflowError("conflict", "The activity changed; reload before saving.");
    await client.query("INSERT INTO activity_form_revisions(activity_id,tax_year_id,activity_version,form_data,change_reason,changed_by) VALUES($1,$2,$3,$4::jsonb,$5,$6)", [activityId, scope.taxYearId, version, JSON.stringify(parsed), reason, context.userId]);
    const revision = scope.revision + 1;
    await invalidateTaxYear(client, scope.taxYearId, revision);
    await refreshMappingDiagnosticsForTaxYear(client, scope.taxYearId, revision);
    await appendAuditEvent(client, context, scope.taxYearId, "activity.form_saved", "activity", activityId, { revision, version, scheduleType: row.activity_type, reason, formDataHash: createHash("sha256").update(JSON.stringify(parsed)).digest("hex"), additionalReceipts: asDecimalString(additional) });
    return { revision, version };
  });
}

async function authorizedTaxYear(client: pg.PoolClient, context: AuthorizationContext, clientId: string, year: number, action: "client.view" | "mapping.modify", lock: boolean) {
  const result = await client.query<{ id: string; revision: number; firm_id: string }>(`SELECT ty.id,ty.revision,c.firm_id FROM tax_years ty JOIN clients c ON c.id=ty.client_id WHERE c.id=$1 AND ty.tax_year=$2 AND c.firm_id=$3 AND c.archived_at IS NULL ${lock ? "FOR UPDATE OF ty" : ""}`, [clientId, year, context.firmId]);
  const row = result.rows[0];
  if (!row) throw new WorkflowError("not_found", "Tax year was not found.");
  if (!authorize(context, action, { firmId: row.firm_id, clientId })) throw new WorkflowError("forbidden", "Activity access is not permitted.");
  return { taxYearId: row.id, revision: row.revision };
}
function assertRevision(current: number, expected: number) { if (current !== expected) throw new WorkflowError("conflict", `Tax year changed from revision ${expected} to ${current}; reload before saving.`); }
async function invalidateTaxYear(client: pg.PoolClient, taxYearId: string, revision: number) { await client.query(`UPDATE tax_years SET revision=$2,validation_status='not_run',calculation_status='stale',preparation_status=CASE WHEN preparation_status IN ('ready_for_review','reviewed_draft') THEN 'changes_requested' ELSE preparation_status END WHERE id=$1`, [taxYearId, revision]); }
async function appendAuditEvent(client: pg.PoolClient, context: AuthorizationContext, taxYearId: string, eventType: string, recordType: string, recordId: string, metadata: Record<string, unknown>) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [context.firmId]);
  const previous = await client.query<{ event_hash: string }>("SELECT event_hash FROM audit_events WHERE firm_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1", [context.firmId]);
  const previousHash = previous.rows[0]?.event_hash ?? null;
  const payload = JSON.stringify({ firmId: context.firmId, taxYearId, actorId: context.userId, eventType, recordType, recordId, metadata, previousHash });
  const eventHash = createHash("sha256").update(payload).digest("hex");
  await client.query("INSERT INTO audit_events(firm_id,tax_year_id,actor_id,event_type,record_type,record_id,metadata,previous_hash,event_hash) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)", [context.firmId, taxYearId, context.userId, eventType, recordType, recordId, JSON.stringify(metadata), previousHash, eventHash]);
}
async function inTransaction<T>(work: (client: pg.PoolClient) => Promise<T>) { const client = await databasePool().connect(); try { await client.query("BEGIN"); const result = await work(client); await client.query("COMMIT"); return result; } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); } }
