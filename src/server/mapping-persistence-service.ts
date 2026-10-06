import "server-only";
import { createHash } from "node:crypto";
import Decimal from "decimal.js";
import type pg from "pg";
import { asDecimalString, money } from "@/domain/money";
import type { DecimalString, SourceMapping } from "@/domain/canonical";
import { authorize, type AuthorizationContext } from "@/services/authorization";
import { reconcileMappings, type MappingStatus } from "@/services/mapping-service";
import { WorkflowError } from "./client-workflow-service";
import { databasePool } from "./database";

export type ActivityType = "schedule_c" | "schedule_e" | "schedule_f" | "schedule_1_other";
export type ReceiptBasis = "source_plus_additional_receipts" | "total_books_receipts";

export interface ActivityInput {
  type: ActivityType;
  name: string;
  ownerRole: "taxpayer" | "spouse";
  implementationStatus: "supported" | "mapping_only";
  receiptBasis: ReceiptBasis | null;
  additionalReceipts: string;
  receiptNote: string | null;
}

export interface AllocationInput {
  targetType: ActivityType | "excluded";
  targetActivityId: string | null;
  allocationMethod: "amount" | "percentage";
  allocatedAmount: string | null;
  percentage: string | null;
  reason: string | null;
  note: string | null;
  status: "accepted" | "reviewed";
  residualRecipient?: boolean;
}

interface SourceFieldDefinition { path: string; label: string; suggestedTarget: ActivityType | null; taxCharacter: string }
const sourceFieldRegistry: Record<string, SourceFieldDefinition[]> = {
  "1099-NEC": [
    { path: "boxes.nonemployeeCompensation", label: "Box 1 · Nonemployee compensation", suggestedTarget: "schedule_c", taxCharacter: "Business or other earned income; facts required" },
    { path: "box_1_nonemployee_compensation", label: "Box 1 · Nonemployee compensation", suggestedTarget: "schedule_c", taxCharacter: "Business or other earned income; facts required" },
    { path: "boxes.excessGoldenParachutePayments", label: "Box 3 · Excess golden parachute payments", suggestedTarget: null, taxCharacter: "Unsupported special treatment" },
    { path: "box_3_excess_golden_parachute_payments", label: "Box 3 · Excess golden parachute payments", suggestedTarget: null, taxCharacter: "Unsupported special treatment" },
  ],
  "1099-MISC": [
    { path: "boxes.rents", label: "Box 1 · Rents", suggestedTarget: "schedule_e", taxCharacter: "Rental or business income; facts required" },
    { path: "box_1_rents", label: "Box 1 · Rents", suggestedTarget: "schedule_e", taxCharacter: "Rental or business income; facts required" },
    { path: "boxes.royalties", label: "Box 2 · Royalties", suggestedTarget: "schedule_e", taxCharacter: "Royalty or business income; facts required" },
    { path: "box_2_royalties", label: "Box 2 · Royalties", suggestedTarget: "schedule_e", taxCharacter: "Royalty or business income; facts required" },
    { path: "boxes.otherIncome", label: "Box 3 · Other income", suggestedTarget: "schedule_1_other", taxCharacter: "Other or business income; facts required" },
    { path: "box_3_other_income", label: "Box 3 · Other income", suggestedTarget: "schedule_1_other", taxCharacter: "Other or business income; facts required" },
    { path: "boxes.fishingBoatProceeds", label: "Box 5 · Fishing boat proceeds", suggestedTarget: null, taxCharacter: "Unsupported special treatment" },
    { path: "boxes.medicalPayments", label: "Box 6 · Medical and health care payments", suggestedTarget: "schedule_c", taxCharacter: "Business receipts when facts support treatment" },
    { path: "box_6_medical_and_health_care_payments", label: "Box 6 · Medical and health care payments", suggestedTarget: "schedule_c", taxCharacter: "Business receipts when facts support treatment" },
    { path: "boxes.substitutePayments", label: "Box 8 · Substitute payments", suggestedTarget: null, taxCharacter: "Unsupported special treatment" },
    { path: "boxes.cropInsuranceProceeds", label: "Box 9 · Crop insurance proceeds", suggestedTarget: "schedule_f", taxCharacter: "Farm income; unsupported calculation target" },
    { path: "boxes.attorneyGrossProceeds", label: "Box 10 · Gross proceeds paid to an attorney", suggestedTarget: null, taxCharacter: "Facts and special treatment required" },
    { path: "boxes.section409ADeferrals", label: "Box 12 · Section 409A deferrals", suggestedTarget: null, taxCharacter: "Unsupported special treatment" },
    { path: "boxes.nonqualifiedDeferredCompensation", label: "Box 14 · Nonqualified deferred compensation", suggestedTarget: null, taxCharacter: "Unsupported special treatment" },
  ],
};

