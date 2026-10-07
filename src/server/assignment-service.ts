import "server-only";
import { createHash } from "node:crypto";
import type pg from "pg";
import { authorize, type AuthorizationContext, type Role } from "@/services/authorization";
import { WorkflowError } from "./client-workflow-service";
import { databasePool } from "./database";

export type AssignmentKind = "preparer" | "reviewer" | "read_only";
export interface AssignmentState {
  canManage: boolean;
  members: Array<{ id: string; displayName: string; email: string; role: Role; allowedKinds: AssignmentKind[] }>;
  assignments: Array<{ userId: string; kind: AssignmentKind }>;
}

export async function getAssignmentState(context: AuthorizationContext, clientId: string): Promise<AssignmentState> {
  const client = await databasePool().connect();
  try {
    await authorizedClient(client, context, clientId, "client.view");
    const canManage = authorize(context, "assignment.manage", { firmId: context.firmId, clientId });
    if (!canManage) return { canManage, members: [], assignments: [] };
    const [members, assignments] = await Promise.all([
      client.query<{ id: string; display_name: string; email: string; role: Role }>("SELECT u.id,u.display_name,u.email,m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.firm_id=$1 ORDER BY u.display_name,u.id", [context.firmId]),
      client.query<{ user_id: string; kind: AssignmentKind }>("SELECT user_id,kind FROM client_assignments WHERE client_id=$1 ORDER BY user_id,kind", [clientId]),
    ]);
    return { canManage, members: members.rows.map((row) => ({ id: row.id, displayName: row.display_name, email: row.email, role: row.role, allowedKinds: allowedKinds(row.role) })), assignments: assignments.rows.map((row) => ({ userId: row.user_id, kind: row.kind })) };
  } finally { client.release(); }
}

export async function setClientAssignment(context: AuthorizationContext, clientId: string, userId: string, kind: AssignmentKind, assigned: boolean) {
  return inTransaction(async (client) => {
    await authorizedClient(client, context, clientId, "assignment.manage");
    const member = await client.query<{ role: Role }>("SELECT role FROM memberships WHERE firm_id=$1 AND user_id=$2", [context.firmId, userId]);
    const role = member.rows[0]?.role;
    if (!role) throw new WorkflowError("invalid", "The selected user is not a member of this firm.");
    if (!allowedKinds(role).includes(kind)) throw new WorkflowError("invalid", `A ${role.replaceAll("_", " ")} member cannot hold the ${kind.replaceAll("_", " ")} assignment.`);
    if (assigned) await client.query("INSERT INTO client_assignments(client_id,user_id,kind) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [clientId, userId, kind]);
    else await client.query("DELETE FROM client_assignments WHERE client_id=$1 AND user_id=$2 AND kind=$3", [clientId, userId, kind]);
    await appendAuditEvent(client, context, "client.assignment_changed", "client", clientId, { assignedUserId: userId, assignmentKind: kind, assigned });
    return { clientId, userId, kind, assigned };
  });
}

function allowedKinds(role: Role): AssignmentKind[] {
  if (role === "admin") return ["preparer", "reviewer", "read_only"];
  if (role === "preparer") return ["preparer", "read_only"];
  if (role === "reviewer") return ["reviewer", "read_only"];
  return ["read_only"];
}

async function authorizedClient(client: pg.PoolClient, context: AuthorizationContext, clientId: string, action: "client.view" | "assignment.manage") {
  const result = await client.query<{ firm_id: string }>("SELECT firm_id FROM clients WHERE id=$1 AND firm_id=$2 AND archived_at IS NULL", [clientId, context.firmId]);
  const row = result.rows[0];
  if (!row) throw new WorkflowError("not_found", "Client was not found.");
  if (!authorize(context, action, { firmId: row.firm_id, clientId })) throw new WorkflowError("forbidden", "Client assignment access is not permitted.");
}

async function appendAuditEvent(client: pg.PoolClient, context: AuthorizationContext, eventType: string, recordType: string, recordId: string, metadata: Record<string, unknown>) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [context.firmId]);
  const previous = await client.query<{ event_hash: string }>("SELECT event_hash FROM audit_events WHERE firm_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1", [context.firmId]);
  const previousHash = previous.rows[0]?.event_hash ?? null;
  const payload = JSON.stringify({ firmId: context.firmId, taxYearId: null, actorId: context.userId, eventType, recordType, recordId, metadata, previousHash });
  const eventHash = createHash("sha256").update(payload).digest("hex");
  await client.query("INSERT INTO audit_events(firm_id,tax_year_id,actor_id,event_type,record_type,record_id,metadata,previous_hash,event_hash) VALUES($1,NULL,$2,$3,$4,$5,$6::jsonb,$7,$8)", [context.firmId, context.userId, eventType, recordType, recordId, JSON.stringify(metadata), previousHash, eventHash]);
}

async function inTransaction<T>(work: (client: pg.PoolClient) => Promise<T>) {
  const client = await databasePool().connect();
  try { await client.query("BEGIN"); const result = await work(client); await client.query("COMMIT"); return result; }
  catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
