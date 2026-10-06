import "server-only";
import { createHash } from "node:crypto";
import type pg from "pg";
import { authorize, type AuthorizationContext } from "@/services/authorization";
import { databasePool } from "./database";

export class WorkflowError extends Error {
  constructor(public readonly code: "forbidden" | "not_found" | "conflict" | "invalid", message: string) {
    super(message);
    this.name = "WorkflowError";
  }
}

export interface CreateClientInput { clientCode: string; displayName: string }
export interface CreateTaxYearInput { year: number }
export interface UpsertPersonInput {
  role: "taxpayer" | "spouse";
  legalName: string;
  dateOfBirth: string | null;
  address: Record<string, unknown>;
  facts: Record<string, unknown>;
  expectedVersion: number | null;
}

export async function createClient(context: AuthorizationContext, input: CreateClientInput) {
  if (!authorize(context, "client.create", { firmId: context.firmId })) throw new WorkflowError("forbidden", "Client creation is not permitted.");
  return inTransaction(async (client) => {
    const inserted = await client.query<{ id: string; client_code: string; display_name: string; version: number }>(
      `INSERT INTO clients(firm_id,client_code,display_name) VALUES($1,$2,$3)
       RETURNING id,client_code,display_name,version`,
      [context.firmId, input.clientCode, input.displayName],
    ).catch((error: unknown) => {
      if (isUniqueViolation(error)) throw new WorkflowError("conflict", "Client code already exists in this firm.");
      throw error;
    });
    const created = inserted.rows[0];
    if (!created) throw new Error("Client insert did not return a row.");
    if (context.role !== "admin") {
      await client.query("INSERT INTO client_assignments(client_id,user_id,kind) VALUES($1,$2,'preparer') ON CONFLICT DO NOTHING", [created.id, context.userId]);
    }
    await appendAuditEvent(client, context, null, "client.created", "client", created.id, { clientCode: created.client_code });
    return created;
  });
}

export async function createTaxYear(context: AuthorizationContext, clientId: string, input: CreateTaxYearInput) {
  return inTransaction(async (client) => {
    const firmId = await authorizedClientFirm(client, context, clientId, "tax_year.create");
    const inserted = await client.query<{ id: string; tax_year: number; revision: number; preparation_status: string }>(
      `INSERT INTO tax_years(client_id,tax_year,canonical_snapshot) VALUES($1,$2,'{}'::jsonb)
       RETURNING id,tax_year,revision,preparation_status`,
      [clientId, input.year],
    ).catch((error: unknown) => {
      if (isUniqueViolation(error)) throw new WorkflowError("conflict", "This client already has that tax year.");
      throw error;
    });
    const created = inserted.rows[0];
    if (!created) throw new Error("Tax-year insert did not return a row.");
    await appendAuditEvent(client, { ...context, firmId }, created.id, "tax_year.created", "tax_year", created.id, { year: created.tax_year, revision: created.revision });
    return created;
  });
}

