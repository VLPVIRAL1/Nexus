import "server-only";
import { createHmac } from "node:crypto";
import { databasePool } from "./database";
import { RateLimitError } from "./rate-limit-service";

export type AuthenticationOperation = "login" | "account_recovery";

interface AuthenticationAttempt {
  operation: AuthenticationOperation;
  networkIdentifier: string;
  principalIdentifier: string;
}

const policies = {
  login: { windowMs: 15 * 60 * 1000, networkLimit: 100, principalLimit: 10 },
  account_recovery: { windowMs: 60 * 60 * 1000, networkLimit: 50, principalLimit: 5 },
} as const;

const developmentSecret = "nexus-development-auth-attempt-secret-do-not-use-in-production";

export class AuthenticationAttemptLimitError extends RateLimitError {
  constructor(retryAfterSeconds: number) {
    super(retryAfterSeconds);
    this.name = "AuthenticationAttemptLimitError";
    this.message = "Authentication is temporarily unavailable. Wait before trying again.";
  }
}

export async function enforceAuthenticationAttemptLimit(attempt: AuthenticationAttempt, now = new Date()): Promise<void> {
  const policy = policies[attempt.operation];
  const networkIdentifier = normalizeIdentifier(attempt.networkIdentifier);
  const principalIdentifier = normalizeIdentifier(attempt.principalIdentifier);
  const secret = authenticationRateLimitSecret();
  const windowStartedAt = new Date(Math.floor(now.getTime() / policy.windowMs) * policy.windowMs);
  const keys = [
    { scope: "network", hash: keyedHash(secret, `network\0${networkIdentifier}`), limit: policy.networkLimit },
    { scope: "principal", hash: keyedHash(secret, `principal\0${principalIdentifier}`), limit: policy.principalLimit },
  ] as const;

  const client = await databasePool().connect();
  let blocked = false;
  try {
    await client.query("BEGIN");
    for (const key of keys) {
      const result = await client.query<{ request_count: number }>(
        `INSERT INTO authentication_attempt_windows(operation_code,key_scope,key_hash,window_started_at,request_count)
         VALUES($1,$2,$3,$4,1)
         ON CONFLICT(operation_code,key_scope,key_hash,window_started_at)
         DO UPDATE SET request_count=authentication_attempt_windows.request_count+1,updated_at=now()
         RETURNING request_count`,
        [attempt.operation, key.scope, key.hash, windowStartedAt],
      );
      if ((result.rows[0]?.request_count ?? 1) > key.limit) blocked = true;
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  void databasePool().query("DELETE FROM authentication_attempt_windows WHERE updated_at<now()-interval '2 days'").catch(() => undefined);
  if (blocked) {
    const retryAfterSeconds = Math.max(1, Math.ceil((windowStartedAt.getTime() + policy.windowMs - now.getTime()) / 1_000));
    throw new AuthenticationAttemptLimitError(retryAfterSeconds);
  }
}

function normalizeIdentifier(value: string): string {
  const normalized = value.trim().normalize("NFKC").toLowerCase();
  if (!normalized || normalized.length > 512) throw new Error("Authentication attempt identifiers must contain 1 to 512 characters.");
  return normalized;
}

function keyedHash(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

function authenticationRateLimitSecret(): string {
  const configured = process.env.AUTH_RATE_LIMIT_SECRET?.trim();
  if (configured && configured.length >= 32) return configured;
  if (process.env.APP_ENV === "production") throw new Error("AUTH_RATE_LIMIT_SECRET must contain at least 32 characters in production.");
  return developmentSecret;
}
