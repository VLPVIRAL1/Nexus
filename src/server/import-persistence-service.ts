import "server-only";
import { createHash } from "node:crypto";
import type pg from "pg";
import { authorize, type AuthorizationContext } from "@/services/authorization";
import {
  commitImport,
  previewImport,
  type ImportChange,
  type ImportDecision,
  type ImportPathSegment,
  type ImportPreview,
} from "@/services/import-service";
import { databasePool } from "./database";
import { refreshMappingDiagnosticsForTaxYear } from "./mapping-persistence-service";
import { WorkflowError } from "./client-workflow-service";

export interface PersistedImportPreview {
  batchId: string;
  previewId: string;
  batchHash: string;
  baseRevision: number;
  status: string;
  warnings: string[];
  changes: ImportChange[];
  replayed: boolean;
  resultRevision: number | null;
}

export interface ImportDecisionInput { changeId: string; decision: ImportDecision }

export async function getImportState(context:AuthorizationContext,clientId:string,year:number){const client=await databasePool().connect();try{const scope=await authorizedTaxYear(client,context,clientId,year,"source.import",false);const result=await client.query<{id:string;file_name:string;batch_hash:string;base_revision:number;import_status:string;summary:{warnings?:string[];changeCount?:number};result_revision:number|null;committed_at:Date|null;rolled_back_at:Date|null;created_at:Date;attempt_count:string}>(`SELECT ib.id,ib.file_name,ib.batch_hash,ib.base_revision,ib.import_status,ib.summary,ib.result_revision,ib.committed_at,ib.rolled_back_at,ib.created_at,(SELECT count(*)::text FROM import_attempts ia WHERE ia.import_batch_id=ib.id) attempt_count FROM import_batches ib WHERE ib.tax_year_id=$1 ORDER BY ib.created_at DESC,ib.id DESC`,[scope.taxYearId]);const active=result.rows.find(row=>row.import_status==="preview");return{revision:scope.revision,activePreview:active?{batchId:active.id,previewId:"persisted",batchHash:active.batch_hash,baseRevision:active.base_revision,status:active.import_status,warnings:active.summary.warnings??[],changes:await loadChanges(client,active.id),replayed:false,resultRevision:active.result_revision}:null,batches:result.rows.map(row=>({id:row.id,fileName:row.file_name,batchHash:row.batch_hash,baseRevision:row.base_revision,status:row.import_status,resultRevision:row.result_revision,changeCount:row.summary.changeCount??0,warnings:row.summary.warnings??[],attemptCount:Number(row.attempt_count),createdAt:row.created_at.toISOString(),committedAt:row.committed_at?.toISOString()??null,rolledBackAt:row.rolled_back_at?.toISOString()??null,canRollback:row.import_status==="committed"&&!row.rolled_back_at&&row.result_revision===scope.revision}))};}finally{client.release();}}

export async function stageCanonicalImport(
  context: AuthorizationContext,
  clientId: string,
  year: number,
  fileName: string,
  rawBytes: Uint8Array,
): Promise<PersistedImportPreview> {
  return inTransaction((client) => stageCanonicalImportWithClient(client, context, clientId, year, fileName, rawBytes));
}

