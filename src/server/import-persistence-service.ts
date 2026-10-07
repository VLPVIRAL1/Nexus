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
      "UPDATE tax_years SET canonical_snapshot=$2::jsonb,revision=$3,validation_status='not_run',calculation_status='stale' WHERE id=$1",
      [scope.taxYearId, JSON.stringify(committed.result), nextRevision],
    );
    const materializedRecords = await synchronizeSourceFormLineage(client, scope.taxYearId, row.id, context.userId, committed.result);
    const mappingBlockers = await refreshMappingDiagnosticsForTaxYear(client, scope.taxYearId, nextRevision);
    await client.query(
      `UPDATE import_batches SET import_status='committed',result_revision=$2,previous_snapshot=$3::jsonb,committed_snapshot=$4::jsonb,committed_by=$5,committed_at=now()
       WHERE id=$1`,
      [batchId, nextRevision, JSON.stringify(scope.snapshot), JSON.stringify(committed.result), context.userId],
    );
    await recordAttempt(client, scope.taxYearId, row.id, row.batch_hash, context.userId, "committed");
    await appendAuditEvent(client, context, scope.taxYearId, "import.committed", "import_batch", row.id, { batchHash: row.batch_hash, baseRevision: scope.revision, resultRevision: nextRevision, acceptedChanges: committed.changeCount, materializedRecords, mappingBlockers });
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
      "UPDATE tax_years SET canonical_snapshot=$2::jsonb,revision=$3,validation_status='not_run',calculation_status='stale' WHERE id=$1",
      [scope.taxYearId, JSON.stringify(row.previous_snapshot), nextRevision],
    );
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
        `INSERT INTO source_form_records(tax_year_id,source_document_id,form_type,form_year,external_source_id,owner_role,owner_person_id,normalized_data,raw_fields,unmapped_fields,corrected,void,effective,supersedes_record_id,version,import_batch_id,record_disposition,change_reason,created_by_id)
         VALUES($1,$2,$3,2025,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         RETURNING id,external_source_id,normalized_data,corrected,void,effective,version`,
        [
          taxYearId, sourceDocumentId, formType, externalId, ownerRole, personByRole.get(ownerRole) ?? null,
          JSON.stringify(record), JSON.stringify(Array.isArray(record.raw_fields) ? record.raw_fields : []),
          JSON.stringify(Array.isArray(record.unmapped_source_fields) ? record.unmapped_source_fields : []),
          corrected, voided, !voided, prior?.id ?? null, (latest?.version ?? 0) + 1, importBatchId,
          voided ? "void" : corrected ? "corrected" : "original", voided ? "Canonical import marked this record void." : corrected ? "Canonical import supplied a corrected version." : null, createdById,
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
