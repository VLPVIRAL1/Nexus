import ExcelJS from "exceljs";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { canonicalReturnFixture } from "../fixtures/canonical-return";
import { exportCanonicalJson } from "../../src/services/outputs/json-export-service";
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

  it("generates a workbook with required foundation sheets and run identity", async () => {
    const calculationResult = supportedCalculation();
    const formPlan = buildFormRenderingPlan2025(calculationResult);
    const bytes = await generateWorkpaper({ data: canonicalReturnFixture, runId: "CALC-SYNTHETIC", calculationStatus: "partial", diagnostics: [], calculationResult, requiredForms: formPlan.requiredForms, renderedForms: formPlan.renderedForms });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes.buffer as ArrayBuffer);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["Cover & Tax Summary", "Source Index", "Income & Withholding", "Open Review Points", "Mapping Reconciliation", "Required Forms", "Unsupported Treatments", "Manual Overrides", "Calculation Trace", "Raw Source Fields"]);
    expect(workbook.getWorksheet("Cover & Tax Summary")?.getCell("B4").value).toBe("CALC-SYNTHETIC");
    expect(workbook.getWorksheet("Required Forms")?.rowCount).toBeGreaterThan(2);
    expect(workbook.getWorksheet("Calculation Trace")?.rowCount).toBeGreaterThan(2);
    expect(workbook.getWorksheet("Income & Withholding")?.getCell("E2").value).toBe(0);
  });

  it("generates a partial package with a cover and every controlled internal form preview", async () => {
    const formPlan = buildFormRenderingPlan2025(supportedCalculation());
    const result = await generateDraftReturnPackage({ taxYear: 2025, inputRevision: 28, calculationRunId: "CALC-SYNTHETIC", engineVersion: "not-approved", ruleVersion: "not-approved", requiredForms: formPlan.requiredForms, renderedForms: formPlan.renderedForms, missingForms: formPlan.missingForms, supportStatus: "partial" }, formPlan.pages);
    const pdf = await PDFDocument.load(result.bytes);
    expect(pdf.getPageCount()).toBe(1 + formPlan.pages.length);
    expect(formPlan.renderedForms).toEqual(expect.arrayContaining(["Form 1040", "Schedule B", "Schedule C", "Schedule SE", "Schedule 1", "Schedule 2", "Form 8995", "Qualified Dividends Tax Worksheet"]));
    expect(result.manifest.missingForms).toEqual([]);
    expect(result.sha256).toHaveLength(64);
  });
});

function supportedCalculation() {
  const input: CalculationInput2025 = {
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
  return calculateFederalReturn2025(input);
}
