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
        "Select one of the five filing statuses only after eligibility is reviewed.",
        "For every dependent, record a reviewed dependent and credit classification; do not infer eligibility from relationship alone.",
        "Schedule A values must be reviewed deductible amounts, with the limitation confirmations completed.",
      ],
    },
    client: {}, filing_profile: { status: "single", eligibility_confirmed: false }, taxpayer: {}, spouse: null, dependents: [],
    schedule_a: {
      enabled: false, married_filing_separately_spouse_itemizes: null,
      medical_and_dental_expenses: "0.00", state_local_income_or_sales_taxes: "0.00", real_estate_taxes: "0.00", personal_property_taxes: "0.00", other_taxes: "0.00",
      home_mortgage_interest_and_points: "0.00", investment_interest: "0.00", cash_charitable_contributions: "0.00", noncash_charitable_contributions: "0.00",
      casualty_and_theft_losses: "0.00", other_itemized_deductions: "0.00", salt_eligibility_confirmed: false, mortgage_limits_applied: false, charity_limits_applied: false, casualty_limits_applied: false,
    },
    source_documents: [],
    forms: { w2: [], form_1099_nec: [], form_1099_misc: [], form_1099_int: [], form_1099_div: [], form_1099_b: [], form_1099_g: [], form_1099_k: [], form_1099_r: [], form_1099_sa: [] },
    activities: { schedule_c: [], schedule_e: [], schedule_f: [], other_income: [] },
    mappings: [], payments: {}, review_points: [],
    metadata: { template: "nexus-taxpayer-import-2025-v1.2.0-review", supported_source_forms: ["W-2", "1099-NEC", "1099-MISC", "1099-INT", "1099-DIV", "1099-B", "1099-G", "1099-K", "1099-R", "1099-SA"], supported_dependent_forms: ["Form 1040 dependents", "Schedule 8812"], supported_deduction_forms: ["Schedule A"] },
  } as const;
}

export function createSupportedReviewExample2025() {
  const template = structuredClone(createBlankCanonicalTemplate2025()) as Record<string, any>;
  const base = (id: string) => ({ id, external_source_id: `review-${id}`, source_document_id: id.replace(/^1/, "2"), form_year: 2025, recipient_role: "taxpayer", corrected: false, void: false, raw_fields: [], unmapped_source_fields: [], version: 1 });
  template.taxpayer = { legal_name: "Synthetic Review Taxpayer" };
  template.filing_profile = { status: "single", eligibility_confirmed: true };
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
  if (mode === "complete") payload = toCanonicalImportPayload(data);
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

function toCanonicalImportPayload(data: CanonicalTaxReturnData) {
  const formCollections: Record<string, unknown[]> = { w2: [], form_1099_nec: [], form_1099_misc: [], form_1099_int: [], form_1099_div: [], form_1099_b: [], form_1099_g: [], form_1099_k: [], form_1099_r: [], form_1099_sa: [] };
  const collectionByType: Record<string, string> = { W2: "w2", "1099-NEC": "form_1099_nec", "1099-MISC": "form_1099_misc", "1099-INT": "form_1099_int", "1099-DIV": "form_1099_div", "1099-B": "form_1099_b", "1099-G": "form_1099_g", "1099-K": "form_1099_k", "1099-R": "form_1099_r", "1099-SA": "form_1099_sa" };
  for (const source of data.sourceForms) {
    const collection = collectionByType[source.formType];
    if (!collection) continue;
    const { externalSourceId, sourceDocumentId, formYear, owner, ownerPersonId: _ownerPersonId, rawFields, unmappedSourceFields, formType: _formType, ...normalized } = source as unknown as Record<string, unknown>;
    formCollections[collection]?.push({ ...normalized, external_source_id: externalSourceId ?? null, source_document_id: sourceDocumentId, form_year: formYear, recipient_role: owner, raw_fields: rawFields ?? [], unmapped_source_fields: unmappedSourceFields ?? [] });
  }
  const schedule = data.scheduleA ?? {};
  const scheduleValue = (key: string, fallback: unknown) => key in schedule ? schedule[key] : fallback;
  return {
    schema_version: "1.0.0", tax_year: 2025, return_type: "1040", client: {},
    filing_profile: { status: data.filingProfile?.status ?? "single", eligibility_confirmed: data.filingProfile?.eligibilityConfirmed ?? false },
    taxpayer: data.taxpayer, spouse: data.spouse,
    dependents: data.dependents.map((value) => {
      const row = value as Record<string, unknown>; const facts = row.facts && typeof row.facts === "object" ? row.facts as Record<string, unknown> : row;
      return { id: row.id, legal_name: row.legal_name ?? row.legalName, date_of_birth: facts.dateOfBirth, relationship: facts.relationship, months_lived_with_taxpayer: facts.monthsLivedWithTaxpayer, qualifies_as_dependent: facts.qualifiesAsDependent, qualifies_for_child_tax_credit: facts.qualifiesForChildTaxCredit, has_valid_ssn_for_child_tax_credit: facts.hasValidSsnForChildTaxCredit, qualifies_for_other_dependent_credit: facts.qualifiesForOtherDependentCredit, eligibility_reviewed: facts.eligibilityReviewed };
    }),
    schedule_a: {
      enabled: scheduleValue("enabled", false), married_filing_separately_spouse_itemizes: scheduleValue("marriedFilingSeparatelySpouseItemizes", null),
      medical_and_dental_expenses: scheduleValue("medicalAndDentalExpenses", "0.00"), state_local_income_or_sales_taxes: scheduleValue("stateLocalIncomeOrSalesTaxes", "0.00"), real_estate_taxes: scheduleValue("realEstateTaxes", "0.00"), personal_property_taxes: scheduleValue("personalPropertyTaxes", "0.00"), other_taxes: scheduleValue("otherTaxes", "0.00"), home_mortgage_interest_and_points: scheduleValue("homeMortgageInterestAndPoints", "0.00"), investment_interest: scheduleValue("investmentInterest", "0.00"), cash_charitable_contributions: scheduleValue("cashCharitableContributions", "0.00"), noncash_charitable_contributions: scheduleValue("noncashCharitableContributions", "0.00"), casualty_and_theft_losses: scheduleValue("casualtyAndTheftLosses", "0.00"), other_itemized_deductions: scheduleValue("otherItemizedDeductions", "0.00"), salt_eligibility_confirmed: scheduleValue("saltEligibilityConfirmed", false), mortgage_limits_applied: scheduleValue("mortgageLimitsApplied", false), charity_limits_applied: scheduleValue("charityLimitsApplied", false), casualty_limits_applied: scheduleValue("casualtyLimitsApplied", false),
    },
    source_documents: data.sourceDocuments, forms: formCollections,
    activities: { schedule_c: data.activities.filter(({ type }) => type === "schedule_c"), schedule_e: data.activities.filter(({ type }) => type === "schedule_e"), schedule_f: data.activities.filter(({ type }) => type === "schedule_f"), other_income: data.activities.filter(({ type }) => type === "schedule_1_other") },
    mappings: data.mappings, payments: {}, review_points: [], metadata: { ...data.metadata, export_revision: data.revision, canonical_round_trip: true },
  };
}
