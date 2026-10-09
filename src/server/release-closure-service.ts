import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type pg from "pg";
import { authorize, type AuthorizationContext } from "@/services/authorization";
import { WorkflowError } from "./client-workflow-service";
import { databasePool } from "./database";

export const releaseGateCatalog = [
  { code: "scope", title: "Product scope", description: "Signed supported profile, schema, intake registry, and no-filing pilot scope." },
  { code: "data", title: "Technical data controls", description: "Release-candidate migration, test, recovery, and performance evidence." },
  { code: "calculation", title: "Calculation approval", description: "Qualified independent review of fixtures, sources, boundaries, and the immutable rule package." },
  { code: "ui_review", title: "UI and review acceptance", description: "Manual assistive-technology and representative-preparer acceptance." },
  { code: "output", title: "Output tie-out", description: "Approved source-to-calculation-to-PDF/XLSX/JSON comparison evidence." },
  { code: "production_data", title: "Production-data authorization", description: "Scanner, encryption, monitoring, retention, recovery, and operating ownership." },
  { code: "production_auth", title: "Production authentication", description: "Supabase identities, trusted ingress, MFA, recovery, cookies, revocation, and security acceptance." },
] as const;
export type ReleaseGateCode = typeof releaseGateCatalog[number]["code"];

export const infrastructureControlCatalog = [
  { code: "supabase_auth", title: "Supabase identity and MFA" },
  { code: "trusted_ingress", title: "Trusted ingress boundary" },
  { code: "malware_scanner", title: "Malware scanner" },
  { code: "source_encryption", title: "Source encryption key" },
  { code: "monitoring_incident", title: "Monitoring and incident ownership" },
  { code: "backup_restore", title: "Backup and restore evidence" },
  { code: "retention", title: "Retention policy approval" },
  { code: "production_authorization", title: "Production-data authorization" },
] as const;
export type InfrastructureControlCode = typeof infrastructureControlCatalog[number]["code"];

type ComparisonValues = Record<string, string>;
type Decision = "approved" | "rejected";