export async function createActivity(context: AuthorizationContext, clientId: string, year: number, expectedRevision: number, input: ActivityInput) {
  return inTransaction(async (client) => {
    const scope = await authorizedTaxYear(client, context, clientId, year, "mapping.modify", true);
    assertRevision(scope.revision, expectedRevision);
    const name = input.name.trim();
    if (!name) throw new WorkflowError("invalid", "Activity name is required.");
    if (input.implementationStatus === "supported" && (input.type !== "schedule_c" || input.receiptBasis !== "source_plus_additional_receipts")) {
      throw new WorkflowError("invalid", "Phase 1 supports only Schedule C with the source forms plus separately stated additional receipts basis.");
    }
    if (input.type !== "schedule_c" && input.implementationStatus !== "mapping_only") throw new WorkflowError("invalid", "This destination must remain mapping-only.");
    const additional = money(input.additionalReceipts);
    if (!additional.isFinite() || additional.lt(0)) throw new WorkflowError("invalid", "Additional receipts must be a nonnegative amount.");
    if (additional.gt(0) && !input.receiptNote?.trim()) throw new WorkflowError("invalid", "Additional receipts require evidence that they exclude the mapped source forms.");
    if (input.receiptBasis === "total_books_receipts") throw new WorkflowError("invalid", "Total books receipts are preserved for a future path but are not implemented in Phase 1.");
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO activities(tax_year_id,activity_type,name,owner_role,implementation_status,receipt_basis,additional_receipts,receipt_note,details)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,'{}'::jsonb) RETURNING id`,
      [scope.taxYearId, input.type, name, input.ownerRole, input.implementationStatus, input.receiptBasis, asDecimalString(additional), input.receiptNote?.trim() || null],
    );
    const id = inserted.rows[0]?.id;
    if (!id) throw new Error("Activity insert failed.");
    const revision = scope.revision + 1;
    await invalidateTaxYear(client, scope.taxYearId, revision);
    await refreshMappingDiagnosticsForTaxYear(client, scope.taxYearId, revision);
    await appendAuditEvent(client, context, scope.taxYearId, "activity.created", "activity", id, { revision, type: input.type, implementationStatus: input.implementationStatus, receiptBasis: input.receiptBasis, additionalReceipts: asDecimalString(additional) });
    return { id, revision };
  });
}

export async function deactivateActivity(context: AuthorizationContext, clientId: string, year: number, activityId: string, expectedRevision: number, expectedVersion: number) {
  return inTransaction(async (client) => {
    const scope = await authorizedTaxYear(client, context, clientId, year, "mapping.modify", true);
    assertRevision(scope.revision, expectedRevision);
    const activeMappings = await client.query("SELECT 1 FROM source_mappings WHERE tax_year_id=$1 AND target_activity_id=$2 AND effective LIMIT 1", [scope.taxYearId, activityId]);
    if (activeMappings.rowCount) throw new WorkflowError("conflict", "Remap or exclude every active allocation before deactivating this activity.");
    const updated = await client.query<{ version: number }>("UPDATE activities SET active=false,version=version+1 WHERE id=$1 AND tax_year_id=$2 AND version=$3 AND active RETURNING version", [activityId, scope.taxYearId, expectedVersion]);
    if (!updated.rows[0]) throw new WorkflowError("conflict", "Activity changed or is already inactive; reload before saving.");
    const revision = scope.revision + 1;
    await invalidateTaxYear(client, scope.taxYearId, revision);
    await refreshMappingDiagnosticsForTaxYear(client, scope.taxYearId, revision);
    await appendAuditEvent(client, context, scope.taxYearId, "activity.deactivated", "activity", activityId, { revision, version: updated.rows[0].version });
    return { revision, version: updated.rows[0].version };
  });
}

export async function saveAllocations(context: AuthorizationContext, clientId: string, year: number, sourceRecordId: string, sourceField: string, expectedRevision: number, allocations: AllocationInput[]) {
  return inTransaction(async (client) => {
    const scope = await authorizedTaxYear(client, context, clientId, year, "mapping.modify", true);
    assertRevision(scope.revision, expectedRevision);
    if (allocations.length > 20) throw new WorkflowError("invalid", "A source field supports at most 20 allocation rows.");
    const sourceResult = await client.query<{ form_type: string; normalized_data: Record<string, unknown> }>(
      "SELECT form_type,normalized_data FROM source_form_records WHERE id=$1 AND tax_year_id=$2 AND effective AND NOT void FOR UPDATE",
      [sourceRecordId, scope.taxYearId],
    );
    const source = sourceResult.rows[0];
    if (!source) throw new WorkflowError("conflict", "The source record is inactive, void, changed, or belongs to another tax year.");
    const definition = sourceFieldRegistry[source.form_type]?.find(({ path }) => path === sourceField);
    if (!definition) throw new WorkflowError("invalid", "This source field is not registered as a mappable tax amount.");
    const sourceAmount = decimalAtPath(source.normalized_data, sourceField);
    if (sourceAmount == null || sourceAmount.lt(0)) throw new WorkflowError("invalid", "The active source field does not contain a supported nonnegative amount.");

    const activityIds = allocations.flatMap(({ targetActivityId }) => targetActivityId ? [targetActivityId] : []);
    const activityResult = activityIds.length ? await client.query<{ id: string; activity_type: ActivityType; implementation_status: "supported" | "mapping_only"; active: boolean }>(
      "SELECT id,activity_type,implementation_status,active FROM activities WHERE tax_year_id=$1 AND id=ANY($2::uuid[])", [scope.taxYearId, activityIds],
    ) : { rows: [] };
    const activities = new Map(activityResult.rows.map((activity) => [activity.id, activity]));
    for (const allocation of allocations) {
      if (allocation.status === "reviewed" && context.role !== "reviewer") throw new WorkflowError("forbidden", "Only the assigned reviewer may record a reviewed allocation.");
      if (allocation.targetType === "excluded") {
        if (allocation.targetActivityId) throw new WorkflowError("invalid", "An exclusion cannot reference an activity.");
        if (allocation.status !== "reviewed" || context.role !== "reviewer" || !allocation.reason?.trim()) throw new WorkflowError("invalid", "A non-taxable exclusion requires reviewer approval and a documented factual reason.");
      } else {
        const activity = allocation.targetActivityId ? activities.get(allocation.targetActivityId) : undefined;
        if (!activity || !activity.active) throw new WorkflowError("invalid", "The target activity is missing, inactive, or belongs to another tax year.");
        if (activity.activity_type !== allocation.targetType) throw new WorkflowError("invalid", "The target activity type does not match the allocation destination.");
      }
    }

    const methods = new Set(allocations.map(({ allocationMethod }) => allocationMethod));
    if (methods.size > 1) throw new WorkflowError("invalid", "Use one allocation method for a source field revision.");
    const computed = computeAllocationAmounts(sourceAmount, allocations);
    const canonicalMappings: SourceMapping[] = allocations.map((allocation, index) => ({
      id: `pending-${index}`, sourceRecordId, sourceField, sourceAmount: asDecimalString(sourceAmount), targetType: allocation.targetType,
      targetActivityId: allocation.targetActivityId, allocationMethod: allocation.allocationMethod, allocatedAmount: computed.amounts[index],
      percentage: allocation.percentage == null ? null : asDecimalString(allocation.percentage), reason: allocation.reason, status: allocation.status, version: 1,
    }));
    let reconciliation;
    try { reconciliation = reconcileMappings(asDecimalString(sourceAmount), canonicalMappings); }
    catch { throw new WorkflowError("invalid", "Accepted allocations exceed the effective source amount."); }

    const prior = await client.query<{ id: string }>("SELECT id FROM source_mappings WHERE tax_year_id=$1 AND source_record_id=$2 AND source_field=$3 AND effective ORDER BY created_at,id FOR UPDATE", [scope.taxYearId, sourceRecordId, sourceField]);
    const versionResult = await client.query<{ version: number }>("SELECT COALESCE(MAX(version),0)+1 AS version FROM source_mappings WHERE tax_year_id=$1 AND source_record_id=$2 AND source_field=$3", [scope.taxYearId, sourceRecordId, sourceField]);
    const version = Number(versionResult.rows[0]?.version ?? 1);
    await client.query("UPDATE source_mappings SET effective=false WHERE tax_year_id=$1 AND source_record_id=$2 AND source_field=$3 AND effective", [scope.taxYearId, sourceRecordId, sourceField]);
    const ids: string[] = [];
    for (let index = 0; index < allocations.length; index += 1) {
      const allocation = allocations[index];
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO source_mappings(tax_year_id,source_record_id,source_field,source_amount,target_type,target_activity_id,allocation_method,allocated_amount,percentage,reason,mapping_status,version,effective,supersedes_mapping_id,note,created_by,receives_rounding_residual)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true,$13,$14,$15,$16) RETURNING id`,
        [scope.taxYearId, sourceRecordId, sourceField, asDecimalString(sourceAmount), allocation.targetType, allocation.targetActivityId, allocation.allocationMethod, computed.amounts[index], allocation.percentage, allocation.reason?.trim() || null, allocation.status, version, prior.rows[index]?.id ?? null, allocation.note?.trim() || null, context.userId, computed.residualRecipientIndex === index],
      );
      if (inserted.rows[0]) ids.push(inserted.rows[0].id);
    }
    const revision = scope.revision + 1;
    await invalidateTaxYear(client, scope.taxYearId, revision);
    const blockerCount = await refreshMappingDiagnosticsForTaxYear(client, scope.taxYearId, revision);
    await appendAuditEvent(client, context, scope.taxYearId, "mapping.allocations_saved", "source_form_record", sourceRecordId, {
      revision, sourceField, sourceAmount: asDecimalString(sourceAmount), allocationCount: allocations.length, allocationIds: ids,
      status: reconciliation.status, unresolvedAmount: reconciliation.unresolvedAmount, residualRecipientIndex: computed.residualRecipientIndex,
    });
    return { revision, version, reconciliation, blockerCount, residualRecipientIndex: computed.residualRecipientIndex };
  });
}

