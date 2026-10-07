import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  calculateFederalReturn2025,
  ordinaryIncomeTax2025,
  qualifiedDividendTax2025,
  resolveDependencyGraph,
  rulePackage2025,
  type CalculationInput2025,
} from "../../src/tax-engine/2025";

function supportedInput(overrides: Partial<CalculationInput2025> = {}): CalculationInput2025 {
  return {
    calculationId: "calc-fixture",
    inputRevision: 1,
    filingStatus: "single",
    eligibility: {
      fullYearUsResident: true,
      claimableAsDependent: false,
      hasDependents: false,
      taxpayerAge65OrOlder: false,
      taxpayerBlind: false,
      spouseAge65OrOlder: false,
      spouseBlind: false,
      usesItemizedDeductions: false,
      allRequiredIntakeAnswered: true,
      documentsCompleteAttested: true,
      unsupportedApplicableTopics: [],
      treatmentScreens: {
        earnedIncomeCredit: "ruled_out",
        otherCredits: "ruled_out",
        alternativeMinimumTax: "ruled_out",
        netInvestmentIncomeTax: "ruled_out",
        additionalMedicareTax: "ruled_out",
        schedule1AAdditionalDeductions: "ruled_out",
        estimatedOrExtensionPayments: "ruled_out",
        specialFilingElection: "ruled_out",
      },
    },
    scheduleBScreening: { foreignAccount: "no", foreignTrust: "no", otherScheduleBTrigger: "no" },
    wages: [],
    interest: [],
    dividends: [],
    scheduleCActivities: [],
    businessWithholding: [],
    ...overrides,
  };
}

describe("2025 tax method registry", () => {
  it("terminates dependency evaluation and reports cycles", () => {
    expect(resolveDependencyGraph({ a: ["b"], b: ["c"], c: [] })).toEqual({ order: ["c", "b", "a"], cycles: [] });
    expect(resolveDependencyGraph({ a: ["b"], b: ["a"] }).cycles).toEqual([["a", "b", "a"]]);
  });

  it("matches the official IRS tax-table example and method boundary", () => {
    expect(ordinaryIncomeTax2025(25300, "married_filing_jointly").toFixed(0)).toBe("2562");
    expect(ordinaryIncomeTax2025(99999, "single").toFixed(0)).toBe("16909");
    expect(ordinaryIncomeTax2025(100000, "single").toFixed(0)).toBe("16914");
    expect(ordinaryIncomeTax2025(103350, "single").toFixed(0)).toBe("17651");
    expect(ordinaryIncomeTax2025(103351, "single").toFixed(0)).toBe("17651");
  });

  it("applies the published qualified-dividend worksheet ceilings", () => {
    const result = qualifiedDividendTax2025(100000, 20000, "single");
    expect(result.ordinaryIncomePortion.toFixed(0)).toBe("80000");
    expect(result.zeroRateAmount.toFixed(0)).toBe("0");
    expect(result.fifteenRateAmount.toFixed(0)).toBe("20000");
    expect(result.twentyRateAmount.toFixed(0)).toBe("0");
    expect(result.tax.toFixed(0)).toBe("15520");
  });

  it("pins every archived authority to its reviewed manifest hash", async () => {
    const packageDirectory = fileURLToPath(new URL("../../src/tax-engine/2025/", import.meta.url));
    for (const source of rulePackage2025.sources) {
      const bytes = await readFile(`${packageDirectory}/${source.archivedFile}`);
      expect(createHash("sha256").update(bytes).digest("hex"), source.id).toBe(source.sha256);
    }
  });
});

