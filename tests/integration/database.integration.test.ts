import pg from "pg";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createTaxYear, upsertPerson } from "../../src/server/client-workflow-service";
import { getClientProfile } from "../../src/server/client-repository";
import { issueSessionFromVerifiedIdentity, resolveSession, revokeSession, sha256 } from "../../src/server/session-service";
import type { AuthorizationContext } from "../../src/services/authorization";
import template from "../../examples/2025/blank-taxpayer-template.json";
import { commitPersistedImport, rollbackPersistedImport, stageCanonicalImport } from "../../src/server/import-persistence-service";
import { attestCompleteness, getIntakeState, saveExpectedDocument, saveIntakeAnswers } from "../../src/server/intake-service";
import { phase1IntakeQuestions } from "../../src/domain/intake";
import { createActivity, getMappingState, saveAllocations } from "../../src/server/mapping-persistence-service";
import { createReviewPoint, getReviewState, requestChanges, updateReviewPointStatus } from "../../src/server/review-service";
import { createOverrideRequest, getOverrideState, reviewOverride, revertOverride } from "../../src/server/override-service";
import { getCalculationState, runPersistedCalculation } from "../../src/server/calculation-service";
import { downloadPersistedArtifact, generatePersistedArtifact, getArtifactState } from "../../src/server/output-persistence-service";
import { downloadSourceDocument, getSourceDocumentState, uploadSourceDocument } from "../../src/server/source-document-service";

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
    const document = await saveExpectedDocument(context, "30000000-0000-4000-8000-000000000001", 2025, answered.revision, {
      documentKey: `fixture.${randomUUID()}`, label: "Synthetic W-2", status: "received", evidence: "Synthetic source inventory", sourceDocumentId: null, expectedVersion: null,
    });
    const attestation = await attestCompleteness(context, "30000000-0000-4000-8000-000000000001", 2025, document.revision, "Synthetic preparer completeness review", null);
    const complete = await getIntakeState(context, "30000000-0000-4000-8000-000000000001", 2025);
    expect(complete).toMatchObject({ revision: attestation.revision, missingQuestionIds: [], blockingQuestionIds: [], attestation: { current: true } });

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
    const pdf = await generatePersistedArtifact(context, "30000000-0000-4000-8000-000000000001", 2025, calculation.revision, "return_package_pdf");
    const workbook = await generatePersistedArtifact(context, "30000000-0000-4000-8000-000000000001", 2025, calculation.revision, "workpaper_xlsx");
    const sourceJson = await generatePersistedArtifact(context, "30000000-0000-4000-8000-000000000001", 2025, calculation.revision, "source_only_json");
    expect(pdf).toMatchObject({ status: "succeeded", replayed: false, contentHash: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(workbook).toMatchObject({ status: "succeeded", replayed: false });
    expect(sourceJson).toMatchObject({ status: "succeeded", replayed: false });
    const replay = await generatePersistedArtifact(context, "30000000-0000-4000-8000-000000000001", 2025, calculation.revision, "return_package_pdf");
    expect(replay).toMatchObject({ id: pdf.id, replayed: true, contentHash: pdf.contentHash });
    await expect(generatePersistedArtifact(context, "30000000-0000-4000-8000-000000000001", 2025, calculation.revision, "complete_json")).rejects.toMatchObject({ code: "forbidden" });
    const downloaded = await downloadPersistedArtifact(context, "30000000-0000-4000-8000-000000000001", 2025, pdf.id);
    expect(downloaded.mimeType).toBe("application/pdf");
    expect(downloaded.bytes.subarray(0, 4).toString()).toBe("%PDF");
    expect(downloaded.contentHash).toBe(pdf.contentHash);
    let state = await getArtifactState(context, "30000000-0000-4000-8000-000000000001", 2025);
    expect(state.canExportComplete).toBe(false);
    expect(state.artifacts.filter(({ stale }) => !stale).map(({ id }) => id)).toEqual(expect.arrayContaining([pdf.id, workbook.id, sourceJson.id]));
    await createActivity(context, "30000000-0000-4000-8000-000000000001", 2025, calculation.revision, {
      type: "schedule_c", name: `Artifact invalidation ${randomUUID()}`, ownerRole: "taxpayer", implementationStatus: "supported",
      receiptBasis: "source_plus_additional_receipts", additionalReceipts: "0.00", receiptNote: null,
    });
    state = await getArtifactState(context, "30000000-0000-4000-8000-000000000001", 2025);
    expect(state.artifacts.find(({ id }) => id === pdf.id)?.stale).toBe(true);
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
});