export async function getReleaseClosureState(context: AuthorizationContext) {
  const canManage = authorize(context, "integration.configure", { firmId: context.firmId });
  const canPrepare = authorize(context, "review.create", { firmId: context.firmId });
  const canReview = authorize(context, "return.approve", { firmId: context.firmId });
  const [members, gates, fixtures, controls, assessments, sessions, tieOuts, scopes] = await Promise.all([
    databasePool().query<{ id: string; display_name: string; role: string }>(
      `SELECT u.id,u.display_name,m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.firm_id=$1 ORDER BY u.display_name`, [context.firmId]),
    databasePool().query<{ id: string; gate_code: ReleaseGateCode; gate_status: string; owner_user_id: string | null; owner_name: string | null; due_date: string | null; evidence_reference: string | null; notes: string | null; submitted_by_id: string; submitted_by: string; decided_by: string | null; decided_at: Date | null; decision_note: string | null; version: number; updated_at: Date }>(
      `SELECT g.id,g.gate_code,g.gate_status,g.owner_user_id,owner.display_name owner_name,g.due_date::text,g.evidence_reference,g.notes,
        g.submitted_by_id,submitter.display_name submitted_by,decider.display_name decided_by,g.decided_at,g.decision_note,g.version,g.updated_at
       FROM release_gate_evidence g JOIN users submitter ON submitter.id=g.submitted_by_id
       LEFT JOIN users owner ON owner.id=g.owner_user_id LEFT JOIN users decider ON decider.id=g.decided_by_id
       WHERE g.firm_id=$1 ORDER BY g.gate_code`, [context.firmId]),
    databasePool().query<{ id: string; fixture_code: string; title: string; source_reference: string; rule_package_version: string; expected_values: ComparisonValues; actual_values: ComparisonValues; mismatch_count: number; evidence_hash: string; review_status: string; prepared_by_id: string; prepared_by: string; reviewed_by: string | null; reviewed_at: Date | null; review_note: string | null; version: number; updated_at: Date }>(
      `SELECT f.id,f.fixture_code,f.title,f.source_reference,f.rule_package_version,f.expected_values,f.actual_values,f.mismatch_count,f.evidence_hash,
        f.review_status,f.prepared_by_id,preparer.display_name prepared_by,reviewer.display_name reviewed_by,f.reviewed_at,f.review_note,f.version,f.updated_at
       FROM tax_review_fixtures f JOIN users preparer ON preparer.id=f.prepared_by_id LEFT JOIN users reviewer ON reviewer.id=f.reviewed_by_id
       WHERE f.firm_id=$1 ORDER BY f.updated_at DESC LIMIT 100`, [context.firmId]),
    databasePool().query<{ id: string; control_code: InfrastructureControlCode; provider_name: string; control_status: string; evidence_reference: string; details: string; observed_at: Date; expires_at: Date | null; recorded_by: string; version: number; updated_at: Date }>(
      `SELECT e.id,e.control_code,e.provider_name,e.control_status,e.evidence_reference,e.details,e.observed_at,e.expires_at,u.display_name recorded_by,e.version,e.updated_at
       FROM infrastructure_control_evidence e JOIN users u ON u.id=e.recorded_by_id WHERE e.firm_id=$1 ORDER BY e.control_code`, [context.firmId]),
    databasePool().query<{ id: string; ready: boolean; passed_count: number; total_count: number; evidence_hash: string; assessed_at: Date; imported_by: string; created_at: Date }>(
      `SELECT a.id,a.ready,a.passed_count,a.total_count,a.evidence_hash,a.assessed_at,u.display_name imported_by,a.created_at
       FROM production_readiness_assessments a JOIN users u ON u.id=a.imported_by_id WHERE a.firm_id=$1 ORDER BY a.created_at DESC LIMIT 20`, [context.firmId]),
    databasePool().query<{ id: string; protocol_code: string; title: string; test_environment: string; participant_role: string; assistive_technology: string | null; scenarios_total: number; scenarios_passed: number; session_result: string; findings: string; evidence_reference: string; conducted_at: Date; acceptance_status: string; recorded_by_id: string; recorded_by: string; reviewed_by: string | null; reviewed_at: Date | null; review_note: string | null; version: number }>(
      `SELECT s.id,s.protocol_code,s.title,s.test_environment,s.participant_role,s.assistive_technology,s.scenarios_total,s.scenarios_passed,
        s.session_result,s.findings,s.evidence_reference,s.conducted_at,s.acceptance_status,s.recorded_by_id,recorder.display_name recorded_by,
        reviewer.display_name reviewed_by,s.reviewed_at,s.review_note,s.version
       FROM manual_acceptance_sessions s JOIN users recorder ON recorder.id=s.recorded_by_id LEFT JOIN users reviewer ON reviewer.id=s.reviewed_by_id
       WHERE s.firm_id=$1 ORDER BY s.conducted_at DESC,s.created_at DESC LIMIT 100`, [context.firmId]),
    databasePool().query<{ id: string; title: string; tax_year_id: string; client_code: string; tax_year: number; calculation_run_id: string | null; artifact_id: string | null; expected_values: ComparisonValues; actual_values: ComparisonValues; mismatch_count: number; evidence_reference: string; evidence_hash: string; tie_out_status: string; prepared_by_id: string; prepared_by: string; reviewed_by: string | null; reviewed_at: Date | null; review_note: string | null; version: number; updated_at: Date }>(
      `SELECT t.id,t.title,t.tax_year_id,c.client_code,ty.tax_year,t.calculation_run_id,t.artifact_id,t.expected_values,t.actual_values,t.mismatch_count,
        t.evidence_reference,t.evidence_hash,t.tie_out_status,t.prepared_by_id,preparer.display_name prepared_by,reviewer.display_name reviewed_by,
        t.reviewed_at,t.review_note,t.version,t.updated_at
       FROM output_tie_outs t JOIN tax_years ty ON ty.id=t.tax_year_id JOIN clients c ON c.id=ty.client_id
       JOIN users preparer ON preparer.id=t.prepared_by_id LEFT JOIN users reviewer ON reviewer.id=t.reviewed_by_id
       WHERE t.firm_id=$1 ORDER BY t.updated_at DESC LIMIT 100`, [context.firmId]),
    databasePool().query<{ tax_year_id: string; client_code: string; tax_year: number; calculation_run_id: string | null; artifact_id: string | null }>(
      `SELECT ty.id tax_year_id,c.client_code,ty.tax_year,
        (SELECT r.id FROM calculation_runs r WHERE r.tax_year_id=ty.id ORDER BY r.created_at DESC LIMIT 1) calculation_run_id,
        (SELECT a.id FROM generated_artifacts a WHERE a.tax_year_id=ty.id AND a.disposed_at IS NULL ORDER BY a.created_at DESC LIMIT 1) artifact_id
       FROM tax_years ty JOIN clients c ON c.id=ty.client_id WHERE c.firm_id=$1 AND c.archived_at IS NULL ORDER BY c.client_code,ty.tax_year DESC`, [context.firmId]),
  ]);

  const gateRows = new Map(gates.rows.map((row) => [row.gate_code, row]));
  return {
    permissions: { canManage, canPrepare, canReview, currentUserId: context.userId },
    members: members.rows.map((row) => ({ id: row.id, displayName: row.display_name, role: row.role })),
    gates: releaseGateCatalog.map((definition) => {
      const row = gateRows.get(definition.code);
      return { ...definition, id: row?.id ?? null, status: row?.gate_status ?? "pending", ownerUserId: row?.owner_user_id ?? null, ownerName: row?.owner_name ?? null, dueDate: row?.due_date ?? null, evidenceReference: row?.evidence_reference ?? "", notes: row?.notes ?? "", submittedById: row?.submitted_by_id ?? null, submittedBy: row?.submitted_by ?? null, decidedBy: row?.decided_by ?? null, decidedAt: row?.decided_at?.toISOString() ?? null, decisionNote: row?.decision_note ?? null, version: row?.version ?? null, updatedAt: row?.updated_at?.toISOString() ?? null };
    }),
    taxFixtures: fixtures.rows.map((row) => ({ id: row.id, fixtureCode: row.fixture_code, title: row.title, sourceReference: row.source_reference, rulePackageVersion: row.rule_package_version, expectedValues: row.expected_values, actualValues: row.actual_values, mismatchCount: row.mismatch_count, evidenceHash: row.evidence_hash, status: row.review_status, preparedById: row.prepared_by_id, preparedBy: row.prepared_by, reviewedBy: row.reviewed_by, reviewedAt: row.reviewed_at?.toISOString() ?? null, reviewNote: row.review_note, version: row.version, updatedAt: row.updated_at.toISOString() })),
    controls: infrastructureControlCatalog.map((definition) => {
      const row = controls.rows.find((item) => item.control_code === definition.code);
      return { ...definition, id: row?.id ?? null, providerName: row?.provider_name ?? "", status: row?.control_status ?? "pending", evidenceReference: row?.evidence_reference ?? "", details: row?.details ?? "", observedAt: row?.observed_at?.toISOString() ?? null, expiresAt: row?.expires_at?.toISOString() ?? null, recordedBy: row?.recorded_by ?? null, version: row?.version ?? null, updatedAt: row?.updated_at?.toISOString() ?? null };
    }),
    readinessAssessments: assessments.rows.map((row) => ({ id: row.id, ready: row.ready, passedCount: row.passed_count, totalCount: row.total_count, evidenceHash: row.evidence_hash, assessedAt: row.assessed_at.toISOString(), importedBy: row.imported_by, createdAt: row.created_at.toISOString() })),
    manualSessions: sessions.rows.map((row) => ({ id: row.id, protocol: row.protocol_code, title: row.title, testEnvironment: row.test_environment, participantRole: row.participant_role, assistiveTechnology: row.assistive_technology, scenariosTotal: row.scenarios_total, scenariosPassed: row.scenarios_passed, result: row.session_result, findings: row.findings, evidenceReference: row.evidence_reference, conductedAt: row.conducted_at.toISOString(), status: row.acceptance_status, recordedById: row.recorded_by_id, recordedBy: row.recorded_by, reviewedBy: row.reviewed_by, reviewedAt: row.reviewed_at?.toISOString() ?? null, reviewNote: row.review_note, version: row.version })),
    tieOuts: tieOuts.rows.map((row) => ({ id: row.id, title: row.title, taxYearId: row.tax_year_id, clientCode: row.client_code, taxYear: row.tax_year, calculationRunId: row.calculation_run_id, artifactId: row.artifact_id, expectedValues: row.expected_values, actualValues: row.actual_values, mismatchCount: row.mismatch_count, evidenceReference: row.evidence_reference, evidenceHash: row.evidence_hash, status: row.tie_out_status, preparedById: row.prepared_by_id, preparedBy: row.prepared_by, reviewedBy: row.reviewed_by, reviewedAt: row.reviewed_at?.toISOString() ?? null, reviewNote: row.review_note, version: row.version, updatedAt: row.updated_at.toISOString() })),
    scopes: scopes.rows.map((row) => ({ taxYearId: row.tax_year_id, clientCode: row.client_code, taxYear: row.tax_year, calculationRunId: row.calculation_run_id, artifactId: row.artifact_id })),
  };
}