export async function upsertPerson(context: AuthorizationContext, clientId: string, year: number, input: UpsertPersonInput) {
  return inTransaction(async (client) => {
    const scope = await authorizedTaxYear(client, context, clientId, year, "person.modify");
    if (input.expectedVersion == null) {
      const inserted = await client.query<{ id: string; role: string; legal_name: string; version: number }>(
        `INSERT INTO people(tax_year_id,role,legal_name,date_of_birth,address,facts)
         VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb)
         RETURNING id,role,legal_name,version`,
        [scope.taxYearId, input.role, input.legalName, input.dateOfBirth, JSON.stringify(input.address), JSON.stringify(input.facts)],
      ).catch((error: unknown) => {
        if (isUniqueViolation(error)) throw new WorkflowError("conflict", "This person role already exists; reload before editing.");
        throw error;
      });
      const created = inserted.rows[0];
      if (!created) throw new Error("Person insert did not return a row.");
      await bumpTaxYearRevision(client, scope.taxYearId);
      await appendAuditEvent(client, context, scope.taxYearId, "person.created", "person", created.id, { role: created.role, version: created.version });
      return created;
    }

    const updated = await client.query<{ id: string; role: string; legal_name: string; version: number }>(
      `UPDATE people SET legal_name=$4,date_of_birth=$5,address=$6::jsonb,facts=$7::jsonb,version=version+1
       WHERE tax_year_id=$1 AND role=$2 AND version=$3
       RETURNING id,role,legal_name,version`,
      [scope.taxYearId, input.role, input.expectedVersion, input.legalName, input.dateOfBirth, JSON.stringify(input.address), JSON.stringify(input.facts)],
    );
    const person = updated.rows[0];
    if (!person) {
      const current = await client.query<{ version: number }>("SELECT version FROM people WHERE tax_year_id=$1 AND role=$2", [scope.taxYearId, input.role]);
      if (!current.rows[0]) throw new WorkflowError("not_found", "Person record was not found.");
      throw new WorkflowError("conflict", `Person changed from version ${input.expectedVersion} to ${current.rows[0].version}; reload before saving.`);
    }
    const revision = await bumpTaxYearRevision(client, scope.taxYearId);
    await appendAuditEvent(client, context, scope.taxYearId, "person.updated", "person", person.id, { role: person.role, version: person.version, taxYearRevision: revision });
    return person;
  });
}

async function authorizedClientFirm(client: pg.PoolClient, context: AuthorizationContext, clientId: string, action: "tax_year.create" | "person.modify"): Promise<string> {
  const result = await client.query<{ firm_id: string }>("SELECT firm_id FROM clients WHERE id=$1 AND archived_at IS NULL", [clientId]);
  const firmId = result.rows[0]?.firm_id;
  if (!firmId) throw new WorkflowError("not_found", "Client was not found.");
  if (firmId !== context.firmId) throw new WorkflowError("not_found", "Client was not found.");
  if (!authorize(context, action, { firmId, clientId })) throw new WorkflowError("forbidden", "Client access is not permitted.");
  return firmId;
}

async function authorizedTaxYear(client: pg.PoolClient, context: AuthorizationContext, clientId: string, year: number, action: "person.modify") {
  const firmId = await authorizedClientFirm(client, context, clientId, action);
  const result = await client.query<{ id: string }>("SELECT id FROM tax_years WHERE client_id=$1 AND tax_year=$2", [clientId, year]);
  const taxYearId = result.rows[0]?.id;
  if (!taxYearId) throw new WorkflowError("not_found", "Tax year was not found.");
  return { firmId, taxYearId };
}

async function bumpTaxYearRevision(client: pg.PoolClient, taxYearId: string): Promise<number> {
  const result = await client.query<{ revision: number }>(
    "UPDATE tax_years SET revision=revision+1,validation_status='not_run',calculation_status='stale' WHERE id=$1 RETURNING revision",
    [taxYearId],
  );
  const revision = result.rows[0]?.revision;
  if (!revision) throw new Error("Tax-year revision update failed.");
  return revision;
}

async function appendAuditEvent(
  client: pg.PoolClient,
  context: AuthorizationContext,
  taxYearId: string | null,
  eventType: string,
  recordType: string,
  recordId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [context.firmId]);
  const previous = await client.query<{ event_hash: string }>("SELECT event_hash FROM audit_events WHERE firm_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1", [context.firmId]);
  const previousHash = previous.rows[0]?.event_hash ?? null;
  const payload = JSON.stringify({ firmId: context.firmId, taxYearId, actorId: context.userId, eventType, recordType, recordId, metadata, previousHash });
  const eventHash = createHash("sha256").update(payload).digest("hex");
  await client.query(
    `INSERT INTO audit_events(firm_id,tax_year_id,actor_id,event_type,record_type,record_id,metadata,previous_hash,event_hash)
     VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`,
    [context.firmId, taxYearId, context.userId, eventType, recordType, recordId, JSON.stringify(metadata), previousHash, eventHash],
  );
}

async function inTransaction<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
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

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