describe("2025 supported return graph", () => {
  it("calculates a supported single wage return and reconciles withholding", () => {
    const result = calculateFederalReturn2025(supportedInput({
      wages: [{ id: "w2-1", owner: "taxpayer", wages: "100000.00", federalWithholding: "15000.00", socialSecurityWages: "100000.00" }],
    }));

    expect(result.status).toBe("calculated_draft");
    expect(result.forms?.form1040).toMatchObject({
      wages: "100000",
      adjustedGrossIncome: "100000",
      standardDeduction: "15750",
      taxableIncome: "84250",
      incomeTax: "13455",
      totalTax: "13455",
      federalWithholding: "15000",
      refund: "1545",
      amountOwed: "0",
    });
    expect(result.trace.find(({ nodeId }) => nodeId === "form-1040.income-tax")?.ruleId).toBe("IRS-TAX-TABLE");
  });

  it("applies only the registered income-tax override and recomputes downstream totals", () => {
    const result = calculateFederalReturn2025(supportedInput({
      wages: [{ id: "w2-override", owner: "taxpayer", wages: "100000.00", federalWithholding: "15000.00", socialSecurityWages: "100000.00" }],
      approvedOverrides: { form1040IncomeTax: "13000.00" },
    }));
    expect(result.forms?.form1040).toMatchObject({ incomeTax: "13000", totalTax: "13000", refund: "2000", amountOwed: "0" });
    expect(result.trace.find(({ nodeId }) => nodeId === "form-1040.income-tax")).toMatchObject({ ruleId: "APPROVED-MANUAL-OVERRIDE", result: "13000" });
    expect(result.diagnostics.some(({ code }) => code === "MANUAL_OVERRIDE_APPLIED")).toBe(true);
  });

  it("aggregates self-employment by owner, applies wage-base interaction, and closes QBI dependencies", () => {
    const result = calculateFederalReturn2025(supportedInput({
      filingStatus: "married_filing_jointly",
      wages: [
        { id: "w2-taxpayer", owner: "taxpayer", wages: "170000.00", federalWithholding: "25000.00", socialSecurityWages: "170000.00" },
        { id: "w2-spouse", owner: "spouse", wages: "20000.00", federalWithholding: "2000.00", socialSecurityWages: "20000.00" },
      ],
      interest: [{ id: "int-1", payerName: "Treasury Bank", ordinaryInterest: "1200.00", treasuryInterest: "400.00", taxExemptInterest: "100.00", federalWithholding: "0.00" }],
      dividends: [{ id: "div-1", payerName: "Fund", ordinaryDividends: "5000.00", qualifiedDividends: "4000.00", exemptInterestDividends: "200.00", section199ADividends: "0.00", federalWithholding: "100.00" }],
      scheduleCActivities: [
        { id: "c-taxpayer", name: "Consulting", owner: "taxpayer", grossReceipts: "10000.00", expenses: {}, qbiEligible: true, receiptBasis: "source_plus_additional_receipts" },
        { id: "c-spouse", name: "Design", owner: "spouse", grossReceipts: "10000.00", expenses: { supplies: "2000.00" }, qbiEligible: true, receiptBasis: "source_plus_additional_receipts" },
      ],
      businessWithholding: [{ sourceId: "nec-1", sourceType: "1099-NEC", federalWithholding: "500.00" }],
    }));

    expect(result.status).toBe("calculated_draft");
    expect(result.forms?.scheduleSE).toEqual([
      { owner: "taxpayer", netProfit: "10000", netEarnings: "9235", socialSecurityWages: "170000", socialSecurityTax: "756", medicareTax: "268", selfEmploymentTax: "1024", deductibleHalf: "512" },
      { owner: "spouse", netProfit: "8000", netEarnings: "7388", socialSecurityWages: "20000", socialSecurityTax: "916", medicareTax: "214", selfEmploymentTax: "1130", deductibleHalf: "565" },
    ]);
    expect(result.forms?.schedule1).toEqual({ businessIncome: "18000", deductiblePartOfSelfEmploymentTax: "1077" });
    expect(result.forms?.schedule2).toEqual({ selfEmploymentTax: "2154" });
    expect(result.forms?.form8995).toEqual({ qbi: "16923", section199ADividends: "0", incomeLimitationBase: "178023", deduction: "3385" });
    expect(result.forms?.scheduleB.required).toBe(true);
    expect(result.forms?.form1040).toMatchObject({ taxExemptInterest: "300", taxableInterest: "1600", qualifiedDividends: "4000", ordinaryDividends: "5000", qbiDeduction: "3385" });
    expect(result.forms?.form1040).toEqual({
      wages: "190000", taxExemptInterest: "300", taxableInterest: "1600", qualifiedDividends: "4000", ordinaryDividends: "5000",
      totalIncome: "214600", adjustedGrossIncome: "213523", standardDeduction: "31500", qbiDeduction: "3385", taxableIncome: "178638",
      incomeTax: "28848", selfEmploymentTax: "2154", totalTax: "31002", federalWithholding: "27600", refund: "0", amountOwed: "3402",
    });
    expect(result.dependencyManifest.every(({ status }) => status === "evaluated")).toBe(true);
  });

  it("includes eligible Section 199A dividends in the simplified Form 8995 limitation", () => {
    const result = calculateFederalReturn2025(supportedInput({
      wages: [{ id: "w2-1", owner: "taxpayer", wages: "60000.00", federalWithholding: "0.00", socialSecurityWages: "60000.00" }],
      dividends: [{ id: "div-1", payerName: "REIT", ordinaryDividends: "1000.00", qualifiedDividends: "0.00", exemptInterestDividends: "0.00", section199ADividends: "1000.00", federalWithholding: "0.00" }],
    }));
    expect(result.forms?.form8995).toEqual({ qbi: "0", section199ADividends: "1000", incomeLimitationBase: "45250", deduction: "200" });
    expect(result.forms?.form1040.taxableIncome).toBe("45050");
  });

  it("blocks unknown applicability and unsupported cases without emitting forms", () => {
    const result = calculateFederalReturn2025(supportedInput({
      scheduleBScreening: { foreignAccount: "unknown", foreignTrust: "no", otherScheduleBTrigger: "no" },
      eligibility: { ...supportedInput().eligibility, unsupportedApplicableTopics: ["estimated payments"] },
    }));
    expect(result.status).toBe("blocked");
    expect(result.forms).toBeNull();
    expect(result.diagnostics.map(({ code }) => code)).toEqual(expect.arrayContaining(["SCHEDULE_B_QUESTION_UNKNOWN", "UNSUPPORTED_TOPIC_APPLIES"]));
  });

  it("rejects spouse-owned inputs on a Single return", () => {
    const result = calculateFederalReturn2025(supportedInput({
      wages: [{ id: "w2-spouse", owner: "spouse", wages: "1000.00", federalWithholding: "0.00", socialSecurityWages: "1000.00" }],
    }));
    expect(result.status).toBe("blocked");
    expect(result.diagnostics.some(({ code }) => code === "SPOUSE_DATA_INVALID_FOR_SINGLE")).toBe(true);
  });

  it("blocks Form 8995-A cases instead of applying a blanket 20 percent deduction", () => {
    const result = calculateFederalReturn2025(supportedInput({
      wages: [{ id: "w2-1", owner: "taxpayer", wages: "300000.00", federalWithholding: "0.00", socialSecurityWages: "176100.00" }],
      scheduleCActivities: [{ id: "c-1", name: "Consulting", owner: "taxpayer", grossReceipts: "10000.00", expenses: {}, qbiEligible: true, receiptBasis: "source_plus_additional_receipts" }],
    }));
    expect(result.status).toBe("blocked");
    expect(result.forms).toBeNull();
    expect(result.diagnostics.some(({ code }) => code === "FORM_8995_A_REQUIRED")).toBe(true);
    expect(result.diagnostics.some(({ code }) => code === "ADDITIONAL_MEDICARE_TAX_REQUIRED")).toBe(true);
  });
});