export async function saveReleaseGate(context: AuthorizationContext, input: { gateCode: ReleaseGateCode; status: "pending" | "blocked" | "evidence_ready"; ownerUserId: string | null; dueDate: string | null; evidenceReference: string; notes: string; expectedVersion: number | null }) {
  assertAdministrator(context);
  return inTransaction(async (client) => {
    if (input.ownerUserId) await assertFirmMember(client, context.firmId, input.ownerUserId);
    const existing = await client.query<{ id: string; version: number }>("SELECT id,version FROM release_gate_evidence WHERE firm_id=$1 AND gate_code=$2 FOR UPDATE", [context.firmId, input.gateCode]);
    const current = existing.rows[0];
    assertExpectedVersion(current?.version ?? null, input.expectedVersion);
    const evidenceReference = optionalText(input.evidenceReference, 500);
    const notes = optionalText(input.notes, 4000);
    const dueDate = input.dueDate || null;
    const saved = current
      ? await client.query<{ id: string; version: number }>(`UPDATE release_gate_evidence SET gate_status=$2,owner_user_id=$3,due_date=$4,evidence_reference=$5,notes=$6,submitted_by_id=$7,decided_by_id=NULL,decided_at=NULL,decision_note=NULL,version=version+1,updated_at=now() WHERE id=$1 RETURNING id,version`, [current.id, input.status, input.ownerUserId, dueDate, evidenceReference, notes, context.userId])
      : await client.query<{ id: string; version: number }>(`INSERT INTO release_gate_evidence(firm_id,gate_code,gate_status,owner_user_id,due_date,evidence_reference,notes,submitted_by_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,version`, [context.firmId, input.gateCode, input.status, input.ownerUserId, dueDate, evidenceReference, notes, context.userId]);
    const row = saved.rows[0];
    await appendAuditEvent(client, context, "release_gate.evidence_saved", "release_gate_evidence", row.id, { gateCode: input.gateCode, status: input.status, ownerUserId: input.ownerUserId, dueDate, evidenceReference, version: row.version });
    return row;
  });
}