export async function getMappingState(context: AuthorizationContext, clientId: string, year: number) {
  const client = await databasePool().connect();
  try {
    const scope = await authorizedTaxYear(client, context, clientId, year, "client.view", false);
    return readMappingState(client, scope.taxYearId, scope.revision);
  } finally { client.release(); }
}

async function readMappingState(client: pg.PoolClient, taxYearId: string, revision: number) {
  const [activityResult, sourceResult, mappingResult] = await Promise.all([
    client.query<{ id: string; activity_type: ActivityType; name: string; owner_role: string; implementation_status: "supported" | "mapping_only"; receipt_basis: ReceiptBasis | null; additional_receipts: string; receipt_note: string | null; active: boolean; version: number }>("SELECT id,activity_type,name,owner_role,implementation_status,receipt_basis,additional_receipts::text,receipt_note,active,version FROM activities WHERE tax_year_id=$1 ORDER BY active DESC,name", [taxYearId]),
    client.query<{ id: string; form_type: string; owner_role: string; normalized_data: Record<string, unknown>; source_document_id: string | null }>("SELECT id,form_type,owner_role,normalized_data,source_document_id FROM source_form_records WHERE tax_year_id=$1 AND effective AND NOT void ORDER BY created_at,id", [taxYearId]),
    client.query<{ id: string; source_record_id: string; source_field: string; source_amount: string; target_type: ActivityType | "excluded"; target_activity_id: string | null; allocation_method: "amount" | "percentage"; allocated_amount: string; percentage: string | null; reason: string | null; mapping_status: "suggested" | "accepted" | "reviewed"; version: number; note: string | null; receives_rounding_residual: boolean }>("SELECT id,source_record_id,source_field,source_amount::text,target_type,target_activity_id,allocation_method,allocated_amount::text,percentage::text,reason,mapping_status,version,note,receives_rounding_residual FROM source_mappings WHERE tax_year_id=$1 AND effective ORDER BY created_at,id", [taxYearId]),
  ]);
  const mappingsByField = Map.groupBy(mappingResult.rows, (row) => `${row.source_record_id}:${row.source_field}`);
  const sources = [];
  for (const source of sourceResult.rows) {
    for (const definition of sourceFieldRegistry[source.form_type] ?? []) {
      const amount = decimalAtPath(source.normalized_data, definition.path);
      if (amount == null || amount.eq(0)) continue;
      const rows = mappingsByField.get(`${source.id}:${definition.path}`) ?? [];
      const mappings: SourceMapping[] = rows.map((row) => ({ id: row.id, sourceRecordId: row.source_record_id, sourceField: row.source_field, sourceAmount: asDecimalString(row.source_amount), targetType: row.target_type, targetActivityId: row.target_activity_id, allocationMethod: row.allocation_method, allocatedAmount: asDecimalString(row.allocated_amount), percentage: row.percentage == null ? null : asDecimalString(row.percentage), reason: row.reason, status: row.mapping_status, version: row.version }));
      let reconciliation: ReturnType<typeof reconcileMappings>;
      try { reconciliation = reconcileMappings(asDecimalString(amount), mappings); }
      catch { reconciliation = { sourceAmount: asDecimalString(amount), allocatedAmount: "0.00" as DecimalString, excludedAmount: "0.00" as DecimalString, unresolvedAmount: asDecimalString(amount), status: "needs_review" as MappingStatus }; }
      const payer = objectAtPath(source.normalized_data, "payer.name");
      sources.push({ id: source.id, formType: source.form_type, ownerRole: source.owner_role, payerName: typeof payer === "string" ? payer : "Payer not named", sourceDocumentId: source.source_document_id, field: definition.path, label: definition.label, taxCharacter: definition.taxCharacter, suggestedTarget: definition.suggestedTarget, amount: asDecimalString(amount), mappings: rows.map((row) => ({ id: row.id, targetType: row.target_type, targetActivityId: row.target_activity_id, allocationMethod: row.allocation_method, allocatedAmount: asDecimalString(row.allocated_amount), percentage: row.percentage == null ? null : asDecimalString(row.percentage), reason: row.reason, status: row.mapping_status, version: row.version, note: row.note, receivesRoundingResidual: row.receives_rounding_residual })), reconciliation });
    }
  }
  return { revision, activities: activityResult.rows.map((row) => ({ id: row.id, type: row.activity_type, name: row.name, ownerRole: row.owner_role, implementationStatus: row.implementation_status, receiptBasis: row.receipt_basis, additionalReceipts: asDecimalString(row.additional_receipts), receiptNote: row.receipt_note, active: row.active, version: row.version })), sources };
}

