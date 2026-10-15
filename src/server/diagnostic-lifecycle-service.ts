import "server-only";
import { createHash } from "node:crypto";
import type pg from "pg";

export interface DiagnosticOccurrenceInput {
  code: string;
  severity: "blocking" | "error" | "warning" | "info";
  category: string;
  recordId?: string | null;
  fieldPath?: string | null;
  message: string;
  resolutionAction: string;
  operands?: Record<string, string | number | boolean | null>;
}

export interface ReplaceDiagnosticSetInput {
  taxYearId: string;
  revision: number;
  origin: string;
  evaluationStage: string;
  findings: DiagnosticOccurrenceInput[];
  resolution: string;
}

export async function replaceDiagnosticSet(client: pg.PoolClient, input: ReplaceDiagnosticSetInput) {
  const normalized = dedupe(input.findings.map((finding) => ({ finding, fingerprint: diagnosticFingerprint(finding) })));
  const open = await client.query<{ id: string; fingerprint: string }>(
    `SELECT id,fingerprint FROM validation_issues
     WHERE tax_year_id=$1 AND origin=$2 AND evaluation_stage=$3 AND resolved_at IS NULL
     FOR UPDATE`, [input.taxYearId, input.origin, input.evaluationStage],
  );
  const wanted = new Set(normalized.map(({ fingerprint }) => fingerprint));
  const obsolete = open.rows.filter(({ fingerprint }) => !wanted.has(fingerprint)).map(({ id }) => id);
  if (obsolete.length) {
    await client.query(
      `UPDATE validation_issues SET resolved_revision=$2,resolved_at=now(),resolution=$3
       WHERE tax_year_id=$1 AND id=ANY($4::uuid[]) AND resolved_at IS NULL`,
      [input.taxYearId, input.revision, input.resolution, obsolete],
    );
  }
  const existingOpen = new Set(open.rows.map(({ fingerprint }) => fingerprint));
  let created = 0;
  let reopened = 0;
  for (const { finding, fingerprint } of normalized) {
    if (existingOpen.has(fingerprint)) continue;
    const previous = await client.query<{ id: string }>(
      `SELECT id FROM validation_issues
       WHERE tax_year_id=$1 AND origin=$2 AND evaluation_stage=$3 AND fingerprint=$4 AND resolved_at IS NOT NULL
       ORDER BY resolved_at DESC,id DESC LIMIT 1 FOR UPDATE`,
      [input.taxYearId, input.origin, input.evaluationStage, fingerprint],
    );
    if (previous.rows[0]) {
      await client.query(
        `UPDATE validation_issues SET severity=$2,category=$3,record_id=$4,field_path=$5,message=$6,
          resolution_action=$7,creation_revision=$8,resolved_revision=NULL,resolution=NULL,resolved_at=NULL,
          occurrence_operands=$9::jsonb,suppressed_at=NULL,suppressed_by_id=NULL,suppression_reason=NULL,suppression_expires_at=NULL
         WHERE id=$1`,
        [previous.rows[0].id, finding.severity, finding.category, finding.recordId ?? null, finding.fieldPath ?? null, finding.message, finding.resolutionAction, input.revision, JSON.stringify(finding.operands ?? {})],
      );
      reopened += 1;
      continue;
    }
    await client.query(
      `INSERT INTO validation_issues(
        tax_year_id,code,severity,category,record_id,field_path,message,resolution_action,creation_revision,
        fingerprint,origin,evaluation_stage,occurrence_operands
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)`,
      [input.taxYearId, finding.code, finding.severity, finding.category, finding.recordId ?? null, finding.fieldPath ?? null, finding.message, finding.resolutionAction, input.revision, fingerprint, input.origin, input.evaluationStage, JSON.stringify(finding.operands ?? {})],
    );
    created += 1;
  }
  return { active: normalized.length, created, reopened, resolved: obsolete.length };
}

export async function createDiagnosticOccurrence(client: pg.PoolClient, input: Omit<ReplaceDiagnosticSetInput, "findings" | "resolution"> & { finding: DiagnosticOccurrenceInput }) {
  const fingerprint = diagnosticFingerprint(input.finding);
  const existing = await client.query(
    `SELECT 1 FROM validation_issues WHERE tax_year_id=$1 AND origin=$2 AND evaluation_stage=$3 AND fingerprint=$4 AND resolved_at IS NULL`,
    [input.taxYearId, input.origin, input.evaluationStage, fingerprint],
  );
  if (existing.rowCount) return { created: false, fingerprint };
  await client.query(
    `INSERT INTO validation_issues(
      tax_year_id,code,severity,category,record_id,field_path,message,resolution_action,creation_revision,
      fingerprint,origin,evaluation_stage,occurrence_operands
     ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)`,
    [input.taxYearId, input.finding.code, input.finding.severity, input.finding.category, input.finding.recordId ?? null, input.finding.fieldPath ?? null, input.finding.message, input.finding.resolutionAction, input.revision, fingerprint, input.origin, input.evaluationStage, JSON.stringify(input.finding.operands ?? {})],
  );
  return { created: true, fingerprint };
}

export async function resolveDiagnosticOccurrences(client: pg.PoolClient, input: { taxYearId: string; revision: number; origin?: string; evaluationStage?: string; code?: string; fieldPath?: string; resolution: string }) {
  const clauses = ["tax_year_id=$1", "resolved_at IS NULL"];
  const values: unknown[] = [input.taxYearId];
  for (const [column, value] of [["origin", input.origin], ["evaluation_stage", input.evaluationStage], ["code", input.code], ["field_path", input.fieldPath]] as const) {
    if (value === undefined) continue;
    values.push(value); clauses.push(`${column}=$${values.length}`);
  }
  values.push(input.revision, input.resolution);
  const result = await client.query(
    `UPDATE validation_issues SET resolved_revision=$${values.length - 1},resolved_at=now(),resolution=$${values.length}
     WHERE ${clauses.join(" AND ")}`,
    values,
  );
  return result.rowCount ?? 0;
}

export function diagnosticFingerprint(finding: DiagnosticOccurrenceInput) {
  return createHash("sha256").update(stable({ code: finding.code, recordId: finding.recordId ?? null, fieldPath: finding.fieldPath ?? null, operands: finding.operands ?? {} })).digest("hex");
}

function dedupe(items: Array<{ finding: DiagnosticOccurrenceInput; fingerprint: string }>) {
  const seen = new Set<string>();
  return items.filter(({ fingerprint }) => {
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => `${JSON.stringify(key)}:${stable(nested)}`).join(",")}}`;
  return JSON.stringify(value);
}
