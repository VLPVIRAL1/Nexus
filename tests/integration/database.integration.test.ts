import pg from "pg";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createTaxYear, upsertPerson } from "../../src/server/client-workflow-service";
import { getClientProfile } from "../../src/server/client-repository";
import { issueSessionFromVerifiedIdentity, resolveSession, revokeSession, sha256 } from "../../src/server/session-service";
import type { AuthorizationContext } from "../../src/services/authorization";
import template from "../../examples/2025/blank-taxpayer-template.json";
import { commitPersistedImport, rollbackPersistedImport, stageCanonicalImport } from "../../src/server/import-persistence-service";

const connectionString = process.env.DATABASE_URL;
const suite = connectionString ? describe : describe.skip;

suite("PostgreSQL foundation", () => {
  it("has the foundation migration and synthetic tax year", async () => {
    const client = new pg.Client({ connectionString });
    await client.connect();
    try {
      expect((await client.query("SELECT name FROM _migrations WHERE name='0001_foundation.sql'")).rowCount).toBe(1);
      expect((await client.query("SELECT name FROM _migrations WHERE name='0002_identity_and_workflows.sql'")).rowCount).toBe(1);
      expect((await client.query("SELECT name FROM _migrations WHERE name='0003_import_history.sql'")).rowCount).toBe(1);
      const result = await client.query("SELECT tax_year, preparation_status FROM tax_years WHERE id='40000000-0000-4000-8000-000000000001'");
      expect(result.rows[0]).toEqual({ tax_year: 2025, preparation_status: "in_preparation" });
    } finally { await client.end(); }
  });

  it("enforces append-only audit history", async () => {
    const client = new pg.Client({ connectionString });
    await client.connect();
    await client.query("BEGIN");
    try {
      const inserted = await client.query<{ id: string }>("INSERT INTO audit_events(firm_id,tax_year_id,actor_id,event_type,record_type,record_id,event_hash) VALUES('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','test','tax_year','synthetic','hash') RETURNING id");
      await expect(client.query("UPDATE audit_events SET event_type='changed' WHERE id=$1", [inserted.rows[0].id])).rejects.toThrow("append-only");
    } finally { await client.query("ROLLBACK"); await client.end(); }
  });

  it("stores only hashed MFA-backed session tokens and enforces client binding and revocation", async () => {
    const userAgent = "Nexus integration test";
    const session = await issueSessionFromVerifiedIdentity({
      userId: "20000000-0000-4000-8000-000000000001",
      firmId: "10000000-0000-4000-8000-000000000001",
      mfaVerifiedAt: new Date(),
      userAgent,
    });
    const client = new pg.Client({ connectionString });
    await client.connect();
    try {
      const stored = await client.query<{ token_hash: string }>("SELECT token_hash FROM auth_sessions WHERE token_hash=$1", [sha256(session.token)]);
      expect(stored.rows[0]?.token_hash).toBe(sha256(session.token));
      expect(stored.rows[0]?.token_hash).not.toContain(session.token);
      const context = await resolveSession(session.token, userAgent);
      expect(context).toMatchObject({ userId: "20000000-0000-4000-8000-000000000001", firmId: "10000000-0000-4000-8000-000000000001", role: "preparer" });
      expect(context.assignedClientIds.has("30000000-0000-4000-8000-000000000001")).toBe(true);
      await expect(resolveSession(session.token, "different client")).rejects.toThrow("Session client changed");
      await revokeSession(session.token, "integration test");
      await expect(resolveSession(session.token, userAgent)).rejects.toThrow("expired or revoked");
    } finally {
      await client.query("DELETE FROM auth_sessions WHERE token_hash=$1", [sha256(session.token)]);
      await client.end();
    }
  });

  it("denies direct-object access across firms and detects stale person edits", async () => {
    const context: AuthorizationContext = {
      userId: "20000000-0000-4000-8000-000000000001",
      firmId: "10000000-0000-4000-8000-000000000001",
      role: "preparer",
      assignedClientIds: new Set(["30000000-0000-4000-8000-000000000001"]),
    };
    const otherFirmId = randomUUID();
    const otherClientId = randomUUID();
    const client = new pg.Client({ connectionString });
    await client.connect();
    try {
      await client.query("INSERT INTO firms(id,name) VALUES($1,'Isolation fixture')", [otherFirmId]);
      await client.query("INSERT INTO clients(id,firm_id,client_code,display_name) VALUES($1,$2,$3,'Other firm client')", [otherClientId, otherFirmId, randomUUID()]);
      expect(await getClientProfile(context, otherClientId)).toBeNull();
      await expect(createTaxYear(context, otherClientId, { year: 2025 })).rejects.toMatchObject({ code: "not_found" });
      await expect(upsertPerson(context, "30000000-0000-4000-8000-000000000001", 2025, {
        role: "taxpayer", legalName: "Stale write", dateOfBirth: null, address: {}, facts: {}, expectedVersion: 999,
      })).rejects.toMatchObject({ code: "conflict" });
    } finally {
      await client.query("DELETE FROM clients WHERE id=$1", [otherClientId]);
      await client.query("DELETE FROM firms WHERE id=$1", [otherFirmId]);
      await client.end();
    }
  });

  it("persists preview decisions, exact attempts, commit snapshots, and a guarded compensating rollback", async () => {
    const context: AuthorizationContext = {
      userId: "20000000-0000-4000-8000-000000000001",
      firmId: "10000000-0000-4000-8000-000000000001",
      role: "preparer",
      assignedClientIds: new Set(["30000000-0000-4000-8000-000000000001"]),
    };
    const payload = structuredClone(template) as Record<string, any>;
    payload.metadata = { integration_fixture: randomUUID() };
    const externalSourceId = `integration-${randomUUID()}`;
    payload.forms.w2 = [{
      id: randomUUID(), external_source_id: externalSourceId, source_document_id: randomUUID(), form_year: 2025,
      recipient_role: "taxpayer", corrected: false, void: false, raw_fields: [], unmapped_source_fields: [], version: 1,
      box1: "1000.00",
    }];
    const raw = new TextEncoder().encode(JSON.stringify(payload));
    const preview = await stageCanonicalImport(context, "30000000-0000-4000-8000-000000000001", 2025, "integration.json", raw);
    const committed = await commitPersistedImport(context, "30000000-0000-4000-8000-000000000001", 2025, preview.batchId, preview.changes.map(({ id }) => ({ changeId: id, decision: "use_imported" })));
    expect(committed.replayed).toBe(false);
    if (committed.committedRevision == null) throw new Error("Expected committed revision.");
    const replay = await stageCanonicalImport(context, "30000000-0000-4000-8000-000000000001", 2025, "integration.json", raw);
    expect(replay).toMatchObject({ batchId: preview.batchId, replayed: true, status: "committed" });
    const rollback = await rollbackPersistedImport(context, "30000000-0000-4000-8000-000000000001", 2025, preview.batchId);
    expect(rollback.rolledBackRevision).toBe(committed.committedRevision + 1);

    const client = new pg.Client({ connectionString });
    await client.connect();
    try {
      const attempts = await client.query<{ outcome: string }>("SELECT outcome FROM import_attempts WHERE import_batch_id=$1 ORDER BY created_at", [preview.batchId]);
      expect(attempts.rows.map(({ outcome }) => outcome)).toEqual(["preview_created", "committed", "commit_replayed", "rolled_back"]);
      const batch = await client.query("SELECT previous_snapshot=committed_snapshot AS snapshots_equal,rolled_back_at IS NOT NULL AS rolled_back FROM import_batches WHERE id=$1", [preview.batchId]);
      expect(batch.rows[0]).toEqual({ snapshots_equal: false, rolled_back: true });
      const sourceRecord = await client.query("SELECT effective,version,import_batch_id FROM source_form_records WHERE tax_year_id='40000000-0000-4000-8000-000000000001' AND external_source_id=$1", [externalSourceId]);
      expect(sourceRecord.rows).toEqual([{ effective: false, version: 1, import_batch_id: preview.batchId }]);
    } finally { await client.end(); }
  });
});
