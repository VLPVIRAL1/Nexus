import { createHash } from "node:crypto";
import type { CanonicalTaxReturnData } from "@/domain/canonical";
import { parseActivityForm2025 } from "@/domain/activity-forms-2025";
import { emptyFederalCreditProfile2025 } from "@/domain/federal-credits-2025";
import { emptyAdvancedFederalProfile2025 } from "@/domain/advanced-federal-2025";

export type JsonExportMode = "complete" | "source_only" | "blank_template";

export interface JsonExportResult {
  mode: JsonExportMode;
  bytes: Uint8Array;
  sha256: string;
  exclusions: string[];
}

export function createBlankCanonicalTemplate2025() {
  return {
    schema_version: "1.4.0",
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
        "Schedule C, E, and F activities use form_data from the 2025.1 activity contract; mapped source receipts are not repeated as additional_receipts.",
        "Complete credits only from a reviewed EITC, dependent-care, or education interview; Form 1098-T does not by itself establish qualified expenses.",
        "Complete advanced_federal only from reviewed Form 8867, marketplace, adjustment, HSA, payment and package-control facts.",
        "A Form 1095-A record is source evidence; reconcile its monthly columns in advanced_federal.premiumTaxCredit before calculation.",
      ],
    },
    client: {}, filing_profile: { status: "single", eligibility_confirmed: false },
    standard_deduction_facts: { schema_version: "2025.1", taxpayer_claimable_as_dependent: false, form_8615_applicability_reviewed: false, form_8615_required: false, taxpayer_age_65_or_older: false, taxpayer_blind: false, spouse_age_65_or_older: false, spouse_blind: false, age_blindness_facts_reviewed: false, mfs_spouse_additional_deduction_eligible: false },
    taxpayer: {}, spouse: null, dependents: [],
    schedule_a: {
      enabled: false, married_filing_separately_spouse_itemizes: null,
      medical_and_dental_expenses: "0.00", state_local_income_or_sales_taxes: "0.00", real_estate_taxes: "0.00", personal_property_taxes: "0.00", other_taxes: "0.00",
      home_mortgage_interest_and_points: "0.00", investment_interest: "0.00", cash_charitable_contributions: "0.00", noncash_charitable_contributions: "0.00",
      casualty_and_theft_losses: "0.00", other_itemized_deductions: "0.00", salt_eligibility_confirmed: false, mortgage_limits_applied: false, charity_limits_applied: false, casualty_limits_applied: false,
    },
    credits: emptyFederalCreditProfile2025,
    advanced_federal: emptyAdvancedFederalProfile2025,
    source_documents: [],
    forms: { w2: [], form_1095_a: [], form_1098_e: [], form_1098_t: [], form_5498: [], form_5498_sa: [], form_1099_nec: [], form_1099_misc: [], form_1099_int: [], form_1099_div: [], form_1099_b: [], form_1099_g: [], form_1099_k: [], form_1099_r: [], form_1099_sa: [], form_ssa_1099: [], form_rrb_1099: [] },
    activities: { schedule_c: [], schedule_e: [], schedule_f: [], other_income: [] },
    mappings: [], payments: {}, review_points: [],
    metadata: { template: "nexus-taxpayer-import-2025-v1.8.0-amt-review", supported_source_forms: ["W-2", "1095-A", "1098-E", "1098-T", "5498", "5498-SA", "1099-NEC", "1099-MISC", "1099-INT", "1099-DIV", "1099-B", "1099-G", "1099-K", "1099-R", "1099-SA", "SSA-1099", "RRB-1099"], supported_dependent_forms: ["Form 1040 dependents", "Schedule 8812", "Schedule EIC", "Form 2441"], supported_deduction_forms: ["Dependent standard-deduction worksheet", "Age/blindness additional standard deduction", "Schedule A", "Schedule 1", "Form 6251", "Form 8889"], supported_credit_forms: ["Schedule EIC", "Form 2441", "Form 8863", "Form 8962", "Schedule 3"], supported_activity_forms: ["Schedule C", "Schedule E", "Schedule F"], supported_income_worksheets: ["Social Security Benefits Worksheet"], filing_output_enabled: false },
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
  template.forms.form_ssa_1099 = [{ ...base("10000000-0000-4000-8000-000000000006"), payer: { name: "Social Security Administration" }, boxes: { benefitsPaid: "12000.00", benefitsRepaid: "0.00", netBenefits: "12000.00", federalWithholding: "600.00", medicarePartBPremiums: "0.00", medicarePartCPremiums: "0.00", medicarePartDPremiums: "0.00", lumpSumElectionApplies: false }, stateRows: [] }];
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
  const formCollections: Record<string, unknown[]> = { w2: [], form_1095_a: [], form_1098_e: [], form_1098_t: [], form_5498: [], form_5498_sa: [], form_1099_nec: [], form_1099_misc: [], form_1099_int: [], form_1099_div: [], form_1099_b: [], form_1099_g: [], form_1099_k: [], form_1099_r: [], form_1099_sa: [], form_ssa_1099: [], form_rrb_1099: [] };
  const collectionByType: Record<string, string> = { W2: "w2", "1095-A": "form_1095_a", "1098-E": "form_1098_e", "1098-T": "form_1098_t", "5498": "form_5498", "5498-SA": "form_5498_sa", "1099-NEC": "form_1099_nec", "1099-MISC": "form_1099_misc", "1099-INT": "form_1099_int", "1099-DIV": "form_1099_div", "1099-B": "form_1099_b", "1099-G": "form_1099_g", "1099-K": "form_1099_k", "1099-R": "form_1099_r", "1099-SA": "form_1099_sa", "SSA-1099": "form_ssa_1099", "RRB-1099": "form_rrb_1099" };
  for (const source of data.sourceForms) {
    const collection = collectionByType[source.formType];
    if (!collection) continue;
    const { externalSourceId, sourceDocumentId, formYear, owner, ownerPersonId: _ownerPersonId, rawFields, unmappedSourceFields, formType: _formType, ...normalized } = source as unknown as Record<string, unknown>;
    formCollections[collection]?.push({ ...normalized, external_source_id: externalSourceId ?? null, source_document_id: sourceDocumentId, form_year: formYear, recipient_role: owner, raw_fields: rawFields ?? [], unmapped_source_fields: unmappedSourceFields ?? [] });
  }
  const schedule = data.scheduleA ?? {};
  const scheduleValue = (key: string, fallback: unknown) => key in schedule ? schedule[key] : fallback;
  return {
    schema_version: "1.4.0", tax_year: 2025, return_type: "1040", client: {},
    filing_profile: { status: data.filingProfile?.status ?? "single", eligibility_confirmed: data.filingProfile?.eligibilityConfirmed ?? false },
    standard_deduction_facts: toCanonicalStandardDeductionFacts(data.standardDeductionFacts),
    taxpayer: toCanonicalPerson(data.taxpayer), spouse: data.spouse ? toCanonicalPerson(data.spouse) : null,
    dependents: data.dependents.map((value) => {
      const row = value as Record<string, unknown>; const facts = row.facts && typeof row.facts === "object" ? row.facts as Record<string, unknown> : row;
      return { id: row.id, legal_name: row.legal_name ?? row.legalName, date_of_birth: facts.dateOfBirth, relationship: facts.relationship, months_lived_with_taxpayer: facts.monthsLivedWithTaxpayer, qualifies_as_dependent: facts.qualifiesAsDependent, qualifies_for_child_tax_credit: facts.qualifiesForChildTaxCredit, has_valid_ssn_for_child_tax_credit: facts.hasValidSsnForChildTaxCredit, qualifies_for_other_dependent_credit: facts.qualifiesForOtherDependentCredit, eligibility_reviewed: facts.eligibilityReviewed };
    }),
    schedule_a: {
      enabled: scheduleValue("enabled", false), married_filing_separately_spouse_itemizes: scheduleValue("marriedFilingSeparatelySpouseItemizes", null),
      medical_and_dental_expenses: scheduleValue("medicalAndDentalExpenses", "0.00"), state_local_income_or_sales_taxes: scheduleValue("stateLocalIncomeOrSalesTaxes", "0.00"), real_estate_taxes: scheduleValue("realEstateTaxes", "0.00"), personal_property_taxes: scheduleValue("personalPropertyTaxes", "0.00"), other_taxes: scheduleValue("otherTaxes", "0.00"), home_mortgage_interest_and_points: scheduleValue("homeMortgageInterestAndPoints", "0.00"), investment_interest: scheduleValue("investmentInterest", "0.00"), cash_charitable_contributions: scheduleValue("cashCharitableContributions", "0.00"), noncash_charitable_contributions: scheduleValue("noncashCharitableContributions", "0.00"), casualty_and_theft_losses: scheduleValue("casualtyAndTheftLosses", "0.00"), other_itemized_deductions: scheduleValue("otherItemizedDeductions", "0.00"), salt_eligibility_confirmed: scheduleValue("saltEligibilityConfirmed", false), mortgage_limits_applied: scheduleValue("mortgageLimitsApplied", false), charity_limits_applied: scheduleValue("charityLimitsApplied", false), casualty_limits_applied: scheduleValue("casualtyLimitsApplied", false),
    },
    credits: data.credits ?? emptyFederalCreditProfile2025,
    advanced_federal: data.advancedFederal ?? emptyAdvancedFederalProfile2025,
    source_documents: data.sourceDocuments, forms: formCollections,
    activities: {
      schedule_c: data.activities.filter(({ type }) => type === "schedule_c").map(toCanonicalActivity),
      schedule_e: data.activities.filter(({ type }) => type === "schedule_e").map(toCanonicalActivity),
      schedule_f: data.activities.filter(({ type }) => type === "schedule_f").map(toCanonicalActivity),
      other_income: data.activities.filter(({ type }) => type === "schedule_1_other").map((activity) => ({ id: activity.id, name: activity.name, owner_role: activity.owner, implementation_status: "mapping_only", active: activity.active, version: activity.version ?? 1 })),
    },
    mappings: data.mappings, payments: {}, review_points: [], metadata: { ...data.metadata, export_revision: data.revision, canonical_round_trip: true },
  };
}

