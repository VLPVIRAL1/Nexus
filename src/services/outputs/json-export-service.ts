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
        "For Form 1099-K, create accepted Schedule C mappings for the entire gross payment amount before calculation.",
        "For Form 1099-SA, enter qualifiedMedicalExpenses only from reviewed substantiation; do not infer it from the distribution form.",
      ],
    },
    client: {}, taxpayer: {}, spouse: null, dependents: [], source_documents: [],
    forms: { w2: [], form_1099_nec: [], form_1099_misc: [], form_1099_int: [], form_1099_div: [], form_1099_b: [], form_1099_g: [], form_1099_k: [], form_1099_r: [], form_1099_sa: [] },
    activities: { schedule_c: [], schedule_e: [], schedule_f: [], other_income: [] },
    mappings: [], payments: {}, review_points: [],
    metadata: { template: "nexus-taxpayer-import-2025-v1.1.0-review", supported_source_forms: ["W-2", "1099-NEC", "1099-MISC", "1099-INT", "1099-DIV", "1099-B", "1099-G", "1099-K", "1099-R", "1099-SA"] },
  } as const;
}

export function createSupportedReviewExample2025() {
  const template = structuredClone(createBlankCanonicalTemplate2025()) as Record<string, any>;
  const base = (id: string) => ({ id, external_source_id: `review-${id}`, source_document_id: id.replace(/^1/, "2"), form_year: 2025, recipient_role: "taxpayer", corrected: false, void: false, raw_fields: [], unmapped_source_fields: [], version: 1 });
  template.taxpayer = { legal_name: "Synthetic Review Taxpayer" };
  template.forms.w2 = [{ ...base("10000000-0000-4000-8000-000000000001"), employer: { name: "Synthetic Employer" }, federal: { box1: "60000.00", box2: "7000.00", box3: "60000.00" }, box12: [], box13: {}, box14: [], stateRows: [], localRows: [] }];
  template.forms.form_1099_b = [{ ...base("10000000-0000-4000-8000-000000000002"), payer: { name: "Synthetic Brokerage" }, boxes: { description: "10 shares SYN", dateAcquired: "2024-01-10", dateSold: "2025-06-10", proceeds: "10000.00", costBasis: "7000.00", term: "long", federalWithholding: "100.00", basisReportedToIrs: true, adjustmentCode: "", adjustmentAmount: "0.00" }, stateRows: [] }];
  template.forms.form_1099_g = [{ ...base("10000000-0000-4000-8000-000000000003"), payer: { name: "Synthetic State Agency" }, boxes: { unemploymentCompensation: "2000.00", federalWithholding: "200.00" }, stateRows: [] }];
  template.forms.form_1099_r = [{ ...base("10000000-0000-4000-8000-000000000004"), payer: { name: "Synthetic Retirement Custodian" }, boxes: { grossDistribution: "5000.00", taxableAmount: "4000.00", taxableAmountNotDetermined: false, totalDistribution: true, federalWithholding: "500.00", distributionCode: "7", iraSepSimple: true }, stateRows: [] }];
  template.forms.form_1099_sa = [{ ...base("10000000-0000-4000-8000-000000000005"), payer: { name: "Synthetic HSA Custodian" }, boxes: { grossDistribution: "1000.00", earningsOnExcessContributions: "0.00", distributionCode: "1", accountType: "HSA", qualifiedMedicalExpenses: "1000.00" }, stateRows: [] }];
  template.metadata = { ...template.metadata, synthetic_review_example: true, warning: "Synthetic data only. Complete intake and document attestation after import; all outputs remain DRAFT — NOT FOR FILING." };
  return template;
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