export async function decideReleaseGate(context: AuthorizationContext, input: { gateCode: ReleaseGateCode; expectedVersion: number; decision: Decision; note: string }) {
  return inTransaction(async (client) => {
    const gate = await client.query<{ id: string; version: number; owner_user_id: string | null; submitted_by_id: string; evidence_reference: string | null }>("SELECT id,version,owner_user_id,submitted_by_id,evidence_reference FROM release_gate_evidence WHERE firm_id=$1 AND gate_code=$2 FOR UPDATE", [context.firmId, input.gateCode]);
    const current = gate.rows[0];
    if (!current) throw new WorkflowError("not_found", "Release gate evidence was not found.");
    if (current.version !== input.expectedVersion) throw new WorkflowError("conflict", "The release gate changed; reload before deciding.");
    if (current.owner_user_id !== context.userId) throw new WorkflowError("forbidden", "Only the assigned accountable owner can decide this gate.");
    if (current.submitted_by_id === context.userId) throw new WorkflowError("forbidden", "The evidence submitter cannot approve or reject their own gate evidence.");
    if (input.decision === "approved" && !current.evidence_reference) throw new WorkflowError("conflict", "Approved gate evidence requires a controlled evidence reference.");
    const note = requiredText(input.note, 2000, "Document the release-gate decision.");
    const updated = await client.query<{ version: number }>("UPDATE release_gate_evidence SET gate_status=$2,decided_by_id=$3,decided_at=now(),decision_note=$4,version=version+1,updated_at=now() WHERE id=$1 RETURNING version", [current.id, input.decision, context.userId, note]);
    await appendAuditEvent(client, context, `release_gate.${input.decision}`, "release_gate_evidence", current.id, { gateCode: input.gateCode, decision: input.decision, version: updated.rows[0].version });
    return { id: current.id, version: updated.rows[0].version };
  });
}

