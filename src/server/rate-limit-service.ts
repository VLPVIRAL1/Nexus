import "server-only";
import type { AuthorizationContext } from "@/services/authorization";
import { databasePool } from "./database";

export class RateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super("Too many requests. Wait before trying this operation again.");
    this.name = "RateLimitError";
  }
}

const limits = {
  "source.upload": 20,
  "import.preview": 20,
  "import.commit": 20,
  "import.rollback": 10,
  "calculation.run": 30,
  "artifact.enqueue": 30,
  "artifact.retry": 10,
  "assignment.modify": 30,
  "retention.modify": 20,
  "retention.dispose": 5,
  "client.search": 60,
} as const;

export type RateLimitedOperation = keyof typeof limits;

export async function enforceRateLimit(context: AuthorizationContext, operation: RateLimitedOperation, now = new Date()) {
  if (!process.env.DATABASE_URL) return;
  const limit = limits[operation];
  const windowStartedAt = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
  const result = await databasePool().query<{ request_count: number }>(`INSERT INTO api_rate_limit_windows(firm_id,user_id,operation_code,window_started_at,request_count)
    VALUES($1,$2,$3,$4,1)
    ON CONFLICT(firm_id,user_id,operation_code,window_started_at)
    DO UPDATE SET request_count=api_rate_limit_windows.request_count+1,updated_at=now()
    RETURNING request_count`, [context.firmId, context.userId, operation, windowStartedAt]);
  void databasePool().query("DELETE FROM api_rate_limit_windows WHERE updated_at<now()-interval '2 days'").catch(() => undefined);
  if ((result.rows[0]?.request_count ?? 1) > limit) {
    const elapsedSeconds = Math.floor((now.getTime() - windowStartedAt.getTime()) / 1_000);
    throw new RateLimitError(Math.max(1, 60 - elapsedSeconds));
  }
}
