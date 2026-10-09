import pg from "pg";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createTaxYear, upsertPerson } from "../../src/server/client-workflow-service";
import { getClientProfile, listDashboardClients } from "../../src/server/client-repository";
import { issueSessionFromVerifiedIdentity, resolveSession, revokeSession, sha256 } from "../../src/server/session-service";
import type { AuthorizationContext } from "../../src/services/authorization";
import template from "../../examples/2025/blank-taxpayer-template.json";
import { readPath, registryEntryFields, registryFieldPath, type RegistryField } from "../../src/form-registry/2025";
import { commitPersistedImport, getImportState, rollbackPersistedImport, stageCanonicalImport } from "../../src/server/import-persistence-service";
import { attestCompleteness, getIntakeState, saveExpectedDocument, saveIntakeAnswers } from "../../src/server/intake-service";
import { phase1IntakeQuestions } from "../../src/domain/intake";
import { createActivity, getMappingState, saveAllocations } from "../../src/server/mapping-persistence-service";
import { createReviewPoint, getReviewState, requestChanges, updateReviewPointStatus } from "../../src/server/review-service";
import { createOverrideRequest, getOverrideState, reviewOverride, revertOverride } from "../../src/server/override-service";
import { getCalculationState, runPersistedCalculation } from "../../src/server/calculation-service";
import { downloadPersistedArtifact, generatePersistedArtifact, getArtifactState } from "../../src/server/output-persistence-service";
import { enqueueArtifactJob, processNextArtifactJob } from "../../src/server/artifact-job-service";
import { downloadSourceDocument, getSourceDocumentState, uploadSourceDocument } from "../../src/server/source-document-service";
import { getSourceRecordState, reviseSourceRecord } from "../../src/server/source-record-service";
import { getArtifactJobMetrics } from "../../src/server/operations-service";
import { getAssignmentState, setClientAssignment } from "../../src/server/assignment-service";
import { enforceRateLimit, RateLimitError } from "../../src/server/rate-limit-service";
import { executeRetentionDisposal, getRetentionState, placeLegalHold, previewRetentionDisposal, releaseLegalHold, saveRetentionPolicy } from "../../src/server/retention-service";
import { AuthenticationAttemptLimitError, enforceAuthenticationAttemptLimit } from "../../src/server/auth-attempt-service";
import { issueProvisionedExternalIdentitySession } from "../../src/server/supabase-auth-service";

const importCollections = {
  W2: "w2",
  "1099-NEC": "form_1099_nec",
  "1099-MISC": "form_1099_misc",
  "1099-INT": "form_1099_int",
  "1099-DIV": "form_1099_div",
} as const;

function comprehensiveImportRecord(formType: keyof typeof importCollections, ordinal: number) {
  const record: Record<string, any> = {
    id: randomUUID(),
    external_source_id: `ac03-${formType.toLowerCase()}-${randomUUID()}`,
    source_document_id: randomUUID(),
    form_year: 2025,
    recipient_role: "taxpayer",
    corrected: false,
    void: false,
    raw_fields: [{ id: randomUUID(), label: `${formType} raw label`, code: "RAW", value: `raw-${ordinal}`, page: 1, reason: "Synthetic AC-03 preservation evidence" }],
    unmapped_source_fields: [{ id: randomUUID(), label: `${formType} unmapped label`, code: "UNMAPPED", value: `unmapped-${ordinal}`, page: 1, reason: "No registered destination" }],
    version: 1,
  };
  registryEntryFields(formType).forEach((field, index) => setFixturePath(record, registryFieldPath(formType, field.key), registryFixtureValue(field, ordinal, index)));
  return record;
}

function registryFixtureValue(field: RegistryField, ordinal: number, index: number): unknown {
  const seed = ordinal * 100 + index + 1;
  if (field.type === "money") return `${seed}.12`;
  if (field.type === "boolean") return true;
  if (field.type === "checkbox_group") return { statutoryEmployee: true, retirementPlan: true, thirdPartySickPay: false };
  if (field.type === "repeatable_code_money") return [{ id: randomUUID(), code: "D", amount: `${seed}.34` }, { id: randomUUID(), code: "DD", amount: `${seed + 1}.56` }];
  if (field.type === "repeatable_open_label_money") return [{ id: randomUUID(), label: "CASDI", amount: `${seed}.78`, classification: "informational" }];
  if (field.type === "repeatable_state") return [{ id: randomUUID(), state: "TX", payerStateId: `TX-${seed}`, stateIncome: `${seed}.90`, stateTaxWithheld: `${seed}.21`, stateWages: `${seed}.43` }];
  if (field.type === "repeatable_local") return [{ id: randomUUID(), localWages: `${seed}.65`, localTaxWithheld: `${seed}.87`, localityName: "Synthetic locality" }];
  if (field.key.endsWith(".tin")) return `12-345${String(seed).padStart(4, "0").slice(-4)}`;
  if (field.key.endsWith(".country")) return "US";
  if (field.key.endsWith(".stateProvince")) return "TX";
  if (field.key.endsWith(".postalCode")) return "75001";
  return `AC03 ${field.label} ${seed}`;
}