export async function saveTaxReviewFixture(context: AuthorizationContext, input: { fixtureCode: string; title: string; sourceReference: string; rulePackageVersion: string; expectedValues: ComparisonValues; actualValues: ComparisonValues; expectedVersion: number | null }) {
  assertPreparer(context);
  const fixtureCode = input.fixtureCode.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{2,63}$/.test(fixtureCode)) throw new WorkflowError("invalid", "Fixture code must use 3–64 uppercase letters, numbers, underscores, or hyphens.");
  const title = requiredText(input.title, 200, "Fixture title is required.");
  const sourceReference = requiredText(input.sourceReference, 500, "A controlled source reference is required.");
  const rulePackageVersion = requiredText(input.rulePackageVersion, 100, "Rule-package version is required.");
  const expectedValues = normalizeComparisonValues(input.expectedValues);
  const actualValues = normalizeComparisonValues(input.actualValues);
  const mismatchCount = comparisonMismatchCount(expectedValues, actualValues);
  const evidenceHash = evidenceDigest({ fixtureCode, sourceReference, rulePackageVersion, expectedValues, actualValues });
  return inTransaction(async (client) => {
    const existing = await client.query<{ id: string; version: number }>("SELECT id,version FROM tax_review_fixtures WHERE firm_id=$1 AND fixture_code=$2 FOR UPDATE", [context.firmId, fixtureCode]);
    const current = existing.rows[0];
    assertExpectedVersion(current?.version ?? null, input.expectedVersion);
    const saved = current
      ? await client.query<{ id: string; version: number }>(`UPDATE tax_review_fixtures SET title=$2,source_reference=$3,rule_package_version=$4,expected_values=$5::jsonb,actual_values=$6::jsonb,mismatch_count=$7,evidence_hash=$8,review_status='ready',prepared_by_id=$9,reviewed_by_id=NULL,reviewed_at=NULL,review_note=NULL,version=version+1,updated_at=now() WHERE id=$1 RETURNING id,version`, [current.id, title, sourceReference, rulePackageVersion, JSON.stringify(expectedValues), JSON.stringify(actualValues), mismatchCount, evidenceHash, context.userId])
      : await client.query<{ id: string; version: number }>(`INSERT INTO tax_review_fixtures(firm_id,fixture_code,title,source_reference,rule_package_version,expected_values,actual_values,mismatch_count,evidence_hash,prepared_by_id) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10) RETURNING id,version`, [context.firmId, fixtureCode, title, sourceReference, rulePackageVersion, JSON.stringify(expectedValues), JSON.stringify(actualValues), mismatchCount, evidenceHash, context.userId]);
    const row = saved.rows[0];
    await appendAuditEvent(client, context, "tax_review.fixture_saved", "tax_review_fixture", row.id, { fixtureCode, rulePackageVersion, mismatchCount, evidenceHash, version: row.version });
    return { ...row, mismatchCount, evidenceHash };
  });
}

export async function decideTaxReviewFixture(context: AuthorizationContext, input: { id: string; expectedVersion: number; decision: Decision; note: string }) {
  assertReviewer(context);
  return decideIndependentRecord(context, { table: "tax_review_fixtures", id: input.id, expectedVersion: input.expectedVersion, decision: input.decision, note: input.note, preparedColumn: "prepared_by_id", statusColumn: "review_status", mismatchColumn: "mismatch_count", eventPrefix: "tax_review", recordType: "tax_review_fixture" });
}

export async function saveInfrastructureControl(context: AuthorizationContext, input: { controlCode: InfrastructureControlCode; providerName: string; status: "pending" | "pass" | "fail"; evidenceReference: string; details: string; observedAt: string; expiresAt: string | null; expectedVersion: number | null }) {
  assertAdministrator(context);
  const providerName = requiredText(input.providerName, 200, "Provider or control owner is required.");
  const evidenceReference = requiredText(input.evidenceReference, 500, "A controlled evidence reference is required.");
  const details = requiredText(input.details, 4000, "Control details are required.");
  const observedAt = requiredDate(input.observedAt, "Observation date is invalid.");
  const expiresAt = input.expiresAt ? requiredDate(input.expiresAt, "Expiry date is invalid.") : null;
  if (expiresAt && expiresAt <= observedAt) throw new WorkflowError("invalid", "Control evidence must expire after it was observed.");
  return inTransaction(async (client) => {
    const existing = await client.query<{ id: string; version: number }>("SELECT id,version FROM infrastructure_control_evidence WHERE firm_id=$1 AND control_code=$2 FOR UPDATE", [context.firmId, input.controlCode]);
    const current = existing.rows[0];
    assertExpectedVersion(current?.version ?? null, input.expectedVersion);
    const saved = current
      ? await client.query<{ id: string; version: number }>("UPDATE infrastructure_control_evidence SET provider_name=$2,control_status=$3,evidence_reference=$4,details=$5,observed_at=$6,expires_at=$7,recorded_by_id=$8,version=version+1,updated_at=now() WHERE id=$1 RETURNING id,version", [current.id, providerName, input.status, evidenceReference, details, observedAt, expiresAt, context.userId])
      : await client.query<{ id: string; version: number }>("INSERT INTO infrastructure_control_evidence(firm_id,control_code,provider_name,control_status,evidence_reference,details,observed_at,expires_at,recorded_by_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,version", [context.firmId, input.controlCode, providerName, input.status, evidenceReference, details, observedAt, expiresAt, context.userId]);
    const row = saved.rows[0];
    await appendAuditEvent(client, context, "infrastructure.control_saved", "infrastructure_control_evidence", row.id, { controlCode: input.controlCode, status: input.status, providerName, evidenceReference, observedAt: observedAt.toISOString(), expiresAt: expiresAt?.toISOString() ?? null, version: row.version });
    return row;
  });
}

