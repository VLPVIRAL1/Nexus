import { createHash } from "node:crypto";
import type { CanonicalTaxReturnData } from "@/domain/canonical";

export type JsonExportMode = "complete" | "source_only" | "blank_template";

export interface JsonExportResult {
  mode: JsonExportMode;
  bytes: Uint8Array;
  sha256: string;
  exclusions: string[];
}

export function createBlankCanonicalTemplate2025() {
  return {
    schema_version: "1.0.0",
    tax_year: 2025,
    return_type: "1040",
    _instructions: {
      purpose: "Populate this JSON from all source documents provided by the user.",
      critical_rules: [
        "Review all source documents before returning the completed JSON.",
        "Do not estimate missing values.",
        "Do not combine separate tax forms.",
        "Create one form record for each source form.",
        "Preserve every visible supported box even if uncommon.",
        "Preserve all W-2 Box 12 code entries.",
        "Preserve all W-2 Box 14 entries.",
        "Preserve every state and local row.",
        "Preserve account numbers where present.",
        "Preserve corrected and void indicators.",
        "Use null when a value cannot be determined.",
        "Create a review point for ambiguous or conflicting information.",
        "Keep source file names exactly as provided.",
        "Do not calculate tax.",
        "Do not modify schema_version.",
        "Do not add unsupported form families to forms; list the document in source_documents, upload the original separately, and flag it for manual review.",
      ],
    },
    client: {}, taxpayer: {}, spouse: null, dependents: [], source_documents: [],
    forms: { w2: [], form_1099_nec: [], form_1099_misc: [], form_1099_int: [], form_1099_div: [] },
    activities: { schedule_c: [], schedule_e: [], schedule_f: [], other_income: [] },
    mappings: [], payments: {}, review_points: [],
    metadata: { template: "nexus-taxpayer-import-2025-v1.0.0", supported_source_forms: ["W-2", "1099-NEC", "1099-MISC", "1099-INT", "1099-DIV"] },
  } as const;
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
    payload = createBlankCanonicalTemplate2025();
  }
  const bytes = new TextEncoder().encode(`${JSON.stringify(payload, null, 2)}\n`);
  return { mode, bytes, sha256: createHash("sha256").update(bytes).digest("hex"), exclusions };
}
