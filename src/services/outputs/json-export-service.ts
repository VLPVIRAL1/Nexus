import { createHash } from "node:crypto";
import type { CanonicalTaxReturnData } from "@/domain/canonical";

export type JsonExportMode = "complete" | "source_only" | "blank_template";

export interface JsonExportResult {
  mode: JsonExportMode;
  bytes: Uint8Array;
  sha256: string;
  exclusions: string[];
}

export function exportCanonicalJson(data: CanonicalTaxReturnData, mode: JsonExportMode): JsonExportResult {
  let payload: unknown;
  const exclusions: string[] = [];
  if (mode === "complete") payload = data;
  else if (mode === "source_only") {
    payload = {
      schemaVersion: data.schemaVersion, taxYear: data.taxYear, returnType: data.returnType,
      sourceDocuments: data.sourceDocuments, sourceForms: data.sourceForms,
      metadata: { exportMode: mode, exclusionManifest: ["intakeAnswers", "activities", "mappings", "workflow approvals", "system audit events"] },
    };
    exclusions.push("intakeAnswers", "activities", "mappings", "workflow approvals", "system audit events");
  } else {
    payload = { schema_version: "1.0.0", tax_year: 2025, return_type: "1040", client: {}, taxpayer: {}, spouse: null, dependents: [], source_documents: [], forms: { w2: [], form_1099_nec: [], form_1099_misc: [], form_1099_int: [], form_1099_div: [] }, activities: { schedule_c: [], schedule_e: [], schedule_f: [], other_income: [] }, mappings: [], payments: {}, review_points: [], metadata: {} };
  }
  const bytes = new TextEncoder().encode(`${JSON.stringify(payload, null, 2)}\n`);
  return { mode, bytes, sha256: createHash("sha256").update(bytes).digest("hex"), exclusions };
}
