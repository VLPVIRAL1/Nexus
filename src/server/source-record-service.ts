import "server-only";
import { createHash } from "node:crypto";
import type pg from "pg";
import { validateRegisteredSourceData } from "@/form-registry/2025";
import { authorize, type AuthorizationContext } from "@/services/authorization";
import { maskTin } from "@/services/redaction";
import { WorkflowError } from "./client-workflow-service";
import { databasePool } from "./database";
import { refreshMappingDiagnosticsForTaxYear } from "./mapping-persistence-service";

export type SourceRecordAction = "correct" | "void" | "exclude_duplicate";
export type CorrectionEvidenceMode = "attached_document" | "manual_attestation";

export async function getSourceRecordState(context: AuthorizationContext, clientId: string, year: number) {
  const client = await databasePool().connect();
  try {
    const scope = await authorizedTaxYear(client, context, clientId, year, "source.download", false);
    const canRevealIdentifiers = authorize(context, "identifier.reveal", { firmId: context.firmId, clientId });
    const [recordResult, documentResult] = await Promise.all([
      client.query<{
        id: string; source_document_id: string | null; source_file_name: string | null; form_type: string;
        external_source_id: string | null; owner_role: string; normalized_data: Record<string, unknown>;
        raw_fields: unknown[]; unmapped_fields: unknown[]; corrected: boolean; void: boolean; effective: boolean;
        record_disposition: string; change_reason: string | null; correction_evidence_mode: CorrectionEvidenceMode | null;
        correction_evidence_note: string | null; supersedes_record_id: string | null; version: number;
        created_at: Date; created_by_name: string | null;
      }>(`SELECT sfr.id,sfr.source_document_id,sd.file_name source_file_name,sfr.form_type,sfr.external_source_id,
          sfr.owner_role,sfr.normalized_data,sfr.raw_fields,sfr.unmapped_fields,sfr.corrected,sfr.void,sfr.effective,
          sfr.record_disposition,sfr.change_reason,sfr.correction_evidence_mode,sfr.correction_evidence_note,
          sfr.supersedes_record_id,sfr.version,sfr.created_at,u.display_name created_by_name
        FROM source_form_records sfr
        LEFT JOIN source_documents sd ON sd.id=sfr.source_document_id
        LEFT JOIN users u ON u.id=sfr.created_by_id
        WHERE sfr.tax_year_id=$1 ORDER BY sfr.created_at DESC,sfr.id DESC`, [scope.taxYearId]),
      client.query<{ id: string; file_name: string; document_type: string; scan_state: string; disposition: string }>(
        `SELECT id,file_name,document_type,scan_state,disposition FROM source_documents
         WHERE tax_year_id=$1 ORDER BY uploaded_at DESC,id DESC`,
        [scope.taxYearId],
      ),
    ]);
    return {
      revision: scope.revision,
      canRevealIdentifiers,
      documents: documentResult.rows.map((row) => ({
        id: row.id,
        fileName: row.file_name,
        documentType: row.document_type,
        scanState: row.scan_state,
        disposition: row.disposition,
      })),
      records: recordResult.rows.map((row) => ({
        id: row.id,
        sourceDocumentId: row.source_document_id,
        sourceFileName: row.source_file_name,
        formType: row.form_type,
        externalSourceId: row.external_source_id,
        ownerRole: row.owner_role,
        normalizedData: canRevealIdentifiers ? row.normalized_data : redactSourceIdentifiers(row.normalized_data),
        rawFieldCount: Array.isArray(row.raw_fields) ? row.raw_fields.length : 0,
        unmappedFieldCount: Array.isArray(row.unmapped_fields) ? row.unmapped_fields.length : 0,
        corrected: row.corrected,
        void: row.void,
        effective: row.effective,
        disposition: row.record_disposition,
        changeReason: row.change_reason,
        correctionEvidenceMode: row.correction_evidence_mode,
        correctionEvidenceNote: row.correction_evidence_note,
        supersedesRecordId: row.supersedes_record_id,
        version: row.version,
        createdAt: row.created_at.toISOString(),
        createdBy: row.created_by_name,
      })),
    };
  } finally {
    client.release();
  }
}