export async function ingestProductionReadiness(context: AuthorizationContext, input: { ready: boolean; assessedAt: string; checks: Array<{ name: string; passed: boolean; detail: string }> }) {
  assertAdministrator(context);
  const assessedAt = requiredDate(input.assessedAt, "Readiness assessment date is invalid.");
  if (!input.checks.length || input.checks.length > 50) throw new WorkflowError("invalid", "Readiness evidence must contain 1–50 checks.");
  const checks = input.checks.map((check) => ({ name: requiredText(check.name, 200, "Every readiness check needs a name."), passed: check.passed, detail: requiredText(check.detail, 1000, "Every readiness check needs a result detail.") }));
  const passedCount = checks.filter(({ passed }) => passed).length;
  if (input.ready !== (passedCount === checks.length)) throw new WorkflowError("invalid", "The readiness result must agree with its individual checks.");
  const evidenceHash = evidenceDigest({ ready: input.ready, assessedAt: assessedAt.toISOString(), checks });
  return inTransaction(async (client) => {
    const id = randomUUID();
    await client.query("INSERT INTO production_readiness_assessments(id,firm_id,ready,passed_count,total_count,checks,evidence_hash,assessed_at,imported_by_id) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9)", [id, context.firmId, input.ready, passedCount, checks.length, JSON.stringify(checks), evidenceHash, assessedAt, context.userId]);
    await appendAuditEvent(client, context, "production_readiness.imported", "production_readiness_assessment", id, { ready: input.ready, passedCount, totalCount: checks.length, evidenceHash, assessedAt: assessedAt.toISOString() });
    return { id, ready: input.ready, passedCount, totalCount: checks.length, evidenceHash };
  });
}

export async function saveManualAcceptanceSession(context: AuthorizationContext, input: { protocol: "accessibility" | "preparer"; title: string; testEnvironment: string; participantRole: string; assistiveTechnology: string | null; scenariosTotal: number; scenariosPassed: number; result: "pass" | "partial" | "fail"; findings: string; evidenceReference: string; conductedAt: string }) {
  assertPreparer(context);
  if (!Number.isInteger(input.scenariosTotal) || input.scenariosTotal < 1 || input.scenariosTotal > 1000 || !Number.isInteger(input.scenariosPassed) || input.scenariosPassed < 0 || input.scenariosPassed > input.scenariosTotal) throw new WorkflowError("invalid", "Scenario totals are invalid.");
  if (input.result === "pass" && input.scenariosPassed !== input.scenariosTotal) throw new WorkflowError("invalid", "A passing session requires every scenario to pass.");
  const values = {
    title: requiredText(input.title, 200, "Session title is required."),
    testEnvironment: requiredText(input.testEnvironment, 500, "Test environment is required."),
    participantRole: requiredText(input.participantRole, 200, "Participant role is required."),
    assistiveTechnology: optionalText(input.assistiveTechnology, 500),
    findings: requiredText(input.findings, 4000, "Record the session findings."),
    evidenceReference: requiredText(input.evidenceReference, 500, "A controlled evidence reference is required."),
    conductedAt: requiredDate(input.conductedAt, "Session date is invalid."),
  };
  return inTransaction(async (client) => {
    const inserted = await client.query<{ id: string; version: number }>(`INSERT INTO manual_acceptance_sessions(firm_id,protocol_code,title,test_environment,participant_role,assistive_technology,scenarios_total,scenarios_passed,session_result,findings,evidence_reference,conducted_at,recorded_by_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id,version`, [context.firmId, input.protocol, values.title, values.testEnvironment, values.participantRole, values.assistiveTechnology, input.scenariosTotal, input.scenariosPassed, input.result, values.findings, values.evidenceReference, values.conductedAt, context.userId]);
    const row = inserted.rows[0];
    await appendAuditEvent(client, context, "manual_acceptance.recorded", "manual_acceptance_session", row.id, { protocol: input.protocol, result: input.result, scenariosTotal: input.scenariosTotal, scenariosPassed: input.scenariosPassed, evidenceReference: values.evidenceReference });
    return row;
  });
}

