import Decimal from "decimal.js";
import { resolveDependencyGraph } from "../dependency-graph";
import { amount, dollars, nonnegative, sum, whole } from "./math";
import { constants2025, rulePackage2025 } from "./rule-package";
import { calculateScheduleSE2025 } from "./self-employment";
import { ordinaryIncomeTax2025, qualifiedDividendTax2025 } from "./tax-method";
import type {
  CalculationDiagnostic2025,
  CalculationInput2025,
  CalculationOutput2025,
  CalculationTraceStep2025,
  PersonRole2025,
} from "./types";

const roles: PersonRole2025[] = ["taxpayer", "spouse"];

export function calculateFederalReturn2025(input: CalculationInput2025): CalculationOutput2025 {
  const diagnostics: CalculationDiagnostic2025[] = [];
  const trace: CalculationTraceStep2025[] = [];

  function blocking(code: string, message: string, path: string | null = null): void {
    diagnostics.push({ code, severity: "blocking", message, path });
  }

  function read(value: string, path: string): Decimal {
    try {
      const parsed = amount(value);
      if (parsed.isNegative()) {
        blocking("NEGATIVE_AMOUNT_UNSUPPORTED", "Negative amounts are outside the supported calculation envelope.", path);
        return new Decimal(0);
      }
      return parsed;
    } catch {
      blocking("INVALID_AMOUNT", "Enter a valid decimal amount.", path);
      return new Decimal(0);
    }
  }

  validateEligibility(input, blocking);
  validateScheduleB(input, blocking);
  if (input.filingStatus === "single" && (
    input.wages.some(({ owner }) => owner === "spouse")
    || input.scheduleCActivities.some(({ owner }) => owner === "spouse")
  )) {
    blocking("SPOUSE_DATA_INVALID_FOR_SINGLE", "A Single return cannot include spouse-owned wage or Schedule C inputs.", null);
  }

  const wages = input.wages.map((item, index) => ({
    ...item,
    wageAmount: read(item.wages, `wages.${index}.wages`),
    withholdingAmount: read(item.federalWithholding, `wages.${index}.federalWithholding`),
    socialSecurityWageAmount: read(item.socialSecurityWages, `wages.${index}.socialSecurityWages`),
  }));
  const interest = input.interest.map((item, index) => ({
    ...item,
    ordinaryAmount: read(item.ordinaryInterest, `interest.${index}.ordinaryInterest`),
    treasuryAmount: read(item.treasuryInterest, `interest.${index}.treasuryInterest`),
    taxExemptAmount: read(item.taxExemptInterest, `interest.${index}.taxExemptInterest`),
    withholdingAmount: read(item.federalWithholding, `interest.${index}.federalWithholding`),
  }));
  const dividends = input.dividends.map((item, index) => {
    const ordinaryAmount = read(item.ordinaryDividends, `dividends.${index}.ordinaryDividends`);
    const qualifiedAmount = read(item.qualifiedDividends, `dividends.${index}.qualifiedDividends`);
    if (qualifiedAmount.gt(ordinaryAmount)) {
      blocking("QUALIFIED_DIVIDENDS_EXCEED_ORDINARY", "Qualified dividends cannot exceed ordinary dividends from the same source.", `dividends.${index}.qualifiedDividends`);
    }
    const section199AAmount = read(item.section199ADividends, `dividends.${index}.section199ADividends`);
    if (section199AAmount.gt(ordinaryAmount)) {
      blocking("SECTION_199A_DIVIDENDS_EXCEED_ORDINARY", "Section 199A dividends cannot exceed ordinary dividends from the same source.", `dividends.${index}.section199ADividends`);
    }
    return {
      ...item,
      ordinaryAmount,
      qualifiedAmount,
      exemptAmount: read(item.exemptInterestDividends, `dividends.${index}.exemptInterestDividends`),
      section199AAmount,
      withholdingAmount: read(item.federalWithholding, `dividends.${index}.federalWithholding`),
    };
  });

  const scheduleC = input.scheduleCActivities.map((activity, activityIndex) => {
    const grossReceipts = whole(read(activity.grossReceipts, `scheduleCActivities.${activityIndex}.grossReceipts`));
    const expenses = whole(sum(Object.entries(activity.expenses).map(([category, value]) => read(value ?? "0", `scheduleCActivities.${activityIndex}.expenses.${category}`))));
    const netProfit = grossReceipts.minus(expenses);
    if (netProfit.isNegative()) {
      blocking("SCHEDULE_C_LOSS_UNSUPPORTED", "The supported Schedule C profile requires nonnegative profit.", `scheduleCActivities.${activityIndex}`);
    }
    if (!activity.qbiEligible) {
      blocking("QBI_TREATMENT_UNSUPPORTED", "A supported Schedule C activity must have confirmed simplified QBI eligibility.", `scheduleCActivities.${activityIndex}.qbiEligible`);
    }
    return { activity, grossReceipts, expenses, netProfit };
  });
  const businessWithholding = input.businessWithholding.map((entry, index) => read(entry.federalWithholding, `businessWithholding.${index}.federalWithholding`));

  if (diagnostics.some(({ severity }) => severity === "blocking")) {
    return blockedOutput(input, diagnostics, trace);
  }

  const wageTotal = whole(sum(wages.map(({ wageAmount }) => wageAmount)));
  const taxableInterest = whole(sum(interest.flatMap(({ ordinaryAmount, treasuryAmount }) => [ordinaryAmount, treasuryAmount])));
  const taxExemptInterest = whole(sum([
    ...interest.map(({ taxExemptAmount }) => taxExemptAmount),
    ...dividends.map(({ exemptAmount }) => exemptAmount),
  ]));
  const ordinaryDividends = whole(sum(dividends.map(({ ordinaryAmount }) => ordinaryAmount)));
  const qualifiedDividends = whole(sum(dividends.map(({ qualifiedAmount }) => qualifiedAmount)));
  const section199ADividends = whole(sum(dividends.map(({ section199AAmount }) => section199AAmount)));
  const businessIncome = whole(sum(scheduleC.map(({ netProfit }) => netProfit)));

  const scheduleSE = roles
    .filter((owner) => input.filingStatus === "married_filing_jointly" || owner === "taxpayer")
    .map((owner) => {
      const ownerProfit = whole(sum(scheduleC.filter(({ activity }) => activity.owner === owner).map(({ netProfit }) => netProfit)));
      const ownerSocialSecurityWages = whole(sum(wages.filter((wage) => wage.owner === owner).map(({ socialSecurityWageAmount }) => socialSecurityWageAmount)));
      return calculateScheduleSE2025(owner, ownerProfit, ownerSocialSecurityWages);
    })
    .filter(({ netProfit }) => !amount(netProfit).isZero());

  const selfEmploymentTax = whole(sum(scheduleSE.map(({ selfEmploymentTax: value }) => value)));
  const deductibleHalf = whole(sum(scheduleSE.map(({ deductibleHalf }) => deductibleHalf)));
  const medicareCompensation = whole(sum([
    ...wages.map(({ wageAmount }) => wageAmount),
    ...scheduleSE.map(({ netEarnings }) => netEarnings),
  ]));
  if (medicareCompensation.gt(constants2025.additionalMedicareThreshold[input.filingStatus])) {
    blocking("ADDITIONAL_MEDICARE_TAX_REQUIRED", "Known wages and self-employment earnings exceed the Phase 1 Additional Medicare Tax screening threshold.", "forms.schedule2");
  }
  const totalIncome = whole(wageTotal.plus(taxableInterest).plus(ordinaryDividends).plus(businessIncome));
  const adjustedGrossIncome = whole(totalIncome.minus(deductibleHalf));
  if (adjustedGrossIncome.gt(constants2025.netInvestmentIncomeThreshold[input.filingStatus]) && taxableInterest.plus(ordinaryDividends).gt(0)) {
    blocking("NET_INVESTMENT_INCOME_TAX_REVIEW_REQUIRED", "Income and investment-income facts cross the NIIT screening threshold; Form 8960 is outside Phase 1.", "forms.schedule2");
  }
  const standardDeduction = amount(constants2025.standardDeduction[input.filingStatus]);
  const taxableBeforeQbi = nonnegative(whole(adjustedGrossIncome.minus(standardDeduction)));

  if (taxableBeforeQbi.gt(constants2025.qbiSimplifiedThreshold[input.filingStatus]) && (businessIncome.gt(0) || section199ADividends.gt(0))) {
    blocking("FORM_8995_A_REQUIRED", "Taxable income exceeds the simplified Form 8995 threshold; Form 8995-A is outside Phase 1.", "forms.form8995");
    return blockedOutput(input, diagnostics, trace);
  }
  if (diagnostics.some(({ severity }) => severity === "blocking")) {
    return blockedOutput(input, diagnostics, trace);
  }

  const qbi = nonnegative(whole(businessIncome.minus(deductibleHalf)));
  const qbiComponent = whole(qbi.mul("0.20"));
  const reitComponent = whole(section199ADividends.mul("0.20"));
  const incomeLimitationBase = nonnegative(whole(taxableBeforeQbi.minus(qualifiedDividends)));
  const incomeLimitation = whole(incomeLimitationBase.mul("0.20"));
  const qbiDeduction = Decimal.min(qbiComponent.plus(reitComponent), incomeLimitation);
  const taxableIncome = nonnegative(whole(taxableBeforeQbi.minus(qbiDeduction)));

  const preferential = qualifiedDividends.gt(0)
    ? qualifiedDividendTax2025(taxableIncome, qualifiedDividends, input.filingStatus)
    : null;
  const incomeTax = preferential?.tax ?? ordinaryIncomeTax2025(taxableIncome, input.filingStatus);
  const totalTax = incomeTax.plus(selfEmploymentTax);
  const federalWithholding = whole(sum([
    ...wages.map(({ withholdingAmount }) => withholdingAmount),
    ...interest.map(({ withholdingAmount }) => withholdingAmount),
    ...dividends.map(({ withholdingAmount }) => withholdingAmount),
    ...businessWithholding,
  ]));
  const refund = Decimal.max(0, federalWithholding.minus(totalTax));
  const amountOwed = Decimal.max(0, totalTax.minus(federalWithholding));
  const scheduleBRequired = taxableInterest.gt(constants2025.scheduleBThreshold)
    || ordinaryDividends.gt(constants2025.scheduleBThreshold)
    || input.scheduleBScreening.foreignAccount === "yes"
    || input.scheduleBScreening.foreignTrust === "yes"
    || input.scheduleBScreening.otherScheduleBTrigger === "yes";

  addTrace(trace, "schedule-c.net-profit", "Schedule C, line 31", "SCH-C-NET-PROFIT", { grossReceipts: dollars(sum(scheduleC.map(({ grossReceipts }) => grossReceipts))), expenses: dollars(sum(scheduleC.map(({ expenses }) => expenses))) }, businessIncome);
  addTrace(trace, "schedule-se.tax", "Schedule SE, line 12", "SCH-SE-REGULAR", { netProfit: businessIncome.toFixed(0), wageBase: String(constants2025.socialSecurityWageBase) }, selfEmploymentTax);
  addTrace(trace, "schedule-1.se-deduction", "Schedule 1, line 15", "SCH-SE-DEDUCTIBLE-HALF", { selfEmploymentTax: selfEmploymentTax.toFixed(0) }, deductibleHalf);
  addTrace(trace, "form-8995.deduction", "Form 8995, line 15", "FORM-8995-SIMPLIFIED", { qbi: qbi.toFixed(0), section199ADividends: section199ADividends.toFixed(0), incomeLimitationBase: incomeLimitationBase.toFixed(0) }, qbiDeduction);
  addTrace(trace, "form-1040.taxable-income", "Form 1040, line 15", "FORM-1040-TAXABLE-INCOME", { adjustedGrossIncome: adjustedGrossIncome.toFixed(0), standardDeduction: standardDeduction.toFixed(0), qbiDeduction: qbiDeduction.toFixed(0) }, taxableIncome);
  addTrace(trace, "form-1040.income-tax", "Form 1040, line 16", preferential ? "QD-CAPITAL-GAIN-WORKSHEET" : taxableIncome.lt(100000) ? "IRS-TAX-TABLE" : "IRS-TAX-COMPUTATION-WORKSHEET", { taxableIncome: taxableIncome.toFixed(0), qualifiedDividends: qualifiedDividends.toFixed(0) }, incomeTax);
  addTrace(trace, "form-1040.total-tax", "Form 1040, line 24", "FORM-1040-TOTAL-TAX", { incomeTax: incomeTax.toFixed(0), selfEmploymentTax: selfEmploymentTax.toFixed(0) }, totalTax);
  addTrace(trace, "form-1040.payments", "Form 1040, line 25d", "ACTIVE-SOURCE-WITHHOLDING", { sourceCount: String(wages.length + interest.length + dividends.length + businessWithholding.length) }, federalWithholding);

  diagnostics.push({
    code: "TAX_RULE_PACKAGE_REVIEW_PENDING",
    severity: "warning",
    message: "This reproducible calculation uses an archived research rule package that still requires qualified tax-professional approval.",
    path: null,
  });

  const graphResolution = resolveDependencyGraph(dependencies);
  if (graphResolution.cycles.length > 0) {
    blocking("CALCULATION_DEPENDENCY_CYCLE", `Calculation dependency cycle detected: ${graphResolution.cycles[0]?.join(" -> ")}.`);
    return blockedOutput(input, diagnostics, trace);
  }
  return {
    taxYear: 2025,
    rulePackageId: rulePackage2025.id,
    rulePackageVersion: rulePackage2025.version,
    rulePackageApproval: rulePackage2025.status,
    calculationId: input.calculationId,
    inputRevision: input.inputRevision,
    status: "calculated_draft",
    diagnostics,
    forms: {
      scheduleB: { required: scheduleBRequired, taxableInterest: taxableInterest.toFixed(0), ordinaryDividends: ordinaryDividends.toFixed(0) },
      scheduleC: scheduleC.map(({ activity, grossReceipts, expenses, netProfit }) => ({ activityId: activity.id, grossReceipts: grossReceipts.toFixed(0), expenses: expenses.toFixed(0), netProfit: netProfit.toFixed(0) })),
      scheduleSE,
      form8995: { qbi: qbi.toFixed(0), section199ADividends: section199ADividends.toFixed(0), incomeLimitationBase: incomeLimitationBase.toFixed(0), deduction: qbiDeduction.toFixed(0) },
      schedule1: { businessIncome: businessIncome.toFixed(0), deductiblePartOfSelfEmploymentTax: deductibleHalf.toFixed(0) },
      schedule2: { selfEmploymentTax: selfEmploymentTax.toFixed(0) },
      form1040: {
        wages: wageTotal.toFixed(0), taxExemptInterest: taxExemptInterest.toFixed(0), taxableInterest: taxableInterest.toFixed(0),
        qualifiedDividends: qualifiedDividends.toFixed(0), ordinaryDividends: ordinaryDividends.toFixed(0), totalIncome: totalIncome.toFixed(0),
        adjustedGrossIncome: adjustedGrossIncome.toFixed(0), standardDeduction: standardDeduction.toFixed(0), qbiDeduction: qbiDeduction.toFixed(0),
        taxableIncome: taxableIncome.toFixed(0), incomeTax: incomeTax.toFixed(0), selfEmploymentTax: selfEmploymentTax.toFixed(0), totalTax: totalTax.toFixed(0),
        federalWithholding: federalWithholding.toFixed(0), refund: refund.toFixed(0), amountOwed: amountOwed.toFixed(0),
      },
    },
    trace,
    dependencyManifest: graphResolution.order.map((nodeId) => ({ nodeId, dependsOn: dependencies[nodeId] ?? [], status: "evaluated" })),
  };
}