export async function reviseSourceRecord(
  context: AuthorizationContext,
  clientId: string,
  year: number,
  recordId: string,
  expectedRevision: number,
  expectedVersion: number,
  action: SourceRecordAction,
  reason: string,
  normalizedData: Record<string, unknown> | null,
  ownerRole?: "taxpayer" | "spouse" | "joint" | "dependent" | "unknown",
  correctionEvidenceMode?: CorrectionEvidenceMode,
  correctionSourceDocumentId?: string | null,
  correctionEvidenceNote?: string | null,
) {
  if (normalizedData) assertSafeJson(normalizedData);
  return inTransaction(async (client) => {
    const scope = await authorizedTaxYear(client, context, clientId, year, "source.modify", true);
    assertRevision(scope.revision, expectedRevision);
    const found = await client.query<{
      id: string; source_document_id: string | null; form_type: string; form_year: number;
      external_source_id: string | null; owner_role: string; owner_person_id: string | null;
      normalized_data: Record<string, unknown>; raw_fields: unknown; unmapped_fields: unknown;
      version: number; effective: boolean; corrected: boolean; record_disposition: string;
    }>(
      `SELECT id,source_document_id,form_type,form_year,external_source_id,owner_role,owner_person_id,
        normalized_data,raw_fields,unmapped_fields,version,effective,corrected,record_disposition
       FROM source_form_records WHERE id=$1 AND tax_year_id=$2 FOR UPDATE`,
      [recordId, scope.taxYearId],
    );
    const prior = found.rows[0];
    if (!prior) throw new WorkflowError("not_found", "Source record was not found.");
    if (!prior.effective || !["original", "corrected"].includes(prior.record_disposition) || prior.version !== expectedVersion) {
      throw new WorkflowError("conflict", "The source record changed; reload its current lineage before deciding.");
    }

    const cleanReason = reason.trim();
    if (!cleanReason) throw new WorkflowError("invalid", "A correction, void, or duplicate decision requires a reason.");
    if (action === "correct" && (!normalizedData || Array.isArray(normalizedData))) {
      throw new WorkflowError("invalid", "A corrected normalized record object is required.");
    }
    const protectedData = action === "correct" && normalizedData
      ? protectSourceIdentifiers(context, clientId, prior.normalized_data, normalizedData)
      : normalizedData;
    if (action === "correct" && protectedData) {
      try {
        validateRegisteredSourceData(prior.form_type, protectedData);
      } catch (error) {
        throw new WorkflowError("invalid", error instanceof Error ? error.message : "Registered source fields are invalid.");
      }
    }

    let nextSourceDocumentId = prior.source_document_id;
    let evidenceMode: CorrectionEvidenceMode | null = null;
    let evidenceNote: string | null = null;
    if (action === "correct") {
      if (correctionEvidenceMode === "attached_document") {
        if (!correctionSourceDocumentId) throw new WorkflowError("invalid", "Select the corrected source document.");
        if (correctionSourceDocumentId === prior.source_document_id) {
          throw new WorkflowError("invalid", "A correction must reference a different source document than the current version.");
        }
        const evidence = await client.query<{ id: string; document_type: string }>(
          `SELECT id,document_type FROM source_documents
           WHERE id=$1 AND tax_year_id=$2 AND scan_state='clean' AND disposition IN ('original','corrected')`,
          [correctionSourceDocumentId, scope.taxYearId],
        );
        const document = evidence.rows[0];
        if (!document) throw new WorkflowError("invalid", "The correction document is unavailable or has not passed scanning.");
        const compatible = document.document_type === prior.form_type
          || (prior.form_type === "W2" && document.document_type === "W2C");
        if (!compatible) throw new WorkflowError("invalid", `A ${document.document_type} document cannot evidence a ${prior.form_type} correction.`);
        nextSourceDocumentId = document.id;
        evidenceMode = "attached_document";
      } else if (correctionEvidenceMode === "manual_attestation") {
        evidenceNote = correctionEvidenceNote?.trim() ?? "";
        if (!evidenceNote) throw new WorkflowError("invalid", "Manual correction evidence requires an attestation note.");
        if (evidenceNote.length > 2000) throw new WorkflowError("invalid", "Manual correction evidence cannot exceed 2,000 characters.");
        evidenceMode = "manual_attestation";
      } else {
        throw new WorkflowError("invalid", "Choose an attached correction document or a manual evidence attestation.");
      }
    }

    const nextOwnerRole = ownerRole ?? prior.owner_role;
    let nextOwnerPersonId = prior.owner_person_id;
    if (nextOwnerRole !== prior.owner_role) {
      if (nextOwnerRole === "taxpayer" || nextOwnerRole === "spouse") {
        const person = await client.query<{ id: string }>("SELECT id FROM people WHERE tax_year_id=$1 AND role=$2", [scope.taxYearId, nextOwnerRole]);
        if (!person.rows[0]) throw new WorkflowError("invalid", `No ${nextOwnerRole} person record exists for this tax year.`);
        nextOwnerPersonId = person.rows[0].id;
      } else nextOwnerPersonId = null;
    }

    const disposition = action === "correct" ? "corrected" : action === "void" ? "void" : "duplicate_excluded";
    const nextData = action === "correct" ? protectedData : prior.normalized_data;
    const externalId = prior.external_source_id ?? `lineage:${prior.id}`;
    await client.query("UPDATE source_form_records SET effective=false WHERE id=$1", [prior.id]);
    await client.query("UPDATE source_mappings SET effective=false WHERE source_record_id=$1 AND effective", [prior.id]);
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO source_form_records(
        tax_year_id,source_document_id,form_type,form_year,external_source_id,owner_role,owner_person_id,
        normalized_data,raw_fields,unmapped_fields,corrected,void,effective,supersedes_record_id,version,
        record_disposition,change_reason,created_by_id,correction_evidence_mode,correction_evidence_note
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11,$12,true,$13,$14,$15,$16,$17,$18,$19)
       RETURNING id`,
      [
        scope.taxYearId, nextSourceDocumentId, prior.form_type, prior.form_year, externalId, nextOwnerRole,
        nextOwnerPersonId, JSON.stringify(nextData), JSON.stringify(prior.raw_fields), JSON.stringify(prior.unmapped_fields),
        action === "correct", action === "void", prior.id, prior.version + 1, disposition, cleanReason, context.userId,
        evidenceMode, evidenceNote,
      ],
    );
    const id = inserted.rows[0]?.id;
    if (!id) throw new Error("Source record revision insert failed.");
    const revision = scope.revision + 1;
    await invalidateTaxYear(client, scope.taxYearId, revision);
    const mappingBlockers = await refreshMappingDiagnosticsForTaxYear(client, scope.taxYearId, revision);
    await appendAuditEvent(client, context, scope.taxYearId, `source_record.${disposition}`, "source_form_record", id, {
      revision,
      priorRecordId: prior.id,
      formType: prior.form_type,
      ownerRole: nextOwnerRole,
      version: prior.version + 1,
      reason: cleanReason,
      correctionEvidenceMode: evidenceMode,
      priorSourceDocumentId: prior.source_document_id,
      sourceDocumentId: nextSourceDocumentId,
      mappingBlockers,
    });
    return { id, revision, version: prior.version + 1, disposition };
  });
}

async function authorizedTaxYear(client: pg.PoolClient, context: AuthorizationContext, clientId: string, year: number, action: "source.modify" | "source.download", lock: boolean) {
  const result = await client.query<{ id: string; revision: number; firm_id: string }>(
    `SELECT ty.id,ty.revision,c.firm_id FROM tax_years ty JOIN clients c ON c.id=ty.client_id
     WHERE c.id=$1 AND ty.tax_year=$2 AND c.firm_id=$3 AND c.archived_at IS NULL ${lock ? "FOR UPDATE OF ty" : ""}`,
    [clientId, year, context.firmId],
  );
  const row = result.rows[0];
  if (!row) throw new WorkflowError("not_found", "Tax year was not found.");
  if (!authorize(context, action, { firmId: row.firm_id, clientId })) throw new WorkflowError("forbidden", "Source-record access is not permitted.");
  return { taxYearId: row.id, revision: row.revision };
}

function assertRevision(current: number, expected: number) {
  if (current !== expected) throw new WorkflowError("conflict", `Tax year changed from revision ${expected} to ${current}; reload before changing source lineage.`);
}

function assertSafeJson(value: unknown, depth = 0): void {
  if (depth > 30) throw new WorkflowError("invalid", "Corrected source data is nested too deeply.");
  if (Array.isArray(value)) {
    for (const child of value) assertSafeJson(child, depth + 1);
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (["__proto__", "prototype", "constructor"].includes(key)) throw new WorkflowError("invalid", `Unsafe source-data key ${key} is not allowed.`);
      assertSafeJson(child, depth + 1);
    }
  }
}

function redactSourceIdentifiers(value: Record<string, unknown>): Record<string, unknown> {
  return transformIdentifiers(value, (key, item) => typeof item === "string" ? maskIdentifier(key, item) : item);
}

function protectSourceIdentifiers(context: AuthorizationContext, clientId: string, prior: Record<string, unknown>, candidate: Record<string, unknown>): Record<string, unknown> {
  if (authorize(context, "identifier.reveal", { firmId: context.firmId, clientId })) return candidate;
  const result = structuredClone(candidate);
  walkProtected(prior, result, []);
  findNewProtected(prior, result, []);
  return result;
}

function walkProtected(prior: unknown, candidate: unknown, path: string[]): void {
  if (!prior || typeof prior !== "object" || Array.isArray(prior) || !candidate || typeof candidate !== "object" || Array.isArray(candidate)) return;
  for (const [key, priorValue] of Object.entries(prior as Record<string, unknown>)) {
    const candidateRecord = candidate as Record<string, unknown>;
    if (isIdentifierKey(key) && typeof priorValue === "string") {
      if (candidateRecord[key] !== maskIdentifier(key, priorValue)) throw new WorkflowError("forbidden", `Changing ${[...path, key].join(".")} requires sensitive-identifier permission.`);
      candidateRecord[key] = priorValue;
    } else walkProtected(priorValue, candidateRecord[key], [...path, key]);
  }
}

function findNewProtected(prior: unknown, candidate: unknown, path: string[]): void {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return;
  const priorRecord = prior && typeof prior === "object" && !Array.isArray(prior) ? prior as Record<string, unknown> : {};
  for (const [key, value] of Object.entries(candidate as Record<string, unknown>)) {
    if (isIdentifierKey(key) && priorRecord[key] === undefined && value !== null && value !== "") throw new WorkflowError("forbidden", `Adding ${[...path, key].join(".")} requires sensitive-identifier permission.`);
    findNewProtected(priorRecord[key], value, [...path, key]);
  }
}

function transformIdentifiers(value: unknown, transform: (key: string, item: unknown) => unknown): any {
  if (Array.isArray(value)) return value.map((item) => transformIdentifiers(item, transform));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, isIdentifierKey(key) ? transform(key, item) : transformIdentifiers(item, transform)]));
}

function isIdentifierKey(key: string) { return /(?:^|_)(?:tin|ein|ssn|account_number)$|^(?:tin|ein|ssn|accountNumber)$/i.test(key); }
function maskIdentifier(key: string, value: string) { return /tin|ein|ssn/i.test(key) ? maskTin(value) : `****${value.replace(/\s/g, "").slice(-4)}`; }

async function invalidateTaxYear(client: pg.PoolClient, taxYearId: string, revision: number) {
  await client.query("UPDATE tax_years SET revision=$2,validation_status='not_run',calculation_status='stale',preparation_status=CASE WHEN preparation_status IN ('ready_for_review','reviewed_draft') THEN 'changes_requested' ELSE preparation_status END WHERE id=$1", [taxYearId, revision]);
}

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
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
