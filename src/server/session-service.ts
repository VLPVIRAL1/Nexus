import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type pg from "pg";
import type { AuthorizationContext, Role } from "@/services/authorization";
import { databasePool } from "./database";

const idleWindowMs = 30 * 60 * 1000;
const absoluteWindowMs = 12 * 60 * 60 * 1000;
const allowedRoles = new Set<Role>(["admin", "preparer", "reviewer", "read_only"]);

export class AuthenticationError extends Error {
  constructor(message = "Authentication required.") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export interface VerifiedIdentityAssertion {
  userId: string;
  firmId: string;
  mfaVerifiedAt: Date;
  userAgent: string | null;
}

export interface IssuedSession {
  token: string;
  absoluteExpiresAt: Date;
  cookie: { name: "nexus_session"; httpOnly: true; secure: true; sameSite: "lax"; path: "/"; expires: Date };
}

export async function issueSessionFromVerifiedIdentity(assertion: VerifiedIdentityAssertion, now = new Date()): Promise<IssuedSession> {
  if (assertion.mfaVerifiedAt.getTime() > now.getTime() || now.getTime() - assertion.mfaVerifiedAt.getTime() > 5 * 60 * 1000) {
    throw new AuthenticationError("A recent MFA verification is required.");
  }
  const token = randomBytes(32).toString("base64url");
  const absoluteExpiresAt = new Date(now.getTime() + absoluteWindowMs);
  const idleExpiresAt = new Date(now.getTime() + idleWindowMs);
  const userAgentHash = assertion.userAgent ? sha256(assertion.userAgent) : null;
  await databasePool().query(
    `INSERT INTO auth_sessions(token_hash,user_id,active_firm_id,mfa_verified_at,idle_expires_at,absolute_expires_at,user_agent_hash)
     SELECT $1,$2,$3,$4,$5,$6,$7
     WHERE EXISTS (SELECT 1 FROM memberships WHERE firm_id=$3 AND user_id=$2)`,
    [sha256(token), assertion.userId, assertion.firmId, assertion.mfaVerifiedAt, idleExpiresAt, absoluteExpiresAt, userAgentHash],
  ).then((result) => {
    if (result.rowCount !== 1) throw new AuthenticationError("Verified identity is not a member of the selected firm.");
  });
  return { token, absoluteExpiresAt, cookie: { name: "nexus_session", httpOnly: true, secure: true, sameSite: "lax", path: "/", expires: absoluteExpiresAt } };
}

interface SessionRow {
  session_id: string;
  user_id: string;
  firm_id: string;
  role: string;
  idle_expires_at: Date;
  absolute_expires_at: Date;
  revoked_at: Date | null;
  user_agent_hash: string | null;
}

export async function resolveSession(token: string, userAgent: string | null, now = new Date()): Promise<AuthorizationContext> {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) throw new AuthenticationError();
  const session = await databasePool().query<SessionRow>(
    `SELECT s.id AS session_id,s.user_id,s.active_firm_id AS firm_id,m.role,s.idle_expires_at,s.absolute_expires_at,s.revoked_at,s.user_agent_hash
     FROM auth_sessions s JOIN memberships m ON m.firm_id=s.active_firm_id AND m.user_id=s.user_id
     WHERE s.token_hash=$1`,
    [sha256(token)],
  );
  const row = session.rows[0];
  if (!row || row.revoked_at || row.idle_expires_at <= now || row.absolute_expires_at <= now) throw new AuthenticationError("Session expired or revoked.");
  if (!allowedRoles.has(row.role as Role)) throw new AuthenticationError("Session role is invalid.");
  if (row.user_agent_hash && (!userAgent || row.user_agent_hash !== sha256(userAgent))) throw new AuthenticationError("Session client changed.");

  const nextIdleExpiry = new Date(Math.min(now.getTime() + idleWindowMs, row.absolute_expires_at.getTime()));
  await databasePool().query("UPDATE auth_sessions SET last_seen_at=$2,idle_expires_at=$3 WHERE id=$1", [row.session_id, now, nextIdleExpiry]);
  return loadAuthorizationContext(databasePool(), row.user_id, row.firm_id, row.role as Role);
}

export async function revokeSession(token: string, reason: string, now = new Date()): Promise<void> {
  await databasePool().query(
    "UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,$2),revocation_reason=COALESCE(revocation_reason,$3) WHERE token_hash=$1",
    [sha256(token), now, reason.slice(0, 200)],
  );
}

export async function loadAuthorizationContext(queryable: Pick<pg.Pool, "query">, userId: string, firmId: string, knownRole?: Role): Promise<AuthorizationContext> {
  const membership = knownRole
    ? { rows: [{ role: knownRole }] }
    : await queryable.query<{ role: string }>("SELECT role FROM memberships WHERE firm_id=$1 AND user_id=$2", [firmId, userId]);
  const role = membership.rows[0]?.role;
  if (!role || !allowedRoles.has(role as Role)) throw new AuthenticationError("Firm membership is missing.");
  const assignments = await queryable.query<{ client_id: string }>(
    "SELECT DISTINCT ca.client_id FROM client_assignments ca JOIN clients c ON c.id=ca.client_id WHERE ca.user_id=$1 AND c.firm_id=$2",
    [userId, firmId],
  );
  return { userId, firmId, role: role as Role, assignedClientIds: new Set(assignments.rows.map(({ client_id }) => client_id)) };
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