const dependencies: Record<string, string[]> = {
  "schedule-b": ["interest", "dividends", "schedule-b-screening"],
  "schedule-c": ["business-receipts", "business-expenses"],
  "schedule-se": ["schedule-c", "w2-social-security-wages"],
  "schedule-1": ["schedule-c", "schedule-se"],
  "schedule-2": ["schedule-se"],
  "form-8995": ["schedule-c", "schedule-se", "qualified-dividends"],
  "qualified-dividend-worksheet": ["form-8995", "qualified-dividends"],
  "form-1040": ["schedule-1", "schedule-2", "schedule-b", "form-8995", "qualified-dividend-worksheet", "withholding-ledger"],
};

function validateEligibility(input: CalculationInput2025, blocking: (code: string, message: string, path?: string | null) => void): void {
  const e = input.eligibility;
  if (!e.fullYearUsResident) blocking("RESIDENCY_UNSUPPORTED", "Phase 1 supports only full-year U.S. residents.", "eligibility.fullYearUsResident");
  if (e.claimableAsDependent || e.hasDependents) blocking("DEPENDENT_PROFILE_UNSUPPORTED", "Phase 1 supports taxpayers who are not claimable and have no dependents.", "eligibility");
  if (e.taxpayerAge65OrOlder || e.taxpayerBlind || (input.filingStatus === "married_filing_jointly" && (e.spouseAge65OrOlder || e.spouseBlind))) blocking("ADDITIONAL_STANDARD_DEDUCTION_UNSUPPORTED", "Age- and blindness-based standard-deduction additions are outside Phase 1.", "eligibility");
  if (e.usesItemizedDeductions) blocking("ITEMIZED_DEDUCTIONS_UNSUPPORTED", "Phase 1 supports the standard deduction only.", "eligibility.usesItemizedDeductions");
  if (!e.allRequiredIntakeAnswered) blocking("INTAKE_INCOMPLETE", "All required intake questions must be answered before calculation.", "eligibility.allRequiredIntakeAnswered");
  if (!e.documentsCompleteAttested) blocking("DOCUMENTS_NOT_ATTESTED", "A preparer completeness attestation is required before calculation.", "eligibility.documentsCompleteAttested");
  for (const topic of e.unsupportedApplicableTopics) blocking("UNSUPPORTED_TOPIC_APPLIES", `Unsupported intake topic applies: ${topic}.`, "eligibility.unsupportedApplicableTopics");
  for (const [topic, answer] of Object.entries(e.treatmentScreens)) {
    if (answer === "unknown") blocking("TREATMENT_SCREEN_UNKNOWN", `Required treatment screen is unanswered: ${topic}.`, `eligibility.treatmentScreens.${topic}`);
    if (answer === "applies") blocking("TREATMENT_OUTSIDE_SUPPORTED_SCOPE", `Required treatment is outside Phase 1: ${topic}.`, `eligibility.treatmentScreens.${topic}`);
  }
}

