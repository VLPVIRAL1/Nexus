import "server-only";
import { authorize, type AuthorizationContext } from "@/services/authorization";
import { WorkflowError } from "./client-workflow-service";
import { databasePool } from "./database";

export async function getArtifactJobMetrics(context: AuthorizationContext) {
  if (!authorize(context, "integration.configure", { firmId: context.firmId })) throw new WorkflowError("forbidden", "Operational metrics require administrator permission.");
  const [summary, recentFailures] = await Promise.all([
    databasePool().query<{ queued: string; running: string; succeeded: string; failed: string; stale: string; oldest_queued_seconds: string | null; p95_success_seconds: string | null }>(`SELECT
      count(*) FILTER (WHERE job_status='queued')::text AS queued,
      count(*) FILTER (WHERE job_status='running')::text AS running,
      count(*) FILTER (WHERE job_status='succeeded')::text AS succeeded,
      count(*) FILTER (WHERE job_status='failed')::text AS failed,
      count(*) FILTER (WHERE job_status='stale')::text AS stale,
      extract(epoch FROM (now()-min(created_at) FILTER (WHERE job_status='queued')))::text AS oldest_queued_seconds,
      percentile_disc(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM (completed_at-created_at))) FILTER (WHERE job_status='succeeded' AND completed_at IS NOT NULL)::text AS p95_success_seconds
      FROM artifact_jobs WHERE firm_id=$1`, [context.firmId]),
    databasePool().query<{ id: string; artifact_type: string; attempt_count: number; error_code: string | null; failed_at: Date }>("SELECT id,artifact_type,attempt_count,last_error_code AS error_code,COALESCE(completed_at,updated_at) AS failed_at FROM artifact_jobs WHERE firm_id=$1 AND job_status='failed' ORDER BY COALESCE(completed_at,updated_at) DESC LIMIT 20", [context.firmId]),
  ]);
  const row = summary.rows[0];
  return {
    generatedAt: new Date().toISOString(),
    counts: { queued: Number(row?.queued ?? 0), running: Number(row?.running ?? 0), succeeded: Number(row?.succeeded ?? 0), failed: Number(row?.failed ?? 0), stale: Number(row?.stale ?? 0) },
    oldestQueuedSeconds: row?.oldest_queued_seconds == null ? null : Number(row.oldest_queued_seconds),
    p95SuccessSeconds: row?.p95_success_seconds == null ? null : Number(row.p95_success_seconds),
    recentFailures: recentFailures.rows.map((failure) => ({ jobId: failure.id, artifactType: failure.artifact_type, attemptCount: failure.attempt_count, errorCode: failure.error_code, failedAt: failure.failed_at.toISOString() })),
  };
}
