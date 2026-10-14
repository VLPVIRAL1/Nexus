import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { emptyFederalCreditProfile2025 } from "../../src/domain/federal-credits-2025";
import { emptyAdvancedFederalProfile2025 } from "../../src/domain/advanced-federal-2025";
import { canonicalReturnFixture } from "../fixtures/canonical-return";
import { canonicalTaxReturnSchema } from "../../src/lib/canonical-schema";
import { createBlankCanonicalTemplate2025, createSupportedReviewExample2025, exportCanonicalJson } from "../../src/services/outputs/json-export-service";
import { buildFormRenderingPlan2025 } from "../../src/services/outputs/form-data-2025";
import { generateDraftReturnPackage } from "../../src/services/outputs/return-package-service";
import { generateWorkpaper } from "../../src/services/outputs/workpaper-service";
import { calculateFederalReturn2025, type CalculationInput2025 } from "../../src/tax-engine/2025";

describe("output integrity foundations", () => {
  it("exports source-only data with an exclusion manifest", () => {
    const result = exportCanonicalJson(canonicalReturnFixture, "source_only");
    const parsed = JSON.parse(new TextDecoder().decode(result.bytes));
    expect(parsed.sourceDocuments).toHaveLength(1);
    expect(parsed.activities).toBeUndefined();
    expect(result.exclusions).toContain("system audit events");
    expect(result.sha256).toHaveLength(64);
  });

  it("exports complete and blank JSON with verifiable hashes and no blank-template identity data", () => {
    const complete = exportCanonicalJson(canonicalReturnFixture, "complete");
    const completePayload = JSON.parse(new TextDecoder().decode(complete.bytes));
    expect(() => canonicalTaxReturnSchema.parse(completePayload)).not.toThrow();
    expect(completePayload).toMatchObject({ schema_version: "1.4.0", tax_year: 2025, return_type: "1040", taxpayer: { legal_name: "Synthetic Taxpayer", date_of_birth: null, address: {}, facts: {} } });
    expect(createHash("sha256").update(complete.bytes).digest("hex")).toBe(complete.sha256);

    const blank = exportCanonicalJson(canonicalReturnFixture, "blank_template");
    const parsed = JSON.parse(new TextDecoder().decode(blank.bytes));
    expect(() => canonicalTaxReturnSchema.parse(parsed)).not.toThrow();
    expect(parsed).toMatchObject({ client: {}, standard_deduction_facts: { taxpayer_claimable_as_dependent: false, taxpayer_age_65_or_older: false }, taxpayer: {}, spouse: null, dependents: [], source_documents: [], mappings: [] });
    expect(JSON.stringify(parsed)).not.toContain(canonicalReturnFixture.clientId);
    expect(createHash("sha256").update(blank.bytes).digest("hex")).toBe(blank.sha256);
    expect(parsed._instructions.critical_rules).toContain("Preserve all W-2 Box 12 code entries.");
    expect(parsed.metadata.supported_source_forms).toEqual(["W-2", "1095-A", "1098-E", "1098-T", "5498", "5498-SA", "1099-NEC", "1099-MISC", "1099-INT", "1099-DIV", "1099-B", "1099-G", "1099-K", "1099-R", "1099-SA", "SSA-1099", "RRB-1099"]);
    expect(createBlankCanonicalTemplate2025()).toEqual(parsed);
  });

  it("publishes a schema-valid synthetic import-to-1040 review example", () => {
    const example = createSupportedReviewExample2025();
    expect(() => canonicalTaxReturnSchema.parse(example)).not.toThrow();
    expect(example.metadata.synthetic_review_example).toBe(true);
    expect(example.forms).toMatchObject({ w2: [expect.any(Object)], form_1099_b: [expect.any(Object)], form_1099_g: [expect.any(Object)], form_1099_r: [expect.any(Object)], form_1099_sa: [expect.any(Object)], form_ssa_1099: [expect.any(Object)], form_rrb_1099: [], form_1099_k: [] });
  });

  it("exports filing profile, dependent and Schedule A data in the importable canonical shape", () => {
    const complete = exportCanonicalJson({
      ...canonicalReturnFixture,
      filingProfile: { status: "head_of_household", eligibilityConfirmed: true },
      standardDeductionFacts: { schemaVersion: "2025.1", taxpayerClaimableAsDependent: true, form8615ApplicabilityReviewed: true, form8615Required: false, taxpayerAge65OrOlder: true, taxpayerBlind: false, spouseAge65OrOlder: false, spouseBlind: false, ageBlindnessFactsReviewed: true, mfsSpouseAdditionalDeductionEligible: false },
      dependents: [{ id: "10000000-0000-4000-8000-000000000099", legal_name: "Synthetic Child", facts: { dateOfBirth: "2015-06-15", relationship: "Child", monthsLivedWithTaxpayer: 12, qualifiesAsDependent: true, qualifiesForChildTaxCredit: true, hasValidSsnForChildTaxCredit: true, qualifiesForOtherDependentCredit: false, eligibilityReviewed: true } }],
      scheduleA: { enabled: true, marriedFilingSeparatelySpouseItemizes: null, medicalAndDentalExpenses: "1000.00", stateLocalIncomeOrSalesTaxes: "12000.00", realEstateTaxes: "5000.00", personalPropertyTaxes: "0.00", otherTaxes: "0.00", homeMortgageInterestAndPoints: "0.00", investmentInterest: "0.00", cashCharitableContributions: "500.00", noncashCharitableContributions: "0.00", casualtyAndTheftLosses: "0.00", otherItemizedDeductions: "0.00", saltEligibilityConfirmed: true, mortgageLimitsApplied: false, charityLimitsApplied: true, casualtyLimitsApplied: false },
      sourceForms: [{ id: "10000000-0000-4000-8000-000000000101", externalSourceId: "round-trip-w2", sourceDocumentId: "20000000-0000-4000-8000-000000000101", formType: "W2", formYear: 2025, owner: "taxpayer", ownerPersonId: null, accountNumber: null, corrected: false, void: false, secondTinNotice: null, fatcaIndicator: null, version: 1, rawFields: [], unmappedSourceFields: [], employer: {}, employee: {}, federal: { box1: "50000.00", box2: "5000.00", box3: "50000.00" }, box12: [], box13: {}, box14: [], stateRows: [], localRows: [] }] as any,
    }, "complete");
    const payload = canonicalTaxReturnSchema.parse(JSON.parse(new TextDecoder().decode(complete.bytes)));
    expect(payload).toMatchObject({ filing_profile: { status: "head_of_household", eligibility_confirmed: true }, standard_deduction_facts: { taxpayer_claimable_as_dependent: true, form_8615_applicability_reviewed: true, taxpayer_age_65_or_older: true, age_blindness_facts_reviewed: true }, dependents: [{ legal_name: "Synthetic Child", qualifies_for_child_tax_credit: true }], schedule_a: { enabled: true, state_local_income_or_sales_taxes: "12000.00", real_estate_taxes: "5000.00" } });
    expect(payload.forms.w2).toEqual([expect.objectContaining({ id: "10000000-0000-4000-8000-000000000101", external_source_id: "round-trip-w2", source_document_id: "20000000-0000-4000-8000-000000000101", recipient_role: "taxpayer", federal: { box1: "50000.00", box2: "5000.00", box3: "50000.00" } })]);
  });

  it("generates a workbook with required foundation sheets and run identity", async () => {
    const calculationResult = supportedCalculation();
    const formPlan = buildFormRenderingPlan2025(calculationResult);
    const data = { ...canonicalReturnFixture, sourceForms: [{
      id: "w2-1", externalSourceId: "synthetic-w2", sourceDocumentId: "doc-1", formType: "W2", formYear: 2025,
      owner: "taxpayer", ownerPersonId: null, accountNumber: null, corrected: false, void: false, secondTinNotice: null,
      fatcaIndicator: null, version: 1, rawFields: [], unmappedSourceFields: [], employer: {}, employee: {},
      federal: { box1: "1000.00", box2: "100.00" }, box12: [], box13: {}, box14: [], stateRows: [], localRows: [],
    }] as any };
    const bytes = await generateWorkpaper({ data, runId: "CALC-SYNTHETIC", calculationStatus: "partial", diagnostics: [], calculationResult, requiredForms: formPlan.requiredForms, renderedForms: formPlan.renderedForms });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes.buffer as ArrayBuffer);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["Cover & Tax Summary", "Source Index", "Income & Withholding", "Open Review Points", "Mapping Reconciliation", "Schedule Activities", "Business Workpapers", "Required Forms", "Unsupported Treatments", "Manual Overrides", "Calculation Trace", "Additional Taxes", "Capital Gains", "Premium Tax Credit", "Retirement & IRA", "Raw Source Fields"]);
    expect(workbook.getWorksheet("Cover & Tax Summary")?.getCell("B4").value).toBe("CALC-SYNTHETIC");
    expect(workbook.getWorksheet("Required Forms")?.rowCount).toBeGreaterThan(2);
    expect(workbook.getWorksheet("Calculation Trace")?.rowCount).toBeGreaterThan(2);
    expect(workbook.getWorksheet("Income & Withholding")?.getCell("E2").value).toBe(1000);
    expect(workbook.getWorksheet("Income & Withholding")?.getCell("E3").value).toEqual({ formula: "SUM(E2:E2)", result: 1000 });
    expect(workbook.getWorksheet("Income & Withholding")?.getCell("G3").value).toEqual({ formula: "SUM(G2:G2)", result: 100 });
  });

  it("generates a partial package with a cover and every controlled internal form preview", async () => {
    const formPlan = buildFormRenderingPlan2025(supportedCalculation());
    const result = await generateDraftReturnPackage({ taxYear: 2025, inputRevision: 28, calculationRunId: "CALC-SYNTHETIC", engineVersion: "not-approved", ruleVersion: "not-approved", requiredForms: formPlan.requiredForms, renderedForms: formPlan.renderedForms, missingForms: formPlan.missingForms, supportStatus: "partial" }, formPlan.pages);
    const pdf = await PDFDocument.load(result.bytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1 + formPlan.pages.length);
    expect(formPlan.renderedForms).toEqual(expect.arrayContaining(["Form 1040", "Schedule B", "Schedule C", "Schedule SE", "Schedule 1", "Schedule 2", "Form 8995", "Qualified Dividends Tax Worksheet"]));
    expect(result.manifest.missingForms).toEqual([]);
    expect(result.sha256).toHaveLength(64);
  }, 15_000);

  it("blocks a form package when required page-level identity fields are missing", () => {
    const formPlan = buildFormRenderingPlan2025(supportedCalculation({ filingStatus: "married_filing_jointly", filingStatusEligibilityConfirmed: true }), {
      taxpayerName: null,
      spouseName: null,
      addressComplete: false,
      taxpayerTinPresent: false,
    });
    expect(formPlan.validationErrors).toEqual([
      "Form 1040: taxpayer legal name is missing.",
      "Form 1040: taxpayer address is incomplete.",
      "Form 1040: taxpayer identifying number is unavailable to the renderer.",
      "Form 1040: spouse legal name is missing for a joint return.",
    ]);
  });

  it("renders Form 8949, Schedule D, Form 8889, retirement lines, and unemployment from expanded sources", () => {
    const calculation = supportedCalculation({
      brokerTransactions: [{ id: "b", description: "Synthetic shares", term: "long", proceeds: "10000.00", costBasis: "7000.00", federalWithholding: "0.00", basisReportedToIrs: true, adjustmentAmount: "0.00", adjustmentCode: "" }],
      retirementDistributions: [{ id: "r", owner: "taxpayer", grossDistribution: "5000.00", taxableAmount: "4000.00", federalWithholding: "0.00", distributionCode: "7", iraSepSimple: true, taxableAmountNotDetermined: false }],
      governmentPayments: [{ id: "g", unemploymentCompensation: "2000.00", federalWithholding: "0.00" }],
      hsaDistributions: [{ id: "sa", owner: "taxpayer", grossDistribution: "1000.00", qualifiedMedicalExpenses: "1000.00", earningsOnExcessContributions: "0.00", distributionCode: "1", accountType: "HSA" }],
    });
    const plan = buildFormRenderingPlan2025(calculation);
    expect(plan.requiredForms).toEqual(expect.arrayContaining(["Form 1040", "Form 8949", "Schedule D", "Form 8889", "Schedule 1"]));
    expect(plan.missingForms).toEqual([]);
    expect(plan.pages.find(({ formName }) => formName === "Form 1040")?.lines).toEqual(expect.arrayContaining([expect.objectContaining({ line: "4a" }), expect.objectContaining({ line: "7" }), expect.objectContaining({ line: "8" })]));
  });

  it("renders Form 8606, the source retirement worksheet, Form 5329 and Schedule 2", () => {
    const sourceId = "50000000-0000-4000-8000-000000000001";
    const adjustments = structuredClone(emptyAdvancedFederalProfile2025.adjustments);
    adjustments.iraBasis.taxpayer = { enabled: true, priorYearBasis: "4000.00", currentYearNondeductibleContributions: "1000.00", traditionalIraDistributions: "10000.00", rothConversions: "0.00", yearEndTraditionalIraValue: "15000.00", outstandingRollovers: "0.00", recharacterizedContributions: "0.00", sourceAmountsReconciled: true, basisReviewed: true };
    adjustments.retirementDistributions = { schemaVersion: "2025.1", enabled: true, allSourceRecordsReviewed: true, treatments: [{ id: "50000000-0000-4000-8000-000000000002", sourceRecordId: sourceId, treatment: "early_distribution", rolloverAmount: "0.00", qcdAmount: "0.00", exceptionAmount: "2000.00", exceptionCode: "01", investmentInContract: "0.00", expectedMonthlyPayments: 0, paymentsReceivedThisYear: 0, reviewed: true }] };
    const calculation = supportedCalculation({
      retirementDistributions: [{ id: sourceId, owner: "taxpayer", grossDistribution: "10000.00", taxableAmount: "10000.00", federalWithholding: "0.00", distributionCode: "1", iraSepSimple: true, taxableAmountNotDetermined: false }],
      advancedFederal: { ...structuredClone(emptyAdvancedFederalProfile2025), adjustments, dueDiligenceSignatureCurrent: false, valid1095ARecordIds: [], valid1098ERecordIds: [], validActivityIds: [] },
    });
    const plan = buildFormRenderingPlan2025(calculation);
    expect(calculation.status, JSON.stringify(calculation.diagnostics)).toBe("calculated_draft");
    expect(plan.requiredForms).toEqual(expect.arrayContaining(["Form 8606", "Retirement Distribution Worksheet", "Form 5329", "Schedule 2"]));
    expect(plan.renderedForms).toEqual(expect.arrayContaining(["Form 8606", "Retirement Distribution Worksheet", "Form 5329", "Schedule 2"]));
    expect(plan.pages.find(({ formName }) => formName === "Form 8606")?.lines).toEqual(expect.arrayContaining([expect.objectContaining({ line: "13", value: "$2,000" }), expect.objectContaining({ line: "14", value: "$3,000" })]));
    expect(plan.pages.find(({ formName }) => formName === "Form 5329")?.lines).toEqual(expect.arrayContaining([expect.objectContaining({ line: "4", value: "$800" })]));
    expect(plan.missingForms).toEqual([]);
  });

  it("renders adjusted capital transactions, carryovers and the Schedule D tax worksheet", () => {
    const sourceId = "50000000-0000-4000-8000-000000000011";
    const adjustments = structuredClone(emptyAdvancedFederalProfile2025.adjustments);
    adjustments.capitalGains = { schemaVersion: "2025.1", enabled: true, carryoversReviewed: true, shortTermLossCarryover: "2000.00", longTermLossCarryover: "0.00", carryoverSourceYear: 2024, treatments: [{ id: "50000000-0000-4000-8000-000000000012", sourceRecordId: sourceId, category: "collectible_28_percent", section1202Exclusion: "0.00", adjustmentReviewed: true }] };
    const calculation = supportedCalculation({
      brokerTransactions: [{ id: sourceId, description: "Synthetic collectible", term: "long", proceeds: "20000.00", costBasis: "10000.00", federalWithholding: "0.00", basisReportedToIrs: true, adjustmentAmount: "500.00", adjustmentCode: "B" }],
      advancedFederal: { ...structuredClone(emptyAdvancedFederalProfile2025), adjustments, dueDiligenceSignatureCurrent: false, valid1095ARecordIds: [], valid1098ERecordIds: [], validActivityIds: [] },
    });
    const plan = buildFormRenderingPlan2025(calculation);
    expect(calculation.status).toBe("calculated_draft");
    expect(plan.requiredForms).toEqual(expect.arrayContaining(["Form 8949", "Schedule D", "Schedule D Tax Worksheet"]));
    expect(plan.pages.find(({ formName }) => formName === "Form 8949")?.lines).toEqual(expect.arrayContaining([expect.objectContaining({ line: "1f", value: "B" }), expect.objectContaining({ line: "1g", value: "$500" })]));
    expect(plan.pages.find(({ formName }) => formName === "Schedule D")?.lines).toEqual(expect.arrayContaining([expect.objectContaining({ line: "6", value: "$2,000" })]));
    expect(plan.pages.find(({ formName }) => formName === "Schedule D Tax Worksheet")?.lines).toEqual(expect.arrayContaining([expect.objectContaining({ line: "28%", value: "$8,500" })]));
    expect(plan.missingForms).toEqual([]);
  });

  it("renders the complete Form 8962 monthly exception reconciliation", () => {
    const sourceId = "50000000-0000-4000-8000-000000000021";
    const premiumTaxCredit = structuredClone(emptyAdvancedFederalProfile2025.premiumTaxCredit);
    Object.assign(premiumTaxCredit, { enabled: true, householdMembersReconciled: true, sharedPoliciesReviewed: true, federalPovertyLine: "15000.00", belowPovertyException: "marketplace_estimated_100_percent", belowPovertyExceptionReviewed: true });
    premiumTaxCredit.policies = [{ id: "50000000-0000-4000-8000-000000000022", form1095ARecordId: sourceId, marketplaceIdentifier: "Synthetic Marketplace", policyNumberLast4: "2121", coveredPersonIds: ["50000000-0000-4000-8000-000000000023"], allocationPercentage: "100.00", allocationReviewed: true, months: [{ month: 1, enrollmentPremium: "500.00", slcspPremium: "450.00", advancePtc: "400.00" }] }];
    const calculation = supportedCalculation({
      wages: [{ id: "w2-ptc-output", owner: "taxpayer", wages: "9000.00", federalWithholding: "0.00", socialSecurityWages: "9000.00" }], dividends: [], scheduleCActivities: [],
      advancedFederal: { ...structuredClone(emptyAdvancedFederalProfile2025), premiumTaxCredit, dueDiligenceSignatureCurrent: false, valid1095ARecordIds: [sourceId], valid1098ERecordIds: [], validActivityIds: [] },
    });
    const plan = buildFormRenderingPlan2025(calculation);
    expect(calculation.status).toBe("calculated_draft");
    expect(plan.requiredForms).toEqual(expect.arrayContaining(["Form 8962", "Form 8962 Monthly Reconciliation", "Schedule 3"]));
    expect(plan.pages.find(({ formName }) => formName === "Form 8962")?.lines).toEqual(expect.arrayContaining([expect.objectContaining({ line: "Exception", label: "Below-poverty exception applied", value: "Yes" })]));
    expect(plan.pages.find(({ formName }) => formName === "Form 8962 Monthly Reconciliation")?.lines).toEqual(expect.arrayContaining([expect.objectContaining({ line: "1f", value: "$450" }), expect.objectContaining({ line: "1g", value: "$400" })]));
    expect(plan.missingForms).toEqual([]);
  });

  it("renders filing status, dependents, Schedule A and Schedule 8812 from the reviewed profile", () => {
    const calculation = supportedCalculation({
      filingStatus: "head_of_household",
      filingStatusEligibilityConfirmed: true,
      dependents: [{ id: "dep-output", legalName: "Synthetic Child", dateOfBirth: "2015-06-15", relationship: "Child", monthsLivedWithTaxpayer: 12, qualifiesAsDependent: true, qualifiesForChildTaxCredit: true, hasValidSsnForChildTaxCredit: true, qualifiesForOtherDependentCredit: false, eligibilityReviewed: true }],
      scheduleA: { enabled: true, marriedFilingSeparatelySpouseItemizes: null, medicalAndDentalExpenses: "5000.00", stateLocalIncomeOrSalesTaxes: "12000.00", realEstateTaxes: "5000.00", personalPropertyTaxes: "0.00", otherTaxes: "0.00", homeMortgageInterestAndPoints: "10000.00", investmentInterest: "0.00", cashCharitableContributions: "1000.00", noncashCharitableContributions: "0.00", casualtyAndTheftLosses: "0.00", otherItemizedDeductions: "0.00", saltEligibilityConfirmed: true, mortgageLimitsApplied: true, charityLimitsApplied: true, casualtyLimitsApplied: false },
      eligibility: { ...supportedCalculationInput().eligibility, hasDependents: true, usesItemizedDeductions: true },
    });
    const plan = buildFormRenderingPlan2025(calculation);
    expect(plan.requiredForms).toEqual(expect.arrayContaining(["Form 1040", "Form 1040 Dependents", "Schedule A", "Schedule 8812"]));
    expect(plan.missingForms).toEqual([]);
    expect(plan.pages.find(({ formName }) => formName === "Form 1040")?.lines).toEqual(expect.arrayContaining([expect.objectContaining({ line: "Status", value: "head of household" }), expect.objectContaining({ line: "19" }), expect.objectContaining({ line: "28" })]));
    expect(plan.pages.find(({ formName }) => formName === "Schedule A")?.lines).toEqual(expect.arrayContaining([expect.objectContaining({ line: "5e", value: "$17,000" }), expect.objectContaining({ line: "17" })]));
    expect(plan.pages.find(({ formName }) => formName === "Schedule 8812")?.lines).toEqual(expect.arrayContaining([expect.objectContaining({ line: "4", value: "1" }), expect.objectContaining({ line: "27" })]));
  });

  it("renders the dependent worksheet and age/blindness addition in the Form 1040 calculation appendix", () => {
    const calculation = supportedCalculation({
      wages: [{ id: "w2-standard-deduction", owner: "taxpayer", wages: "5000.00", federalWithholding: "0.00", socialSecurityWages: "5000.00" }],
      dividends: [],
      scheduleCActivities: [],
      eligibility: { ...supportedCalculationInput().eligibility, claimableAsDependent: true, form8615ApplicabilityReviewed: true, form8615Required: false, taxpayerAge65OrOlder: true, ageBlindnessFactsReviewed: true },
    });
    const lines = buildFormRenderingPlan2025(calculation).pages.find(({ formName }) => formName === "Form 1040")?.lines;
    expect(lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ line: "Std. worksheet", value: "$5,450" }),
      expect.objectContaining({ line: "Std. addition", value: "$2,000" }),
      expect.objectContaining({ line: "12", value: "$7,450" }),
    ]));
  });

  it("renders gross and taxable Social Security benefits on Form 1040 lines 6a and 6b", () => {
    const calculation = supportedCalculation({
      wages: [{ id: "w2-social-security", owner: "taxpayer", wages: "30000.00", federalWithholding: "0.00", socialSecurityWages: "30000.00" }],
      dividends: [], scheduleCActivities: [],
      socialSecurityBenefits: [{ id: "ssa-output", owner: "taxpayer", sourceType: "SSA-1099", benefitsPaid: "20000.00", benefitsRepaid: "0.00", netBenefits: "20000.00", federalWithholding: "0.00", workersCompensationOffset: "0.00", lumpSumElectionApplies: false }],
    });
    const lines = buildFormRenderingPlan2025(calculation).pages.find(({ formName }) => formName === "Form 1040")?.lines;
    expect(lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ line: "6a", value: "$20,000" }),
      expect.objectContaining({ line: "6b", value: "$9,600" }),
    ]));
  });

  it("renders Form 6251, Schedule 2 and Form 1040 line 17 for a supported AMT case", () => {
    const eligibility = structuredClone(supportedCalculationInput().eligibility);
    eligibility.treatmentScreens.alternativeMinimumTax = "applies";
    const adjustments = structuredClone(emptyAdvancedFederalProfile2025.adjustments);
    adjustments.alternativeMinimumTax = { ...adjustments.alternativeMinimumTax, enabled: true, applicabilityReviewed: true, incentiveStockOptionAdjustment: "200000.00" };
    const calculation = supportedCalculation({
      eligibility,
      wages: [{ id: "w2-amt-output", owner: "taxpayer", wages: "150000.00", federalWithholding: "30000.00", socialSecurityWages: "150000.00" }],
      dividends: [], scheduleCActivities: [],
      advancedFederal: { ...structuredClone(emptyAdvancedFederalProfile2025), adjustments, dueDiligenceSignatureCurrent: false, valid1095ARecordIds: [], valid1098ERecordIds: [], validActivityIds: [] },
    });
    const plan = buildFormRenderingPlan2025(calculation);
    expect(plan.requiredForms).toEqual(expect.arrayContaining(["Form 6251", "Schedule 2"]));
    expect(plan.pages.find(({ formName }) => formName === "Form 6251")?.lines).toEqual(expect.arrayContaining([expect.objectContaining({ line: "11" })]));
    expect(plan.pages.find(({ formName }) => formName === "Form 1040")?.lines).toEqual(expect.arrayContaining([expect.objectContaining({ line: "17" })]));
    expect(plan.missingForms).toEqual([]);
  });

  it("renders Forms 8959 and 8960 and their Form 1040 and Schedule 2 destinations", () => {
    const eligibility = structuredClone(supportedCalculationInput().eligibility);
    eligibility.treatmentScreens.additionalMedicareTax = "applies";
    eligibility.treatmentScreens.netInvestmentIncomeTax = "applies";
    const adjustments = structuredClone(emptyAdvancedFederalProfile2025.adjustments);
    adjustments.additionalMedicareTax = { ...adjustments.additionalMedicareTax, enabled: true, applicabilityReviewed: true, withholdingReconciled: true };
    adjustments.netInvestmentIncomeTax = { ...adjustments.netInvestmentIncomeTax, enabled: true, applicabilityReviewed: true, classificationsReviewed: true };
    const calculation = supportedCalculation({
      eligibility,
      wages: [{ id: "w2-additional-taxes", owner: "taxpayer", wages: "260000.00", federalWithholding: "55000.00", socialSecurityWages: "176100.00", medicareWagesAndTips: "260000.00", medicareTaxWithheld: "4000.00" }],
      interest: [{ id: "int-additional-taxes", payerName: "Synthetic Bank", ordinaryInterest: "20000.00", treasuryInterest: "0.00", taxExemptInterest: "0.00", federalWithholding: "0.00" }],
      dividends: [{ id: "div-additional-taxes", payerName: "Synthetic Fund", ordinaryDividends: "10000.00", qualifiedDividends: "0.00", exemptInterestDividends: "0.00", section199ADividends: "0.00", federalWithholding: "0.00" }],
      scheduleCActivities: [],
      advancedFederal: { ...structuredClone(emptyAdvancedFederalProfile2025), adjustments, dueDiligenceSignatureCurrent: false, valid1095ARecordIds: [], valid1098ERecordIds: [], validActivityIds: [] },
    });
    const plan = buildFormRenderingPlan2025(calculation);
    expect(plan.requiredForms).toEqual(expect.arrayContaining(["Form 8959", "Form 8960", "Schedule 2"]));
    expect(plan.renderedForms).toEqual(expect.arrayContaining(["Form 8959", "Form 8960", "Schedule 2"]));
    expect(plan.missingForms).toEqual([]);
    expect(plan.pages.find(({ formName }) => formName === "Form 1040")?.lines).toEqual(expect.arrayContaining([expect.objectContaining({ line: "25c", value: "$230" })]));
  });

  it("renders Schedule EIC, Form 2441, Form 8863 and Schedule 3 from calculated credits", () => {
    const childId = "40000000-0000-4000-8000-000000000001";
    const calculation = supportedCalculation({
      filingStatus: "head_of_household", filingStatusEligibilityConfirmed: true,
      dependents: [{ id: childId, legalName: "Synthetic Child", dateOfBirth: "2015-06-15", relationship: "Child", monthsLivedWithTaxpayer: 12, qualifiesAsDependent: true, qualifiesForChildTaxCredit: true, hasValidSsnForChildTaxCredit: true, qualifiesForOtherDependentCredit: false, eligibilityReviewed: true }],
      eligibility: { ...supportedCalculationInput().eligibility, hasDependents: true },
      federalCredits: {
        ...structuredClone(emptyFederalCreditProfile2025), employerDependentCareBenefits: "0.00", valid1098TRecordIds: ["40000000-0000-4000-8000-000000000006"],
        eitc: { ...emptyFederalCreditProfile2025.eitc, enabled: true, eligibilityReviewed: true, taxpayerAgeAtYearEnd: 35, taxpayerWorkEligibleIdentifier: true, notQualifyingChildOfAnother: true, noForm2555: true, noPriorDisallowance: true, noCombatPayElection: true, qualifyingChildren: [{ id: "40000000-0000-4000-8000-000000000002", dependentId: childId, relationshipTest: true, ageTest: true, residencyTest: true, jointReturnTest: true, validWorkEligibleIdentifier: true, notClaimedByOther: true, disabilityException: false }] },
        dependentCare: { ...emptyFederalCreditProfile2025.dependentCare, enabled: true, workRelatedExpensesConfirmed: true, providers: [{ id: "40000000-0000-4000-8000-000000000003", name: "Synthetic Care", address: "1 Test St", tinLast4: "1234", eligibleConfirmed: true, amountPaid: "3000.00" }], qualifyingPersons: [{ id: "40000000-0000-4000-8000-000000000004", dependentId: childId, name: "Synthetic Child", expenses: "3000.00", qualifiesConfirmed: true }] },
        education: { enabled: true, students: [{ id: "40000000-0000-4000-8000-000000000005", personRole: "taxpayer", dependentId: null, name: "Synthetic Taxpayer", institutionName: "Synthetic University", form1098TRecordId: "40000000-0000-4000-8000-000000000006", creditType: "aotc", qualifiedExpenses: "4000.00", taxFreeAssistance: "0.00", eligibleInstitution: true, firstFourYears: true, atLeastHalfTime: true, degreeCandidate: true, noFelonyDrugConviction: true, priorAotcYears: 0, refundabilityConfirmed: true }] },
      },
    });
    const plan = buildFormRenderingPlan2025(calculation);
    expect(plan.requiredForms).toEqual(expect.arrayContaining(["Schedule EIC", "Form 2441", "Form 8863", "Schedule 3"]));
    expect(plan.missingForms).toEqual([]);
    expect(plan.pages.find(({ formName }) => formName === "Form 1040")?.lines).toEqual(expect.arrayContaining([expect.objectContaining({ line: "20" }), expect.objectContaining({ line: "27a" }), expect.objectContaining({ line: "29" }), expect.objectContaining({ line: "33" })]));
  });

  it("renders Form 8995-A and applicable Schedules A through D without package gaps", () => {
    const adjustments = structuredClone(emptyAdvancedFederalProfile2025.adjustments);
    adjustments.qualifiedBusinessIncome = { schemaVersion: "2025.1", enabled: true, priorQualifiedBusinessLoss: "100.00", lossesReviewed: true, aggregationReviewed: true, publiclyTradedPartnershipIncome: "500.00", publiclyTradedPartnershipLossCarryover: "0.00", trades: [{ id: "50000000-0000-4000-8000-000000000091", activityId: "50000000-0000-4000-8000-000000000092", name: "Synthetic consulting", specifiedServiceTradeOrBusiness: true, w2Wages: "10000.00", unadjustedBasisImmediatelyAfterAcquisition: "20000.00", qualifiedIncomeAdjustment: "0.00", patronReduction: "0.00", aggregationGroup: "Synthetic group", classificationReviewed: true }] };
    adjustments.netInvestmentIncomeTax = { ...adjustments.netInvestmentIncomeTax, enabled: true, applicabilityReviewed: true, classificationsReviewed: true };
    const eligibility = structuredClone(supportedCalculationInput().eligibility);
    eligibility.treatmentScreens.netInvestmentIncomeTax = "applies";
    const calculation = supportedCalculation({
      eligibility,
      scheduleCActivities: [{ id: "50000000-0000-4000-8000-000000000092", name: "Synthetic consulting", owner: "taxpayer", grossReceipts: "50000.00", expenses: { supplies: "5000.00" }, qbiEligible: true, selfEmploymentTreatmentConfirmed: true, receiptBasis: "source_plus_additional_receipts" }],
      retirementDistributions: [{ id: "pension-high", owner: "taxpayer", grossDistribution: "130000.00", taxableAmount: "130000.00", federalWithholding: "0.00", distributionCode: "7", iraSepSimple: false, taxableAmountNotDetermined: false }],
      advancedFederal: { ...structuredClone(emptyAdvancedFederalProfile2025), adjustments, dueDiligenceSignatureCurrent: false, valid1095ARecordIds: [], valid1098ERecordIds: [], validActivityIds: ["50000000-0000-4000-8000-000000000092"] },
    });
    expect(calculation.status, JSON.stringify(calculation.diagnostics)).toBe("calculated_draft");
    const plan = buildFormRenderingPlan2025(calculation);
    expect(plan.requiredForms).toEqual(expect.arrayContaining(["Form 8995-A", "Form 8995-A Schedule A", "Form 8995-A Schedule B", "Form 8995-A Schedule C", "Form 8995-A Schedule D"]));
    expect(plan.missingForms).toEqual([]);
  });
});

