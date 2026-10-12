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

export interface PersonProfileRecord {
  role: "taxpayer" | "spouse";
  legalName: string;
  dateOfBirth: string | null;
  address: Record<string, unknown>;
  facts: Record<string, unknown>;
  version: number;
}

export async function getPeopleState(context: AuthorizationContext, clientId: string, year: number) {
  const client = await databasePool().connect();
  try {
    const scope = await authorizedTaxYear(client, context, clientId, year, "client.view", false);
    const result = await client.query<{
      role: "taxpayer" | "spouse"; legal_name: string; date_of_birth: string | null;
      address: Record<string, unknown>; facts: Record<string, unknown>; version: number;
    }>("SELECT role,legal_name,date_of_birth::text,address,facts,version FROM people WHERE tax_year_id=$1 AND role IN ('taxpayer','spouse') ORDER BY CASE role WHEN 'taxpayer' THEN 1 ELSE 2 END", [scope.taxYearId]);
    return {
      revision: scope.revision,
      people: result.rows.map((row): PersonProfileRecord => ({
        role: row.role,
        legalName: row.legal_name,
        dateOfBirth: row.date_of_birth,
        address: row.address,
        facts: row.facts,
        version: row.version,
      })),
    };
  } finally {
    client.release();
  }
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
    await client.query("INSERT INTO return_profiles(tax_year_id) VALUES($1) ON CONFLICT DO NOTHING", [created.id]);
    await appendAuditEvent(client, { ...context, firmId }, created.id, "tax_year.created", "tax_year", created.id, { year: created.tax_year, revision: created.revision });
    return created;
  });
}

export async function upsertPerson(context: AuthorizationContext, clientId: string, year: number, input: UpsertPersonInput) {
  return inTransaction(async (client) => {
    const scope = await authorizedTaxYear(client, context, clientId, year, "person.modify", true);
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
      const revision = await bumpTaxYearRevision(client, scope.taxYearId, withCanonicalPerson(scope.canonicalSnapshot, input));
      await appendAuditEvent(client, context, scope.taxYearId, "person.created", "person", created.id, { role: created.role, version: created.version, taxYearRevision: revision });
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
    const revision = await bumpTaxYearRevision(client, scope.taxYearId, withCanonicalPerson(scope.canonicalSnapshot, input));
    await appendAuditEvent(client, context, scope.taxYearId, "person.updated", "person", person.id, { role: person.role, version: person.version, taxYearRevision: revision });
    return person;
  });
}

export async function deleteSpouse(context: AuthorizationContext, clientId: string, year: number, expectedVersion: number) {
  return inTransaction(async (client) => {
    const scope = await authorizedTaxYear(client, context, clientId, year, "person.modify", true);
    await client.query("UPDATE source_form_records SET owner_person_id=NULL WHERE tax_year_id=$1 AND owner_person_id=(SELECT id FROM people WHERE tax_year_id=$1 AND role='spouse' AND version=$2)", [scope.taxYearId, expectedVersion]);
    const deleted = await client.query<{ id: string }>("DELETE FROM people WHERE tax_year_id=$1 AND role='spouse' AND version=$2 RETURNING id", [scope.taxYearId, expectedVersion]);
    const spouse = deleted.rows[0];
    if (!spouse) {
      const current = await client.query<{ version: number }>("SELECT version FROM people WHERE tax_year_id=$1 AND role='spouse'", [scope.taxYearId]);
      if (!current.rows[0]) throw new WorkflowError("not_found", "Spouse profile was not found.");
      throw new WorkflowError("conflict", `Spouse profile changed from version ${expectedVersion} to ${current.rows[0].version}; reload before removing it.`);
    }
    const revision = await bumpTaxYearRevision(client, scope.taxYearId, { ...scope.canonicalSnapshot, spouse: null });
    await appendAuditEvent(client, context, scope.taxYearId, "person.removed", "person", spouse.id, { role: "spouse", version: expectedVersion, taxYearRevision: revision });
    return { id: spouse.id, revision };
  });
}

async function authorizedClientFirm(client: pg.PoolClient, context: AuthorizationContext, clientId: string, action: "tax_year.create" | "person.modify" | "client.view"): Promise<string> {
  const result = await client.query<{ firm_id: string }>("SELECT firm_id FROM clients WHERE id=$1 AND archived_at IS NULL", [clientId]);
  const firmId = result.rows[0]?.firm_id;
  if (!firmId) throw new WorkflowError("not_found", "Client was not found.");
  if (firmId !== context.firmId) throw new WorkflowError("not_found", "Client was not found.");
  if (!authorize(context, action, { firmId, clientId })) throw new WorkflowError("forbidden", "Client access is not permitted.");
  return firmId;
}

async function authorizedTaxYear(client: pg.PoolClient, context: AuthorizationContext, clientId: string, year: number, action: "person.modify" | "client.view", lock: boolean) {
  const firmId = await authorizedClientFirm(client, context, clientId, action);
  const result = await client.query<{ id: string; revision: number; canonical_snapshot: Record<string, unknown> }>(`SELECT id,revision,canonical_snapshot FROM tax_years WHERE client_id=$1 AND tax_year=$2 ${lock ? "FOR UPDATE" : ""}`, [clientId, year]);
  const row = result.rows[0];
  if (!row) throw new WorkflowError("not_found", "Tax year was not found.");
  return { firmId, taxYearId: row.id, revision: row.revision, canonicalSnapshot: row.canonical_snapshot };
}

async function bumpTaxYearRevision(client: pg.PoolClient, taxYearId: string, canonicalSnapshot: Record<string, unknown>): Promise<number> {
  const result = await client.query<{ revision: number }>(
    `UPDATE tax_years SET revision=revision+1,canonical_snapshot=$2::jsonb,validation_status='not_run',calculation_status='stale',
     preparation_status=CASE WHEN preparation_status IN ('ready_for_review','reviewed_draft') THEN 'changes_requested' ELSE preparation_status END
     WHERE id=$1 RETURNING revision`,
    [taxYearId, JSON.stringify(canonicalSnapshot)],
  );
  const revision = result.rows[0]?.revision;
  if (!revision) throw new Error("Tax-year revision update failed.");
  return revision;
}

function withCanonicalPerson(snapshot: Record<string, unknown>, input: UpsertPersonInput): Record<string, unknown> {
  return {
    ...snapshot,
    [input.role]: {
      legal_name: input.legalName,
      date_of_birth: input.dateOfBirth,
      address: input.address,
      facts: input.facts,
    },
  };
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