export async function refreshMappingDiagnosticsForTaxYear(client: pg.PoolClient, taxYearId: string, revision: number): Promise<number> {
  await client.query("UPDATE validation_issues SET resolved_revision=$2,resolved_at=now(),resolution='Superseded by mapping revision' WHERE tax_year_id=$1 AND category IN ('mapping','calculation_support') AND resolved_at IS NULL", [taxYearId, revision]);
  const state = await readMappingState(client, taxYearId, revision);
  let blockers = 0;
  const activityById = new Map(state.activities.map((activity) => [activity.id, activity]));
  for (const source of state.sources) {
    if (source.reconciliation.unresolvedAmount !== "0.00") {
      blockers += 1;
      await client.query("INSERT INTO validation_issues(tax_year_id,code,severity,category,record_id,field_path,message,resolution_action,creation_revision) VALUES($1,'MAPPING_UNRESOLVED','blocking','mapping',$2,$3,$4,'Allocate or substantiate the entire effective source amount.',$5)", [taxYearId, source.id, source.field, `${source.formType} ${source.label} has ${source.reconciliation.unresolvedAmount} unresolved.`, revision]);
    }
    for (const mapping of source.mappings) {
      const activity = mapping.targetActivityId ? activityById.get(mapping.targetActivityId) : undefined;
      if (mapping.targetType !== "excluded" && activity?.implementationStatus === "mapping_only" && mapping.status !== "suggested") {
        blockers += 1;
        await client.query("INSERT INTO validation_issues(tax_year_id,code,severity,category,record_id,field_path,message,resolution_action,creation_revision) VALUES($1,'MAPPING_TARGET_UNSUPPORTED','blocking','calculation_support',$2,$3,$4,'Retain the allocation and issue a partial draft until the destination calculation is implemented.',$5)", [taxYearId, source.id, source.field, `${activity.name} is a mapping-only destination.`, revision]);
      }
    }
  }
  return blockers;
}