function supportedCalculationInput(): CalculationInput2025 {
  return {
    calculationId: "CALC-SYNTHETIC", inputRevision: 28, filingStatus: "single",
    eligibility: {
      fullYearUsResident: true, claimableAsDependent: false, hasDependents: false,
      taxpayerAge65OrOlder: false, taxpayerBlind: false, spouseAge65OrOlder: false, spouseBlind: false,
      usesItemizedDeductions: false, allRequiredIntakeAnswered: true, documentsCompleteAttested: true,
      unsupportedApplicableTopics: [],
      treatmentScreens: { earnedIncomeCredit: "ruled_out", otherCredits: "ruled_out", alternativeMinimumTax: "ruled_out", netInvestmentIncomeTax: "ruled_out", additionalMedicareTax: "ruled_out", schedule1AAdditionalDeductions: "ruled_out", estimatedOrExtensionPayments: "ruled_out", specialFilingElection: "ruled_out" },
    },
    scheduleBScreening: { foreignAccount: "no", foreignTrust: "no", otherScheduleBTrigger: "no" },
    wages: [{ id: "w2", owner: "taxpayer", wages: "60000.00", federalWithholding: "7000.00", socialSecurityWages: "60000.00" }],
    interest: [],
    dividends: [{ id: "div", payerName: "Synthetic Fund", ordinaryDividends: "2000.00", qualifiedDividends: "1000.00", exemptInterestDividends: "0.00", section199ADividends: "500.00", federalWithholding: "100.00" }],
    scheduleCActivities: [{ id: "business", name: "Synthetic Consulting", owner: "taxpayer", grossReceipts: "5000.00", expenses: { supplies: "500.00" }, qbiEligible: true, receiptBasis: "source_plus_additional_receipts" }],
    businessWithholding: [],
  };
}

function supportedCalculation(overrides: Partial<CalculationInput2025> = {}) {
  const input = { ...supportedCalculationInput(), ...overrides };
  return calculateFederalReturn2025(input);
}
