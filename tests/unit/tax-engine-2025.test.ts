import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { emptyFederalCreditProfile2025, type FederalCreditProfile2025 } from "../../src/domain/federal-credits-2025";
import { emptyAdvancedFederalProfile2025 } from "../../src/domain/advanced-federal-2025";
import {
  calculateFederalReturn2025,
  ordinaryIncomeTax2025,
  qualifiedDividendTax2025,
  resolveDependencyGraph,
  rulePackage2025,
  type CalculationInput2025,
  type FilingStatus2025,
  type ScheduleAInput2025,
} from "../../src/tax-engine/2025";

function scheduleA(overrides: Partial<ScheduleAInput2025> = {}): ScheduleAInput2025 {
  return {
    enabled: false,
    marriedFilingSeparatelySpouseItemizes: null,
    medicalAndDentalExpenses: "0.00",
    stateLocalIncomeOrSalesTaxes: "0.00",
    realEstateTaxes: "0.00",
    personalPropertyTaxes: "0.00",
    otherTaxes: "0.00",
    homeMortgageInterestAndPoints: "0.00",
    investmentInterest: "0.00",
    cashCharitableContributions: "0.00",
    noncashCharitableContributions: "0.00",
    casualtyAndTheftLosses: "0.00",
    otherItemizedDeductions: "0.00",
    saltEligibilityConfirmed: false,
    mortgageLimitsApplied: false,
    charityLimitsApplied: false,
    casualtyLimitsApplied: false,
    ...overrides,
  };
}

function qualifyingChild(id = "dep-1") {
  return {
    id,
    legalName: "Synthetic Child",
    dateOfBirth: "2015-06-15",
    relationship: "Child",
    monthsLivedWithTaxpayer: 12,
    qualifiesAsDependent: true,
    qualifiesForChildTaxCredit: true,
    hasValidSsnForChildTaxCredit: true,
    qualifiesForOtherDependentCredit: false,
    eligibilityReviewed: true,
  };
}

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

function creditProfile(overrides: { eitc?: Partial<FederalCreditProfile2025["eitc"]>; dependentCare?: Partial<FederalCreditProfile2025["dependentCare"]>; education?: Partial<FederalCreditProfile2025["education"]> } = {}): NonNullable<CalculationInput2025["federalCredits"]> {
  return {
    ...structuredClone(emptyFederalCreditProfile2025),
    eitc: { ...emptyFederalCreditProfile2025.eitc, ...overrides.eitc },
    dependentCare: { ...emptyFederalCreditProfile2025.dependentCare, ...overrides.dependentCare },
    education: { ...emptyFederalCreditProfile2025.education, ...overrides.education },
    employerDependentCareBenefits: "0.00",
    valid1098TRecordIds: [],
  };
}

