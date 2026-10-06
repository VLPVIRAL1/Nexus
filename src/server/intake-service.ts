import "server-only";
import { createHash } from "node:crypto";
import type pg from "pg";
import { phase1IntakeQuestions } from "@/domain/intake";
import { authorize, type AuthorizationContext } from "@/services/authorization";
import { databasePool } from "./database";
import { WorkflowError } from "./client-workflow-service";

export type IntakeAnswerValue = "yes" | "no" | "unknown";
export interface IntakeAnswerInput { questionId: string; answer: IntakeAnswerValue; evidence: string }
export interface ExpectedDocumentInput {
  documentKey: string;
  label: string;
  status: "expected" | "received" | "unavailable" | "not_applicable";
  evidence: string | null;
  sourceDocumentId: string | null;
  expectedVersion: number | null;
}

export async function saveIntakeAnswers(context: AuthorizationContext, clientId: string, year: number, expectedRevision: number, answers: IntakeAnswerInput[]) {
  return inTransaction(async (client) => {
    const scope = await authorizedTaxYear(client, context, clientId, year, "intake.modify", true);
    assertRevision(scope.revision, expectedRevision);
    const registry = new Map(phase1IntakeQuestions.map((question) => [question.id, question]));
    if (answers.length === 0 || new Set(answers.map(({ questionId }) => questionId)).size !== answers.length) throw new WorkflowError("invalid", "Submit one or more unique intake answers.");
    for (const answer of answers) {
      if (!registry.has(answer.questionId)) throw new WorkflowError("invalid", `Unknown intake question: ${answer.questionId}.`);
      if (!answer.evidence.trim()) throw new WorkflowError("invalid", `Evidence or respondent note is required for ${answer.questionId}.`);
    }
    const nextRevision = scope.revision + 1;
    for (const answer of answers) {
      await client.query(
        "INSERT INTO intake_answers(tax_year_id,question_id,answer,respondent_id,evidence,answer_revision) VALUES($1,$2,$3,$4,$5,$6)",
        [scope.taxYearId, answer.questionId, answer.answer, context.userId, answer.evidence.trim(), nextRevision],
      );
    }
    await invalidateTaxYear(client, scope.taxYearId, nextRevision);
    const diagnostics = await refreshIntakeDiagnostics(client, scope.taxYearId, nextRevision);
    await appendAuditEvent(client, context, scope.taxYearId, "intake.answers_saved", "tax_year", scope.taxYearId, { revision: nextRevision, questionIds: answers.map(({ questionId }) => questionId), blockerCount: diagnostics });
    return { revision: nextRevision, blockerCount: diagnostics };
  });
}

export async function saveExpectedDocument(context: AuthorizationContext, clientId: string, year: number, expectedTaxYearRevision: number, input: ExpectedDocumentInput) {
  return inTransaction(async (client) => {
    const scope = await authorizedTaxYear(client, context, clientId, year, "intake.modify", true);
    assertRevision(scope.revision, expectedTaxYearRevision);
    if ((input.status === "unavailable" || input.status === "not_applicable") && !input.evidence?.trim()) throw new WorkflowError("invalid", "Unavailable or not-applicable documents require evidence.");
    if (input.status === "received" && !input.sourceDocumentId && !input.evidence?.trim()) throw new WorkflowError("invalid", "A received document requires a source link or evidence note.");
    if (input.sourceDocumentId) {
      const source = await client.query("SELECT 1 FROM source_documents WHERE id=$1 AND tax_year_id=$2", [input.sourceDocumentId, scope.taxYearId]);
      if (!source.rowCount) throw new WorkflowError("invalid", "Source document does not belong to this tax year.");
    }
    let document: { id: string; version: number } | undefined;
    if (input.expectedVersion == null) {
      const inserted = await client.query<{ id: string; version: number }>(
        `INSERT INTO expected_documents(tax_year_id,document_key,label,status,evidence,source_document_id,updated_by)
         VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,version`,
        [scope.taxYearId, input.documentKey, input.label, input.status, input.evidence?.trim() || null, input.sourceDocumentId, context.userId],
      ).catch((error: unknown) => { if (isUniqueViolation(error)) throw new WorkflowError("conflict", "Expected document changed; reload before saving."); throw error; });
      document = inserted.rows[0];
    } else {
      const updated = await client.query<{ id: string; version: number }>(
        `UPDATE expected_documents SET label=$4,status=$5,evidence=$6,source_document_id=$7,updated_by=$8,version=version+1
         WHERE tax_year_id=$1 AND document_key=$2 AND version=$3 RETURNING id,version`,
        [scope.taxYearId, input.documentKey, input.expectedVersion, input.label, input.status, input.evidence?.trim() || null, input.sourceDocumentId, context.userId],
      );
      document = updated.rows[0];
      if (!document) throw new WorkflowError("conflict", "Expected document changed or was removed; reload before saving.");
    }
    if (!document) throw new Error("Expected document write failed.");
    const nextRevision = scope.revision + 1;
    await invalidateTaxYear(client, scope.taxYearId, nextRevision);
    await appendAuditEvent(client, context, scope.taxYearId, "expected_document.saved", "expected_document", document.id, { revision: nextRevision, documentKey: input.documentKey, status: input.status, version: document.version });
    return { id: document.id, version: document.version, revision: nextRevision };
  });
}