function validateScheduleB(input: CalculationInput2025, blocking: (code: string, message: string, path?: string | null) => void): void {
  for (const [question, answer] of Object.entries(input.scheduleBScreening)) {
    if (answer === "unknown") blocking("SCHEDULE_B_QUESTION_UNKNOWN", "Schedule B applicability questions must be answered.", `scheduleBScreening.${question}`);
    if (answer === "yes") blocking("SCHEDULE_B_SPECIAL_TREATMENT_UNSUPPORTED", `Schedule B special condition requires additional implementation: ${question}.`, `scheduleBScreening.${question}`);
  }
}

function addTrace(trace: CalculationTraceStep2025[], nodeId: string, formLine: string, ruleId: string, operands: Record<string, string>, result: Decimal): void {
  trace.push({ nodeId, formLine, ruleId, operands, result: result.toFixed(0), rounding: "nearest_whole_dollar_half_up" });
}

function blockedOutput(input: CalculationInput2025, diagnostics: CalculationDiagnostic2025[], trace: CalculationTraceStep2025[]): CalculationOutput2025 {
  return {
    taxYear: 2025,
    rulePackageId: rulePackage2025.id,
    rulePackageVersion: rulePackage2025.version,
    rulePackageApproval: rulePackage2025.status,
    calculationId: input.calculationId,
    inputRevision: input.inputRevision,
    status: "blocked",
    diagnostics,
    forms: null,
    trace,
    dependencyManifest: Object.keys(dependencies).map((nodeId) => ({ nodeId, dependsOn: dependencies[nodeId] ?? [], status: "blocked" })),
  };
}