export async function stageCanonicalImportWithClient(
  client: pg.PoolClient,
  context: AuthorizationContext,
  clientId: string,
  year: number,
  fileName: string,
  rawBytes: Uint8Array,
): Promise<PersistedImportPreview> {
  const scope = await authorizedTaxYear(client, context, clientId, year, "source.import", true);
  const preview = previewImport(rawBytes, scope.snapshot, scope.revision);
  const existing = await client.query<{ id: string; import_status: string }>(
    "SELECT id,import_status FROM import_batches WHERE tax_year_id=$1 AND batch_hash=$2",
    [scope.taxYearId, preview.batchHash],
  );
  if (existing.rows[0]) {
    await recordAttempt(client, scope.taxYearId, existing.rows[0].id, preview.batchHash, context.userId, existing.rows[0].import_status === "committed" ? "commit_replayed" : "preview_replayed");
    return loadPreview(client, existing.rows[0].id, true);
  }

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO import_batches(tax_year_id,file_name,schema_version,batch_hash,base_revision,import_status,raw_payload,parsed_payload,preview_id,summary)
     VALUES($1,$2,'1.0.0',$3,$4,'preview',$5,$6::jsonb,$7,$8::jsonb) RETURNING id`,
    [scope.taxYearId, fileName, preview.batchHash, preview.baseRevision, Buffer.from(rawBytes), JSON.stringify(preview.parsed), preview.previewId, JSON.stringify({ warnings: preview.warnings, changeCount: preview.changes.length })],
  );
  const batchId = inserted.rows[0]?.id;
  if (!batchId) throw new Error("Import batch insert failed.");
  for (const change of preview.changes) {
    await client.query(
      `INSERT INTO import_record_changes(import_batch_id,change_id,field_path,path_segments,change_kind,existing_value,imported_value,decision)
       VALUES($1,$2,$3,$4::jsonb,$5,$6::jsonb,$7::jsonb,$8)`,
      [batchId, change.id, change.path, JSON.stringify(change.segments), change.kind, jsonValue(change.existingValue), jsonValue(change.importedValue), change.decision],
    );
  }
  await recordAttempt(client, scope.taxYearId, batchId, preview.batchHash, context.userId, "preview_created");
  await appendAuditEvent(client, context, scope.taxYearId, "import.previewed", "import_batch", batchId, { batchHash: preview.batchHash, baseRevision: preview.baseRevision, changeCount: preview.changes.length });
  return { batchId, ...preview, status: "preview", replayed: false, resultRevision: null };
}

export async function commitPersistedImport(
  context: AuthorizationContext,
  clientId: string,
  year: number,
  batchId: string,
  decisions: ImportDecisionInput[],
) {
  const result = await inTransaction(async (client) => {
    const scope = await authorizedTaxYear(client, context, clientId, year, "source.import", true);
    const batch = await client.query<BatchRow>("SELECT * FROM import_batches WHERE id=$1 AND tax_year_id=$2 FOR UPDATE", [batchId, scope.taxYearId]);
    const row = batch.rows[0];
    if (!row) return new WorkflowError("not_found", "Import preview was not found.");
    if (row.import_status === "committed") {
      await recordAttempt(client, scope.taxYearId, row.id, row.batch_hash, context.userId, "commit_replayed");
      return { batchId: row.id, committedRevision: row.result_revision, replayed: true, result: row.committed_snapshot };
    }
    if (row.import_status !== "preview") return new WorkflowError("conflict", "Import preview is no longer committable.");
    if (scope.revision !== row.base_revision) {
      await recordAttempt(client, scope.taxYearId, row.id, row.batch_hash, context.userId, "stale_rejected");
      return new WorkflowError("conflict", "The tax year changed after preview. Generate and review a new preview.");
    }

    const knownChanges = await client.query<{ change_id: string }>("SELECT change_id FROM import_record_changes WHERE import_batch_id=$1", [batchId]);
    const knownIds = new Set(knownChanges.rows.map(({ change_id }) => change_id));
    if (decisions.some(({ changeId }) => !knownIds.has(changeId))) return new WorkflowError("invalid", "A change decision does not belong to this preview.");
    for (const decision of decisions) {
      await client.query("UPDATE import_record_changes SET decision=$3 WHERE import_batch_id=$1 AND change_id=$2", [batchId, decision.changeId, decision.decision]);
    }
    const preview = await importPreviewFromDatabase(client, row);
    const committed = commitImport(preview, scope.snapshot, scope.revision, new Map());
    const nextRevision = scope.revision + 1;
    await client.query(
      `UPDATE tax_years SET canonical_snapshot=$2::jsonb,revision=$3,validation_status='not_run',calculation_status='stale',
       preparation_status=CASE WHEN preparation_status IN ('ready_for_review','reviewed_draft') THEN 'changes_requested' ELSE preparation_status END
       WHERE id=$1`,
      [scope.taxYearId, JSON.stringify(committed.result), nextRevision],
    );
    const materializedRecords = await synchronizeSourceFormLineage(client, scope.taxYearId, row.id, context.userId, committed.result);
    const profileMaterialized = await synchronizeReturnProfile(client, scope.taxYearId, committed.result);
    const materializedActivities = await synchronizeActivities(client, scope.taxYearId, row.id, context.userId, committed.result);
    const materializedMappings = await synchronizeActivityMappings(client, scope.taxYearId, row.id, context.userId, committed.result);
    const mappingBlockers = await refreshMappingDiagnosticsForTaxYear(client, scope.taxYearId, nextRevision);
    await client.query(
      `UPDATE import_batches SET import_status='committed',result_revision=$2,previous_snapshot=$3::jsonb,committed_snapshot=$4::jsonb,committed_by=$5,committed_at=now()
       WHERE id=$1`,
      [batchId, nextRevision, JSON.stringify(scope.snapshot), JSON.stringify(committed.result), context.userId],
    );
    await recordAttempt(client, scope.taxYearId, row.id, row.batch_hash, context.userId, "committed");
    await appendAuditEvent(client, context, scope.taxYearId, "import.committed", "import_batch", row.id, { batchHash: row.batch_hash, baseRevision: scope.revision, resultRevision: nextRevision, acceptedChanges: committed.changeCount, materializedRecords, materializedActivities, materializedMappings, profileMaterialized, mappingBlockers });
    return { batchId: row.id, committedRevision: nextRevision, replayed: false, result: committed.result };
  });
  if (result instanceof WorkflowError) throw result;
  return result;
}

export async function rollbackPersistedImport(context: AuthorizationContext, clientId: string, year: number, batchId: string) {
  const result = await inTransaction(async (client) => {
    const scope = await authorizedTaxYear(client, context, clientId, year, "source.modify", true);
    const batch = await client.query<BatchRow>("SELECT * FROM import_batches WHERE id=$1 AND tax_year_id=$2 FOR UPDATE", [batchId, scope.taxYearId]);
    const row = batch.rows[0];
    if (!row) return new WorkflowError("not_found", "Committed import was not found.");
    if (row.import_status !== "committed" || !row.previous_snapshot || !row.result_revision) return new WorkflowError("conflict", "Only a committed import can be rolled back.");
    if (row.rolled_back_at) return new WorkflowError("conflict", "This import was already rolled back.");
    if (scope.revision !== row.result_revision) return new WorkflowError("conflict", "Later edits depend on this import. Reconcile them before a compensating rollback.");
    const nextRevision = scope.revision + 1;
    const importedRecords = await client.query<{ id: string; supersedes_record_id: string | null }>("SELECT id,supersedes_record_id FROM source_form_records WHERE import_batch_id=$1 FOR UPDATE", [row.id]);
    if (importedRecords.rowCount) {
      await client.query("UPDATE source_form_records SET effective=false WHERE import_batch_id=$1", [row.id]);
      const priorIds = importedRecords.rows.flatMap(({ supersedes_record_id }) => supersedes_record_id ? [supersedes_record_id] : []);
      if (priorIds.length) await client.query("UPDATE source_form_records SET effective=NOT void WHERE id=ANY($1::uuid[])", [priorIds]);
    }
    await client.query(
      `UPDATE tax_years SET canonical_snapshot=$2::jsonb,revision=$3,validation_status='not_run',calculation_status='stale',
       preparation_status=CASE WHEN preparation_status IN ('ready_for_review','reviewed_draft') THEN 'changes_requested' ELSE preparation_status END
       WHERE id=$1`,
      [scope.taxYearId, JSON.stringify(row.previous_snapshot), nextRevision],
    );
    await synchronizeReturnProfile(client, scope.taxYearId, row.previous_snapshot, true);
    await synchronizeActivities(client, scope.taxYearId, row.id, context.userId, row.previous_snapshot, true);
    await synchronizeActivityMappings(client, scope.taxYearId, row.id, context.userId, row.previous_snapshot, true);
    await refreshMappingDiagnosticsForTaxYear(client, scope.taxYearId, nextRevision);
    await client.query("UPDATE import_batches SET rolled_back_at=now(),rolled_back_by=$2 WHERE id=$1", [row.id, context.userId]);
    await recordAttempt(client, scope.taxYearId, row.id, row.batch_hash, context.userId, "rolled_back");
    await appendAuditEvent(client, context, scope.taxYearId, "import.rolled_back", "import_batch", row.id, { batchHash: row.batch_hash, importedRevision: row.result_revision, compensatingRevision: nextRevision });
    return { batchId: row.id, rolledBackRevision: nextRevision };
  });
  if (result instanceof WorkflowError) throw result;
  return result;
}

interface ScopeRow { tax_year_id: string; revision: number; canonical_snapshot: Record<string, unknown>; firm_id: string }
interface BatchRow {
  id: string; batch_hash: string; base_revision: number; import_status: string; preview_id: string;
  parsed_payload: Record<string, unknown>; summary: { warnings?: string[] }; result_revision: number | null;
  previous_snapshot: Record<string, unknown> | null; committed_snapshot: Record<string, unknown> | null; rolled_back_at: Date | null;
}

async function authorizedTaxYear(client: pg.PoolClient, context: AuthorizationContext, clientId: string, year: number, action: "source.import" | "source.modify", lock: boolean) {
  const result = await client.query<ScopeRow>(
    `SELECT ty.id AS tax_year_id,ty.revision,ty.canonical_snapshot,c.firm_id
     FROM tax_years ty JOIN clients c ON c.id=ty.client_id
     WHERE c.id=$1 AND ty.tax_year=$2 AND c.firm_id=$3 AND c.archived_at IS NULL ${lock ? "FOR UPDATE OF ty" : ""}`,
    [clientId, year, context.firmId],
  );
  const row = result.rows[0];
  if (!row) throw new WorkflowError("not_found", "Tax year was not found.");
  if (!authorize(context, action, { firmId: row.firm_id, clientId })) throw new WorkflowError("forbidden", "Tax-year access is not permitted.");
  return { taxYearId: row.tax_year_id, revision: row.revision, snapshot: row.canonical_snapshot };
}

async function importPreviewFromDatabase(client: pg.PoolClient, batch: BatchRow): Promise<ImportPreview> {
  const changes = await loadChanges(client, batch.id);
  return { previewId: batch.preview_id, batchHash: batch.batch_hash, baseRevision: batch.base_revision, parsed: batch.parsed_payload, warnings: batch.summary.warnings ?? [], changes };
}

async function loadPreview(client: pg.PoolClient, batchId: string, replayed: boolean): Promise<PersistedImportPreview> {
  const result = await client.query<BatchRow>("SELECT * FROM import_batches WHERE id=$1", [batchId]);
  const row = result.rows[0];
  if (!row) throw new WorkflowError("not_found", "Import preview was not found.");
  return { batchId: row.id, previewId: row.preview_id, batchHash: row.batch_hash, baseRevision: row.base_revision, status: row.import_status, warnings: row.summary.warnings ?? [], changes: await loadChanges(client, row.id), replayed, resultRevision: row.result_revision };
}

async function loadChanges(client: pg.PoolClient, batchId: string): Promise<ImportChange[]> {
  const result = await client.query<{
    change_id: string; field_path: string; path_segments: ImportPathSegment[]; change_kind: ImportChange["kind"];
    existing_value: unknown; imported_value: unknown; decision: ImportDecision;
  }>("SELECT change_id,field_path,path_segments,change_kind,existing_value,imported_value,decision FROM import_record_changes WHERE import_batch_id=$1 ORDER BY id", [batchId]);
  return result.rows.map((row) => ({ id: row.change_id, path: row.field_path, segments: row.path_segments, kind: row.change_kind, existingValue: row.existing_value, importedValue: row.imported_value, decision: row.decision }));
}

async function recordAttempt(client: pg.PoolClient, taxYearId: string, batchId: string, batchHash: string, userId: string, outcome: string) {
  await client.query("INSERT INTO import_attempts(tax_year_id,import_batch_id,batch_hash,attempted_by,outcome) VALUES($1,$2,$3,$4,$5)", [taxYearId, batchId, batchHash, userId, outcome]);
}

async function appendAuditEvent(client: pg.PoolClient, context: AuthorizationContext, taxYearId: string, eventType: string, recordType: string, recordId: string, metadata: Record<string, unknown>) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [context.firmId]);
  const previous = await client.query<{ event_hash: string }>("SELECT event_hash FROM audit_events WHERE firm_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1", [context.firmId]);
  const previousHash = previous.rows[0]?.event_hash ?? null;
  const payload = JSON.stringify({ firmId: context.firmId, taxYearId, actorId: context.userId, eventType, recordType, recordId, metadata, previousHash });
  const eventHash = createHash("sha256").update(payload).digest("hex");
  await client.query(
    "INSERT INTO audit_events(firm_id,tax_year_id,actor_id,event_type,record_type,record_id,metadata,previous_hash,event_hash) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)",
    [context.firmId, taxYearId, context.userId, eventType, recordType, recordId, JSON.stringify(metadata), previousHash, eventHash],
  );
}

async function inTransaction<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await databasePool().connect();
  try { await client.query("BEGIN"); const result = await work(client); await client.query("COMMIT"); return result; }
  catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

function jsonValue(value: unknown): string {
  return JSON.stringify(value === undefined ? null : value);
}

const formTypes = {
  w2: "W2",
  form_1099_nec: "1099-NEC",
  form_1099_misc: "1099-MISC",
  form_1099_int: "1099-INT",
  form_1099_div: "1099-DIV",
  form_1099_b: "1099-B",
  form_1099_g: "1099-G",
  form_1099_k: "1099-K",
  form_1099_r: "1099-R",
  form_1099_sa: "1099-SA",
} as const;

async function synchronizeSourceFormLineage(client: pg.PoolClient, taxYearId: string, importBatchId: string, createdById: string, snapshot: Record<string, unknown>): Promise<number> {
  const forms = snapshot.forms;
  if (!forms || typeof forms !== "object" || Array.isArray(forms)) return 0;
  const people = await client.query<{ id: string; role: string }>("SELECT id,role FROM people WHERE tax_year_id=$1", [taxYearId]);
  const personByRole = new Map(people.rows.map(({ id, role }) => [role, id]));
  const documents = await client.query<{ id: string }>("SELECT id FROM source_documents WHERE tax_year_id=$1", [taxYearId]);
  const documentIds = new Set(documents.rows.map(({ id }) => id));
  const existing = await client.query<{
    id: string; external_source_id: string | null; normalized_data: Record<string, unknown>; corrected: boolean; void: boolean; effective: boolean; version: number;
  }>("SELECT id,external_source_id,normalized_data,corrected,void,effective,version FROM source_form_records WHERE tax_year_id=$1 ORDER BY version DESC,created_at DESC", [taxYearId]);
  const latestByExternalId = new Map<string, typeof existing.rows[number]>();
  for (const row of existing.rows) if (row.external_source_id && !latestByExternalId.has(row.external_source_id)) latestByExternalId.set(row.external_source_id, row);

  let materialized = 0;
  for (const [collection, formType] of Object.entries(formTypes)) {
    const records = (forms as Record<string, unknown>)[collection];
    if (!Array.isArray(records)) continue;
    for (const unknownRecord of records) {
      if (!unknownRecord || typeof unknownRecord !== "object" || Array.isArray(unknownRecord)) continue;
      const record = unknownRecord as Record<string, unknown>;
      const importedId = typeof record.id === "string" ? record.id : null;
      if (!importedId) continue;
      const externalId = typeof record.external_source_id === "string" && record.external_source_id.trim()
        ? record.external_source_id.trim()
        : `canonical:${formType}:${importedId}`;
      const latest = latestByExternalId.get(externalId);
      const corrected = record.corrected === true;
      const voided = record.void === true;
      if (latest && canonicalJson(latest.normalized_data) === canonicalJson(record) && latest.corrected === corrected && latest.void === voided) continue;

      const supersedesExternalId = typeof record.supersedes_external_source_id === "string" ? record.supersedes_external_source_id : null;
      const explicitPrior = supersedesExternalId ? latestByExternalId.get(supersedesExternalId) : undefined;
      const prior = explicitPrior ?? latest;
      if (prior) {
        await client.query("UPDATE source_form_records SET effective=false WHERE id=$1", [prior.id]);
        await client.query("UPDATE source_mappings SET effective=false WHERE source_record_id=$1 AND effective", [prior.id]);
      }
      const ownerRole = typeof record.recipient_role === "string" ? record.recipient_role : "unknown";
      const sourceDocumentId = typeof record.source_document_id === "string" && documentIds.has(record.source_document_id) ? record.source_document_id : null;
      const inserted = await client.query<{ id: string; external_source_id: string; normalized_data: Record<string, unknown>; corrected: boolean; void: boolean; effective: boolean; version: number }>(
        `INSERT INTO source_form_records(tax_year_id,source_document_id,form_type,form_year,external_source_id,owner_role,owner_person_id,normalized_data,raw_fields,unmapped_fields,corrected,void,effective,supersedes_record_id,version,import_batch_id,record_disposition,change_reason,created_by_id,correction_evidence_mode,correction_evidence_note)
         VALUES($1,$2,$3,2025,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
         RETURNING id,external_source_id,normalized_data,corrected,void,effective,version`,
        [
          taxYearId, sourceDocumentId, formType, externalId, ownerRole, personByRole.get(ownerRole) ?? null,
          JSON.stringify(record), JSON.stringify(Array.isArray(record.raw_fields) ? record.raw_fields : []),
          JSON.stringify(Array.isArray(record.unmapped_source_fields) ? record.unmapped_source_fields : []),
          corrected, voided, !voided, prior?.id ?? null, (latest?.version ?? 0) + 1, importBatchId,
          voided ? "void" : corrected ? "corrected" : "original", voided ? "Canonical import marked this record void." : corrected ? "Canonical import supplied a corrected version." : null, createdById,
          corrected ? sourceDocumentId ? "attached_document" : "manual_attestation" : null,
          corrected && !sourceDocumentId ? "Canonical import supplied a corrected version without an attached source document." : null,
        ],
      );
      const created = inserted.rows[0];
      if (created) latestByExternalId.set(externalId, created);
      materialized += 1;
    }
  }
  return materialized;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(",")}}`;
  return JSON.stringify(value);
}

async function synchronizeActivities(client: pg.PoolClient, taxYearId: string, importBatchId: string, changedById: string, snapshot: Record<string, unknown>, resetImported = false): Promise<number> {
  const groups = record(snapshot.activities);
  const definitions = [["schedule_c", "schedule_c"], ["schedule_e", "schedule_e"], ["schedule_f", "schedule_f"], ["other_income", "schedule_1_other"]] as const;
  if (resetImported) await client.query("UPDATE activities SET active=false,last_import_batch_id=NULL,version=version+1 WHERE tax_year_id=$1 AND last_import_batch_id=$2", [taxYearId, importBatchId]);
  let materialized = 0;
  for (const [collection, activityType] of definitions) {
    const values = groups[collection];
    if (!Array.isArray(values)) continue;
    for (const value of values) {
      const activity = record(value);
      if (typeof activity.id !== "string" || typeof activity.name !== "string" || typeof activity.owner_role !== "string") continue;
      const existing = await client.query<{ tax_year_id: string; version: number; details: unknown; name: string; owner_role: string; active: boolean; additional_receipts: string; receipt_note: string | null }>("SELECT tax_year_id,version,details,name,owner_role,active,additional_receipts::text,receipt_note FROM activities WHERE id=$1 FOR UPDATE", [activity.id]);
      const current = existing.rows[0];
      if (current && current.tax_year_id !== taxYearId) throw new WorkflowError("invalid", `Activity ${activity.id} already belongs to another tax year.`);
      const formData = activityType === "schedule_1_other" ? {} : record(activity.form_data);
      const additionalReceipts = activityType === "schedule_1_other" ? "0.00" : moneyString(activity.additional_receipts);
      const receiptNote = typeof activity.receipt_note === "string" ? activity.receipt_note : null;
      const active = activity.active !== false;
      const implementation = activityType === "schedule_1_other" ? "mapping_only" : activity.implementation_status === "mapping_only" ? "mapping_only" : "supported";
      const receiptBasis = activityType === "schedule_1_other" ? null : "source_plus_additional_receipts";
      const same = current && current.name === activity.name && current.owner_role === activity.owner_role && current.active === active && current.additional_receipts === additionalReceipts && current.receipt_note === receiptNote && canonicalJson(current.details) === canonicalJson(formData);
      if (same) continue;
      let version: number;
      if (current) {
        version = current.version + 1;
        await client.query("UPDATE activities SET activity_type=$3,name=$4,owner_role=$5,implementation_status=$6,receipt_basis=$7,additional_receipts=$8,receipt_note=$9,details=$10::jsonb,active=$11,version=$12,last_import_batch_id=$13 WHERE id=$1 AND tax_year_id=$2", [activity.id, taxYearId, activityType, activity.name.trim(), activity.owner_role, implementation, receiptBasis, additionalReceipts, receiptNote, JSON.stringify(formData), active, version, resetImported ? null : importBatchId]);
      } else {
        version = 1;
        await client.query("INSERT INTO activities(id,tax_year_id,activity_type,name,owner_role,implementation_status,details,active,version,receipt_basis,additional_receipts,receipt_note,last_import_batch_id) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13)", [activity.id, taxYearId, activityType, activity.name.trim(), activity.owner_role, implementation, JSON.stringify(formData), active, version, receiptBasis, additionalReceipts, receiptNote, resetImported ? null : importBatchId]);
      }
      await client.query("INSERT INTO activity_form_revisions(activity_id,tax_year_id,activity_version,form_data,change_reason,changed_by) VALUES($1,$2,$3,$4::jsonb,$5,$6) ON CONFLICT(activity_id,activity_version) DO NOTHING", [activity.id, taxYearId, version, JSON.stringify(formData), resetImported ? "Activity restored by import rollback." : "Activity materialized from canonical JSON import.", changedById]);
      materialized += 1;
    }
  }
  return materialized;
}

async function synchronizeActivityMappings(client: pg.PoolClient, taxYearId: string, importBatchId: string, createdById: string, snapshot: Record<string, unknown>, resetImported = false): Promise<number> {
  if (resetImported) {
    const imported = await client.query<{ source_record_id: string; source_field: string; version: number }>(
      "SELECT DISTINCT source_record_id,source_field,version FROM source_mappings WHERE tax_year_id=$1 AND import_batch_id=$2",
      [taxYearId, importBatchId],
    );
    await client.query("UPDATE source_mappings SET effective=false WHERE tax_year_id=$1 AND import_batch_id=$2", [taxYearId, importBatchId]);
    for (const group of imported.rows) {
      await client.query(
        `UPDATE source_mappings SET effective=true
         WHERE tax_year_id=$1 AND source_record_id=$2 AND source_field=$3 AND version=(
           SELECT MAX(version) FROM source_mappings
           WHERE tax_year_id=$1 AND source_record_id=$2 AND source_field=$3 AND version<$4 AND import_batch_id IS DISTINCT FROM $5
         )`,
        [taxYearId, group.source_record_id, group.source_field, group.version, importBatchId],
      );
    }
  }
  if (!Array.isArray(snapshot.mappings)) return 0;
  type ImportedMapping = {
    sourceId: string; sourceField: string; targetType: string; targetActivityId: string | null;
    allocationMethod: string; allocatedAmount: string; sourceAmount: string; status: string;
    percentage: string | null; reason: string | null;
  };
  const grouped = new Map<string, ImportedMapping[]>();
  for (const value of snapshot.mappings) {
    const mapping = record(value);
    const candidate: ImportedMapping = {
      sourceId: textValue(mapping, "sourceRecordId", "source_record_id"),
      sourceField: textValue(mapping, "sourceField", "source_field"),
      targetType: textValue(mapping, "targetType", "target_type"),
      targetActivityId: nullableTextValue(mapping, "targetActivityId", "target_activity_id"),
      allocationMethod: textValue(mapping, "allocationMethod", "allocation_method"),
      allocatedAmount: textValue(mapping, "allocatedAmount", "allocated_amount"),
      sourceAmount: textValue(mapping, "sourceAmount", "source_amount"),
      status: textValue(mapping, "status", "mapping_status"),
      percentage: nullableTextValue(mapping, "percentage"),
      reason: nullableTextValue(mapping, "reason"),
    };
    if (!candidate.sourceId || !candidate.sourceField || !candidate.targetType || !candidate.allocationMethod || !candidate.allocatedAmount || !candidate.sourceAmount || !["accepted", "reviewed"].includes(candidate.status)) continue;
    const key = `${candidate.sourceId}\u0000${candidate.sourceField}`;
    grouped.set(key, [...(grouped.get(key) ?? []), candidate]);
  }
  let materialized = 0;
  for (const allocations of grouped.values()) {
    const first = allocations[0];
    if (!first) continue;
    if (allocations.some((allocation) => allocation.sourceAmount !== first.sourceAmount || allocation.allocationMethod !== first.allocationMethod)) {
      throw new WorkflowError("invalid", `Mappings for ${first.sourceField} must use one source amount and allocation method.`);
    }
    const source = await client.query<{ id: string }>("SELECT id FROM source_form_records WHERE tax_year_id=$1 AND effective AND NOT void AND (id::text=$2 OR normalized_data->>'id'=$2) ORDER BY (id::text=$2) DESC,version DESC LIMIT 1", [taxYearId, first.sourceId]);
    const sourceRecordId = source.rows[0]?.id;
    if (!sourceRecordId) throw new WorkflowError("invalid", `Mapping source ${first.sourceId} was not materialized.`);
    for (const allocation of allocations) {
      if (allocation.targetType === "excluded") {
        if (allocation.targetActivityId || !allocation.reason) throw new WorkflowError("invalid", "An imported exclusion requires a documented reason and cannot target an activity.");
      } else {
        if (!allocation.targetActivityId) throw new WorkflowError("invalid", "An imported schedule mapping requires a target activity.");
        const activity = await client.query("SELECT 1 FROM activities WHERE id=$1 AND tax_year_id=$2 AND active AND activity_type=$3", [allocation.targetActivityId, taxYearId, allocation.targetType]);
        if (!activity.rowCount) throw new WorkflowError("invalid", `Mapping target ${allocation.targetActivityId} is missing or has a different schedule type.`);
      }
    }
    const current = await client.query<{ id: string; source_amount: string; target_type: string; target_activity_id: string | null; allocation_method: string; allocated_amount: string; percentage: string | null; reason: string | null; mapping_status: string; version: number }>("SELECT id,source_amount::text,target_type,target_activity_id,allocation_method,allocated_amount::text,percentage::text,reason,mapping_status,version FROM source_mappings WHERE tax_year_id=$1 AND source_record_id=$2 AND source_field=$3 AND effective ORDER BY created_at,id FOR UPDATE", [taxYearId, sourceRecordId, first.sourceField]);
    const signature = (value: { source_amount?: string; sourceAmount?: string; target_type?: string; targetType?: string; target_activity_id?: string | null; targetActivityId?: string | null; allocation_method?: string; allocationMethod?: string; allocated_amount?: string; allocatedAmount?: string; percentage: string | null; reason: string | null; mapping_status?: string; status?: string }) => canonicalJson({
      sourceAmount: normalizeNumeric(value.source_amount ?? value.sourceAmount ?? ""), targetType: value.target_type ?? value.targetType,
      targetActivityId: value.target_activity_id ?? value.targetActivityId ?? null, allocationMethod: value.allocation_method ?? value.allocationMethod,
      allocatedAmount: normalizeNumeric(value.allocated_amount ?? value.allocatedAmount ?? ""), percentage: value.percentage == null ? null : normalizeNumeric(value.percentage),
      reason: value.reason, status: value.mapping_status ?? value.status,
    });
    const desiredSignatures = allocations.map((allocation) => signature(allocation)).sort();
    const currentSignatures = current.rows.map((allocation) => signature(allocation)).sort();
    if (canonicalJson(desiredSignatures) === canonicalJson(currentSignatures)) continue;
    const versionResult = await client.query<{ version: number }>("SELECT COALESCE(MAX(version),0)+1 AS version FROM source_mappings WHERE tax_year_id=$1 AND source_record_id=$2 AND source_field=$3", [taxYearId, sourceRecordId, first.sourceField]);
    const version = Number(versionResult.rows[0]?.version ?? 1);
    await client.query("UPDATE source_mappings SET effective=false WHERE tax_year_id=$1 AND source_record_id=$2 AND source_field=$3 AND effective", [taxYearId, sourceRecordId, first.sourceField]);
    for (let index = 0; index < allocations.length; index += 1) {
      const allocation = allocations[index];
      if (!allocation) continue;
      await client.query(`INSERT INTO source_mappings(tax_year_id,source_record_id,source_field,source_amount,target_type,target_activity_id,allocation_method,allocated_amount,percentage,reason,mapping_status,version,effective,supersedes_mapping_id,note,created_by,import_batch_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true,$13,$14,$15,$16)`, [taxYearId, sourceRecordId, first.sourceField, allocation.sourceAmount, allocation.targetType, allocation.targetActivityId, allocation.allocationMethod, allocation.allocatedAmount, allocation.percentage, allocation.reason, allocation.status, version, current.rows[index]?.id ?? null, "Canonical JSON import", createdById, resetImported ? null : importBatchId]);
      materialized += 1;
    }
  }
  return materialized;
}

function textValue(value: Record<string, unknown>, ...keys: string[]): string { for (const key of keys) if (typeof value[key] === "string") return value[key] as string; return ""; }
function nullableTextValue(value: Record<string, unknown>, ...keys: string[]): string | null { const found = textValue(value, ...keys); return found || null; }
function normalizeNumeric(value: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return value;
  const whole = (match[2] ?? "0").replace(/^0+(?=\d)/, "");
  const fraction = (match[3] ?? "").replace(/0+$/, "");
  return `${match[1] ?? ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

async function synchronizeReturnProfile(client: pg.PoolClient, taxYearId: string, snapshot: Record<string, unknown>, resetMissing = false): Promise<boolean> {
  const filing = record(snapshot.filing_profile);
  const status = typeof filing.status === "string" ? filing.status : null;
  const schedule = record(snapshot.schedule_a);
  if (!status && !Array.isArray(snapshot.dependents) && !Object.keys(schedule).length && !resetMissing) return false;
  const allowedStatuses = new Set(["single", "married_filing_jointly", "married_filing_separately", "head_of_household", "qualifying_surviving_spouse"]);
  if (status && allowedStatuses.has(status)) {
    const mappedSchedule = {
      enabled: schedule.enabled === true,
      marriedFilingSeparatelySpouseItemizes: typeof schedule.married_filing_separately_spouse_itemizes === "boolean" ? schedule.married_filing_separately_spouse_itemizes : null,
      medicalAndDentalExpenses: moneyString(schedule.medical_and_dental_expenses), stateLocalIncomeOrSalesTaxes: moneyString(schedule.state_local_income_or_sales_taxes),
      realEstateTaxes: moneyString(schedule.real_estate_taxes), personalPropertyTaxes: moneyString(schedule.personal_property_taxes), otherTaxes: moneyString(schedule.other_taxes),
      homeMortgageInterestAndPoints: moneyString(schedule.home_mortgage_interest_and_points), investmentInterest: moneyString(schedule.investment_interest),
      cashCharitableContributions: moneyString(schedule.cash_charitable_contributions), noncashCharitableContributions: moneyString(schedule.noncash_charitable_contributions),
      casualtyAndTheftLosses: moneyString(schedule.casualty_and_theft_losses), otherItemizedDeductions: moneyString(schedule.other_itemized_deductions),
      saltEligibilityConfirmed: schedule.salt_eligibility_confirmed === true, mortgageLimitsApplied: schedule.mortgage_limits_applied === true,
      charityLimitsApplied: schedule.charity_limits_applied === true, casualtyLimitsApplied: schedule.casualty_limits_applied === true,
    };
    await client.query(`INSERT INTO return_profiles(tax_year_id,filing_status,filing_status_eligibility_confirmed,schedule_a) VALUES($1,$2,$3,$4::jsonb)
      ON CONFLICT(tax_year_id) DO UPDATE SET filing_status=EXCLUDED.filing_status,filing_status_eligibility_confirmed=EXCLUDED.filing_status_eligibility_confirmed,schedule_a=EXCLUDED.schedule_a,version=return_profiles.version+1`, [taxYearId, status, filing.eligibility_confirmed === true, JSON.stringify(mappedSchedule)]);
  } else if (resetMissing) {
    await client.query(`INSERT INTO return_profiles(tax_year_id) VALUES($1) ON CONFLICT(tax_year_id) DO UPDATE SET filing_status='single',filing_status_eligibility_confirmed=false,schedule_a='{"enabled":false,"marriedFilingSeparatelySpouseItemizes":null,"medicalAndDentalExpenses":"0.00","stateLocalIncomeOrSalesTaxes":"0.00","realEstateTaxes":"0.00","personalPropertyTaxes":"0.00","otherTaxes":"0.00","homeMortgageInterestAndPoints":"0.00","investmentInterest":"0.00","cashCharitableContributions":"0.00","noncashCharitableContributions":"0.00","casualtyAndTheftLosses":"0.00","otherItemizedDeductions":"0.00","saltEligibilityConfirmed":false,"mortgageLimitsApplied":false,"charityLimitsApplied":false,"casualtyLimitsApplied":false}'::jsonb,version=return_profiles.version+1`, [taxYearId]);
  }
  if (Array.isArray(snapshot.dependents)) {
    await client.query("DELETE FROM dependents WHERE tax_year_id=$1", [taxYearId]);
    for (const value of snapshot.dependents) {
      const dependent = record(value);
      if (typeof dependent.id !== "string" || typeof dependent.legal_name !== "string") continue;
      const facts = { dateOfBirth: dependent.date_of_birth, relationship: dependent.relationship, monthsLivedWithTaxpayer: dependent.months_lived_with_taxpayer, qualifiesAsDependent: dependent.qualifies_as_dependent === true, qualifiesForChildTaxCredit: dependent.qualifies_for_child_tax_credit === true, hasValidSsnForChildTaxCredit: dependent.has_valid_ssn_for_child_tax_credit === true, qualifiesForOtherDependentCredit: dependent.qualifies_for_other_dependent_credit === true, eligibilityReviewed: dependent.eligibility_reviewed === true };
      await client.query("INSERT INTO dependents(id,tax_year_id,legal_name,facts) VALUES($1,$2,$3,$4::jsonb)", [dependent.id, taxYearId, dependent.legal_name, JSON.stringify(facts)]);
    }
  } else if (resetMissing) {
    await client.query("DELETE FROM dependents WHERE tax_year_id=$1", [taxYearId]);
  }
  return true;
}

function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function moneyString(value: unknown): string { return typeof value === "string" && /^\d+\.\d{2}$/.test(value) ? value : "0.00"; }
