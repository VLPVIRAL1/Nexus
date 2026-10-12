import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
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
    expect(completePayload).toMatchObject({ schema_version: "1.0.0", tax_year: 2025, return_type: "1040" });
    expect(createHash("sha256").update(complete.bytes).digest("hex")).toBe(complete.sha256);

    const blank = exportCanonicalJson(canonicalReturnFixture, "blank_template");
    const parsed = JSON.parse(new TextDecoder().decode(blank.bytes));
    expect(() => canonicalTaxReturnSchema.parse(parsed)).not.toThrow();
    expect(parsed).toMatchObject({ client: {}, taxpayer: {}, spouse: null, dependents: [], source_documents: [], mappings: [] });
    expect(JSON.stringify(parsed)).not.toContain(canonicalReturnFixture.clientId);
    expect(createHash("sha256").update(blank.bytes).digest("hex")).toBe(blank.sha256);
    expect(parsed._instructions.critical_rules).toContain("Preserve all W-2 Box 12 code entries.");
    expect(parsed.metadata.supported_source_forms).toEqual(["W-2", "1099-NEC", "1099-MISC", "1099-INT", "1099-DIV", "1099-B", "1099-G", "1099-K", "1099-R", "1099-SA"]);
    expect(createBlankCanonicalTemplate2025()).toEqual(parsed);
  });

  it("publishes a schema-valid synthetic import-to-1040 review example", () => {
    const example = createSupportedReviewExample2025();
    expect(() => canonicalTaxReturnSchema.parse(example)).not.toThrow();
    expect(example.metadata.synthetic_review_example).toBe(true);
    expect(example.forms).toMatchObject({ w2: [expect.any(Object)], form_1099_b: [expect.any(Object)], form_1099_g: [expect.any(Object)], form_1099_r: [expect.any(Object)], form_1099_sa: [expect.any(Object)], form_1099_k: [] });
  });

  it("exports filing profile, dependent and Schedule A data in the importable canonical shape", () => {
    const complete = exportCanonicalJson({
      ...canonicalReturnFixture,
      filingProfile: { status: "head_of_household", eligibilityConfirmed: true },
      dependents: [{ id: "10000000-0000-4000-8000-000000000099", legal_name: "Synthetic Child", facts: { dateOfBirth: "2015-06-15", relationship: "Child", monthsLivedWithTaxpayer: 12, qualifiesAsDependent: true, qualifiesForChildTaxCredit: true, hasValidSsnForChildTaxCredit: true, qualifiesForOtherDependentCredit: false, eligibilityReviewed: true } }],
      scheduleA: { enabled: true, marriedFilingSeparatelySpouseItemizes: null, medicalAndDentalExpenses: "1000.00", stateLocalIncomeOrSalesTaxes: "12000.00", realEstateTaxes: "5000.00", personalPropertyTaxes: "0.00", otherTaxes: "0.00", homeMortgageInterestAndPoints: "0.00", investmentInterest: "0.00", cashCharitableContributions: "500.00", noncashCharitableContributions: "0.00", casualtyAndTheftLosses: "0.00", otherItemizedDeductions: "0.00", saltEligibilityConfirmed: true, mortgageLimitsApplied: false, charityLimitsApplied: true, casualtyLimitsApplied: false },
      sourceForms: [{ id: "10000000-0000-4000-8000-000000000101", externalSourceId: "round-trip-w2", sourceDocumentId: "20000000-0000-4000-8000-000000000101", formType: "W2", formYear: 2025, owner: "taxpayer", ownerPersonId: null, accountNumber: null, corrected: false, void: false, secondTinNotice: null, fatcaIndicator: null, version: 1, rawFields: [], unmappedSourceFields: [], employer: {}, employee: {}, federal: { box1: "50000.00", box2: "5000.00", box3: "50000.00" }, box12: [], box13: {}, box14: [], stateRows: [], localRows: [] }] as any,
    }, "complete");
    const payload = canonicalTaxReturnSchema.parse(JSON.parse(new TextDecoder().decode(complete.bytes)));
    expect(payload).toMatchObject({ filing_profile: { status: "head_of_household", eligibility_confirmed: true }, dependents: [{ legal_name: "Synthetic Child", qualifies_for_child_tax_credit: true }], schedule_a: { enabled: true, state_local_income_or_sales_taxes: "12000.00", real_estate_taxes: "5000.00" } });
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
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["Cover & Tax Summary", "Source Index", "Income & Withholding", "Open Review Points", "Mapping Reconciliation", "Required Forms", "Unsupported Treatments", "Manual Overrides", "Calculation Trace", "Raw Source Fields"]);
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