function computeAllocationAmounts(sourceAmount: Decimal, allocations: AllocationInput[]): { amounts: DecimalString[]; residualRecipientIndex: number | null } {
  if (!allocations.length) return { amounts: [], residualRecipientIndex: null };
  if (allocations[0].allocationMethod === "amount") {
    return { amounts: allocations.map((allocation) => {
      if (allocation.allocatedAmount == null) throw new WorkflowError("invalid", "Every amount allocation requires an amount.");
      const amount = money(allocation.allocatedAmount);
      if (!amount.isFinite() || amount.lt(0)) throw new WorkflowError("invalid", "Allocation amounts must be nonnegative.");
      return asDecimalString(amount);
    }), residualRecipientIndex: null };
  }
  const percentages = allocations.map((allocation) => {
    if (allocation.percentage == null) throw new WorkflowError("invalid", "Every percentage allocation requires a percentage.");
    const percentage = money(allocation.percentage);
    if (!percentage.isFinite() || percentage.lte(0) || percentage.gt(100)) throw new WorkflowError("invalid", "Percentages must be greater than zero and no more than 100.");
    return percentage;
  });
  const totalPercentage = Decimal.sum(...percentages);
  if (totalPercentage.gt(100)) throw new WorkflowError("invalid", "Allocation percentages exceed 100%.");
  const requestedResiduals = allocations.flatMap((allocation, index) => allocation.residualRecipient ? [index] : []);
  if (requestedResiduals.length > 1) throw new WorkflowError("invalid", "Choose only one percentage row to receive a rounding residual.");
  const residualRecipientIndex = totalPercentage.eq(100) ? (requestedResiduals[0] ?? allocations.length - 1) : null;
  const raw = percentages.map((percentage) => sourceAmount.mul(percentage).div(100).toDecimalPlaces(2));
  if (residualRecipientIndex != null) {
    const difference = sourceAmount.minus(Decimal.sum(...raw));
    raw[residualRecipientIndex] = raw[residualRecipientIndex].plus(difference);
  }
  return { amounts: raw.map(asDecimalString), residualRecipientIndex };
}