function advancedProfile(overrides: Partial<NonNullable<CalculationInput2025["advancedFederal"]>> = {}): NonNullable<CalculationInput2025["advancedFederal"]> {
  return { ...structuredClone(emptyAdvancedFederalProfile2025), dueDiligenceSignatureCurrent: false, valid1095ARecordIds: [], valid1098ERecordIds: [], validActivityIds: [], ...overrides };
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

  it("uses the correct 2025 tax computation column for every filing status", () => {
    const expected: Record<FilingStatus2025, string> = {
      single: "16914",
      married_filing_jointly: "11828",
      married_filing_separately: "16914",
      head_of_household: "15175",
      qualifying_surviving_spouse: "11828",
    };
    for (const [status, tax] of Object.entries(expected) as Array<[FilingStatus2025, string]>) {
      expect(ordinaryIncomeTax2025(100000, status).toFixed(0), status).toBe(tax);
    }
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
  it("calculates the 2025 EITC and emits Schedule EIC for a reviewed qualifying child", () => {
    const child = qualifyingChild("10000000-0000-4000-8000-000000000001");
    const result = calculateFederalReturn2025(supportedInput({
      filingStatus: "head_of_household", filingStatusEligibilityConfirmed: true, dependents: [child],
      eligibility: { ...supportedInput().eligibility, hasDependents: true },
      wages: [{ id: "w2-eitc", owner: "taxpayer", wages: "20000.00", federalWithholding: "0.00", socialSecurityWages: "20000.00" }],
      federalCredits: creditProfile({ eitc: { enabled: true, eligibilityReviewed: true, taxpayerAgeAtYearEnd: 32, taxpayerWorkEligibleIdentifier: true, notQualifyingChildOfAnother: true, noForm2555: true, noPriorDisallowance: true, noCombatPayElection: true, investmentIncome: "0.00", qualifyingChildren: [{ id: "10000000-0000-4000-8000-000000000002", dependentId: child.id, relationshipTest: true, ageTest: true, residencyTest: true, jointReturnTest: true, validWorkEligibleIdentifier: true, notClaimedByOther: true, disabilityException: false }] } }),
    }));
    expect(result.status).toBe("calculated_draft");
    expect(result.forms?.scheduleEic).toMatchObject({ required: true, credit: "4328", earnedIncome: "20000", adjustedGrossIncome: "20000" });
    expect(result.forms?.form1040).toMatchObject({ earnedIncomeCredit: "4328", additionalChildTaxCredit: "1700", totalPayments: "6028", refund: "6028" });
  });

  it("blocks EITC above the investment-income ceiling", () => {
    const result = calculateFederalReturn2025(supportedInput({
      wages: [{ id: "w2-eitc-limit", owner: "taxpayer", wages: "15000.00", federalWithholding: "0.00", socialSecurityWages: "15000.00" }],
      federalCredits: creditProfile({ eitc: { enabled: true, eligibilityReviewed: true, taxpayerAgeAtYearEnd: 30, taxpayerWorkEligibleIdentifier: true, notQualifyingChildOfAnother: true, noForm2555: true, noPriorDisallowance: true, noCombatPayElection: true, investmentIncome: "11950.01" } }),
    }));
    expect(result.status).toBe("blocked");
    expect(result.diagnostics.map(({ code }) => code)).toContain("EITC_INVESTMENT_INCOME_LIMIT");
  });

  it("calculates Form 2441 and Schedule 3 from reconciled providers and qualifying persons", () => {
    const child = qualifyingChild("20000000-0000-4000-8000-000000000001");
    const result = calculateFederalReturn2025(supportedInput({
      filingStatus: "head_of_household", filingStatusEligibilityConfirmed: true, dependents: [child],
      eligibility: { ...supportedInput().eligibility, hasDependents: true },
      wages: [{ id: "w2-care", owner: "taxpayer", wages: "70000.00", federalWithholding: "0.00", socialSecurityWages: "70000.00" }],
      federalCredits: creditProfile({ dependentCare: { enabled: true, workRelatedExpensesConfirmed: true, providers: [{ id: "20000000-0000-4000-8000-000000000002", name: "Synthetic Care", address: "100 Test St", tinLast4: "1234", eligibleConfirmed: true, amountPaid: "3000.00" }], qualifyingPersons: [{ id: "20000000-0000-4000-8000-000000000003", dependentId: child.id, name: child.legalName, expenses: "3000.00", qualifiesConfirmed: true }] } }),
    }));
    expect(result.status).toBe("calculated_draft");
    expect(result.forms?.form2441).toMatchObject({ required: true, qualifiedExpenses: "3000", applicablePercentage: "0.20", credit: "600" });
    expect(result.forms?.schedule3).toMatchObject({ dependentCareCredit: "600", educationCredit: "0", totalNonrefundableCredits: "600" });
  });

  it("calculates AOTC refundable and nonrefundable portions through Form 8863", () => {
    const result = calculateFederalReturn2025(supportedInput({
      filingStatusEligibilityConfirmed: true,
      wages: [{ id: "w2-aotc", owner: "taxpayer", wages: "60000.00", federalWithholding: "0.00", socialSecurityWages: "60000.00" }],
      federalCredits: { ...creditProfile({ education: { enabled: true, students: [{ id: "30000000-0000-4000-8000-000000000001", personRole: "taxpayer", dependentId: null, name: "Synthetic Student", institutionName: "Synthetic University", form1098TRecordId: "30000000-0000-4000-8000-000000000002", creditType: "aotc", qualifiedExpenses: "4000.00", taxFreeAssistance: "0.00", eligibleInstitution: true, firstFourYears: true, atLeastHalfTime: true, degreeCandidate: true, noFelonyDrugConviction: true, priorAotcYears: 0, refundabilityConfirmed: true }] } }), valid1098TRecordIds: ["30000000-0000-4000-8000-000000000002"] },
    }));
    expect(result.status).toBe("calculated_draft");
    expect(result.forms?.form8863).toMatchObject({ required: true, tentativeAmericanOpportunityCredit: "2500", phaseoutFactor: "1.0000", nonrefundableCredit: "1500", refundableAmericanOpportunityCredit: "1000" });
    expect(result.forms?.form1040).toMatchObject({ educationCredit: "1500", refundableAmericanOpportunityCredit: "1000" });
  });

  it("blocks an education credit until the student is linked to an effective Form 1098-T", () => {
    const result = calculateFederalReturn2025(supportedInput({
      wages: [{ id: "w2-aotc-unlinked", owner: "taxpayer", wages: "60000.00", federalWithholding: "0.00", socialSecurityWages: "60000.00" }],
      federalCredits: creditProfile({ education: { enabled: true, students: [{ id: "30000000-0000-4000-8000-000000000003", personRole: "taxpayer", dependentId: null, name: "Synthetic Student", institutionName: "Synthetic University", form1098TRecordId: null, creditType: "aotc", qualifiedExpenses: "4000.00", taxFreeAssistance: "0.00", eligibleInstitution: true, firstFourYears: true, atLeastHalfTime: true, degreeCandidate: true, noFelonyDrugConviction: true, priorAotcYears: 0, refundabilityConfirmed: true }] } }),
    }));
    expect(result.status).toBe("blocked");
    expect(result.diagnostics.map(({ code }) => code)).toContain("FORM_1098_T_REQUIRED");
  });

  it("calculates the Lifetime Learning Credit as a nonrefundable Schedule 3 credit", () => {
    const form1098TRecordId = "30000000-0000-4000-8000-000000000004";
    const result = calculateFederalReturn2025(supportedInput({
      wages: [{ id: "w2-llc", owner: "taxpayer", wages: "60000.00", federalWithholding: "0.00", socialSecurityWages: "60000.00" }],
      federalCredits: { ...creditProfile({ education: { enabled: true, students: [{ id: "30000000-0000-4000-8000-000000000005", personRole: "taxpayer", dependentId: null, name: "Synthetic Student", institutionName: "Synthetic University", form1098TRecordId, creditType: "llc", qualifiedExpenses: "10000.00", taxFreeAssistance: "0.00", eligibleInstitution: true, firstFourYears: false, atLeastHalfTime: false, degreeCandidate: false, noFelonyDrugConviction: false, priorAotcYears: 4, refundabilityConfirmed: false }] } }), valid1098TRecordIds: [form1098TRecordId] },
    }));
    expect(result.status).toBe("calculated_draft");
    expect(result.forms?.form8863).toMatchObject({ tentativeLifetimeLearningCredit: "2000", nonrefundableCredit: "2000", refundableAmericanOpportunityCredit: "0" });
    expect(result.forms?.schedule3).toMatchObject({ educationCredit: "2000", totalNonrefundableCredits: "2000" });
  });

  it("applies all five filing statuses and their 2025 standard deductions", () => {
    const expected: Record<FilingStatus2025, string> = {
      single: "15750",
      married_filing_jointly: "31500",
      married_filing_separately: "15750",
      head_of_household: "23625",
      qualifying_surviving_spouse: "31500",
    };
    for (const [filingStatus, standardDeduction] of Object.entries(expected) as Array<[FilingStatus2025, string]>) {
      const needsQualifyingPerson = filingStatus === "head_of_household" || filingStatus === "qualifying_surviving_spouse";
      const result = calculateFederalReturn2025(supportedInput({
        filingStatus,
        filingStatusEligibilityConfirmed: true,
        hasSpouse: filingStatus === "married_filing_jointly" || filingStatus === "married_filing_separately",
        dependents: needsQualifyingPerson ? [qualifyingChild()] : [],
        scheduleA: filingStatus === "married_filing_separately" ? scheduleA({ marriedFilingSeparatelySpouseItemizes: false }) : undefined,
        eligibility: { ...supportedInput().eligibility, hasDependents: needsQualifyingPerson },
        wages: [{ id: "w2-status", owner: "taxpayer", wages: "50000.00", federalWithholding: "0.00", socialSecurityWages: "50000.00" }],
      }));
      expect(result.status, filingStatus).toBe("calculated_draft");
      expect(result.forms?.filingStatus).toBe(filingStatus);
      expect(result.forms?.form1040.standardDeduction).toBe(standardDeduction);
    }
  });

  it("applies the 2025 dependent standard-deduction worksheet using supported earned income", () => {
    const result = calculateFederalReturn2025(supportedInput({
      wages: [{ id: "w2-dependent", owner: "taxpayer", wages: "5000.00", federalWithholding: "0.00", socialSecurityWages: "5000.00" }],
      eligibility: { ...supportedInput().eligibility, claimableAsDependent: true, form8615ApplicabilityReviewed: true, form8615Required: false },
    }));
    expect(result.status).toBe("calculated_draft");
    expect(result.forms?.form1040).toMatchObject({ basicStandardDeduction: "5450", additionalStandardDeduction: "0", standardDeduction: "5450" });
    expect(result.trace).toContainEqual(expect.objectContaining({ nodeId: "form-1040.standard-deduction", ruleId: "DEPENDENT-STANDARD-DEDUCTION-WORKSHEET" }));
  });

  it("uses the dependent minimum and adds reviewed age/blindness amounts", () => {
    const result = calculateFederalReturn2025(supportedInput({
      wages: [],
      eligibility: {
        ...supportedInput().eligibility,
        claimableAsDependent: true,
        form8615ApplicabilityReviewed: true,
        form8615Required: false,
        taxpayerAge65OrOlder: true,
        taxpayerBlind: true,
        ageBlindnessFactsReviewed: true,
      },
    }));
    expect(result.status).toBe("calculated_draft");
    expect(result.forms?.form1040).toMatchObject({ basicStandardDeduction: "1350", additionalStandardDeduction: "4000", standardDeduction: "5350" });
  });

  it("counts all four reviewed MFJ age/blindness boxes at the married rate", () => {
    const result = calculateFederalReturn2025(supportedInput({
      filingStatus: "married_filing_jointly",
      hasSpouse: true,
      eligibility: {
        ...supportedInput().eligibility,
        taxpayerAge65OrOlder: true,
        taxpayerBlind: true,
        spouseAge65OrOlder: true,
        spouseBlind: true,
        ageBlindnessFactsReviewed: true,
      },
    }));
    expect(result.status).toBe("calculated_draft");
    expect(result.forms?.form1040).toMatchObject({ basicStandardDeduction: "31500", additionalStandardDeduction: "6400", standardDeduction: "37900" });
  });

  it("keeps a reviewed dependent return blocked when Form 8615 is required", () => {
    const result = calculateFederalReturn2025(supportedInput({
      eligibility: { ...supportedInput().eligibility, claimableAsDependent: true, form8615ApplicabilityReviewed: true, form8615Required: true },
    }));
    expect(result.status).toBe("blocked");
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "FORM_8615_REQUIRED" }));
  });

  it("calculates the 2025 Social Security Benefits Worksheet through the 0%, 50%, and 85% tiers", () => {
    const benefit = (netBenefits: string) => [{ id: "ssa-1", owner: "taxpayer" as const, sourceType: "SSA-1099" as const, benefitsPaid: netBenefits, benefitsRepaid: "0.00", netBenefits, federalWithholding: "500.00", workersCompensationOffset: "0.00", lumpSumElectionApplies: false }];
    const belowBase = calculateFederalReturn2025(supportedInput({
      wages: [{ id: "w2-ss-low", owner: "taxpayer", wages: "20000.00", federalWithholding: "0.00", socialSecurityWages: "20000.00" }],
      socialSecurityBenefits: benefit("10000.00"),
    }));
    expect(belowBase.forms?.form1040).toMatchObject({ socialSecurityBenefits: "10000", taxableSocialSecurityBenefits: "0", federalWithholding: "500" });

    const fiftyPercentTier = calculateFederalReturn2025(supportedInput({
      filingStatus: "married_filing_jointly", hasSpouse: true,
      wages: [{ id: "w2-ss-mid", owner: "taxpayer", wages: "30000.00", federalWithholding: "0.00", socialSecurityWages: "30000.00" }],
      socialSecurityBenefits: benefit("20000.00"),
    }));
    expect(fiftyPercentTier.forms?.form1040).toMatchObject({ socialSecurityBenefits: "20000", taxableSocialSecurityBenefits: "4000", totalIncome: "34000" });

    const eightyFivePercentTier = calculateFederalReturn2025(supportedInput({
      wages: [{ id: "w2-ss-high", owner: "taxpayer", wages: "30000.00", federalWithholding: "0.00", socialSecurityWages: "30000.00" }],
      socialSecurityBenefits: benefit("20000.00"),
    }));
    expect(eightyFivePercentTier.forms?.form1040).toMatchObject({ socialSecurityBenefits: "20000", taxableSocialSecurityBenefits: "9600", totalIncome: "39600" });
    expect(eightyFivePercentTier.trace).toContainEqual(expect.objectContaining({ nodeId: "form-1040.social-security-benefits", ruleId: "SOCIAL-SECURITY-BENEFITS-WORKSHEET-2025", result: "9600" }));
  });

  it("fails closed for unsupported Social Security statement and filing-status treatments", () => {
    const result = calculateFederalReturn2025(supportedInput({
      filingStatus: "married_filing_separately", hasSpouse: true,
      scheduleA: scheduleA({ marriedFilingSeparatelySpouseItemizes: false }),
      socialSecurityBenefits: [{ id: "rrb-unsupported", owner: "taxpayer", sourceType: "RRB-1099", benefitsPaid: "12000.00", benefitsRepaid: "1000.00", netBenefits: "12000.00", federalWithholding: "0.00", workersCompensationOffset: "500.00", lumpSumElectionApplies: true }],
    }));
    expect(result.status).toBe("blocked");
    expect(result.diagnostics.map(({ code }) => code)).toEqual(expect.arrayContaining([
      "SOCIAL_SECURITY_STATEMENT_RECONCILIATION_REQUIRED",
      "RRB_WORKERS_COMPENSATION_OFFSET_UNSUPPORTED",
      "SOCIAL_SECURITY_LUMP_SUM_ELECTION_UNSUPPORTED",
      "MFS_SOCIAL_SECURITY_WORKSHEET_UNSUPPORTED",
    ]));
  });

  it("calculates Schedule A medical, SALT, interest, charity, casualty and other deductions", () => {
    const result = calculateFederalReturn2025(supportedInput({
      filingStatusEligibilityConfirmed: true,
      scheduleA: scheduleA({
        enabled: true,
        medicalAndDentalExpenses: "10000.00",
        stateLocalIncomeOrSalesTaxes: "30000.00",
        realEstateTaxes: "20000.00",
        otherTaxes: "250.00",
        homeMortgageInterestAndPoints: "20000.00",
        investmentInterest: "500.00",
        cashCharitableContributions: "4000.00",
        noncashCharitableContributions: "1000.00",
        casualtyAndTheftLosses: "750.00",
        otherItemizedDeductions: "500.00",
        saltEligibilityConfirmed: true,
        mortgageLimitsApplied: true,
        charityLimitsApplied: true,
        casualtyLimitsApplied: true,
      }),
      eligibility: { ...supportedInput().eligibility, usesItemizedDeductions: true },
      wages: [{ id: "w2-itemized", owner: "taxpayer", wages: "100000.00", federalWithholding: "0.00", socialSecurityWages: "100000.00" }],
    }));
    expect(result.status).toBe("calculated_draft");
    expect(result.forms?.scheduleA).toMatchObject({
      required: true,
      medicalFloor: "7500",
      deductibleMedical: "2500",
      stateAndLocalTaxesBeforeLimit: "50000",
      stateAndLocalTaxLimit: "40000",
      deductibleStateAndLocalTaxes: "40000",
      charitableContributions: "5000",
      totalItemizedDeductions: "69500",
    });
    expect(result.forms?.form1040).toMatchObject({ standardDeduction: "15750", itemizedDeductions: "69500", deductionUsed: "69500", taxableIncome: "30500" });
  });

  it("applies the 2025 Schedule A SALT phaseout and MFS spouse-itemization rule", () => {
    const result = calculateFederalReturn2025(supportedInput({
      filingStatus: "married_filing_separately",
      filingStatusEligibilityConfirmed: true,
      hasSpouse: true,
      scheduleA: scheduleA({ enabled: true, marriedFilingSeparatelySpouseItemizes: true, stateLocalIncomeOrSalesTaxes: "50000.00", saltEligibilityConfirmed: true }),
      eligibility: { ...supportedInput().eligibility, usesItemizedDeductions: true },
      retirementDistributions: [{ id: "r-salt", owner: "taxpayer", grossDistribution: "300000.00", taxableAmount: "300000.00", federalWithholding: "0.00", distributionCode: "7", iraSepSimple: false, taxableAmountNotDetermined: false }],
    }));
    expect(result.status).toBe("calculated_draft");
    expect(result.forms?.scheduleA).toMatchObject({ stateAndLocalTaxLimit: "12500", deductibleStateAndLocalTaxes: "12500", totalItemizedDeductions: "12500" });
    expect(result.forms?.form1040).toMatchObject({ standardDeduction: "0", itemizedDeductions: "12500", deductionUsed: "12500" });
  });

  it("calculates Schedule 8812 child, other-dependent and refundable credits", () => {
    const result = calculateFederalReturn2025(supportedInput({
      filingStatus: "head_of_household",
      filingStatusEligibilityConfirmed: true,
      dependents: [qualifyingChild(), { ...qualifyingChild("dep-2"), legalName: "Synthetic Parent", dateOfBirth: "1955-03-10", relationship: "Parent", qualifiesForChildTaxCredit: false, hasValidSsnForChildTaxCredit: false, qualifiesForOtherDependentCredit: true }],
      eligibility: { ...supportedInput().eligibility, hasDependents: true },
      wages: [{ id: "w2-credit", owner: "taxpayer", wages: "20000.00", federalWithholding: "0.00", socialSecurityWages: "20000.00" }],
    }));
    expect(result.status).toBe("calculated_draft");
    expect(result.forms?.schedule8812).toMatchObject({ qualifyingChildren: 1, otherDependents: 1, potentialChildTaxCredit: "2200", potentialOtherDependentCredit: "500", phaseoutReduction: "0", nonrefundableCredit: "0", additionalChildTaxCredit: "1700" });
    expect(result.forms?.form1040).toMatchObject({ childTaxCreditAndOtherDependentCredit: "0", additionalChildTaxCredit: "1700", refund: "1700" });
  });

  it("phases out dependent credits in $50 increments above the filing-status threshold", () => {
    const result = calculateFederalReturn2025(supportedInput({
      filingStatusEligibilityConfirmed: true,
      dependents: [qualifyingChild()],
      eligibility: { ...supportedInput().eligibility, hasDependents: true },
      retirementDistributions: [{ id: "r-phaseout", owner: "taxpayer", grossDistribution: "202001.00", taxableAmount: "202001.00", federalWithholding: "0.00", distributionCode: "7", iraSepSimple: false, taxableAmountNotDetermined: false }],
    }));
    expect(result.status).toBe("calculated_draft");
    expect(result.forms?.schedule8812).toMatchObject({ potentialChildTaxCredit: "2200", phaseoutReduction: "150", nonrefundableCredit: "2050", additionalChildTaxCredit: "0" });
  });

  it("uses the Schedule 8812 three-child payroll-tax alternative for self-employment income", () => {
    const result = calculateFederalReturn2025(supportedInput({
      filingStatus: "head_of_household",
      filingStatusEligibilityConfirmed: true,
      dependents: [qualifyingChild("dep-1"), qualifyingChild("dep-2"), qualifyingChild("dep-3")],
      eligibility: { ...supportedInput().eligibility, hasDependents: true },
      scheduleCActivities: [{ id: "c-credit", name: "Synthetic services", owner: "taxpayer", grossReceipts: "10000.00", expenses: {}, qbiEligible: true, receiptBasis: "source_plus_additional_receipts" }],
    }));
    expect(result.status).toBe("calculated_draft");
    expect(result.forms?.scheduleSE[0]).toMatchObject({ selfEmploymentTax: "1413", deductibleHalf: "707" });
    expect(result.forms?.schedule8812).toMatchObject({ qualifyingChildren: 3, additionalChildTaxCredit: "2120" });
    expect(result.trace.find(({ nodeId }) => nodeId === "schedule-8812.additional-child-tax-credit")?.operands.threeChildAlternativeLimit).toBe("2120");
  });

  it("blocks unreviewed, conflicting, over-age and SSN-ineligible dependent credit facts", () => {
    const invalid = { ...qualifyingChild(), dateOfBirth: "2008-01-01", hasValidSsnForChildTaxCredit: false, qualifiesForOtherDependentCredit: true, eligibilityReviewed: false };
    const result = calculateFederalReturn2025(supportedInput({
      filingStatusEligibilityConfirmed: true,
      dependents: [invalid],
      eligibility: { ...supportedInput().eligibility, hasDependents: true },
    }));
    expect(result.status).toBe("blocked");
    expect(result.diagnostics.map(({ code }) => code)).toEqual(expect.arrayContaining(["DEPENDENT_ELIGIBILITY_UNCONFIRMED", "CHILD_TAX_CREDIT_SSN_REQUIRED", "CHILD_TAX_CREDIT_AGE_INVALID", "DEPENDENT_CREDIT_CLASSIFICATION_CONFLICT"]));
  });

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
    expect(result.forms?.schedule1).toMatchObject({ businessIncome: "18000", rentalRealEstateRoyalties: "0", farmIncome: "0", unemploymentCompensation: "0", deductiblePartOfSelfEmploymentTax: "1077", totalAdjustments: "1077" });
    expect(result.forms?.schedule2).toMatchObject({ selfEmploymentTax: "2154", additionalHsaTax: "0", excessAdvancePtcRepayment: "0" });
    expect(result.forms?.form8995).toEqual({ qbi: "16923", section199ADividends: "0", incomeLimitationBase: "178023", deduction: "3385" });
    expect(result.forms?.scheduleB.required).toBe(true);
    expect(result.forms?.form1040).toMatchObject({ taxExemptInterest: "300", taxableInterest: "1600", qualifiedDividends: "4000", ordinaryDividends: "5000", qbiDeduction: "3385" });
    expect(result.forms?.form1040).toMatchObject({
      wages: "190000", taxExemptInterest: "300", taxableInterest: "1600", qualifiedDividends: "4000", ordinaryDividends: "5000",
      iraDistributions: "0", taxableIraDistributions: "0", pensionsAndAnnuities: "0", taxablePensionsAndAnnuities: "0", capitalGainOrLoss: "0", schedule1AdditionalIncome: "18000",
      totalIncome: "214600", adjustedGrossIncome: "213523", standardDeduction: "31500", qbiDeduction: "3385", taxableIncome: "178638",
      itemizedDeductions: "0", deductionUsed: "31500", incomeTax: "28848", childTaxCreditAndOtherDependentCredit: "0", dependentCareCredit: "0", educationCredit: "0", schedule3NonrefundableCredits: "0", selfEmploymentTax: "2154", totalTax: "31002", federalWithholding: "27600", additionalChildTaxCredit: "0", earnedIncomeCredit: "0", refundableAmericanOpportunityCredit: "0", totalPayments: "27600", refund: "0", amountOwed: "3402",
    });
    expect(result.dependencyManifest.every(({ status }) => status === "evaluated")).toBe(true);
  });

  it("calculates reviewed Schedule C, E, and F activities through Schedule 1, SE, QBI, and Form 1040", () => {
    const result = calculateFederalReturn2025(supportedInput({
      scheduleCActivities: [{ id: "c-all", name: "Services", owner: "taxpayer", grossReceipts: "10000.00", returnsAndAllowances: "500.00", costOfGoodsSold: "1000.00", otherIncome: "200.00", expenses: { advertising: "300.00" }, otherExpenses: "100.00", qbiEligible: true, selfEmploymentTreatmentConfirmed: true, receiptBasis: "source_plus_additional_receipts" }],
      scheduleEActivities: [{ id: "e-all", name: "Rental", owner: "taxpayer", rentsReceived: "12000.00", royaltiesReceived: "0.00", expenses: { repairs: "1500.00", insurance: "500.00" }, otherExpenses: "0.00", propertyType: "single_family", personalUseDays: 0, qualifiedJointVenture: false, allInvestmentAtRisk: true, passiveLossRulesReviewed: true, depreciationReviewed: true, rentalQbiEligible: false, supplementalActivityCount: 0, remicInterestCount: 0 }],
      scheduleFActivities: [{ id: "f-all", name: "Farm", owner: "taxpayer", income: { livestockSalesPurchased: "3000.00", livestockCostOrBasis: "500.00", livestockProduceSales: "7000.00", cooperativeTaxable: "1000.00" }, expenses: { feed: "1000.00" }, otherExpenses: "500.00", accountingMethod: "cash", accrualAmounts: {}, materiallyParticipated: true, qbiEligible: true, selfEmploymentTreatmentConfirmed: true, cropInsuranceElectionReviewed: true }],
    }));
    expect(result.status).toBe("calculated_draft");
    expect(result.forms?.scheduleC[0]).toMatchObject({ grossReceipts: "10000", returnsAndAllowances: "500", costOfGoodsSold: "1000", grossIncome: "8700", expenses: "400", netProfit: "8300" });
    expect(result.forms?.scheduleE[0]).toMatchObject({ rents: "12000", expenses: "2000", netIncomeOrLoss: "10000" });
    expect(result.forms?.scheduleF[0]).toMatchObject({ grossIncome: "10500", expenses: "1500", netProfit: "9000" });
    expect(result.forms?.schedule1).toMatchObject({ businessIncome: "8300", rentalRealEstateRoyalties: "10000", farmIncome: "9000" });
    expect(result.forms?.scheduleSE[0]?.netProfit).toBe("17300");
    expect(result.trace.map(({ nodeId }) => nodeId)).toEqual(expect.arrayContaining(["schedule-c.net-profit", "schedule-e.net-income-loss", "schedule-f.net-profit"]));
  });

  it("preserves complex Schedule E and F facts but blocks unsupported linked calculations", () => {
    const result = calculateFederalReturn2025(supportedInput({
      scheduleEActivities: [{ id: "e-block", name: "Pass-through", owner: "taxpayer", rentsReceived: "0.00", royaltiesReceived: "0.00", expenses: {}, otherExpenses: "0.00", propertyType: "single_family", personalUseDays: 1, qualifiedJointVenture: false, allInvestmentAtRisk: false, passiveLossRulesReviewed: false, depreciationReviewed: false, rentalQbiEligible: null, supplementalActivityCount: 1, remicInterestCount: 0 }],
      scheduleFActivities: [{ id: "f-block", name: "Accrual farm", owner: "taxpayer", income: {}, expenses: {}, otherExpenses: "0.00", accountingMethod: "accrual", accrualAmounts: { endingInventory: "1000.00" }, materiallyParticipated: null, qbiEligible: null, selfEmploymentTreatmentConfirmed: null, cropInsuranceElectionReviewed: null }],
    }));
    expect(result.status).toBe("blocked");
    expect(result.forms).toBeNull();
    expect(result.diagnostics.map(({ code }) => code)).toEqual(expect.arrayContaining(["SCHEDULE_E_PERSONAL_USE_ALLOCATION_REQUIRED", "SCHEDULE_E_PARTS_II_IV_UNSUPPORTED", "SCHEDULE_E_LIMITATION_REVIEW_REQUIRED", "SCHEDULE_F_ACCRUAL_METHOD_UNSUPPORTED", "SCHEDULE_F_QBI_TREATMENT_REQUIRED"]));
  });

  it("includes eligible Section 199A dividends in the simplified Form 8995 limitation", () => {
    const result = calculateFederalReturn2025(supportedInput({
      wages: [{ id: "w2-1", owner: "taxpayer", wages: "60000.00", federalWithholding: "0.00", socialSecurityWages: "60000.00" }],
      dividends: [{ id: "div-1", payerName: "REIT", ordinaryDividends: "1000.00", qualifiedDividends: "0.00", exemptInterestDividends: "0.00", section199ADividends: "1000.00", federalWithholding: "0.00" }],
    }));
    expect(result.forms?.form8995).toEqual({ qbi: "0", section199ADividends: "1000", incomeLimitationBase: "45250", deduction: "200" });
    expect(result.forms?.form1040.taxableIncome).toBe("45050");
  });

  it("calculates the five expanded review-profile source forms through their dependent forms", () => {
    const result = calculateFederalReturn2025(supportedInput({
      wages: [{ id: "w2", owner: "taxpayer", wages: "60000.00", federalWithholding: "7000.00", socialSecurityWages: "60000.00" }],
      brokerTransactions: [{ id: "b1", description: "10 shares SYN", term: "long", proceeds: "10000.00", costBasis: "7000.00", federalWithholding: "100.00", basisReportedToIrs: true, adjustmentAmount: "0.00", adjustmentCode: "" }],
      retirementDistributions: [{ id: "r1", owner: "taxpayer", grossDistribution: "5000.00", taxableAmount: "4000.00", federalWithholding: "500.00", distributionCode: "7", iraSepSimple: true, taxableAmountNotDetermined: false }],
      governmentPayments: [{ id: "g1", unemploymentCompensation: "2000.00", federalWithholding: "200.00" }],
      paymentCardReceipts: [{ id: "k1", grossPaymentAmount: "5000.00", mappedScheduleCAmount: "5000.00", federalWithholding: "50.00" }],
      hsaDistributions: [{ id: "sa1", owner: "taxpayer", grossDistribution: "1000.00", qualifiedMedicalExpenses: "1000.00", earningsOnExcessContributions: "0.00", distributionCode: "1", accountType: "HSA" }],
      scheduleCActivities: [{ id: "c1", name: "Card receipts business", owner: "taxpayer", grossReceipts: "5000.00", expenses: {}, qbiEligible: true, receiptBasis: "source_plus_additional_receipts" }],
    }));
    expect(result.status).toBe("calculated_draft");
    expect(result.forms?.form8949[0]).toMatchObject({ term: "long", proceeds: "10000", costBasis: "7000", gainOrLoss: "3000" });
    expect(result.forms?.scheduleD).toMatchObject({ shortTermGainOrLoss: "0", longTermGainOrLoss: "3000", netGainOrLoss: "3000", deductibleLoss: "0" });
    expect(result.forms?.form8889[0]).toMatchObject({ grossDistribution: "1000", qualifiedMedicalExpenses: "1000", taxableDistribution: "0" });
    expect(result.forms?.schedule1).toMatchObject({ businessIncome: "5000", unemploymentCompensation: "2000" });
    expect(result.forms?.form1040).toMatchObject({ iraDistributions: "5000", taxableIraDistributions: "4000", capitalGainOrLoss: "3000", schedule1AdditionalIncome: "7000", federalWithholding: "7850" });
    expect(result.trace.find(({ nodeId }) => nodeId === "form-1040.income-tax")).toMatchObject({ ruleId: "QD-CAPITAL-GAIN-WORKSHEET", operands: expect.objectContaining({ netCapitalGain: "3000" }) });
    expect(result.dependencyManifest.find(({ nodeId }) => nodeId === "form-8949")?.status).toBe("evaluated");
  });

  it("taxes short-term brokerage gains as ordinary income", () => {
    const result = calculateFederalReturn2025(supportedInput({
      wages: [{ id: "w2", owner: "taxpayer", wages: "60000.00", federalWithholding: "0.00", socialSecurityWages: "60000.00" }],
      brokerTransactions: [{ id: "b1", description: "Short-term shares", term: "short", proceeds: "10000.00", costBasis: "7000.00", federalWithholding: "0.00", basisReportedToIrs: true, adjustmentAmount: "0.00", adjustmentCode: "" }],
    }));
    expect(result.forms?.form1040.capitalGainOrLoss).toBe("3000");
    expect(result.trace.find(({ nodeId }) => nodeId === "form-1040.income-tax")).toMatchObject({ ruleId: "IRS-TAX-TABLE", operands: expect.objectContaining({ netCapitalGain: "0" }) });
  });

  it("applies reviewed Form 8949 adjustments and creates term-specific capital-loss carryovers", () => {
    const sourceId = "60000000-0000-4000-8000-000000000001";
    const adjustments = structuredClone(emptyAdvancedFederalProfile2025.adjustments);
    adjustments.capitalGains = {
      schemaVersion: "2025.1", enabled: true, carryoversReviewed: true,
      shortTermLossCarryover: "2000.00", longTermLossCarryover: "0.00", carryoverSourceYear: 2024,
      treatments: [{ id: "60000000-0000-4000-8000-000000000002", sourceRecordId: sourceId, category: "regular", section1202Exclusion: "0.00", adjustmentReviewed: true }],
    };
    const result = calculateFederalReturn2025(supportedInput({
      brokerTransactions: [{ id: sourceId, description: "Synthetic wash sale", term: "short", proceeds: "5000.00", costBasis: "15000.00", federalWithholding: "0.00", basisReportedToIrs: true, adjustmentAmount: "2000.00", adjustmentCode: "W" }],
      advancedFederal: advancedProfile({ adjustments }),
    }));
    expect(result.status).toBe("calculated_draft");
    expect(result.forms?.form8949[0]).toMatchObject({ adjustmentCode: "W", adjustment: "2000", gainOrLoss: "-8000" });
    expect(result.forms?.scheduleD).toMatchObject({ shortTermCarryover: "2000", netGainOrLoss: "-10000", deductibleLoss: "-3000", nextYearShortTermCarryover: "7000", nextYearLongTermCarryover: "0" });
    expect(result.forms?.form1040.capitalGainOrLoss).toBe("-3000");
    expect(result.trace.map(({ nodeId }) => nodeId)).toContain("schedule-d.next-year-carryover");
  });

  it("uses the $1,500 MFS capital-loss limit", () => {
    const result = calculateFederalReturn2025(supportedInput({
      filingStatus: "married_filing_separately",
      filingStatusEligibilityConfirmed: true,
      scheduleA: scheduleA({ marriedFilingSeparatelySpouseItemizes: false }),
      brokerTransactions: [{ id: "mfs-loss", description: "Synthetic loss", term: "long", proceeds: "0.00", costBasis: "5000.00", federalWithholding: "0.00", basisReportedToIrs: true, adjustmentAmount: "0.00", adjustmentCode: "" }],
    }));
    expect(result.status).toBe("calculated_draft");
    expect(result.forms?.form1040.capitalGainOrLoss).toBe("-1500");
    expect(result.forms?.scheduleD.nextYearLongTermCarryover).toBe("3500");
  });

  it("calculates reviewed Section 1202 exclusions and special-rate Schedule D categories", () => {
    const section1202Id = "60000000-0000-4000-8000-000000000003";
    const section1250Id = "60000000-0000-4000-8000-000000000004";
    const collectibleId = "60000000-0000-4000-8000-000000000005";
    const adjustments = structuredClone(emptyAdvancedFederalProfile2025.adjustments);
    adjustments.capitalGains = {
      schemaVersion: "2025.1", enabled: true, carryoversReviewed: true, shortTermLossCarryover: "0.00", longTermLossCarryover: "0.00", carryoverSourceYear: null,
      treatments: [
        { id: "60000000-0000-4000-8000-000000000006", sourceRecordId: section1202Id, category: "section_1202", section1202Exclusion: "40000.00", adjustmentReviewed: true },
        { id: "60000000-0000-4000-8000-000000000007", sourceRecordId: section1250Id, category: "unrecaptured_section_1250", section1202Exclusion: "0.00", adjustmentReviewed: true },
        { id: "60000000-0000-4000-8000-000000000008", sourceRecordId: collectibleId, category: "collectible_28_percent", section1202Exclusion: "0.00", adjustmentReviewed: true },
      ],
    };
    const result = calculateFederalReturn2025(supportedInput({
      wages: [{ id: "w2-capital", owner: "taxpayer", wages: "100000.00", federalWithholding: "0.00", socialSecurityWages: "100000.00" }],
      brokerTransactions: [
        { id: section1202Id, description: "Qualified small-business stock", term: "long", proceeds: "100000.00", costBasis: "20000.00", federalWithholding: "0.00", basisReportedToIrs: true, adjustmentAmount: "0.00", adjustmentCode: "Q" },
        { id: section1250Id, description: "Section 1250 property", term: "long", proceeds: "20000.00", costBasis: "10000.00", federalWithholding: "0.00", basisReportedToIrs: true, adjustmentAmount: "0.00", adjustmentCode: "" },
        { id: collectibleId, description: "Collectible", term: "long", proceeds: "15000.00", costBasis: "10000.00", federalWithholding: "0.00", basisReportedToIrs: true, adjustmentAmount: "0.00", adjustmentCode: "" },
      ],
      advancedFederal: advancedProfile({ adjustments }),
    }));
    expect(result.status).toBe("calculated_draft");
    expect(result.forms?.form8949[0]).toMatchObject({ section1202Exclusion: "40000", gainOrLoss: "40000", category: "section_1202" });
    expect(result.forms?.capitalGainTaxWorksheet).toMatchObject({ required: true, collectiblesGain: "5000", unrecapturedSection1250Gain: "10000" });
  });

  it("blocks expanded forms outside the explicit review profiles", () => {
    const result = calculateFederalReturn2025(supportedInput({
      retirementDistributions: [{ id: "r1", owner: "taxpayer", grossDistribution: "5000.00", taxableAmount: "5000.00", federalWithholding: "0.00", distributionCode: "1", iraSepSimple: true, taxableAmountNotDetermined: false }],
      paymentCardReceipts: [{ id: "k1", grossPaymentAmount: "5000.00", mappedScheduleCAmount: "4000.00", federalWithholding: "0.00" }],
      hsaDistributions: [{ id: "sa1", owner: "taxpayer", grossDistribution: "1000.00", qualifiedMedicalExpenses: "900.00", earningsOnExcessContributions: "0.00", distributionCode: "1", accountType: "HSA" }],
    }));
    expect(result.status).toBe("blocked");
    expect(result.diagnostics.map(({ code }) => code)).toEqual(expect.arrayContaining(["RETIREMENT_TREATMENT_REQUIRED", "FORM_1099_K_RECONCILIATION_REQUIRED", "HSA_NONQUALIFIED_DISTRIBUTION_UNSUPPORTED"]));
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
    expect(result.diagnostics.some(({ code }) => code === "SPOUSE_DATA_INVALID_FOR_STATUS")).toBe(true);
  });

  it("blocks Form 8995-A cases instead of applying a blanket 20 percent deduction", () => {
    const result = calculateFederalReturn2025(supportedInput({
      wages: [{ id: "w2-1", owner: "taxpayer", wages: "300000.00", federalWithholding: "0.00", socialSecurityWages: "176100.00" }],
      scheduleCActivities: [{ id: "c-1", name: "Consulting", owner: "taxpayer", grossReceipts: "10000.00", expenses: {}, qbiEligible: true, receiptBasis: "source_plus_additional_receipts" }],
    }));
    expect(result.status).toBe("blocked");
    expect(result.forms).toBeNull();
    expect(result.diagnostics.some(({ code }) => code === "FORM_8995_A_REQUIRED")).toBe(true);
    expect(result.diagnostics.some(({ code }) => code === "ADDITIONAL_MEDICARE_PROFILE_REQUIRED")).toBe(true);
  });

  it("calculates Forms 8959 and 8960 with Schedule 2 and withholding integration", () => {
    const eligibility = structuredClone(supportedInput().eligibility);
    eligibility.treatmentScreens.additionalMedicareTax = "applies";
    eligibility.treatmentScreens.netInvestmentIncomeTax = "applies";
    const adjustments = structuredClone(emptyAdvancedFederalProfile2025.adjustments);
    adjustments.additionalMedicareTax = { ...adjustments.additionalMedicareTax, enabled: true, applicabilityReviewed: true, withholdingReconciled: true };
    adjustments.netInvestmentIncomeTax = { ...adjustments.netInvestmentIncomeTax, enabled: true, applicabilityReviewed: true, classificationsReviewed: true };
    const result = calculateFederalReturn2025(supportedInput({
      eligibility,
      wages: [{ id: "w2-high-income", owner: "taxpayer", wages: "260000.00", federalWithholding: "55000.00", socialSecurityWages: "176100.00", medicareWagesAndTips: "260000.00", medicareTaxWithheld: "4000.00" }],
      interest: [{ id: "int-high-income", payerName: "Synthetic Bank", ordinaryInterest: "20000.00", treasuryInterest: "0.00", taxExemptInterest: "0.00", federalWithholding: "0.00" }],
      dividends: [{ id: "div-high-income", payerName: "Synthetic Fund", ordinaryDividends: "10000.00", qualifiedDividends: "0.00", exemptInterestDividends: "0.00", section199ADividends: "0.00", federalWithholding: "0.00" }],
      advancedFederal: advancedProfile({ adjustments }),
    }));
    expect(result.status).toBe("calculated_draft");
    expect(result.forms?.form8959).toMatchObject({ required: true, medicareWagesAndTips: "260000", threshold: "200000", excessWages: "60000", additionalMedicareTax: "540", additionalMedicareWithholding: "230" });
    expect(result.forms?.form8960).toMatchObject({ required: true, netInvestmentIncome: "30000", excessMagi: "90000", netInvestmentIncomeTax: "1140" });
    expect(result.forms?.schedule2).toMatchObject({ additionalMedicareTax: "540", netInvestmentIncomeTax: "1140" });
    expect(result.forms?.form1040.additionalMedicareWithholding).toBe("230");
    expect(result.trace.map(({ nodeId }) => nodeId)).toEqual(expect.arrayContaining(["form-8959.additional-medicare-tax", "form-8959.additional-withholding", "form-8960.net-investment-income-tax"]));
  });

  it("calculates reviewed Schedule 1 adjustments, full HSA facts, and payment reconciliation", () => {
    const source1098E = "10000000-0000-4000-8000-000000000101";
    const result = calculateFederalReturn2025(supportedInput({
      wages: [{ id: "w2-advanced", owner: "taxpayer", wages: "80000.00", federalWithholding: "7000.00", socialSecurityWages: "80000.00", socialSecurityTaxWithheld: "4960.00" }],
      advancedFederal: advancedProfile({
        adjustments: {
          ...structuredClone(emptyAdvancedFederalProfile2025.adjustments),
          educator: { enabled: true, expenses: { taxpayer: "350.00", spouse: "0.00" }, reimbursements: { taxpayer: "25.00", spouse: "0.00" }, eligible: { taxpayer: true, spouse: false } },
          ira: { enabled: true, contributions: { taxpayer: "1000.00", spouse: "0.00" }, workplacePlanCovered: { taxpayer: false, spouse: false }, age50OrOlder: { taxpayer: false, spouse: false }, eligibilityReviewed: true, nondeductibleBasisApplies: false },
          studentLoan: { enabled: true, interestPaid: "500.00", form1098ERecordId: source1098E, eligibilityReviewed: true },
          hsa: { enabled: true, owner: "taxpayer", coverageType: "self", eligibleMonths: 12, age55OrOlder: false, personalContributions: "2000.00", employerContributions: "0.00", qualifiedDistributions: "0.00", nonqualifiedDistributions: "0.00", excessContributions: "0.00", lastMonthRuleUsed: false, testingPeriodSatisfied: false, additionalTaxException: "none", additionalTaxExceptionReviewed: false },
        },
        payments: { schemaVersion: "2025.1", excessSocialSecurityReviewed: true, payments: [{ id: "10000000-0000-4000-8000-000000000102", type: "estimated", amount: "1500.00", paidOn: "2025-06-15", appliedTaxYear: 2025, owner: "taxpayer", confirmationReference: "IRS synthetic confirmation", sourceDocumentId: null, evidenceReviewed: true, status: "current" }] },
        valid1098ERecordIds: [source1098E],
      }),
    }));
    expect(result.status).toBe("calculated_draft");
    expect(result.forms?.schedule1).toMatchObject({ educatorExpenses: "300", iraDeduction: "1000", studentLoanInterestDeduction: "500", hsaDeduction: "2000" });
    expect(result.forms?.form8889Summary).toMatchObject({ required: true, deductibleContribution: "2000", additionalTax: "0" });
    expect(result.forms?.form1040).toMatchObject({ estimatedTaxPayments: "1500", federalWithholding: "7000" });
    expect(result.forms?.schedule3.totalOtherPayments).toBe("0");
  });

  it("prorates the HSA catch-up limit and applies only a reviewed additional-tax exception", () => {
    const result = calculateFederalReturn2025(supportedInput({
      hsaDistributions: [{ id: "hsa-exception", owner: "taxpayer", grossDistribution: "600.00", qualifiedMedicalExpenses: "0.00", earningsOnExcessContributions: "0.00", distributionCode: "1", accountType: "HSA" }],
      advancedFederal: advancedProfile({ adjustments: { ...structuredClone(emptyAdvancedFederalProfile2025.adjustments), hsa: { ...structuredClone(emptyAdvancedFederalProfile2025.adjustments.hsa), enabled: true, coverageType: "family", eligibleMonths: 6, age55OrOlder: true, nonqualifiedDistributions: "600.00", additionalTaxException: "age65", additionalTaxExceptionReviewed: true } } }),
    }));
    expect(result.status).toBe("calculated_draft");
    expect(result.forms?.form8889Summary).toMatchObject({ contributionLimit: "4775", taxableDistribution: "600", additionalTax: "0" });
  });

  it("limits a reviewed self-employed SEP deduction to 20 percent of net compensation", () => {
    const activityId = "10000000-0000-4000-8000-000000000111";
    const result = calculateFederalReturn2025(supportedInput({
      scheduleCActivities: [{ id: activityId, name: "Synthetic SEP business", owner: "taxpayer", grossReceipts: "50000.00", expenses: {}, qbiEligible: true, receiptBasis: "source_plus_additional_receipts" }],
      advancedFederal: advancedProfile({
        adjustments: {
          ...structuredClone(emptyAdvancedFederalProfile2025.adjustments),
          retirementPlan: {
            ...structuredClone(emptyAdvancedFederalProfile2025.adjustments.retirementPlan),
            enabled: true,
            planType: "sep",
            contributions: { taxpayer: "20000.00", spouse: "0.00" },
            activityId,
            limitReviewed: true,
          },
        },
        validActivityIds: [activityId],
      }),
    }));
    expect(result.status).toBe("calculated_draft");
    expect(result.forms?.schedule1.retirementPlanDeduction).toBe("9293");
  });

  it("calculates owner-specific Form 8606 basis and replaces the reported IRA taxable amount", () => {
    const sourceId = "10000000-0000-4000-8000-000000000121";
    const adjustments = structuredClone(emptyAdvancedFederalProfile2025.adjustments);
    adjustments.iraBasis.taxpayer = {
      enabled: true,
      priorYearBasis: "4000.00",
      currentYearNondeductibleContributions: "1000.00",
      traditionalIraDistributions: "10000.00",
      rothConversions: "0.00",
      yearEndTraditionalIraValue: "15000.00",
      outstandingRollovers: "0.00",
      recharacterizedContributions: "0.00",
      sourceAmountsReconciled: true,
      basisReviewed: true,
    };
    const result = calculateFederalReturn2025(supportedInput({
      retirementDistributions: [{ id: sourceId, owner: "taxpayer", grossDistribution: "10000.00", taxableAmount: "10000.00", federalWithholding: "500.00", distributionCode: "7", iraSepSimple: true, taxableAmountNotDetermined: false }],
      advancedFederal: advancedProfile({ adjustments }),
    }));
    expect(result.status).toBe("calculated_draft");
    expect(result.forms?.form8606).toEqual([expect.objectContaining({ owner: "taxpayer", totalBasis: "5000", nontaxableAmount: "2000", taxableAmount: "8000", basisCarryforward: "3000" })]);
    expect(result.forms?.form1040).toMatchObject({ iraDistributions: "10000", taxableIraDistributions: "8000" });
    expect(result.trace.map(({ nodeId }) => nodeId)).toContain("form-8606.taxpayer");
  });

  it("calculates a reviewed early-distribution exception and Form 5329 tax", () => {
    const sourceId = "10000000-0000-4000-8000-000000000122";
    const adjustments = structuredClone(emptyAdvancedFederalProfile2025.adjustments);
    adjustments.retirementDistributions = {
      schemaVersion: "2025.1",
      enabled: true,
      allSourceRecordsReviewed: true,
      treatments: [{ id: "10000000-0000-4000-8000-000000000123", sourceRecordId: sourceId, treatment: "early_distribution", rolloverAmount: "0.00", qcdAmount: "0.00", exceptionAmount: "2000.00", exceptionCode: "01", investmentInContract: "0.00", expectedMonthlyPayments: 0, paymentsReceivedThisYear: 0, reviewed: true }],
    };
    const result = calculateFederalReturn2025(supportedInput({
      retirementDistributions: [{ id: sourceId, owner: "taxpayer", grossDistribution: "10000.00", taxableAmount: "10000.00", federalWithholding: "0.00", distributionCode: "1", iraSepSimple: true, taxableAmountNotDetermined: false }],
      advancedFederal: advancedProfile({ adjustments }),
    }));
    expect(result.status).toBe("calculated_draft");
    expect(result.forms?.form5329).toEqual({ required: true, earlyDistributions: "10000", exceptionAmount: "2000", amountSubjectToAdditionalTax: "8000", additionalTax: "800" });
    expect(result.forms?.schedule2.additionalRetirementTax).toBe("800");
    expect(result.forms?.form1040.totalTax).toBe("800");
  });

  it.each([
    ["simple", "11700.00", "9000.00", "2700.00", "11700"],
    ["qualified", "15000.00", "10000.00", "5000.00", "15000"],
  ] as const)("calculates reviewed %s self-employed plan contributions", (planType, total, deferrals, employer, expected) => {
    const activityId = "10000000-0000-4000-8000-000000000124";
    const adjustments = structuredClone(emptyAdvancedFederalProfile2025.adjustments);
    adjustments.retirementPlan = {
      ...adjustments.retirementPlan,
      enabled: true,
      planType,
      contributions: { taxpayer: total, spouse: "0.00" },
      employeeDeferrals: { taxpayer: deferrals, spouse: "0.00" },
      employerContributions: { taxpayer: employer, spouse: "0.00" },
      activityId,
      limitReviewed: true,
    };
    const result = calculateFederalReturn2025(supportedInput({
      scheduleCActivities: [{ id: activityId, name: "Synthetic plan business", owner: "taxpayer", grossReceipts: "100000.00", expenses: {}, qbiEligible: true, receiptBasis: "source_plus_additional_receipts" }],
      advancedFederal: advancedProfile({ adjustments, validActivityIds: [activityId] }),
    }));
    expect(result.status).toBe("calculated_draft");
    expect(result.forms?.schedule1.retirementPlanDeduction).toBe(expected);
  });

  it("calculates Form 6251 and carries AMT through Schedule 2 and Form 1040", () => {
    const eligibility = structuredClone(supportedInput().eligibility);
    eligibility.treatmentScreens.alternativeMinimumTax = "applies";
    const adjustments = structuredClone(emptyAdvancedFederalProfile2025.adjustments);
    adjustments.alternativeMinimumTax = {
      ...adjustments.alternativeMinimumTax,
      enabled: true,
      applicabilityReviewed: true,
      incentiveStockOptionAdjustment: "200000.00",
    };
    const result = calculateFederalReturn2025(supportedInput({
      eligibility,
      wages: [{ id: "w2-amt", owner: "taxpayer", wages: "150000.00", federalWithholding: "30000.00", socialSecurityWages: "150000.00" }],
      advancedFederal: advancedProfile({ adjustments }),
    }));
    expect(result.status).toBe("calculated_draft");
    expect(result.forms?.form6251).toMatchObject({ required: true, preferenceAdjustments: "200000" });
    expect(Number(result.forms?.form6251.alternativeMinimumTax)).toBeGreaterThan(0);
    expect(result.forms?.schedule2.alternativeMinimumTax).toBe(result.forms?.form6251.alternativeMinimumTax);
    expect(result.forms?.form1040.alternativeMinimumTax).toBe(result.forms?.form6251.alternativeMinimumTax);
    expect(result.trace.some(({ nodeId }) => nodeId === "form-6251.alternative-minimum-tax")).toBe(true);
  });

  it("blocks unsupported Form 6251 adjustments and prior-year minimum tax credits", () => {
    const eligibility = structuredClone(supportedInput().eligibility);
    eligibility.treatmentScreens.alternativeMinimumTax = "applies";
    const adjustments = structuredClone(emptyAdvancedFederalProfile2025.adjustments);
    adjustments.alternativeMinimumTax = {
      ...adjustments.alternativeMinimumTax,
      enabled: true,
      applicabilityReviewed: true,
      unsupportedAdjustmentApplies: true,
      unsupportedAdjustmentDescription: "Synthetic unsupported negative adjustment",
      priorYearMinimumTaxCreditApplies: true,
    };
    const result = calculateFederalReturn2025(supportedInput({ eligibility, advancedFederal: advancedProfile({ adjustments }) }));
    expect(result.status).toBe("blocked");
    expect(result.diagnostics.map(({ code }) => code)).toEqual(expect.arrayContaining(["AMT_UNSUPPORTED_ADJUSTMENT", "FORM_8801_REQUIRED"]));
  });

  it("reconciles Form 1095-A monthly amounts through Form 8962", () => {
    const source1095A = "10000000-0000-4000-8000-000000000103";
    const months = Array.from({ length: 12 }, (_, index) => ({ month: index + 1, enrollmentPremium: "1000.00", slcspPremium: "833.33", advancePtc: "500.00" }));
    const result = calculateFederalReturn2025(supportedInput({
      wages: [{ id: "w2-ptc", owner: "taxpayer", wages: "40000.00", federalWithholding: "3000.00", socialSecurityWages: "40000.00" }],
      advancedFederal: advancedProfile({ premiumTaxCredit: { ...structuredClone(emptyAdvancedFederalProfile2025.premiumTaxCredit), enabled: true, householdSize: 1, householdModifiedAgiOther: "0.00", federalPovertyLine: "20000.00", stateCode: "IL", householdMembersReconciled: true, sharedPoliciesReviewed: true, policies: [{ id: "10000000-0000-4000-8000-000000000104", form1095ARecordId: source1095A, marketplaceIdentifier: "Synthetic Marketplace", policyNumberLast4: "1234", coveredPersonIds: ["10000000-0000-4000-8000-000000000105"], allocationPercentage: "100.00", allocationReviewed: true, months }] }, valid1095ARecordIds: [source1095A] }),
    }));
    expect(result.status).toBe("calculated_draft");
    expect(result.forms?.form8962).toMatchObject({ required: true, totalPremium: "12000", totalAdvancePtc: "6000" });
    expect(Number(result.forms?.form8962.premiumTaxCredit)).toBeGreaterThan(0);
    expect(result.forms?.form1040.premiumTaxCredit).toBe(result.forms?.form8962.premiumTaxCredit);
    expect(result.forms?.schedule3.totalOtherPayments).toBe(result.forms?.form8962.premiumTaxCredit);
  });

  it("blocks below-poverty Form 8962 exceptions instead of silently granting PTC", () => {
    const source1095A = "10000000-0000-4000-8000-000000000108";
    const result = calculateFederalReturn2025(supportedInput({
      wages: [{ id: "w2-ptc-low-income", owner: "taxpayer", wages: "9000.00", federalWithholding: "0.00", socialSecurityWages: "9000.00" }],
      advancedFederal: advancedProfile({ premiumTaxCredit: { ...structuredClone(emptyAdvancedFederalProfile2025.premiumTaxCredit), enabled: true, householdSize: 1, householdModifiedAgiOther: "0.00", federalPovertyLine: "15000.00", stateCode: "IL", householdMembersReconciled: true, sharedPoliciesReviewed: true, policies: [{ id: "10000000-0000-4000-8000-000000000109", form1095ARecordId: source1095A, marketplaceIdentifier: "Synthetic Marketplace", policyNumberLast4: "5678", coveredPersonIds: ["10000000-0000-4000-8000-000000000110"], allocationPercentage: "100.00", allocationReviewed: true, months: [{ month: 1, enrollmentPremium: "500.00", slcspPremium: "450.00", advancePtc: "400.00" }] }] }, valid1095ARecordIds: [source1095A] }),
    }));
    expect(result.status).toBe("blocked");
    expect(result.diagnostics.map(({ code }) => code)).toContain("FORM_8962_BELOW_FPL_EXCEPTION_REQUIRED");
  });

  it("applies a reviewed below-poverty marketplace exception", () => {
    const sourceId = "10000000-0000-4000-8000-000000000131";
    const profile = structuredClone(emptyAdvancedFederalProfile2025.premiumTaxCredit);
    Object.assign(profile, { enabled: true, householdMembersReconciled: true, sharedPoliciesReviewed: true, federalPovertyLine: "15000.00", belowPovertyException: "marketplace_estimated_100_percent", belowPovertyExceptionReviewed: true });
    profile.policies = [{ id: "10000000-0000-4000-8000-000000000132", form1095ARecordId: sourceId, marketplaceIdentifier: "Synthetic Marketplace", policyNumberLast4: "1313", coveredPersonIds: ["10000000-0000-4000-8000-000000000133"], allocationPercentage: "100.00", allocationReviewed: true, months: [{ month: 1, enrollmentPremium: "500.00", slcspPremium: "450.00", advancePtc: "400.00" }] }];
    const result = calculateFederalReturn2025(supportedInput({
      wages: [{ id: "w2-ptc-below", owner: "taxpayer", wages: "9000.00", federalWithholding: "0.00", socialSecurityWages: "9000.00" }],
      advancedFederal: advancedProfile({ premiumTaxCredit: profile, valid1095ARecordIds: [sourceId] }),
    }));
    expect(result.status).toBe("calculated_draft");
    expect(result.forms?.form8962).toMatchObject({ belowPovertyExceptionApplied: true, householdIncomePercentFpl: "60.00", premiumTaxCredit: "50" });
  });

  it("applies a reviewed MFS exception and aggregates household contribution only once per month", () => {
    const sourceIds = ["10000000-0000-4000-8000-000000000134", "10000000-0000-4000-8000-000000000135"];
    const profile = structuredClone(emptyAdvancedFederalProfile2025.premiumTaxCredit);
    Object.assign(profile, { enabled: true, householdMembersReconciled: true, sharedPoliciesReviewed: true, federalPovertyLine: "20000.00", mfsException: "domestic_abuse", mfsExceptionReviewed: true });
    profile.policies = sourceIds.map((sourceRecordId, index) => ({ id: `10000000-0000-4000-8000-00000000013${6 + index}`, form1095ARecordId: sourceRecordId, marketplaceIdentifier: `Synthetic ${index + 1}`, policyNumberLast4: `13${40 + index}`, coveredPersonIds: ["10000000-0000-4000-8000-000000000138"], allocationPercentage: "100.00", allocationReviewed: true, months: [{ month: 1, enrollmentPremium: "500.00", slcspPremium: "450.00", advancePtc: "300.00" }] }));
    const result = calculateFederalReturn2025(supportedInput({
      filingStatus: "married_filing_separately", filingStatusEligibilityConfirmed: true,
      scheduleA: scheduleA({ marriedFilingSeparatelySpouseItemizes: false }),
      wages: [{ id: "w2-ptc-mfs", owner: "taxpayer", wages: "40000.00", federalWithholding: "0.00", socialSecurityWages: "40000.00" }],
      advancedFederal: advancedProfile({ premiumTaxCredit: profile, valid1095ARecordIds: sourceIds }),
    }));
    expect(result.status).toBe("calculated_draft");
    expect(result.forms?.form8962.mfsExceptionApplied).toBe(true);
    expect(result.forms?.form8962.months).toEqual([expect.objectContaining({ month: 1, premium: "1000", slcsp: "900", contribution: "67", allowedPtc: "833" })]);
  });

  it("calculates alternative marriage-year monthly contributions", () => {
    const sourceId = "10000000-0000-4000-8000-000000000139";
    const profile = structuredClone(emptyAdvancedFederalProfile2025.premiumTaxCredit);
    Object.assign(profile, { enabled: true, householdMembersReconciled: true, sharedPoliciesReviewed: true, federalPovertyLine: "20000.00", marriageAlternativeApplies: true, marriageAlternativeReviewed: true, marriageMonth: 6, alternativeMarriageHouseholds: { taxpayer: { familySize: 1, modifiedAgi: "20000.00", federalPovertyLine: "20000.00" }, spouse: { familySize: 1, modifiedAgi: "20000.00", federalPovertyLine: "20000.00" } } });
    profile.policies = [{ id: "10000000-0000-4000-8000-000000000140", form1095ARecordId: sourceId, marketplaceIdentifier: "Synthetic Marriage", policyNumberLast4: "1414", coveredPersonIds: ["10000000-0000-4000-8000-000000000141"], allocationPercentage: "100.00", allocationReviewed: true, months: [{ month: 1, enrollmentPremium: "1000.00", slcspPremium: "900.00", advancePtc: "0.00" }, { month: 7, enrollmentPremium: "1000.00", slcspPremium: "900.00", advancePtc: "0.00" }] }];
    const result = calculateFederalReturn2025(supportedInput({
      filingStatus: "married_filing_jointly", filingStatusEligibilityConfirmed: true, hasSpouse: true,
      wages: [{ id: "w2-ptc-marriage", owner: "taxpayer", wages: "100000.00", federalWithholding: "0.00", socialSecurityWages: "100000.00" }],
      advancedFederal: advancedProfile({ premiumTaxCredit: profile, valid1095ARecordIds: [sourceId] }),
    }));
    expect(result.status).toBe("calculated_draft");
    expect(result.forms?.form8962.alternativeMarriageYearApplied).toBe(true);
    expect(result.forms?.form8962.months).toEqual([expect.objectContaining({ month: 1, contribution: "0" }), expect.objectContaining({ month: 7, contribution: "708" })]);
  });

  it("blocks a paid-preparer credit claim until Form 8867 is completed and signed", () => {
    const dependent = qualifyingChild();
    const due = structuredClone(emptyAdvancedFederalProfile2025.dueDiligence);
    due.paidPreparer = true;
    due.clientInterviewDate = "2026-02-01";
    due.preparerNotes = "Reviewed the synthetic client's residency, relationship, income, and supporting records.";
    due.sections.eitc = { applies: true, interviewComplete: true, knowledgeDocumented: true, documentsReviewed: true, consistencyResolved: true, notes: "Qualifying-child rules reviewed." };
    due.sections.childTaxCredits = { applies: true, interviewComplete: true, knowledgeDocumented: true, documentsReviewed: true, consistencyResolved: true, notes: "Child-credit eligibility reviewed." };
    due.evidence = [{ id: "10000000-0000-4000-8000-000000000106", sourceDocumentId: null, page: null, description: "Synthetic residency evidence", verified: true }];
    const input = supportedInput({ dependents: [dependent], eligibility: { ...supportedInput().eligibility, hasDependents: true }, wages: [{ id: "w2-eitc-8867", owner: "taxpayer", wages: "18000.00", federalWithholding: "0.00", socialSecurityWages: "18000.00" }], federalCredits: creditProfile({ eitc: { enabled: true, eligibilityReviewed: true, taxpayerAgeAtYearEnd: 30, taxpayerWorkEligibleIdentifier: true, notQualifyingChildOfAnother: true, investmentIncome: "0.00", noForm2555: true, noPriorDisallowance: true, noCombatPayElection: true, qualifyingChildren: [{ id: "10000000-0000-4000-8000-000000000107", dependentId: dependent.id, relationshipTest: true, ageTest: true, residencyTest: true, jointReturnTest: true, validWorkEligibleIdentifier: true, notClaimedByOther: true, disabilityException: false }] } }), advancedFederal: advancedProfile({ dueDiligence: due }) });
    const blocked = calculateFederalReturn2025(input);
    expect(blocked.status).toBe("blocked");
    expect(blocked.diagnostics.map(({ code }) => code)).toEqual(expect.arrayContaining(["FORM_8867_SIGNATURE_REQUIRED"]));
    const signed = calculateFederalReturn2025({ ...input, advancedFederal: { ...input.advancedFederal!, dueDiligenceSignatureCurrent: true } });
    expect(signed.status).toBe("calculated_draft");
    expect(signed.forms?.form8867).toEqual({ required: true, signedForCurrentRevision: true });
  });
});