export async function attestCompleteness(context: AuthorizationContext, clientId: string, year: number, expectedRevision: number, evidence: string, missingDocumentExplanation: string | null) {
  return inTransaction(async (client) => {
    const scope = await authorizedTaxYear(client, context, clientId, year, "intake.modify", true);
    assertRevision(scope.revision, expectedRevision);
    if (!evidence.trim()) throw new WorkflowError("invalid", "Completeness attestation evidence is required.");
    const state = await readIntakeState(client, scope.taxYearId, scope.revision);
    if (state.missingQuestionIds.length || state.blockingQuestionIds.length) throw new WorkflowError("conflict", "Required intake questions remain unknown, unanswered, or unsupported.");
    if (state.expectedDocuments.length === 0 || state.expectedDocuments.some(({ status }) => status === "expected")) throw new WorkflowError("conflict", "Every expected document must be received, unavailable, or substantiated as not applicable.");
    if (state.expectedDocuments.some(({ status, evidence: itemEvidence, sourceDocumentId }) => status === "received" ? !itemEvidence && !sourceDocumentId : (status === "unavailable" || status === "not_applicable") && !itemEvidence)) throw new WorkflowError("conflict", "Expected-document evidence is incomplete.");
    if (state.expectedDocuments.some(({ status }) => status === "unavailable") && !missingDocumentExplanation?.trim()) throw new WorkflowError("invalid", "Explain unavailable expected documents.");
    const nextRevision = scope.revision + 1;
    await invalidateTaxYear(client, scope.taxYearId, nextRevision);
    const inserted = await client.query<{ id: string }>(
      "INSERT INTO completeness_attestations(tax_year_id,tax_year_revision,attested_by,evidence,missing_document_explanation) VALUES($1,$2,$3,$4,$5) RETURNING id",
      [scope.taxYearId, nextRevision, context.userId, evidence.trim(), missingDocumentExplanation?.trim() || null],
    );
    const id = inserted.rows[0]?.id;
    if (!id) throw new Error("Completeness attestation insert failed.");
    await appendAuditEvent(client, context, scope.taxYearId, "completeness.attested", "completeness_attestation", id, { revision: nextRevision });
    return { id, revision: nextRevision };
  });
}

export async function getIntakeState(context: AuthorizationContext, clientId: string, year: number) {
  const client = await databasePool().connect();
  try {
    const scope = await authorizedTaxYear(client, context, clientId, year, "client.view", false);
    return readIntakeState(client, scope.taxYearId, scope.revision);
  } finally { client.release(); }
}