function objectAtPath(value: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => current && typeof current === "object" && !Array.isArray(current) ? (current as Record<string, unknown>)[segment] : undefined, value);
}

function decimalAtPath(value: Record<string, unknown>, path: string): Decimal | null {
  const found = objectAtPath(value, path);
  if (typeof found !== "string" && typeof found !== "number") return null;
  try { const decimal = money(found); return decimal.isFinite() ? decimal : null; } catch { return null; }
}

async function authorizedTaxYear(client: pg.PoolClient, context: AuthorizationContext, clientId: string, year: number, action: "client.view" | "mapping.modify", lock: boolean) {
  const result = await client.query<{ id: string; revision: number; firm_id: string }>(`SELECT ty.id,ty.revision,c.firm_id FROM tax_years ty JOIN clients c ON c.id=ty.client_id WHERE c.id=$1 AND ty.tax_year=$2 AND c.firm_id=$3 AND c.archived_at IS NULL ${lock ? "FOR UPDATE OF ty" : ""}`, [clientId, year, context.firmId]);
  const row = result.rows[0];
  if (!row) throw new WorkflowError("not_found", "Tax year was not found.");
  if (!authorize(context, action, { firmId: row.firm_id, clientId })) throw new WorkflowError("forbidden", "Mapping access is not permitted.");
  return { taxYearId: row.id, revision: row.revision };
}

async function invalidateTaxYear(client: pg.PoolClient, taxYearId: string, revision: number) {
  await client.query(`UPDATE tax_years SET revision=$2,validation_status='not_run',calculation_status='stale',preparation_status=CASE WHEN preparation_status IN ('ready_for_review','reviewed_draft') THEN 'changes_requested' ELSE preparation_status END WHERE id=$1`, [taxYearId, revision]);
}

function assertRevision(current: number, expected: number) {
  if (current !== expected) throw new WorkflowError("conflict", `Tax year changed from revision ${expected} to ${current}; reload before saving.`);
}

async function appendAuditEvent(client: pg.PoolClient, context: AuthorizationContext, taxYearId: string, eventType: string, recordType: string, recordId: string, metadata: Record<string, unknown>) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [context.firmId]);
  const previous = await client.query<{ event_hash: string }>("SELECT event_hash FROM audit_events WHERE firm_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1", [context.firmId]);
  const previousHash = previous.rows[0]?.event_hash ?? null;
  const payload = JSON.stringify({ firmId: context.firmId, taxYearId, actorId: context.userId, eventType, recordType, recordId, metadata, previousHash });
  const eventHash = createHash("sha256").update(payload).digest("hex");
  await client.query("INSERT INTO audit_events(firm_id,tax_year_id,actor_id,event_type,record_type,record_id,metadata,previous_hash,event_hash) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)", [context.firmId, taxYearId, context.userId, eventType, recordType, recordId, JSON.stringify(metadata), previousHash, eventHash]);
}

async function inTransaction<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await databasePool().connect();
  try { await client.query("BEGIN"); const result = await work(client); await client.query("COMMIT"); return result; }
  catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