export async function decideManualAcceptanceSession(context: AuthorizationContext, input: { id: string; expectedVersion: number; decision: "signed" | "rejected"; note: string }) {
  assertReviewer(context);
  return inTransaction(async (client) => {
    const result = await client.query<{ id: string; recorded_by_id: string; version: number; session_result: string; scenarios_total: number; scenarios_passed: number }>("SELECT id,recorded_by_id,version,session_result,scenarios_total,scenarios_passed FROM manual_acceptance_sessions WHERE id=$1 AND firm_id=$2 FOR UPDATE", [input.id, context.firmId]);
    const row = result.rows[0];
    if (!row) throw new WorkflowError("not_found", "Manual acceptance session was not found.");
    if (row.version !== input.expectedVersion) throw new WorkflowError("conflict", "The acceptance session changed; reload before deciding.");
    if (row.recorded_by_id === context.userId) throw new WorkflowError("forbidden", "The session recorder cannot sign their own evidence.");
    if (input.decision === "signed" && (row.session_result !== "pass" || row.scenarios_passed !== row.scenarios_total)) throw new WorkflowError("conflict", "Only a fully passing session can be signed.");
    const note = requiredText(input.note, 2000, "Document the acceptance decision.");
    const updated = await client.query<{ version: number }>("UPDATE manual_acceptance_sessions SET acceptance_status=$2,reviewed_by_id=$3,reviewed_at=now(),review_note=$4,version=version+1,updated_at=now() WHERE id=$1 RETURNING version", [row.id, input.decision, context.userId, note]);
    await appendAuditEvent(client, context, `manual_acceptance.${input.decision}`, "manual_acceptance_session", row.id, { decision: input.decision, version: updated.rows[0].version });
    return { id: row.id, version: updated.rows[0].version };
  });
}

export async function saveOutputTieOut(context: AuthorizationContext, input: { taxYearId: string; calculationRunId: string | null; artifactId: string | null; title: string; expectedValues: ComparisonValues; actualValues: ComparisonValues; evidenceReference: string }) {
  assertPreparer(context);
  const title = requiredText(input.title, 200, "Tie-out title is required.");
  const evidenceReference = requiredText(input.evidenceReference, 500, "A controlled evidence reference is required.");
  const expectedValues = normalizeComparisonValues(input.expectedValues);
  const actualValues = normalizeComparisonValues(input.actualValues);
  const mismatchCount = comparisonMismatchCount(expectedValues, actualValues);
  const evidenceHash = evidenceDigest({ taxYearId: input.taxYearId, calculationRunId: input.calculationRunId, artifactId: input.artifactId, expectedValues, actualValues, evidenceReference });
  return inTransaction(async (client) => {
    const scope = await client.query<{ tax_year_id: string }>(
      `SELECT ty.id tax_year_id FROM tax_years ty JOIN clients c ON c.id=ty.client_id
       WHERE ty.id=$1 AND c.firm_id=$2
         AND ($3::uuid IS NULL OR EXISTS(SELECT 1 FROM calculation_runs r WHERE r.id=$3 AND r.tax_year_id=ty.id))
         AND ($4::uuid IS NULL OR EXISTS(SELECT 1 FROM generated_artifacts a WHERE a.id=$4 AND a.tax_year_id=ty.id))`,
      [input.taxYearId, context.firmId, input.calculationRunId, input.artifactId],
    );
    if (!scope.rowCount) throw new WorkflowError("not_found", "The selected tax-year, calculation, or artifact scope was not found in this firm.");
    const id = randomUUID();
    await client.query(`INSERT INTO output_tie_outs(id,firm_id,tax_year_id,calculation_run_id,artifact_id,title,expected_values,actual_values,mismatch_count,evidence_reference,evidence_hash,prepared_by_id) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12)`, [id, context.firmId, input.taxYearId, input.calculationRunId, input.artifactId, title, JSON.stringify(expectedValues), JSON.stringify(actualValues), mismatchCount, evidenceReference, evidenceHash, context.userId]);
    await appendAuditEvent(client, context, "output_tie_out.recorded", "output_tie_out", id, { taxYearId: input.taxYearId, calculationRunId: input.calculationRunId, artifactId: input.artifactId, mismatchCount, evidenceReference, evidenceHash });
    return { id, version: 1, mismatchCount, evidenceHash };
  });
}

export async function decideOutputTieOut(context: AuthorizationContext, input: { id: string; expectedVersion: number; decision: Decision; note: string }) {
  assertReviewer(context);
  return decideIndependentRecord(context, { table: "output_tie_outs", id: input.id, expectedVersion: input.expectedVersion, decision: input.decision, note: input.note, preparedColumn: "prepared_by_id", statusColumn: "tie_out_status", mismatchColumn: "mismatch_count", eventPrefix: "output_tie_out", recordType: "output_tie_out" });
}

