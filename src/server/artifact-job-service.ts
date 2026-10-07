import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type pg from "pg";
import { authorize, type AuthorizationContext, type Role } from "@/services/authorization";
import { WorkflowError } from "./client-workflow-service";
import { databasePool } from "./database";
import { artifactTemplateVersion, generatePersistedArtifact, type ArtifactType } from "./output-persistence-service";

const LEASE_TIMEOUT_MINUTES = 5;

export async function enqueueArtifactJob(context: AuthorizationContext, clientId: string, year: number, expectedRevision: number, artifactType: ArtifactType) {
  return inTransaction(async (client) => {
    const scope = await authorizedTaxYear(client, context, clientId, year, true);
    if (scope.revision !== expectedRevision) throw new WorkflowError("conflict", `Tax year changed from revision ${expectedRevision} to ${scope.revision}; reload before generating outputs.`);
    if (artifactType === "complete_json" && !authorize(context, "identifier.reveal", { firmId: context.firmId, clientId })) throw new WorkflowError("forbidden", "Complete canonical export requires sensitive-identifier permission.");
    const calculation = await client.query<{ id: string; input_revision: number }>("SELECT id,input_revision FROM calculation_runs WHERE tax_year_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1 FOR SHARE", [scope.taxYearId]);
    const run = calculation.rows[0];
    if (!run || run.input_revision !== scope.revision) throw new WorkflowError("conflict", "A current persisted calculation run is required before generating outputs.");
    const templateVersion = artifactTemplateVersion(artifactType);
    const idempotencyKey = createHash("sha256").update(JSON.stringify({ taxYearId: scope.taxYearId, revision: scope.revision, calculationRunId: run.id, artifactType, templateVersion })).digest("hex");
    const existing = await client.query<{ id: string; job_status: string; artifact_id: string | null; attempt_count: number }>("SELECT id,job_status,artifact_id,attempt_count FROM artifact_jobs WHERE idempotency_key=$1", [idempotencyKey]);
    if (existing.rows[0]) return { jobId: existing.rows[0].id, artifactId: existing.rows[0].artifact_id, status: existing.rows[0].job_status, attemptCount: existing.rows[0].attempt_count, replayed: true };

    const jobId = randomUUID();
    await client.query(`INSERT INTO artifact_jobs(id,firm_id,client_id,tax_year_id,calculation_run_id,artifact_type,input_revision,template_version,idempotency_key,created_by_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [jobId, context.firmId, clientId, scope.taxYearId, run.id, artifactType, scope.revision, templateVersion, idempotencyKey, context.userId]);
    await appendAuditEvent(client, context, scope.taxYearId, "artifact_job.queued", "artifact_job", jobId, { revision: scope.revision, artifactType, calculationRunId: run.id, templateVersion });
    return { jobId, artifactId: null, status: "queued", attemptCount: 0, replayed: false };
  });
}

export async function retryArtifactJob(context: AuthorizationContext, clientId: string, year: number, jobId: string) {
  return inTransaction(async (client) => {
    const scope = await authorizedTaxYear(client, context, clientId, year, true);
    const result = await client.query<{ input_revision: number; job_status: string; attempt_count: number; max_attempts: number }>("SELECT input_revision,job_status,attempt_count,max_attempts FROM artifact_jobs WHERE id=$1 AND tax_year_id=$2 FOR UPDATE", [jobId, scope.taxYearId]);
    const job = result.rows[0];
    if (!job) throw new WorkflowError("not_found", "Artifact job was not found.");
    if (job.job_status !== "failed") throw new WorkflowError("conflict", "Only a failed artifact job can be retried manually.");
    if (job.input_revision !== scope.revision) throw new WorkflowError("conflict", "This failed job belongs to an older return revision and cannot be retried.");
    await client.query("UPDATE artifact_jobs SET job_status='queued',attempt_count=0,available_at=now(),locked_at=NULL,locked_by=NULL,completed_at=NULL,last_error_code=NULL,last_error_message=NULL,updated_at=now() WHERE id=$1", [jobId]);
    await appendAuditEvent(client, context, scope.taxYearId, "artifact_job.retry_requested", "artifact_job", jobId, { revision: scope.revision, priorAttempts: job.attempt_count, maxAttempts: job.max_attempts });
    return { jobId, status: "queued" as const };
  });
}

export async function processNextArtifactJob(workerId: string) {
  const claimed = await claimNextJob(workerId);
  if (!claimed) return null;
  try {
    const context = await contextForJob(claimed);
    const artifact = await generatePersistedArtifact(context, claimed.clientId, claimed.year, claimed.inputRevision, claimed.artifactType);
    const completed = await inTransaction(async (client) => {
      const updated = await client.query("UPDATE artifact_jobs SET job_status='succeeded',artifact_id=$2,completed_at=now(),locked_at=NULL,locked_by=NULL,last_error_code=NULL,last_error_message=NULL,updated_at=now() WHERE id=$1 AND job_status='running' RETURNING id", [claimed.id, artifact.id]);
      if (updated.rowCount) await appendAuditEvent(client, context, claimed.taxYearId, "artifact_job.succeeded", "artifact_job", claimed.id, { revision: claimed.inputRevision, artifactType: claimed.artifactType, artifactId: artifact.id, attemptCount: claimed.attemptCount });
      return updated;
    });
    return { jobId: claimed.id, status: completed.rowCount ? "succeeded" as const : "stale" as const, artifactId: artifact.id, attemptCount: claimed.attemptCount };
  } catch (error) {
    const failure = classifyFailure(error);
    const retry = failure.retryable && claimed.attemptCount < claimed.maxAttempts;
    const delaySeconds = Math.min(60, 2 ** Math.max(0, claimed.attemptCount - 1));
    const updated = await databasePool().query("UPDATE artifact_jobs SET job_status=$2,available_at=CASE WHEN $2='queued' THEN now()+($3::text||' seconds')::interval ELSE available_at END,completed_at=CASE WHEN $2='failed' THEN now() ELSE completed_at END,locked_at=NULL,locked_by=NULL,last_error_code=$4,last_error_message=$5,updated_at=now() WHERE id=$1 AND job_status='running' RETURNING job_status", [claimed.id, retry ? "queued" : "failed", delaySeconds, failure.code, failure.message]);
    return { jobId: claimed.id, status: (updated.rows[0]?.job_status ?? "stale") as "queued" | "failed" | "stale", artifactId: null, attemptCount: claimed.attemptCount };
  }
}

interface ClaimedJob {
  id: string;
  firmId: string;
  clientId: string;
  taxYearId: string;
  year: number;
  inputRevision: number;
  artifactType: ArtifactType;
  createdById: string;
  attemptCount: number;
  maxAttempts: number;
}

async function claimNextJob(workerId: string): Promise<ClaimedJob | null> {
  return inTransaction(async (client) => {
    await client.query("UPDATE artifact_jobs SET job_status='failed',completed_at=now(),locked_at=NULL,locked_by=NULL,last_error_code='worker_lease_expired',last_error_message='The worker lease expired at the configured attempt limit.',updated_at=now() WHERE job_status='running' AND locked_at<now()-($1::text||' minutes')::interval AND attempt_count>=max_attempts", [LEASE_TIMEOUT_MINUTES]);
    const result = await client.query<{ id: string; firm_id: string; client_id: string; tax_year_id: string; tax_year: number; input_revision: number; artifact_type: ArtifactType; created_by_id: string; attempt_count: number; max_attempts: number }>(`SELECT j.id,j.firm_id,j.client_id,j.tax_year_id,ty.tax_year,j.input_revision,j.artifact_type,j.created_by_id,j.attempt_count,j.max_attempts FROM artifact_jobs j JOIN tax_years ty ON ty.id=j.tax_year_id WHERE (j.job_status='queued' AND j.available_at<=now()) OR (j.job_status='running' AND j.locked_at<now()-($1::text||' minutes')::interval AND j.attempt_count<j.max_attempts) ORDER BY j.available_at,j.created_at FOR UPDATE OF j SKIP LOCKED LIMIT 1`, [LEASE_TIMEOUT_MINUTES]);
    const row = result.rows[0];
    if (!row) return null;
    const updated = await client.query<{ attempt_count: number }>("UPDATE artifact_jobs SET job_status='running',attempt_count=attempt_count+1,locked_at=now(),locked_by=$2,started_at=COALESCE(started_at,now()),updated_at=now() WHERE id=$1 RETURNING attempt_count", [row.id, workerId]);
    return { id: row.id, firmId: row.firm_id, clientId: row.client_id, taxYearId: row.tax_year_id, year: row.tax_year, inputRevision: row.input_revision, artifactType: row.artifact_type, createdById: row.created_by_id, attemptCount: updated.rows[0]?.attempt_count ?? row.attempt_count + 1, maxAttempts: row.max_attempts };
  });
}

async function contextForJob(job: ClaimedJob): Promise<AuthorizationContext> {
  const result = await databasePool().query<{ role: Role; assigned: boolean }>("SELECT m.role,EXISTS(SELECT 1 FROM client_assignments ca WHERE ca.client_id=$3 AND ca.user_id=$1) AS assigned FROM memberships m JOIN clients c ON c.firm_id=m.firm_id WHERE m.user_id=$1 AND m.firm_id=$2 AND c.id=$3", [job.createdById, job.firmId, job.clientId]);
  const membership = result.rows[0];
  if (!membership) throw new WorkflowError("forbidden", "The job creator no longer has an active firm membership.");
  if (membership.role !== "admin" && !membership.assigned) throw new WorkflowError("forbidden", "The job creator is no longer assigned to this client.");
  return { userId: job.createdById, firmId: job.firmId, role: membership.role, assignedClientIds: new Set([job.clientId]) };
}

function classifyFailure(error: unknown): { code: string; message: string; retryable: boolean } {
  if (error instanceof WorkflowError) return { code: error.code, message: sanitize(error.message), retryable: false };
  return { code: "artifact_generation_failed", message: "Artifact generation failed; the worker will retry within the configured attempt limit.", retryable: true };
}

function sanitize(message: string): string { return message.replace(/[\r\n\t]+/g, " ").slice(0, 300); }

async function authorizedTaxYear(client: pg.PoolClient, context: AuthorizationContext, clientId: string, year: number, lock: boolean) {
  const result = await client.query<{ id: string; revision: number; firm_id: string }>(`SELECT ty.id,ty.revision,c.firm_id FROM tax_years ty JOIN clients c ON c.id=ty.client_id WHERE c.id=$1 AND ty.tax_year=$2 AND c.firm_id=$3 AND c.archived_at IS NULL ${lock ? "FOR UPDATE OF ty" : ""}`, [clientId, year, context.firmId]);
  const row = result.rows[0];
  if (!row) throw new WorkflowError("not_found", "Tax year was not found.");
  if (!authorize(context, "output.generate", { firmId: row.firm_id, clientId })) throw new WorkflowError("forbidden", "Output generation is not permitted.");
  return { taxYearId: row.id, revision: row.revision };
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
  try { await client.query("BEGIN"); const result = await work(client); await client.query("COMMIT"); return result; }
  catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