function setFixturePath(target: Record<string, any>, path: string[], value: unknown) {
  let cursor = target;
  path.forEach((segment, index) => {
    if (index === path.length - 1) cursor[segment] = value;
    else cursor = cursor[segment] ??= {};
  });
}

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
      expect((await client.query("SELECT name FROM _migrations WHERE name='0004_source_form_lineage.sql'")).rowCount).toBe(1);
      expect((await client.query("SELECT name FROM _migrations WHERE name='0005_intake_completeness.sql'")).rowCount).toBe(1);
      expect((await client.query("SELECT name FROM _migrations WHERE name='0006_mapping_integrity.sql'")).rowCount).toBe(1);
      expect((await client.query("SELECT name FROM _migrations WHERE name='0007_mapping_residual_disclosure.sql'")).rowCount).toBe(1);
      expect((await client.query("SELECT name FROM _migrations WHERE name='0008_review_workflow.sql'")).rowCount).toBe(1);
      expect((await client.query("SELECT name FROM _migrations WHERE name='0009_override_governance.sql'")).rowCount).toBe(1);
      expect((await client.query("SELECT name FROM _migrations WHERE name='0010_calculation_snapshots.sql'")).rowCount).toBe(1);
      expect((await client.query("SELECT name FROM _migrations WHERE name='0011_persisted_artifacts.sql'")).rowCount).toBe(1);
      expect((await client.query("SELECT name FROM _migrations WHERE name='0012_encrypted_source_storage.sql'")).rowCount).toBe(1);
      expect((await client.query("SELECT name FROM _migrations WHERE name='0013_source_record_lifecycle.sql'")).rowCount).toBe(1);
      expect((await client.query("SELECT name FROM _migrations WHERE name='0014_artifact_jobs.sql'")).rowCount).toBe(1);
      expect((await client.query("SELECT name FROM _migrations WHERE name='0015_api_rate_limits.sql'")).rowCount).toBe(1);
      expect((await client.query("SELECT name FROM _migrations WHERE name='0016_correction_evidence.sql'")).rowCount).toBe(1);
      expect((await client.query("SELECT name FROM _migrations WHERE name='0017_retention_governance.sql'")).rowCount).toBe(1);
      expect((await client.query("SELECT name FROM _migrations WHERE name='0018_client_list_performance.sql'")).rowCount).toBe(1);
      expect((await client.query("SELECT name FROM _migrations WHERE name='0019_retention_disposal.sql'")).rowCount).toBe(1);
      expect((await client.query("SELECT name FROM _migrations WHERE name='0020_authentication_attempt_limits.sql'")).rowCount).toBe(1);
      expect((await client.query("SELECT name FROM _migrations WHERE name='0021_expected_document_registry.sql'")).rowCount).toBe(1);
      const result = await client.query("SELECT tax_year, preparation_status FROM tax_years WHERE id='40000000-0000-4000-8000-000000000001'");
      expect(result.rows[0]?.tax_year).toBe(2025);
      expect(["in_preparation", "changes_requested"]).toContain(result.rows[0]?.preparation_status);
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

  it("bounds and prefix-filters the firm client list", async () => {
    const context: AuthorizationContext = { userId: "20000000-0000-4000-8000-000000000003", firmId: "10000000-0000-4000-8000-000000000001", role: "admin", assignedClientIds: new Set() };
    expect(await listDashboardClients(context, { limit: 1 })).toHaveLength(1);
    expect(await listDashboardClients(context, { query: "000123", limit: 10 })).toEqual([expect.objectContaining({ code: "000123" })]);
    expect(await listDashboardClients(context, { query: "no-such-prefix", limit: 10 })).toEqual([]);
  });

  it("lets only administrators manage compatible firm assignments and audits every change", async () => {
    const clientId = "30000000-0000-4000-8000-000000000001";
    const preparer: AuthorizationContext = { userId: "20000000-0000-4000-8000-000000000001", firmId: "10000000-0000-4000-8000-000000000001", role: "preparer", assignedClientIds: new Set([clientId]) };
    const admin: AuthorizationContext = { userId: "20000000-0000-4000-8000-000000000003", firmId: "10000000-0000-4000-8000-000000000001", role: "admin", assignedClientIds: new Set() };
    expect(await getAssignmentState(preparer, clientId)).toEqual({ canManage: false, members: [], assignments: [] });
    await expect(setClientAssignment(preparer, clientId, preparer.userId, "preparer", true)).rejects.toMatchObject({ code: "forbidden" });
    const before = await getAssignmentState(admin, clientId);
    expect(before.members.map(({ role }) => role)).toEqual(expect.arrayContaining(["admin", "preparer", "reviewer"]));
    await setClientAssignment(admin, clientId, admin.userId, "reviewer", true);
    let state = await getAssignmentState(admin, clientId);
    expect(state.assignments).toContainEqual({ userId: admin.userId, kind: "reviewer" });
    await expect(setClientAssignment(admin, clientId, "20000000-0000-4000-8000-000000000002", "preparer", true)).rejects.toMatchObject({ code: "invalid" });
    await setClientAssignment(admin, clientId, admin.userId, "reviewer", false);
    state = await getAssignmentState(admin, clientId);
    expect(state.assignments).not.toContainEqual({ userId: admin.userId, kind: "reviewer" });
    const database = new pg.Client({ connectionString }); await database.connect();
    const audit = await database.query("SELECT 1 FROM audit_events WHERE firm_id=$1 AND event_type='client.assignment_changed' AND record_id=$2", [admin.firmId, clientId]);
    await database.end();
    expect(audit.rowCount).toBeGreaterThanOrEqual(2);
  });

  it("governs retention policies and legal holds with versions, scope, and audit history", async () => {
    const clientId = "30000000-0000-4000-8000-000000000001";
    const preparer: AuthorizationContext = { userId: "20000000-0000-4000-8000-000000000001", firmId: "10000000-0000-4000-8000-000000000001", role: "preparer", assignedClientIds: new Set([clientId]) };
    const admin: AuthorizationContext = { userId: "20000000-0000-4000-8000-000000000003", firmId: preparer.firmId, role: "admin", assignedClientIds: new Set() };
    expect(await getRetentionState(preparer)).toEqual({ canManage: false, policies: [], holds: [], scopes: [], disposalRuns: [] });
    await expect(saveRetentionPolicy(preparer, { category: "backups", retentionMonths: 12, disposition: "review", policyBasis: "Unauthorized", expectedVersion: null })).rejects.toMatchObject({ code: "forbidden" });

    let state = await getRetentionState(admin);
    const priorPolicy = state.policies.find((policy) => policy.category === "backups");
    const saved = await saveRetentionPolicy(admin, { category: "backups", retentionMonths: 18, disposition: "review", policyBasis: "Synthetic approved backup-expiry review policy.", expectedVersion: priorPolicy?.version ?? null });
    await expect(saveRetentionPolicy(admin, { category: "backups", retentionMonths: 19, disposition: "delete", policyBasis: "Stale update.", expectedVersion: priorPolicy?.version ?? null })).rejects.toMatchObject({ code: "conflict" });
    state = await getRetentionState(admin);
    expect(state.policies.find((policy) => policy.category === "backups")).toMatchObject({ retentionMonths: 18, disposition: "review", version: saved.version });

    const scope = state.scopes.find((item) => item.clientId === clientId)!;
    const existingHold = state.holds.find((hold) => hold.taxYearId === scope.taxYearId && !hold.releasedAt);
    if (existingHold) await releaseLegalHold(admin, { holdId: existingHold.id, expectedVersion: existingHold.version, reason: "Reset repeatable synthetic integration fixture." });
    const hold = await placeLegalHold(admin, { taxYearId: scope.taxYearId, reference: `TEST-${randomUUID()}`, reason: "Preserve this synthetic return during a test matter." });
    await expect(placeLegalHold(admin, { taxYearId: scope.taxYearId, reference: "DUPLICATE", reason: "Must not overlap." })).rejects.toMatchObject({ code: "conflict" });
    const released = await releaseLegalHold(admin, { holdId: hold.id, expectedVersion: hold.version, reason: "Synthetic matter closed." });
    await expect(releaseLegalHold(admin, { holdId: hold.id, expectedVersion: hold.version, reason: "Stale release." })).rejects.toMatchObject({ code: "conflict" });
    expect(released.version).toBe(2);
    const verify = new pg.Client({ connectionString }); await verify.connect();
    const audit = await verify.query("SELECT event_type FROM audit_events WHERE record_id=ANY($1::text[])", [[hold.id, saved.id]]);
    await verify.end();
    expect(audit.rows.map((row) => row.event_type)).toEqual(expect.arrayContaining(["retention.policy_saved", "retention.legal_hold_placed", "retention.legal_hold_released"]));
  });

  it("disposes expired payloads only after rechecking legal holds and preserves immutable evidence", async () => {
    const clientId = "30000000-0000-4000-8000-000000000001";
    const taxYearId = "40000000-0000-4000-8000-000000000001";
    const admin: AuthorizationContext = { userId: "20000000-0000-4000-8000-000000000003", firmId: "10000000-0000-4000-8000-000000000001", role: "admin", assignedClientIds: new Set() };
    const preparer: AuthorizationContext = { userId: "20000000-0000-4000-8000-000000000001", firmId: admin.firmId, role: "preparer", assignedClientIds: new Set([clientId]) };
    const database = new pg.Client({ connectionString }); await database.connect();
    const batchId = randomUUID();
    await database.query(
      `INSERT INTO import_batches(id,tax_year_id,file_name,schema_version,batch_hash,base_revision,import_status,raw_payload,parsed_payload,created_at)
       VALUES($1,$2,'expired.json','1.0.0',$3,1,'previewed',$4,$5::jsonb,now()-interval '2 months')`,
      [batchId, taxYearId, randomUUID().replaceAll("-", ""), Buffer.from("synthetic expired payload"), JSON.stringify({ synthetic: true })],
    );
    try {
      let state = await getRetentionState(admin);
      for (const active of state.holds.filter((item) => item.taxYearId === taxYearId && !item.releasedAt)) await releaseLegalHold(admin, { holdId: active.id, expectedVersion: active.version, reason: "Reset repeatable disposal fixture." });
      const prior = state.policies.find((item) => item.category === "import_payloads");
      const policy = await saveRetentionPolicy(admin, { category: "import_payloads", retentionMonths: 1, disposition: "delete", policyBasis: "Synthetic approved payload-disposal fixture.", expectedVersion: prior?.version ?? null });
      const authorizationPreview = await previewRetentionDisposal(admin, "import_payloads");
      await expect(executeRetentionDisposal(preparer, { category: "import_payloads", expectedPolicyVersion: policy.version, previewCutoffAt: authorizationPreview.cutoffAt, authorizationReference: "UNAUTHORIZED", confirmation: "DELETE import_payloads" })).rejects.toMatchObject({ code: "forbidden" });
      const hold = await placeLegalHold(admin, { taxYearId, reference: `DISPOSAL-${randomUUID()}`, reason: "Prove the disposal transaction preserves held records." });
      const heldPreview = await previewRetentionDisposal(admin, "import_payloads");
      expect(heldPreview.heldCount).toBeGreaterThanOrEqual(1);
      const heldRun = await executeRetentionDisposal(admin, { category: "import_payloads", expectedPolicyVersion: policy.version, previewCutoffAt: heldPreview.cutoffAt, authorizationReference: "SYNTHETIC-HOLD-CHECK", confirmation: "DELETE import_payloads" });
      expect(heldRun.heldCount).toBeGreaterThanOrEqual(1);
      expect((await database.query("SELECT raw_payload IS NOT NULL retained FROM import_batches WHERE id=$1", [batchId])).rows[0].retained).toBe(true);
      await releaseLegalHold(admin, { holdId: hold.id, expectedVersion: hold.version, reason: "Synthetic hold check completed." });
      const releasedPreview = await previewRetentionDisposal(admin, "import_payloads");
      const disposedRun = await executeRetentionDisposal(admin, { category: "import_payloads", expectedPolicyVersion: releasedPreview.policyVersion, previewCutoffAt: releasedPreview.cutoffAt, authorizationReference: "SYNTHETIC-DISPOSAL", confirmation: "DELETE import_payloads" });
      expect(disposedRun.disposedCount).toBeGreaterThanOrEqual(1);
      expect((await database.query("SELECT raw_payload,parsed_payload,disposed_at,disposal_run_id FROM import_batches WHERE id=$1", [batchId])).rows[0]).toMatchObject({ raw_payload: null, parsed_payload: null, disposal_run_id: disposedRun.id });
      await expect(database.query("UPDATE retention_disposal_runs SET authorization_reference='changed' WHERE id=$1", [disposedRun.id])).rejects.toThrow("append-only");
      const audit = await database.query("SELECT 1 FROM audit_events WHERE event_type='retention.disposal_executed' AND record_id=$1", [disposedRun.id]);
      expect(audit.rowCount).toBe(1);
    } finally { await database.end(); }
  });

  it("persists per-user sensitive-operation limits and returns a retry interval", async () => {
    const userId = randomUUID();
    const database = new pg.Client({ connectionString }); await database.connect();
    await database.query("INSERT INTO users(id,email,display_name) VALUES($1,$2,'Synthetic Rate Test')", [userId, `${userId}@example.invalid`]);
    const context: AuthorizationContext = { userId, firmId: "10000000-0000-4000-8000-000000000001", role: "admin", assignedClientIds: new Set() };
    const now = new Date();
    try {
      for (let request = 0; request < 30; request += 1) await enforceRateLimit(context, "assignment.modify", now);
      await expect(enforceRateLimit(context, "assignment.modify", now)).rejects.toBeInstanceOf(RateLimitError);
      await expect(enforceRateLimit(context, "assignment.modify", now)).rejects.toMatchObject({ retryAfterSeconds: expect.any(Number) });
    } finally {
      await database.query("DELETE FROM api_rate_limit_windows WHERE user_id=$1", [userId]);
      await database.query("DELETE FROM users WHERE id=$1", [userId]);
      await database.end();
    }
  });

  it("throttles pre-session authentication attempts without storing network or principal identifiers", async () => {
    const marker = randomUUID();
    const networkIdentifier = `integration-network-${marker}`;
    const principalIdentifier = `Synthetic.User+${marker}@Example.Invalid`;
    const startedAt = new Date();
    const now = new Date(Math.floor(startedAt.getTime() / 1_000) * 1_000);
    const database = new pg.Client({ connectionString }); await database.connect();
    try {
      for (let request = 0; request < 10; request += 1) {
        await enforceAuthenticationAttemptLimit({ operation: "login", networkIdentifier, principalIdentifier }, now);
      }
      await expect(enforceAuthenticationAttemptLimit({ operation: "login", networkIdentifier, principalIdentifier }, now)).rejects.toBeInstanceOf(AuthenticationAttemptLimitError);
      await expect(enforceAuthenticationAttemptLimit({ operation: "login", networkIdentifier, principalIdentifier }, now)).rejects.toMatchObject({ retryAfterSeconds: expect.any(Number) });
      await expect(enforceAuthenticationAttemptLimit({ operation: "login", networkIdentifier, principalIdentifier: `other-${marker}@example.invalid` }, now)).resolves.toBeUndefined();

      const rows = await database.query<{ key_hash: string; request_count: number }>(
        "SELECT key_hash,request_count FROM authentication_attempt_windows WHERE operation_code='login' AND updated_at >= $1",
        [startedAt],
      );
      expect(rows.rows).toHaveLength(3);
      expect(rows.rows.every(({ key_hash }) => /^[0-9a-f]{64}$/.test(key_hash))).toBe(true);
      expect(JSON.stringify(rows.rows)).not.toContain(marker);
      expect(rows.rows.map(({ request_count }) => request_count)).toEqual(expect.arrayContaining([1, 13]));
    } finally {
      await database.query("DELETE FROM authentication_attempt_windows WHERE operation_code='login' AND updated_at >= $1", [startedAt]);
      await database.end();
    }
  });

  it("fails closed when production authentication throttling has no strong keyed-hash secret", async () => {
    const priorEnvironment = process.env.APP_ENV;
    const priorSecret = process.env.AUTH_RATE_LIMIT_SECRET;
    process.env.APP_ENV = "production";
    delete process.env.AUTH_RATE_LIMIT_SECRET;
    try {
      await expect(enforceAuthenticationAttemptLimit({ operation: "login", networkIdentifier: "synthetic-network", principalIdentifier: "synthetic@example.invalid" })).rejects.toThrow("AUTH_RATE_LIMIT_SECRET");
    } finally {
      if (priorEnvironment === undefined) delete process.env.APP_ENV; else process.env.APP_ENV = priorEnvironment;
      if (priorSecret === undefined) delete process.env.AUTH_RATE_LIMIT_SECRET; else process.env.AUTH_RATE_LIMIT_SECRET = priorSecret;
    }
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

  it("maps a provisioned Supabase subject to one firm membership before issuing an MFA-backed session", async () => {
    const subject = `supabase-${randomUUID()}`;
    const userAgent = "Nexus Supabase integration test";
    const now = new Date();
    const client = new pg.Client({ connectionString });
    await client.connect();
    let token: string | null = null;
    try {
      await client.query(
        "INSERT INTO external_identities(provider_code,provider_subject,user_id,linked_email) VALUES('supabase',$1,'20000000-0000-4000-8000-000000000001','maya@example.invalid')",
        [subject],
      );
      const session = await issueProvisionedExternalIdentitySession("supabase", subject, null, now, userAgent, now);
      token = session.token;
      const context = await resolveSession(session.token, userAgent, now);
      expect(context).toMatchObject({ userId: "20000000-0000-4000-8000-000000000001", firmId: "10000000-0000-4000-8000-000000000001", role: "preparer" });
      await expect(issueProvisionedExternalIdentitySession("supabase", "unprovisioned-subject", null, now, userAgent, now)).rejects.toThrow("Authentication required");
    } finally {
      if (token) await client.query("DELETE FROM auth_sessions WHERE token_hash=$1", [sha256(token)]);
      await client.query("DELETE FROM external_identities WHERE provider_code='supabase' AND provider_subject=$1", [subject]);
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
    const statusSetup = new pg.Client({ connectionString });
    await statusSetup.connect();
    await statusSetup.query("UPDATE tax_years SET preparation_status='reviewed_draft' WHERE id='40000000-0000-4000-8000-000000000001'");
    await statusSetup.end();
    const preview = await stageCanonicalImport(context, "30000000-0000-4000-8000-000000000001", 2025, "integration.json", raw);
    const committed = await commitPersistedImport(context, "30000000-0000-4000-8000-000000000001", 2025, preview.batchId, preview.changes.map(({ id }) => ({ changeId: id, decision: "use_imported" })));
    expect(committed.replayed).toBe(false);
    const statusVerification = new pg.Client({ connectionString });
    await statusVerification.connect();
    expect((await statusVerification.query<{ preparation_status: string }>("SELECT preparation_status FROM tax_years WHERE id='40000000-0000-4000-8000-000000000001'")).rows[0]?.preparation_status).toBe("changes_requested");
    await statusVerification.end();
    if (committed.committedRevision == null) throw new Error("Expected committed revision.");
    const replay = await stageCanonicalImport(context, "30000000-0000-4000-8000-000000000001", 2025, "integration.json", raw);
    expect(replay).toMatchObject({ batchId: preview.batchId, replayed: true, status: "committed" });
    const rollback = await rollbackPersistedImport(context, "30000000-0000-4000-8000-000000000001", 2025, preview.batchId);
    expect(rollback.rolledBackRevision).toBe(committed.committedRevision + 1);
    const importState=await getImportState(context,"30000000-0000-4000-8000-000000000001",2025);
    expect(importState.batches.find(({id})=>id===preview.batchId)).toMatchObject({status:"committed",resultRevision:committed.committedRevision,attemptCount:4,canRollback:false,rolledBackAt:expect.any(String)});

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

  it("round-trips every registered field and repeated row across all five source families", async () => {
    const context: AuthorizationContext = {
      userId: "20000000-0000-4000-8000-000000000001",
      firmId: "10000000-0000-4000-8000-000000000001",
      role: "preparer",
      assignedClientIds: new Set(["30000000-0000-4000-8000-000000000001"]),
    };
    const payload = structuredClone(template) as Record<string, any>;
    const expectedRecords = Object.keys(importCollections).map((formType, index) => {
      const typedForm = formType as keyof typeof importCollections;
      const record = comprehensiveImportRecord(typedForm, index + 1);
      payload.forms[importCollections[typedForm]] = [record];
      return { formType: typedForm, collection: importCollections[typedForm], record };
    });
    payload.metadata = { acceptanceScenario: "AC-03", fixtureId: randomUUID() };

    const raw = new TextEncoder().encode(JSON.stringify(payload));
    const preview = await stageCanonicalImport(context, "30000000-0000-4000-8000-000000000001", 2025, "ac03-five-form-round-trip.json", raw);
    for (const { collection, record } of expectedRecords) {
      expect(preview.changes).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: `forms.${collection}[id=${record.id}]`, kind: "add", importedValue: record }),
      ]));
    }
    const committed = await commitPersistedImport(
      context,
      "30000000-0000-4000-8000-000000000001",
      2025,
      preview.batchId,
      preview.changes.map(({ id }) => ({ changeId: id, decision: "use_imported" })),
    );
    expect(committed.replayed).toBe(false);

    for (const { formType, collection, record } of expectedRecords) {
      const committedRecord = (committed.result as any).forms[collection].find(({ id }: { id: string }) => id === record.id);
      expect(committedRecord).toBeDefined();
      for (const field of registryEntryFields(formType)) {
        const path = registryFieldPath(formType, field.key);
        expect(readPath(committedRecord, path), `${formType} ${field.key}`).toEqual(readPath(record, path));
      }
      expect(committedRecord.raw_fields).toEqual(record.raw_fields);
      expect(committedRecord.unmapped_source_fields).toEqual(record.unmapped_source_fields);
    }

    const database = new pg.Client({ connectionString });
    await database.connect();
    try {
      const persisted = await database.query<{ form_type: string; external_source_id: string; normalized_data: Record<string, unknown>; raw_fields: unknown[]; unmapped_fields: unknown[] }>(
        "SELECT form_type,external_source_id,normalized_data,raw_fields,unmapped_fields FROM source_form_records WHERE import_batch_id=$1 AND effective ORDER BY form_type",
        [preview.batchId],
      );
      expect(persisted.rowCount).toBe(5);
      expect(new Set(persisted.rows.map(({ form_type }) => form_type))).toEqual(new Set(Object.keys(importCollections)));
      for (const row of persisted.rows) {
        const expected = expectedRecords.find(({ record }) => record.external_source_id === row.external_source_id);
        expect(expected).toBeDefined();
        expect(row.normalized_data).toEqual(expected?.record);
        expect(row.raw_fields).toEqual(expected?.record.raw_fields);
        expect(row.unmapped_fields).toEqual(expected?.record.unmapped_source_fields);
      }
    } finally {
      await database.end();
    }

    if (committed.committedRevision == null) throw new Error("Expected AC-03 committed revision.");
    const calculation = await runPersistedCalculation(context, "30000000-0000-4000-8000-000000000001", 2025, committed.committedRevision);
    const artifact = await generatePersistedArtifact(context, "30000000-0000-4000-8000-000000000001", 2025, committed.committedRevision, "source_only_json");
    const downloaded = await downloadPersistedArtifact(context, "30000000-0000-4000-8000-000000000001", 2025, artifact.id);
    const exported = JSON.parse(downloaded.bytes.toString()) as { sourceForms: Array<Record<string, any>>; metadata: Record<string, unknown> };
    expect(calculation.revision).toBe(committed.committedRevision);
    expect(exported.metadata).toMatchObject({ exportMode: "source_only", exclusionManifest: expect.any(Array) });
    for (const { formType, record } of expectedRecords) {
      const exportedRecord = exported.sourceForms.find(({ external_source_id: externalId }) => externalId === record.external_source_id);
      expect(exportedRecord, `${formType} source-only export`).toBeDefined();
      for (const field of registryEntryFields(formType)) {
        const path = registryFieldPath(formType, field.key);
        expect(readPath(exportedRecord ?? {}, path), `${formType} exported ${field.key}`).toEqual(readPath(record, path));
      }
      expect(exportedRecord?.raw_fields).toEqual(record.raw_fields);
      expect(exportedRecord?.unmapped_source_fields).toEqual(record.unmapped_source_fields);
    }

    const rollback = await rollbackPersistedImport(context, "30000000-0000-4000-8000-000000000001", 2025, preview.batchId);
    expect(rollback.rolledBackRevision).toBe(committed.committedRevision + 1);
  });

  it("persists evidence-backed intake, document disposition, attestation, and revision invalidation", async () => {
    const context: AuthorizationContext = {
      userId: "20000000-0000-4000-8000-000000000001",
      firmId: "10000000-0000-4000-8000-000000000001",
      role: "preparer",
      assignedClientIds: new Set(["30000000-0000-4000-8000-000000000001"]),
    };
    const before = await getIntakeState(context, "30000000-0000-4000-8000-000000000001", 2025);
    const answered = await saveIntakeAnswers(
      context,
      "30000000-0000-4000-8000-000000000001",
      2025,
      before.revision,
      phase1IntakeQuestions.map((question) => ({ questionId: question.id, answer: question.supportedWhenYes ? "yes" as const : "no" as const, evidence: "Synthetic integration interview" })),
    );
    expect(answered.blockerCount).toBe(0);
    const uploaded = await uploadSourceDocument(context, "30000000-0000-4000-8000-000000000001", 2025, answered.revision, {
      fileName: `Synthetic intake W-2 ${randomUUID()}.pdf`, mimeType: "application/pdf", bytes: new TextEncoder().encode(`%PDF-1.4\nSynthetic intake evidence ${randomUUID()}\n%%EOF\n`), documentType: "W2",
    });
    await expect(saveExpectedDocument(context, "30000000-0000-4000-8000-000000000001", 2025, uploaded.revision, {
      registryId: "1099_int", documentKey: `1099_int.fixture_${randomUUID()}`, label: "Mismatched interest statement", status: "received", evidence: null, sourceDocumentId: uploaded.id, expectedVersion: null,
    })).rejects.toMatchObject({ code: "invalid" });
    const document = await saveExpectedDocument(context, "30000000-0000-4000-8000-000000000001", 2025, uploaded.revision, {
      registryId: "w2", documentKey: `w2.fixture_${randomUUID()}`, label: "Synthetic W-2", status: "received", evidence: null, sourceDocumentId: uploaded.id, expectedVersion: null,
    });
    const unavailable = await saveExpectedDocument(context, "30000000-0000-4000-8000-000000000001", 2025, document.revision, {
      registryId: "estimated_payment_support", documentKey: `estimated_payment_support.fixture_${randomUUID()}`, label: "Unavailable synthetic payment confirmation", status: "unavailable", evidence: "Client and preparer documented the unavailable confirmation.", sourceDocumentId: null, expectedVersion: null,
    });
    await expect(attestCompleteness(context, "30000000-0000-4000-8000-000000000001", 2025, unavailable.revision, "Synthetic preparer completeness review", null)).rejects.toMatchObject({ code: "invalid" });
    const attestation = await attestCompleteness(context, "30000000-0000-4000-8000-000000000001", 2025, unavailable.revision, "Synthetic preparer completeness review", "Client could not obtain the confirmation; preparer reviewed the payment ledger instead.");
    const complete = await getIntakeState(context, "30000000-0000-4000-8000-000000000001", 2025);
    expect(complete).toMatchObject({ revision: attestation.revision, missingQuestionIds: [], blockingQuestionIds: [], attestation: { current: true }, expectedDocuments: expect.arrayContaining([expect.objectContaining({ registryId: "w2", sourceDocumentId: uploaded.id })]), sourceDocuments: expect.arrayContaining([expect.objectContaining({ id: uploaded.id, documentType: "W2" })]), documentRegistry: expect.arrayContaining([expect.objectContaining({ id: "prior_year_return", suggested: true }), expect.objectContaining({ id: "w2" })]) });

    const invalidated = await saveIntakeAnswers(context, "30000000-0000-4000-8000-000000000001", 2025, complete.revision, [{
      questionId: "income.investment_sales", answer: "yes", evidence: "Synthetic unsupported fact",
    }]);
    expect(invalidated.blockerCount).toBe(1);
    const changed = await getIntakeState(context, "30000000-0000-4000-8000-000000000001", 2025);
    expect(changed.blockingQuestionIds).toContain("income.investment_sales");
    expect(changed.attestation?.current).toBe(false);
  });

  it("persists cent-perfect source allocations, receipt bases, unsupported blockers, and immutable mapping revisions", async () => {
    const context: AuthorizationContext = {
      userId: "20000000-0000-4000-8000-000000000001",
      firmId: "10000000-0000-4000-8000-000000000001",
      role: "preparer",
      assignedClientIds: new Set(["30000000-0000-4000-8000-000000000001"]),
    };
    const sourceRecordId = randomUUID();
    const externalSourceId = `mapping-${randomUUID()}`;
    const database = new pg.Client({ connectionString });
    await database.connect();
    await database.query(
      `INSERT INTO source_form_records(id,tax_year_id,form_type,form_year,external_source_id,owner_role,normalized_data,raw_fields,unmapped_fields)
       VALUES($1,'40000000-0000-4000-8000-000000000001','1099-NEC',2025,$2,'taxpayer',$3::jsonb,'[]'::jsonb,'[]'::jsonb)`,
      [sourceRecordId, externalSourceId, JSON.stringify({ payer: { name: "Synthetic mapping payer" }, boxes: { nonemployeeCompensation: "100.00" } })],
    );
    await database.end();

    let state = await getMappingState(context, "30000000-0000-4000-8000-000000000001", 2025);
    const supported = await createActivity(context, "30000000-0000-4000-8000-000000000001", 2025, state.revision, {
      type: "schedule_c", name: `Synthetic consulting ${randomUUID()}`, ownerRole: "taxpayer", implementationStatus: "supported",
      receiptBasis: "source_plus_additional_receipts", additionalReceipts: "25.00", receiptNote: "Synthetic cash receipts exclude all information returns",
    });
    const mapped = await saveAllocations(context, "30000000-0000-4000-8000-000000000001", 2025, sourceRecordId, "boxes.nonemployeeCompensation", supported.revision, [
      { targetType: "schedule_c", targetActivityId: supported.id, allocationMethod: "percentage", allocatedAmount: null, percentage: "33.33", reason: null, note: "Synthetic split A", status: "accepted" },
      { targetType: "schedule_c", targetActivityId: supported.id, allocationMethod: "percentage", allocatedAmount: null, percentage: "33.33", reason: null, note: "Synthetic split B", status: "accepted" },
      { targetType: "schedule_c", targetActivityId: supported.id, allocationMethod: "percentage", allocatedAmount: null, percentage: "33.34", reason: null, note: "Synthetic residual row", status: "accepted", residualRecipient: true },
    ]);
    expect(mapped.reconciliation).toMatchObject({ allocatedAmount: "100.00", unresolvedAmount: "0.00", status: "fully_mapped" });
    expect(mapped.residualRecipientIndex).toBe(2);

    const unsupported = await createActivity(context, "30000000-0000-4000-8000-000000000001", 2025, mapped.revision, {
      type: "schedule_e", name: `Synthetic rental ${randomUUID()}`, ownerRole: "taxpayer", implementationStatus: "mapping_only",
      receiptBasis: null, additionalReceipts: "0.00", receiptNote: null,
    });
    const partial = await saveAllocations(context, "30000000-0000-4000-8000-000000000001", 2025, sourceRecordId, "boxes.nonemployeeCompensation", unsupported.revision, [
      { targetType: "schedule_e", targetActivityId: unsupported.id, allocationMethod: "amount", allocatedAmount: "100.00", percentage: null, reason: null, note: "Synthetic unsupported destination", status: "accepted" },
    ]);
    expect(partial.blockerCount).toBeGreaterThan(0);
    await expect(saveAllocations(context, "30000000-0000-4000-8000-000000000001", 2025, sourceRecordId, "boxes.nonemployeeCompensation", partial.revision, [
      { targetType: "schedule_c", targetActivityId: supported.id, allocationMethod: "amount", allocatedAmount: "100.01", percentage: null, reason: null, note: null, status: "accepted" },
    ])).rejects.toMatchObject({ code: "invalid" });
    const restored = await saveAllocations(context, "30000000-0000-4000-8000-000000000001", 2025, sourceRecordId, "boxes.nonemployeeCompensation", partial.revision, [
      { targetType: "schedule_c", targetActivityId: supported.id, allocationMethod: "amount", allocatedAmount: "100.00", percentage: null, reason: null, note: "Synthetic supported restoration", status: "accepted" },
    ]);
    expect(restored.reconciliation.status).toBe("fully_mapped");
    state = await getMappingState(context, "30000000-0000-4000-8000-000000000001", 2025);
    expect(state.sources.find(({ id }) => id === sourceRecordId)?.reconciliation.status).toBe("fully_mapped");
    const historyDatabase = new pg.Client({ connectionString });
    await historyDatabase.connect();
    const history = await historyDatabase.query<{ effective: boolean }>("SELECT effective FROM source_mappings WHERE source_record_id=$1 ORDER BY version", [sourceRecordId]);
    await historyDatabase.end();
    expect(history.rows.filter(({ effective }) => effective)).toHaveLength(1);
    expect(history.rows.some(({ effective }) => !effective)).toBe(true);
  });

  it("persists assigned review points, guarded resolutions, request-changes status, audit history, and changed-after-review state", async () => {
    const preparer: AuthorizationContext = {
      userId: "20000000-0000-4000-8000-000000000001", firmId: "10000000-0000-4000-8000-000000000001", role: "preparer",
      assignedClientIds: new Set(["30000000-0000-4000-8000-000000000001"]),
    };
    const reviewer: AuthorizationContext = {
      userId: "20000000-0000-4000-8000-000000000002", firmId: "10000000-0000-4000-8000-000000000001", role: "reviewer",
      assignedClientIds: new Set(["30000000-0000-4000-8000-000000000001"]),
    };
    let state = await getReviewState(preparer, "30000000-0000-4000-8000-000000000001", 2025);
    const created = await createReviewPoint(preparer, "30000000-0000-4000-8000-000000000001", 2025, state.revision, {
      category: "confirm", subject: `Synthetic review ${randomUUID()}`, description: "Confirm the synthetic mapping evidence.", sourceRecordId: null,
      relatedForm: "Schedule C", relatedActivityId: null, ownerRole: "return", assignedUserId: reviewer.userId, dueDate: "2026-10-31",
    });
    await expect(updateReviewPointStatus(preparer, "30000000-0000-4000-8000-000000000001", 2025, created.id, created.revision, created.version, "resolved", "Preparer cannot approve this point")).rejects.toMatchObject({ code: "forbidden" });
    const changes = await requestChanges(reviewer, "30000000-0000-4000-8000-000000000001", 2025, created.id, created.revision, created.version);
    expect(changes.status).toBe("changes_requested");
    const resolved = await updateReviewPointStatus(reviewer, "30000000-0000-4000-8000-000000000001", 2025, created.id, created.revision, created.version, "resolved", "Synthetic evidence reviewed independently.");
    state = await getReviewState(reviewer, "30000000-0000-4000-8000-000000000001", 2025);
    expect(state.points.find(({ id }) => id === created.id)).toMatchObject({ status: "resolved", current: true, changedAfterReview: false, version: resolved.version });
    const activity = await createActivity(preparer, "30000000-0000-4000-8000-000000000001", 2025, state.revision, {
      type: "schedule_c", name: `Post-review change ${randomUUID()}`, ownerRole: "taxpayer", implementationStatus: "supported",
      receiptBasis: "source_plus_additional_receipts", additionalReceipts: "0.00", receiptNote: null,
    });
    const changed = await getReviewState(reviewer, "30000000-0000-4000-8000-000000000001", 2025);
    expect(changed.revision).toBe(activity.revision);
    expect(changed.points.find(({ id }) => id === created.id)).toMatchObject({ current: false, changedAfterReview: true });
    expect(changed.auditEvents.some(({ eventType }) => eventType === "review_point.resolved")).toBe(true);
    expect(changed.auditEvents.some(({ eventType }) => eventType === "review.changes_requested")).toBe(true);
  });

  it("governs registered overrides through independent approval, forced recalculation, and auditable revert", async () => {
    const preparer: AuthorizationContext = { userId: "20000000-0000-4000-8000-000000000001", firmId: "10000000-0000-4000-8000-000000000001", role: "preparer", assignedClientIds: new Set(["30000000-0000-4000-8000-000000000001"]) };
    const reviewer: AuthorizationContext = { userId: "20000000-0000-4000-8000-000000000002", firmId: "10000000-0000-4000-8000-000000000001", role: "reviewer", assignedClientIds: new Set(["30000000-0000-4000-8000-000000000001"]) };
    const before = await getOverrideState(preparer, "30000000-0000-4000-8000-000000000001", 2025);
    const calculationRunId = randomUUID();
    const database = new pg.Client({ connectionString }); await database.connect();
    await database.query(`INSERT INTO calculation_runs(id,tax_year_id,input_revision,input_hash,engine_version,rule_version,form_registry_version,calculation_status,result) VALUES($1,'40000000-0000-4000-8000-000000000001',$2,$3,'integration-engine','integration-rules','integration-forms','partial',$4::jsonb)`, [calculationRunId, before.revision, randomUUID(), JSON.stringify({ trace: [{ nodeId: "form-1040.income-tax", result: "1234" }] })]);
    await database.end();
    const requested = await createOverrideRequest(preparer, "30000000-0000-4000-8000-000000000001", 2025, before.revision, "form-1040.income-tax", "1200.00", "Synthetic worksheet exception", "Synthetic reviewer workpaper reference");
    await expect(reviewOverride(preparer, "30000000-0000-4000-8000-000000000001", 2025, requested.id, requested.revision, requested.version, "approved", "Self approval is forbidden")).rejects.toMatchObject({ code: "forbidden" });
    const approved = await reviewOverride(reviewer, "30000000-0000-4000-8000-000000000001", 2025, requested.id, requested.revision, requested.version, "approved", "Synthetic independent recalculation review");
    let state = await getOverrideState(reviewer, "30000000-0000-4000-8000-000000000001", 2025);
    expect(state.overrides.find(({ id }) => id === requested.id)).toMatchObject({ status: "approved", active: true, engineValue: "1234.00", overrideValue: "1200.00", version: approved.version });
    expect(state.currentCalculation?.current).toBe(false);
    const reverted = await revertOverride(reviewer, "30000000-0000-4000-8000-000000000001", 2025, requested.id, approved.revision, approved.version, "Synthetic revert to calculated value");
    state = await getOverrideState(reviewer, "30000000-0000-4000-8000-000000000001", 2025);
    expect(state.revision).toBe(reverted.revision);
    expect(state.overrides.find(({ id }) => id === requested.id)).toMatchObject({ status: "reverted", active: false });
    const verification = new pg.Client({ connectionString }); await verification.connect();
    const blockers = await verification.query("SELECT 1 FROM validation_issues WHERE tax_year_id='40000000-0000-4000-8000-000000000001' AND code='OVERRIDE_RECALCULATION_REQUIRED' AND resolved_at IS NULL");
    await verification.end(); expect(blockers.rowCount).toBeGreaterThan(0);
  });

  it("assembles current persisted facts into an immutable, hashed, idempotent calculation snapshot", async () => {
    const context: AuthorizationContext = { userId: "20000000-0000-4000-8000-000000000001", firmId: "10000000-0000-4000-8000-000000000001", role: "preparer", assignedClientIds: new Set(["30000000-0000-4000-8000-000000000001"]) };
    const before = await getCalculationState(context, "30000000-0000-4000-8000-000000000001", 2025);
    const run = await runPersistedCalculation(context, "30000000-0000-4000-8000-000000000001", 2025, before.revision);
    expect(run).toMatchObject({ revision: before.revision, status: "partial", replayed: false });
    expect(run.resultHash).toMatch(/^[a-f0-9]{64}$/);
    const replay = await runPersistedCalculation(context, "30000000-0000-4000-8000-000000000001", 2025, before.revision);
    expect(replay).toMatchObject({ id: run.id, revision: before.revision, status: "partial", replayed: true, resultHash: run.resultHash });
    const state = await getCalculationState(context, "30000000-0000-4000-8000-000000000001", 2025);
    expect(state.latestRun).toMatchObject({ id: run.id, inputRevision: before.revision, current: true, status: "partial", resultHash: run.resultHash });
    const database = new pg.Client({ connectionString }); await database.connect();
    const stored = await database.query<{ input_snapshot: Record<string, unknown>; result_hash: string }>("SELECT input_snapshot,result_hash FROM calculation_runs WHERE id=$1", [run.id]);
    await database.end();
    expect(stored.rows[0]?.input_snapshot).toMatchObject({ calculationId: expect.any(String), inputRevision: before.revision });
    expect(stored.rows[0]?.result_hash).toBe(run.resultHash);
  });

  it("persists content-addressed output bytes, enforces sensitive exports, replays identical jobs, and stales artifacts on change", async () => {
    const context: AuthorizationContext = { userId: "20000000-0000-4000-8000-000000000001", firmId: "10000000-0000-4000-8000-000000000001", role: "preparer", assignedClientIds: new Set(["30000000-0000-4000-8000-000000000001"]) };
    const calculation = await getCalculationState(context, "30000000-0000-4000-8000-000000000001", 2025);
    expect(calculation.latestRun?.current).toBe(true);
    const queuedPdf = await enqueueArtifactJob(context, "30000000-0000-4000-8000-000000000001", 2025, calculation.revision, "return_package_pdf");
    expect(["queued", "succeeded"]).toContain(queuedPdf.status);
    const processedPdf = queuedPdf.status === "succeeded" ? { jobId: queuedPdf.jobId, status: queuedPdf.status, artifactId: queuedPdf.artifactId, attemptCount: queuedPdf.attemptCount } : await processNextArtifactJob("integration-worker");
    expect(processedPdf).toMatchObject({ jobId: queuedPdf.jobId, status: "succeeded", artifactId: expect.any(String), attemptCount: expect.any(Number) });
    const pdf = await generatePersistedArtifact(context, "30000000-0000-4000-8000-000000000001", 2025, calculation.revision, "return_package_pdf");
    const workbook = await generatePersistedArtifact(context, "30000000-0000-4000-8000-000000000001", 2025, calculation.revision, "workpaper_xlsx");
    const sourceJson = await generatePersistedArtifact(context, "30000000-0000-4000-8000-000000000001", 2025, calculation.revision, "source_only_json");
    const blankJson = await generatePersistedArtifact(context, "30000000-0000-4000-8000-000000000001", 2025, calculation.revision, "blank_template_json");
    const admin = { ...context, role: "admin" as const, assignedClientIds: new Set<string>() };
    const completeJson = await generatePersistedArtifact(admin, "30000000-0000-4000-8000-000000000001", 2025, calculation.revision, "complete_json");
    expect(pdf).toMatchObject({ id: processedPdf?.artifactId, status: "succeeded", replayed: true, contentHash: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(workbook).toMatchObject({ status: "succeeded", replayed: false });
    expect(sourceJson).toMatchObject({ status: "succeeded", replayed: false });
    expect(blankJson).toMatchObject({ status: "succeeded", replayed: false });
    expect(completeJson).toMatchObject({ status: "succeeded", replayed: false });
    const replay = await generatePersistedArtifact(context, "30000000-0000-4000-8000-000000000001", 2025, calculation.revision, "return_package_pdf");
    expect(replay).toMatchObject({ id: pdf.id, replayed: true, contentHash: pdf.contentHash });
    await expect(generatePersistedArtifact(context, "30000000-0000-4000-8000-000000000001", 2025, calculation.revision, "complete_json")).rejects.toMatchObject({ code: "forbidden" });
    await expect(downloadPersistedArtifact(context, "30000000-0000-4000-8000-000000000001", 2025, completeJson.id)).rejects.toMatchObject({ code: "forbidden" });
    const downloadedComplete = await downloadPersistedArtifact(admin, "30000000-0000-4000-8000-000000000001", 2025, completeJson.id);
    expect(JSON.parse(downloadedComplete.bytes.toString())).toMatchObject({ clientId: "30000000-0000-4000-8000-000000000001", taxYear: 2025, revision: calculation.revision });
    const downloadedBlank = await downloadPersistedArtifact(context, "30000000-0000-4000-8000-000000000001", 2025, blankJson.id);
    expect(JSON.parse(downloadedBlank.bytes.toString())).toMatchObject({ client: {}, taxpayer: {}, source_documents: [], mappings: [] });
    const downloaded = await downloadPersistedArtifact(context, "30000000-0000-4000-8000-000000000001", 2025, pdf.id);
    expect(downloaded.mimeType).toBe("application/pdf");
    expect(downloaded.bytes.subarray(0, 4).toString()).toBe("%PDF");
    expect(downloaded.contentHash).toBe(pdf.contentHash);
    let state = await getArtifactState(context, "30000000-0000-4000-8000-000000000001", 2025);
    expect(state.canExportComplete).toBe(false);
    expect(state.jobs.find(({ id }) => id === queuedPdf.jobId)).toMatchObject({ status: "succeeded", artifactId: pdf.id });
    expect(state.artifacts.filter(({ stale }) => !stale).map(({ id }) => id)).toEqual(expect.arrayContaining([pdf.id, workbook.id, sourceJson.id, blankJson.id, completeJson.id]));
    await createActivity(context, "30000000-0000-4000-8000-000000000001", 2025, calculation.revision, {
      type: "schedule_c", name: `Artifact invalidation ${randomUUID()}`, ownerRole: "taxpayer", implementationStatus: "supported",
      receiptBasis: "source_plus_additional_receipts", additionalReceipts: "0.00", receiptNote: null,
    });
    state = await getArtifactState(context, "30000000-0000-4000-8000-000000000001", 2025);
    expect(state.artifacts.find(({ id }) => id === pdf.id)?.stale).toBe(true);
    expect(state.jobs.find(({ id }) => id === queuedPdf.jobId)?.status).toBe("stale");
    await expect(getArtifactJobMetrics(context)).rejects.toMatchObject({ code: "forbidden" });
    const metrics = await getArtifactJobMetrics({ ...context, role: "admin", assignedClientIds: new Set() });
    expect(metrics.counts.stale).toBeGreaterThan(0);
    expect(metrics.recentFailures).toBeInstanceOf(Array);
  });

  it("quarantines, scans, encrypts, authorizes, verifies, and duplicate-flags persisted source originals", async () => {
    const context: AuthorizationContext = { userId: "20000000-0000-4000-8000-000000000001", firmId: "10000000-0000-4000-8000-000000000001", role: "preparer", assignedClientIds: new Set(["30000000-0000-4000-8000-000000000001"]) };
    const before=await getSourceDocumentState(context,"30000000-0000-4000-8000-000000000001",2025);
    const bytes=new TextEncoder().encode(`%PDF-1.4\nSynthetic integration source ${randomUUID()}\n%%EOF\n`);
    const first=await uploadSourceDocument(context,"30000000-0000-4000-8000-000000000001",2025,before.revision,{fileName:"../Synthetic W-2.pdf",mimeType:"application/pdf",bytes,documentType:"W2"});
    expect(first.possibleDuplicateOf).toBeNull();
    const downloaded=await downloadSourceDocument(context,"30000000-0000-4000-8000-000000000001",2025,first.id);
    expect(downloaded.fileName).toBe("Synthetic W-2.pdf");
    expect(downloaded.bytes).toEqual(Buffer.from(bytes));
    await expect(downloadSourceDocument({...context,role:"read_only"},"30000000-0000-4000-8000-000000000001",2025,first.id)).rejects.toMatchObject({code:"forbidden"});
    const second=await uploadSourceDocument(context,"30000000-0000-4000-8000-000000000001",2025,first.revision,{fileName:"duplicate.pdf",mimeType:"application/pdf",bytes,documentType:"W2"});
    expect(second.possibleDuplicateOf).toBe(first.id);
    const state=await getSourceDocumentState(context,"30000000-0000-4000-8000-000000000001",2025);
    expect(state.documents.find(({id})=>id===first.id)).toMatchObject({scanState:"clean",scannerVersion:"development-static-v1",possibleDuplicate:true});
    const database=new pg.Client({connectionString});await database.connect();
    const stored=await database.query<{object_state:string;cipher_bytes:Buffer}>("SELECT object_state,cipher_bytes FROM source_object_blobs WHERE id=(SELECT storage_id::uuid FROM source_documents WHERE id=$1)",[first.id]);
    const issue=await database.query("SELECT 1 FROM validation_issues WHERE record_id=$1 AND code='POSSIBLE_DUPLICATE_SOURCE' AND resolved_at IS NULL",[second.id]);
    await database.end();
    expect(stored.rows[0]?.object_state).toBe("promoted");
    expect(stored.rows[0]?.cipher_bytes.includes(Buffer.from("Synthetic integration source"))).toBe(false);
    expect(issue.rowCount).toBe(1);
    await expect(uploadSourceDocument(context,"30000000-0000-4000-8000-000000000001",2025,second.revision,{fileName:"active.pdf",mimeType:"application/pdf",bytes:new TextEncoder().encode("%PDF-1.4 /OpenAction"),documentType:"OTHER"})).rejects.toMatchObject({code:"invalid"});
  });

  it("reconciles correction evidence and versions source lineage without double-counting history", async () => {
    const clientId = "30000000-0000-4000-8000-000000000001";
    const context: AuthorizationContext = { userId: "20000000-0000-4000-8000-000000000001", firmId: "10000000-0000-4000-8000-000000000001", role: "preparer", assignedClientIds: new Set([clientId]) };
    const externalSourceId = `lifecycle-${randomUUID()}`;
    const originalId = randomUUID();
    const database = new pg.Client({ connectionString });
    await database.connect();
    await database.query(
      `INSERT INTO source_form_records(id,tax_year_id,form_type,form_year,external_source_id,owner_role,normalized_data,raw_fields,unmapped_fields,record_disposition)
       VALUES($1,'40000000-0000-4000-8000-000000000001','1099-INT',2025,$2,'taxpayer',$3::jsonb,'[]','[]','original')`,
      [originalId, externalSourceId, JSON.stringify({ payer: { name: "Lifecycle Bank", tin: "12-3456789" }, accountNumber: "ACCT-12345678", boxes: { interestIncome: "10.00" } })],
    );
    await database.end();

    const documentsBefore = await getSourceDocumentState(context, clientId, 2025);
    const correctionDocument = await uploadSourceDocument(context, clientId, 2025, documentsBefore.revision, {
      fileName: "Corrected 1099-INT.pdf",
      mimeType: "application/pdf",
      bytes: new TextEncoder().encode(`%PDF-1.4\nCorrected 1099-INT ${randomUUID()}\n%%EOF\n`),
      documentType: "1099-INT",
    });
    const before = await getSourceRecordState(context, clientId, 2025);
    expect(before.documents).toContainEqual(expect.objectContaining({ id: correctionDocument.id, scanState: "clean" }));
    const originalView = before.records.find(({ id }) => id === originalId)!;
    expect(originalView.normalizedData).toMatchObject({ payer: { tin: "***-**-6789" }, accountNumber: "****5678" });
    const correctedData = structuredClone(originalView.normalizedData);
    (correctedData.boxes as Record<string, unknown>).interestIncome = "11.00";

    await expect(reviseSourceRecord(context, clientId, 2025, originalId, before.revision, 1, "correct", "Unsafe correction", JSON.parse('{"__proto__":{"polluted":true}}'))).rejects.toMatchObject({ code: "invalid" });
    await expect(reviseSourceRecord(context, clientId, 2025, originalId, before.revision, 1, "correct", "Unauthorized TIN change", { ...correctedData, payer: { ...(correctedData.payer as object), tin: "98-7654321" } })).rejects.toMatchObject({ code: "forbidden" });
    await expect(reviseSourceRecord(context, clientId, 2025, originalId, before.revision, 1, "correct", "Missing evidence", correctedData, "spouse")).rejects.toMatchObject({ code: "invalid" });
    const corrected = await reviseSourceRecord(context, clientId, 2025, originalId, before.revision, 1, "correct", "Synthetic source correction", correctedData, "spouse", "attached_document", correctionDocument.id);
    expect(corrected).toMatchObject({ version: 2, disposition: "corrected" });
    await expect(reviseSourceRecord(context, clientId, 2025, originalId, corrected.revision, 1, "void", "Stale version attempt", null)).rejects.toMatchObject({ code: "conflict" });
    const excluded = await reviseSourceRecord(context, clientId, 2025, corrected.id, corrected.revision, 2, "exclude_duplicate", "Confirmed duplicate of another bank statement", null);
    expect(excluded).toMatchObject({ version: 3, disposition: "duplicate_excluded" });

    const state = await getSourceRecordState(context, clientId, 2025);
    const lineage = state.records.filter((record) => record.externalSourceId === externalSourceId);
    expect(lineage).toHaveLength(3);
    expect(lineage.find((record) => record.id === corrected.id)).toMatchObject({ ownerRole: "spouse", sourceDocumentId: correctionDocument.id, correctionEvidenceMode: "attached_document" });
    expect(lineage.filter((record) => record.effective)).toEqual([expect.objectContaining({ id: excluded.id, disposition: "duplicate_excluded" })]);
    const verify = new pg.Client({ connectionString });
    await verify.connect();
    const contributing = await verify.query("SELECT id FROM source_form_records WHERE external_source_id=$1 AND effective AND NOT void AND record_disposition NOT IN ('void','duplicate_excluded')", [externalSourceId]);
    const persisted = await verify.query<{ normalized_data: Record<string, any>; owner_role: string; source_document_id: string; correction_evidence_mode: string }>("SELECT normalized_data,owner_role,source_document_id,correction_evidence_mode FROM source_form_records WHERE id=$1", [corrected.id]);
    const audits = await verify.query<{ event_type: string; metadata: Record<string, unknown> }>("SELECT event_type,metadata FROM audit_events WHERE record_id=ANY($1::text[])", [[corrected.id, excluded.id]]);
    await verify.end();
    expect(contributing.rowCount).toBe(0);
    expect(persisted.rows[0]).toMatchObject({ owner_role: "spouse", source_document_id: correctionDocument.id, correction_evidence_mode: "attached_document", normalized_data: { payer: { tin: "12-3456789" }, accountNumber: "ACCT-12345678" } });
    expect(audits.rows.map((row) => row.event_type)).toEqual(expect.arrayContaining(["source_record.corrected", "source_record.duplicate_excluded"]));
    expect(audits.rows.find((row) => row.event_type === "source_record.corrected")?.metadata).toMatchObject({ correctionEvidenceMode: "attached_document", sourceDocumentId: correctionDocument.id });
  });
});