async function decideIndependentRecord(context: AuthorizationContext, options: { table: "tax_review_fixtures" | "output_tie_outs"; id: string; expectedVersion: number; decision: Decision; note: string; preparedColumn: "prepared_by_id"; statusColumn: "review_status" | "tie_out_status"; mismatchColumn: "mismatch_count"; eventPrefix: string; recordType: string }) {
  return inTransaction(async (client) => {
    const record = await client.query<{ id: string; prepared_by_id: string; version: number; mismatch_count: number }>(`SELECT id,${options.preparedColumn} prepared_by_id,version,${options.mismatchColumn} mismatch_count FROM ${options.table} WHERE id=$1 AND firm_id=$2 FOR UPDATE`, [options.id, context.firmId]);
    const row = record.rows[0];
    if (!row) throw new WorkflowError("not_found", "Review evidence was not found.");
    if (row.version !== options.expectedVersion) throw new WorkflowError("conflict", "The evidence changed; reload before deciding.");
    if (row.prepared_by_id === context.userId) throw new WorkflowError("forbidden", "The evidence preparer cannot approve or reject their own work.");
    if (options.decision === "approved" && row.mismatch_count !== 0) throw new WorkflowError("conflict", "Resolve every comparison mismatch before approval.");
    const note = requiredText(options.note, 2000, "Document the independent review decision.");
    const updated = await client.query<{ version: number }>(`UPDATE ${options.table} SET ${options.statusColumn}=$2,reviewed_by_id=$3,reviewed_at=now(),review_note=$4,version=version+1,updated_at=now() WHERE id=$1 RETURNING version`, [row.id, options.decision, context.userId, note]);
    await appendAuditEvent(client, context, `${options.eventPrefix}.${options.decision}`, options.recordType, row.id, { decision: options.decision, mismatchCount: row.mismatch_count, version: updated.rows[0].version });
    return { id: row.id, version: updated.rows[0].version };
  });
}

export function comparisonMismatchCount(expected: ComparisonValues, actual: ComparisonValues): number {
  const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  return [...keys].filter((key) => expected[key] !== actual[key]).length;
}

function normalizeComparisonValues(values: ComparisonValues): ComparisonValues {
  if (!values || typeof values !== "object" || Array.isArray(values)) throw new WorkflowError("invalid", "Comparison values must be an object.");
  const entries = Object.entries(values);
  if (!entries.length || entries.length > 500) throw new WorkflowError("invalid", "Comparison evidence must contain 1–500 named values.");
  const normalized: ComparisonValues = {};
  for (const [rawKey, rawValue] of entries) {
    const key = rawKey.trim();
    if (!key || key.length > 200 || ["__proto__", "prototype", "constructor"].includes(key)) throw new WorkflowError("invalid", "Comparison keys must be safe and no longer than 200 characters.");
    if (typeof rawValue !== "string" || rawValue.length > 1000) throw new WorkflowError("invalid", "Comparison values must be strings no longer than 1,000 characters.");
    normalized[key] = rawValue.trim();
  }
  return Object.fromEntries(Object.entries(normalized).sort(([left], [right]) => left.localeCompare(right)));
}

function evidenceDigest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function assertExpectedVersion(current: number | null, expected: number | null) {
  if (current !== expected) throw new WorkflowError("conflict", "The evidence changed; reload before saving.");
}

async function assertFirmMember(client: pg.PoolClient, firmId: string, userId: string) {
  const membership = await client.query("SELECT 1 FROM memberships WHERE firm_id=$1 AND user_id=$2", [firmId, userId]);
  if (!membership.rowCount) throw new WorkflowError("invalid", "The selected owner is not a member of this firm.");
}

function assertAdministrator(context: AuthorizationContext) {
  if (!authorize(context, "integration.configure", { firmId: context.firmId })) throw new WorkflowError("forbidden", "This release-closure operation requires administrator permission.");
}

function assertPreparer(context: AuthorizationContext) {
  if (!authorize(context, "review.create", { firmId: context.firmId })) throw new WorkflowError("forbidden", "This evidence operation requires preparer or reviewer permission.");
}

function assertReviewer(context: AuthorizationContext) {
  if (!authorize(context, "return.approve", { firmId: context.firmId })) throw new WorkflowError("forbidden", "This decision requires reviewer permission.");
}

function requiredText(value: string, maximum: number, message: string): string {
  const text = value.trim();
  if (!text || text.length > maximum) throw new WorkflowError("invalid", message);
  return text;
}

function optionalText(value: string | null | undefined, maximum: number): string | null {
  const text = value?.trim() ?? "";
  if (text.length > maximum) throw new WorkflowError("invalid", `Text cannot exceed ${maximum.toLocaleString()} characters.`);
  return text || null;
}

function requiredDate(value: string, message: string): Date {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new WorkflowError("invalid", message);
  return date;
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
