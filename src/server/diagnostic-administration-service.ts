import "server-only";
import { authorize, type AuthorizationContext } from "@/services/authorization";
import { databasePool } from "./database";

export async function getDiagnosticAdministrationState(context: AuthorizationContext) {
  if (!authorize(context, "integration.configure", { firmId: context.firmId })) return { canManage: false as const, scope: { taxYear: 2025, jurisdiction: "Federal", filingChannel: "Preparation and paper draft" }, summary: { definitionCount: 0, authorityVerifiedCount: 0, authorityGapCount: 0, conditionCount: 0, fixtureCompleteCount: 0, fixtureGapCount: 0, occurrenceCount: 0, openOccurrenceCount: 0 }, definitions: [], externalGates: [], releases: [] };
  const [definitions, summary, gates, releases] = await Promise.all([
    databasePool().query<{
      id: string; code: string; definition_version: number; tax_year: number; diagnostic_class: string;
      default_severity: string; evaluation_stage: string; support_state: string; affected_forms: string[];
      authority_review_status: string; owner: string; definition_hash: string; source_metadata: Record<string, unknown>;
      authority_count: string; condition_count: string; fixture_complete_count: string;
    }>(`SELECT dd.id,dd.code,dd.definition_version,dd.tax_year,dd.diagnostic_class,dd.default_severity,
        dd.evaluation_stage,dd.support_state,dd.affected_forms,dd.authority_review_status,dd.owner,
        dd.definition_hash,dd.source_metadata,
        count(DISTINCT dda.authority_id)::text authority_count,
        count(DISTINCT dc.id)::text condition_count,
        count(DISTINCT dc.id) FILTER (WHERE dc.positive_fixture_id IS NOT NULL AND dc.negative_fixture_id IS NOT NULL)::text fixture_complete_count
      FROM diagnostic_definitions dd
      LEFT JOIN diagnostic_definition_authorities dda ON dda.definition_id=dd.id
      LEFT JOIN diagnostic_conditions dc ON dc.definition_id=dd.id
      WHERE dd.tax_year=2025 AND dd.jurisdiction='federal' AND dd.filing_channel='preparation'
      GROUP BY dd.id ORDER BY dd.code,dd.definition_version DESC`),
    databasePool().query<{
      definition_count: string; authority_verified_count: string; conditions_count: string;
      fixture_complete_count: string; occurrence_count: string; open_occurrence_count: string;
    }>(`SELECT
        (SELECT count(*) FROM diagnostic_definitions WHERE tax_year=2025 AND jurisdiction='federal' AND filing_channel='preparation')::text definition_count,
        (SELECT count(DISTINCT dd.id) FROM diagnostic_definitions dd JOIN diagnostic_definition_authorities dda ON dda.definition_id=dd.id JOIN diagnostic_authorities da ON da.id=dda.authority_id WHERE dd.tax_year=2025 AND da.research_status='verified')::text authority_verified_count,
        (SELECT count(*) FROM diagnostic_conditions)::text conditions_count,
        (SELECT count(*) FROM diagnostic_conditions WHERE positive_fixture_id IS NOT NULL AND negative_fixture_id IS NOT NULL)::text fixture_complete_count,
        (SELECT count(*) FROM validation_issues)::text occurrence_count,
        (SELECT count(*) FROM validation_issues WHERE resolved_at IS NULL)::text open_occurrence_count`),
    databasePool().query<{ gate_key: string; status: string; reason: string; evidence_reference: string | null; updated_at: Date }>("SELECT gate_key,status,reason,evidence_reference,updated_at FROM diagnostic_external_gates ORDER BY gate_key"),
    databasePool().query<{ manifest_version: string; manifest_hash: string; release_status: string; definition_count: number; rule_package_hash: string | null; created_at: Date }>("SELECT manifest_version,manifest_hash,release_status,definition_count,rule_package_hash,created_at FROM diagnostic_manifest_releases WHERE tax_year=2025 ORDER BY created_at DESC,id DESC"),
  ]);
  const totals = summary.rows[0];
  return {
    canManage: true as const,
    scope: { taxYear: 2025, jurisdiction: "Federal", filingChannel: "Preparation and paper draft" },
    summary: {
      definitionCount: Number(totals.definition_count),
      authorityVerifiedCount: Number(totals.authority_verified_count),
      authorityGapCount: Number(totals.definition_count) - Number(totals.authority_verified_count),
      conditionCount: Number(totals.conditions_count),
      fixtureCompleteCount: Number(totals.fixture_complete_count),
      fixtureGapCount: Number(totals.conditions_count) - Number(totals.fixture_complete_count),
      occurrenceCount: Number(totals.occurrence_count),
      openOccurrenceCount: Number(totals.open_occurrence_count),
    },
    definitions: definitions.rows.map((row) => ({
      id: row.id, code: row.code, version: row.definition_version, taxYear: row.tax_year,
      diagnosticClass: row.diagnostic_class, severity: row.default_severity, stage: row.evaluation_stage,
      supportState: row.support_state, affectedForms: row.affected_forms, authorityStatus: row.authority_review_status,
      owner: row.owner, definitionHash: row.definition_hash, sourceLocations: Array.isArray(row.source_metadata?.sourceLocations) ? row.source_metadata.sourceLocations : [],
      authorityCount: Number(row.authority_count), conditionCount: Number(row.condition_count), fixtureCompleteCount: Number(row.fixture_complete_count),
    })),
    externalGates: gates.rows.map((row) => ({ key: row.gate_key, status: row.status, reason: row.reason, evidenceReference: row.evidence_reference, updatedAt: row.updated_at.toISOString() })),
    releases: releases.rows.map((row) => ({ version: row.manifest_version, hash: row.manifest_hash, status: row.release_status, definitionCount: row.definition_count, rulePackageHash: row.rule_package_hash, createdAt: row.created_at.toISOString() })),
  };
}