async function readIntakeState(client: pg.PoolClient, taxYearId: string, revision: number) {
  const answerResult = await client.query<{ question_id: string; answer: IntakeAnswerValue; evidence: string; answered_at: Date; answer_revision: number }>(
    `SELECT DISTINCT ON (question_id) question_id,answer,evidence,answered_at,answer_revision
     FROM intake_answers WHERE tax_year_id=$1 ORDER BY question_id,answer_revision DESC`, [taxYearId],
  );
  const answerByQuestion = new Map(answerResult.rows.map((answer) => [answer.question_id, answer]));
  const missingQuestionIds = phase1IntakeQuestions.filter(({ required, id }) => required && (!answerByQuestion.has(id) || answerByQuestion.get(id)?.answer === "unknown")).map(({ id }) => id);
  const blockingQuestionIds = phase1IntakeQuestions.filter((question) => {
    const answer = answerByQuestion.get(question.id)?.answer;
    return answer === "yes" ? !question.supportedWhenYes : answer === "no" ? question.supportedWhenYes : false;
  }).map(({ id }) => id);
  const documents = await client.query<{ id: string; document_key: string; label: string; status: ExpectedDocumentInput["status"]; evidence: string | null; source_document_id: string | null; version: number }>(
    "SELECT id,document_key,label,status,evidence,source_document_id,version FROM expected_documents WHERE tax_year_id=$1 ORDER BY label", [taxYearId],
  );
  const attestation = await client.query<{ id: string; tax_year_revision: number }>("SELECT id,tax_year_revision FROM completeness_attestations WHERE tax_year_id=$1 ORDER BY tax_year_revision DESC LIMIT 1", [taxYearId]);
  return {
    revision,
    questions: phase1IntakeQuestions.map((question) => ({ ...question, answer: answerByQuestion.get(question.id) ?? null })),
    missingQuestionIds,
    blockingQuestionIds,
    expectedDocuments: documents.rows.map((row) => ({ id: row.id, documentKey: row.document_key, label: row.label, status: row.status, evidence: row.evidence, sourceDocumentId: row.source_document_id, version: row.version })),
    attestation: attestation.rows[0] ? { id: attestation.rows[0].id, revision: attestation.rows[0].tax_year_revision, current: attestation.rows[0].tax_year_revision === revision } : null,
  };
}

async function refreshIntakeDiagnostics(client: pg.PoolClient, taxYearId: string, revision: number): Promise<number> {
  await client.query("UPDATE validation_issues SET resolved_revision=$2,resolved_at=now(),resolution='Superseded by intake revision' WHERE tax_year_id=$1 AND category='intake' AND resolved_at IS NULL", [taxYearId, revision]);
  const state = await readIntakeState(client, taxYearId, revision);
  for (const questionId of state.missingQuestionIds) {
    await client.query(
      "INSERT INTO validation_issues(tax_year_id,code,severity,category,field_path,message,resolution_action,creation_revision) VALUES($1,'INTAKE_REQUIRED_UNKNOWN','blocking','intake',$2,$3,'Answer the required intake question with evidence.',$4)",
      [taxYearId, questionId, `Required intake question is unanswered or unknown: ${questionId}.`, revision],
    );
  }
  for (const questionId of state.blockingQuestionIds) {
    const question = phase1IntakeQuestions.find(({ id }) => id === questionId);
    await client.query(
      "INSERT INTO validation_issues(tax_year_id,code,severity,category,field_path,message,resolution_action,creation_revision) VALUES($1,'INTAKE_TREATMENT_UNSUPPORTED','blocking','intake',$2,$3,'Implement the required treatment or keep the return partial.',$4)",
      [taxYearId, questionId, `${question?.affirmativeTreatment ?? questionId} is outside the supported calculation profile.`, revision],
    );
  }
  return state.missingQuestionIds.length + state.blockingQuestionIds.length;
}

async function authorizedTaxYear(client: pg.PoolClient, context: AuthorizationContext, clientId: string, year: number, action: "client.view" | "intake.modify", lock: boolean) {
  const result = await client.query<{ id: string; revision: number; firm_id: string }>(
    `SELECT ty.id,ty.revision,c.firm_id FROM tax_years ty JOIN clients c ON c.id=ty.client_id
     WHERE c.id=$1 AND ty.tax_year=$2 AND c.firm_id=$3 AND c.archived_at IS NULL ${lock ? "FOR UPDATE OF ty" : ""}`,
    [clientId, year, context.firmId],
  );
  const row = result.rows[0];
  if (!row) throw new WorkflowError("not_found", "Tax year was not found.");
  if (!authorize(context, action, { firmId: row.firm_id, clientId })) throw new WorkflowError("forbidden", "Intake access is not permitted.");
  return { taxYearId: row.id, revision: row.revision };
}

async function invalidateTaxYear(client: pg.PoolClient, taxYearId: string, revision: number) {
  await client.query(
    `UPDATE tax_years SET revision=$2,validation_status='not_run',calculation_status='stale',
       preparation_status=CASE WHEN preparation_status IN ('ready_for_review','reviewed_draft') THEN 'changes_requested' ELSE preparation_status END
     WHERE id=$1`, [taxYearId, revision],
  );
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

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