function toCanonicalPerson(value: Record<string, unknown>) {
  const facts = value.facts && typeof value.facts === "object" && !Array.isArray(value.facts) ? value.facts as Record<string, unknown> : {};
  return {
    legal_name: value.legal_name ?? value.legalName,
    date_of_birth: value.date_of_birth ?? value.dateOfBirth ?? null,
    address: value.address && typeof value.address === "object" && !Array.isArray(value.address) ? value.address : {},
    facts,
  };
}

function toCanonicalStandardDeductionFacts(value: Record<string, unknown> | undefined) {
  const facts = value ?? {};
  return {
    schema_version: facts.schemaVersion ?? "2025.1",
    taxpayer_claimable_as_dependent: facts.taxpayerClaimableAsDependent === true,
    form_8615_applicability_reviewed: facts.form8615ApplicabilityReviewed === true,
    form_8615_required: facts.form8615Required === true,
    taxpayer_age_65_or_older: facts.taxpayerAge65OrOlder === true,
    taxpayer_blind: facts.taxpayerBlind === true,
    spouse_age_65_or_older: facts.spouseAge65OrOlder === true,
    spouse_blind: facts.spouseBlind === true,
    age_blindness_facts_reviewed: facts.ageBlindnessFactsReviewed === true,
    mfs_spouse_additional_deduction_eligible: facts.mfsSpouseAdditionalDeductionEligible === true,
  };
}

function toCanonicalActivity(activity: CanonicalTaxReturnData["activities"][number]) {
  const type = activity.type as "schedule_c" | "schedule_e" | "schedule_f";
  return { id: activity.id, name: activity.name, owner_role: activity.owner, implementation_status: activity.implementationStatus, additional_receipts: activity.additionalReceipts ?? "0.00", receipt_note: activity.receiptNote ?? null, active: activity.active, version: activity.version ?? 1, form_data: parseActivityForm2025(type, activity.formData) };
}
