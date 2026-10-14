import Decimal from "decimal.js";
import { emptyAdvancedFederalProfile2025 } from "@/domain/advanced-federal-2025";
import { resolveDependencyGraph } from "../dependency-graph";
import { calculateAdjustments2025, calculatePayments2025, calculatePremiumTaxCredit2025, validateDueDiligence2025 } from "./advanced-federal";
import { calculateAlternativeMinimumTax2025 } from "./alternative-minimum-tax";
import { calculateAdditionalMedicareTax2025, calculateNetInvestmentIncomeTax2025 } from "./additional-taxes";
import { calculateFederalCredits2025 } from "./federal-credits";
import { amount, dollars, nonnegative, sum, whole } from "./math";
import { constants2025, rulePackage2025 } from "./rule-package";
import { calculateScheduleSE2025 } from "./self-employment";
import { calculateSocialSecurityBenefits2025 } from "./social-security";
import { calculateIraBasis2025, calculateRetirementDistributions2025 } from "./retirement";
import { ordinaryIncomeTax2025, qualifiedDividendTax2025, scheduleDCapitalGainTax2025 } from "./tax-method";
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
  const advancedFederal = input.advancedFederal ?? { ...structuredClone(emptyAdvancedFederalProfile2025), dueDiligenceSignatureCurrent: false, valid1095ARecordIds: [], valid1098ERecordIds: [], validActivityIds: [] };

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

  function readSigned(value: string, path: string): Decimal {
    try { return amount(value); }
    catch { blocking("INVALID_AMOUNT", "Enter a valid decimal amount.", path); return new Decimal(0); }
  }

  validateEligibility(input, blocking);
  validateScheduleB(input, blocking);
  if (input.filingStatus !== "married_filing_jointly" && (
    input.wages.some(({ owner }) => owner === "spouse")
    || input.scheduleCActivities.some(({ owner }) => owner === "spouse")
    || (input.scheduleEActivities ?? []).some(({ owner }) => owner === "spouse")
    || (input.scheduleFActivities ?? []).some(({ owner }) => owner === "spouse")
    || (input.socialSecurityBenefits ?? []).some(({ owner }) => owner === "spouse")
  )) {
    blocking("SPOUSE_DATA_INVALID_FOR_STATUS", "Only a Married Filing Jointly return can include spouse-owned wage, benefit, or Schedule C, E, or F inputs.", null);
  }

  const wages = input.wages.map((item, index) => ({
    ...item,
    wageAmount: read(item.wages, `wages.${index}.wages`),
    withholdingAmount: read(item.federalWithholding, `wages.${index}.federalWithholding`),
    socialSecurityWageAmount: read(item.socialSecurityWages, `wages.${index}.socialSecurityWages`),
    medicareWageAmount: read(item.medicareWagesAndTips ?? item.wages, `wages.${index}.medicareWagesAndTips`),
    socialSecurityTaxWithheldAmount: read(item.socialSecurityTaxWithheld ?? "0.00", `wages.${index}.socialSecurityTaxWithheld`),
    medicareTaxWithheldAmount: read(item.medicareTaxWithheld ?? "0.00", `wages.${index}.medicareTaxWithheld`),
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
    const capitalGainDistributionAmount = read(item.capitalGainDistributions ?? "0.00", `dividends.${index}.capitalGainDistributions`);
    const unrecaptured1250Amount = read(item.unrecaptured1250Gain ?? "0.00", `dividends.${index}.unrecaptured1250Gain`);
    const section1202Amount = read(item.section1202Gain ?? "0.00", `dividends.${index}.section1202Gain`);
    const collectiblesAmount = read(item.collectiblesGain ?? "0.00", `dividends.${index}.collectiblesGain`);
    if (section199AAmount.gt(ordinaryAmount)) {
      blocking("SECTION_199A_DIVIDENDS_EXCEED_ORDINARY", "Section 199A dividends cannot exceed ordinary dividends from the same source.", `dividends.${index}.section199ADividends`);
    }
    if (unrecaptured1250Amount.plus(section1202Amount).plus(collectiblesAmount).gt(capitalGainDistributionAmount)) blocking("DIVIDEND_SPECIAL_GAIN_EXCEEDS_DISTRIBUTION", "Special-rate capital-gain distribution components cannot exceed total capital gain distributions.", `dividends.${index}.capitalGainDistributions`);
    return {
      ...item,
      ordinaryAmount,
      qualifiedAmount,
      exemptAmount: read(item.exemptInterestDividends, `dividends.${index}.exemptInterestDividends`),
      section199AAmount,
      capitalGainDistributionAmount,
      unrecaptured1250Amount,
      section1202Amount,
      collectiblesAmount,
      withholdingAmount: read(item.federalWithholding, `dividends.${index}.federalWithholding`),
    };
  });

  const capitalProfile = advancedFederal.adjustments.capitalGains;
  const capitalTreatments = new Map(capitalProfile.treatments.map((item) => [item.sourceRecordId, item]));
  const brokerTransactions = (input.brokerTransactions ?? []).map((item, index) => {
    const proceeds = read(item.proceeds, `brokerTransactions.${index}.proceeds`);
    const costBasis = read(item.costBasis, `brokerTransactions.${index}.costBasis`);
    const withholdingAmount = read(item.federalWithholding, `brokerTransactions.${index}.federalWithholding`);
    const enteredAdjustment = readSigned(item.adjustmentAmount, `brokerTransactions.${index}.adjustmentAmount`);
    const accruedMarketDiscount = read(item.accruedMarketDiscount ?? "0.00", `brokerTransactions.${index}.accruedMarketDiscount`);
    const washSaleLossDisallowed = read(item.washSaleLossDisallowed ?? "0.00", `brokerTransactions.${index}.washSaleLossDisallowed`);
    const sourceAdjustment = washSaleLossDisallowed.minus(accruedMarketDiscount);
    const adjustment = enteredAdjustment.isZero() && !sourceAdjustment.isZero() ? sourceAdjustment : enteredAdjustment;
    const adjustmentCode = item.adjustmentCode.trim().toUpperCase();
    const codes = adjustmentCode.split(/[,\s]+/).filter(Boolean);
    const treatment = capitalTreatments.get(item.id);
    const category = treatment?.category ?? "regular";
    const section1202Exclusion = treatment ? read(treatment.section1202Exclusion, `advancedFederal.adjustments.capitalGains.treatments.${index}.section1202Exclusion`) : new Decimal(0);
    if (item.term !== "short" && item.term !== "long") blocking("FORM_8949_TERM_REQUIRED", "Each brokerage transaction must be classified as short- or long-term.", `brokerTransactions.${index}.term`);
    if (codes.some((code) => !["B", "C", "D", "E", "H", "I", "L", "M", "N", "O", "Q", "R", "S", "T", "W", "X"].includes(code))) blocking("FORM_8949_ADJUSTMENT_CODE_INVALID", "Use a valid Form 8949 adjustment code.", `brokerTransactions.${index}.adjustmentCode`);
    if (!enteredAdjustment.isZero() && !sourceAdjustment.isZero() && !enteredAdjustment.eq(sourceAdjustment)) blocking("FORM_8949_SOURCE_ADJUSTMENT_MISMATCH", "The Form 8949 adjustment must reconcile to wash-sale loss disallowed less accrued market discount.", `brokerTransactions.${index}.adjustmentAmount`);
    if (washSaleLossDisallowed.gt(0) && !codes.includes("W")) blocking("FORM_8949_WASH_SALE_CODE_REQUIRED", "Wash-sale loss disallowed requires Form 8949 code W.", `brokerTransactions.${index}.adjustmentCode`);
    if (accruedMarketDiscount.gt(0) && !codes.includes("D")) blocking("FORM_8949_MARKET_DISCOUNT_CODE_REQUIRED", "Accrued market discount requires Form 8949 code D.", `brokerTransactions.${index}.adjustmentCode`);
    if (item.collectiblesOrQof && category === "regular") blocking("FORM_8949_SPECIAL_CATEGORY_REQUIRED", "A collectibles/QOF indicator requires a reviewed special transaction classification.", `advancedFederal.adjustments.capitalGains.treatments`);
    if (item.lossNotAllowed && adjustment.isZero()) blocking("FORM_8949_LOSS_NOT_ALLOWED_ADJUSTMENT_REQUIRED", "A loss-not-allowed indicator requires a reviewed adjustment amount and code.", `brokerTransactions.${index}.adjustmentAmount`);
    if ((!adjustment.isZero() || codes.length || category !== "regular") && (!capitalProfile.enabled || !treatment?.adjustmentReviewed)) blocking("FORM_8949_ADJUSTMENT_REVIEW_REQUIRED", "Adjusted and specially classified transactions require a source-linked reviewed capital-gain treatment.", `advancedFederal.adjustments.capitalGains.treatments`);
    if (category === "section_1202" && section1202Exclusion.gt(Decimal.max(0, proceeds.minus(costBasis).plus(adjustment)))) blocking("SECTION_1202_EXCLUSION_EXCEEDS_GAIN", "The Section 1202 exclusion cannot exceed gain before the exclusion.", `advancedFederal.adjustments.capitalGains.treatments.${index}.section1202Exclusion`);
    if (category === "section_1202" && item.term !== "long") blocking("SECTION_1202_LONG_TERM_REQUIRED", "Section 1202 treatment requires a long-term transaction.", `brokerTransactions.${index}.term`);
    if (!item.description.trim()) blocking("FORM_8949_DESCRIPTION_REQUIRED", "A property description is required for each brokerage transaction.", `brokerTransactions.${index}.description`);
    return { ...item, proceeds, costBasis, adjustmentCode, adjustment, withholdingAmount, category, section1202Exclusion, gainOrLoss: proceeds.minus(costBasis).plus(adjustment).minus(section1202Exclusion) };
  });
  for (const [index, treatment] of capitalProfile.treatments.entries()) if (!brokerTransactions.some(({ id }) => id === treatment.sourceRecordId)) blocking("CAPITAL_TREATMENT_SOURCE_INVALID", "Each capital treatment must link to an effective Form 1099-B transaction.", `advancedFederal.adjustments.capitalGains.treatments.${index}.sourceRecordId`);
  if (capitalProfile.enabled && !capitalProfile.carryoversReviewed) blocking("CAPITAL_CARRYOVER_REVIEW_REQUIRED", "Review short- and long-term capital-loss carryovers before calculation.", "advancedFederal.adjustments.capitalGains.carryoversReviewed");
  const retirementDistributions = (input.retirementDistributions ?? []).map((item, index) => {
    const gross = read(item.grossDistribution, `retirementDistributions.${index}.grossDistribution`);
    const reportedTaxable = read(item.taxableAmount, `retirementDistributions.${index}.taxableAmount`);
    const withholdingAmount = read(item.federalWithholding, `retirementDistributions.${index}.federalWithholding`);
    const employeeContributionAmount = read(item.employeeContributions ?? "0.00", `retirementDistributions.${index}.employeeContributions`);
    const totalEmployeeContributionAmount = read(item.totalEmployeeContributions ?? "0.00", `retirementDistributions.${index}.totalEmployeeContributions`);
    return { ...item, gross, reportedTaxable, withholdingAmount, employeeContributionAmount, totalEmployeeContributionAmount };
  });
  const retirementCalculation = calculateRetirementDistributions2025({ profile: advancedFederal, distributions: retirementDistributions, block: blocking });
  const iraBasisCalculation = calculateIraBasis2025({ profile: advancedFederal, retirementWorksheets: retirementCalculation.worksheets, block: blocking });
  const governmentPayments = (input.governmentPayments ?? []).map((item, index) => ({
    ...item,
    unemployment: read(item.unemploymentCompensation, `governmentPayments.${index}.unemploymentCompensation`),
    withholdingAmount: read(item.federalWithholding, `governmentPayments.${index}.federalWithholding`),
  }));
  const socialSecurityBenefits = (input.socialSecurityBenefits ?? []).map((item, index) => {
    const benefitsPaid = read(item.benefitsPaid, `socialSecurityBenefits.${index}.benefitsPaid`);
    const benefitsRepaid = read(item.benefitsRepaid, `socialSecurityBenefits.${index}.benefitsRepaid`);
    const netBenefits = read(item.netBenefits, `socialSecurityBenefits.${index}.netBenefits`);
    const withholdingAmount = read(item.federalWithholding, `socialSecurityBenefits.${index}.federalWithholding`);
    const workersCompensationOffset = read(item.workersCompensationOffset, `socialSecurityBenefits.${index}.workersCompensationOffset`);
    if ((!benefitsPaid.isZero() || !benefitsRepaid.isZero()) && !benefitsPaid.minus(benefitsRepaid).eq(netBenefits)) blocking("SOCIAL_SECURITY_STATEMENT_RECONCILIATION_REQUIRED", "Benefits paid minus benefits repaid must equal net benefits on each SSA-1099 or RRB-1099.", `socialSecurityBenefits.${index}`);
    if (!workersCompensationOffset.isZero()) blocking("RRB_WORKERS_COMPENSATION_OFFSET_UNSUPPORTED", "A railroad benefit statement with a workers' compensation offset requires treatment outside the supported worksheet profile.", `socialSecurityBenefits.${index}.workersCompensationOffset`);
    if (item.lumpSumElectionApplies) blocking("SOCIAL_SECURITY_LUMP_SUM_ELECTION_UNSUPPORTED", "A prior-year lump-sum election requires Publication 915 election worksheets outside the supported profile.", `socialSecurityBenefits.${index}.lumpSumElectionApplies`);
    return { ...item, benefitsPaid, benefitsRepaid, netBenefits, withholdingAmount, workersCompensationOffset };
  });
  if (socialSecurityBenefits.length && input.filingStatus === "married_filing_separately") blocking("MFS_SOCIAL_SECURITY_WORKSHEET_UNSUPPORTED", "Married Filing Separately Social Security taxation depends on whether the spouses lived apart all year; this fact is not yet supported, so calculation is blocked.", "filingStatus");
  const paymentCardReceipts = (input.paymentCardReceipts ?? []).map((item, index) => {
    const gross = read(item.grossPaymentAmount, `paymentCardReceipts.${index}.grossPaymentAmount`);
    const mapped = read(item.mappedScheduleCAmount, `paymentCardReceipts.${index}.mappedScheduleCAmount`);
    const withholdingAmount = read(item.federalWithholding, `paymentCardReceipts.${index}.federalWithholding`);
    if (!mapped.eq(gross)) blocking("FORM_1099_K_RECONCILIATION_REQUIRED", "Every supported Form 1099-K gross-payment amount must be fully reconciled to accepted Schedule C mappings.", `paymentCardReceipts.${index}.mappedScheduleCAmount`);
    return { ...item, gross, mapped, withholdingAmount };
  });
  const hsaDistributions = (input.hsaDistributions ?? []).map((item, index) => {
    const gross = read(item.grossDistribution, `hsaDistributions.${index}.grossDistribution`);
    const qualified = read(item.qualifiedMedicalExpenses, `hsaDistributions.${index}.qualifiedMedicalExpenses`);
    const excessEarnings = read(item.earningsOnExcessContributions, `hsaDistributions.${index}.earningsOnExcessContributions`);
    if (item.accountType !== "HSA" || item.distributionCode.trim() !== "1") blocking("HSA_DISTRIBUTION_PROFILE_UNSUPPORTED", "The review profile supports only normal code 1 HSA distributions.", `hsaDistributions.${index}`);
    if (!excessEarnings.isZero()) blocking("HSA_EXCESS_CONTRIBUTION_EARNINGS_UNSUPPORTED", "Earnings on excess HSA contributions require treatment outside the supported review profile.", `hsaDistributions.${index}.earningsOnExcessContributions`);
    if (!advancedFederal.adjustments.hsa.enabled && !qualified.eq(gross)) blocking("HSA_NONQUALIFIED_DISTRIBUTION_UNSUPPORTED", "Enable and complete the full Form 8889 profile before reporting a nonqualified HSA distribution.", `hsaDistributions.${index}.qualifiedMedicalExpenses`);
    return { ...item, gross, qualified, taxable: Decimal.max(0, gross.minus(qualified)) };
  });

  const scheduleC = input.scheduleCActivities.map((activity, activityIndex) => {
    const grossReceipts = whole(read(activity.grossReceipts, `scheduleCActivities.${activityIndex}.grossReceipts`));
    const returnsAndAllowances = whole(read(activity.returnsAndAllowances ?? "0.00", `scheduleCActivities.${activityIndex}.returnsAndAllowances`));
    const costOfGoodsSold = whole(read(activity.costOfGoodsSold ?? "0.00", `scheduleCActivities.${activityIndex}.costOfGoodsSold`));
    const otherIncome = whole(read(activity.otherIncome ?? "0.00", `scheduleCActivities.${activityIndex}.otherIncome`));
    const expenses = whole(sum([...Object.entries(activity.expenses).map(([category, value]) => read(value ?? "0", `scheduleCActivities.${activityIndex}.expenses.${category}`)), read(activity.otherExpenses ?? "0.00", `scheduleCActivities.${activityIndex}.otherExpenses`), read(activity.homeOfficeDeduction ?? "0.00", `scheduleCActivities.${activityIndex}.homeOfficeDeduction`)]));
    const grossIncome = grossReceipts.minus(returnsAndAllowances).minus(costOfGoodsSold).plus(otherIncome);
    const netProfit = grossIncome.minus(expenses);
    if (activity.accountingMethod && activity.accountingMethod !== "cash") blocking("SCHEDULE_C_ACCOUNTING_METHOD_UNSUPPORTED", "The supported Schedule C calculation profile requires the cash method.", `scheduleCActivities.${activityIndex}.accountingMethod`);
    if (activity.vehicleUsed) blocking("SCHEDULE_C_VEHICLE_FORM_UNSUPPORTED", "Vehicle facts are preserved, but the vehicle deduction and Part IV require a linked calculation module.", `scheduleCActivities.${activityIndex}.vehicleUsed`);
    if (activity.homeOfficeClaimed) blocking("SCHEDULE_C_HOME_OFFICE_FORM_UNSUPPORTED", "Home-office facts are preserved, but Form 8829 or the simplified-method worksheet is not yet calculated.", `scheduleCActivities.${activityIndex}.homeOfficeClaimed`);
    if (netProfit.isNegative()) {
      blocking("SCHEDULE_C_LOSS_UNSUPPORTED", "The supported Schedule C profile requires nonnegative profit.", `scheduleCActivities.${activityIndex}`);
    }
    if (!activity.qbiEligible) {
      blocking("QBI_TREATMENT_UNSUPPORTED", "A supported Schedule C activity must have confirmed simplified QBI eligibility.", `scheduleCActivities.${activityIndex}.qbiEligible`);
    }
    if (activity.selfEmploymentTreatmentConfirmed === false) blocking("SCHEDULE_C_SE_TREATMENT_UNCONFIRMED", "Schedule C self-employment treatment must be confirmed.", `scheduleCActivities.${activityIndex}.selfEmploymentTreatmentConfirmed`);
    return { activity, grossReceipts, returnsAndAllowances, costOfGoodsSold, grossIncome, expenses, netProfit };
  });
  const scheduleE = (input.scheduleEActivities ?? []).map((activity, activityIndex) => {
    const rents = whole(read(activity.rentsReceived, `scheduleEActivities.${activityIndex}.rentsReceived`));
    const royalties = whole(read(activity.royaltiesReceived, `scheduleEActivities.${activityIndex}.royaltiesReceived`));
    const expenses = whole(sum([...Object.entries(activity.expenses).map(([category, value]) => read(value ?? "0", `scheduleEActivities.${activityIndex}.expenses.${category}`)), read(activity.otherExpenses, `scheduleEActivities.${activityIndex}.otherExpenses`)]));
    const netIncomeOrLoss = rents.plus(royalties).minus(expenses);
    if (activity.personalUseDays > 0) blocking("SCHEDULE_E_PERSONAL_USE_ALLOCATION_REQUIRED", "Rental property with personal-use days requires allocation and vacation-home rules outside the supported profile.", `scheduleEActivities.${activityIndex}.personalUseDays`);
    if (["vacation_short_term", "self_rental", "other"].includes(activity.propertyType)) blocking("SCHEDULE_E_PROPERTY_PROFILE_UNSUPPORTED", "Vacation/short-term, self-rental, or unclassified property requires treatment outside the supported simple rental/royalty profile.", `scheduleEActivities.${activityIndex}.propertyType`);
    if (activity.qualifiedJointVenture !== false) blocking("SCHEDULE_E_QJV_REVIEW_REQUIRED", "Confirm that the activity is not a qualified joint venture; qualified joint venture treatment requires separate spouse reporting outside the supported profile.", `scheduleEActivities.${activityIndex}.qualifiedJointVenture`);
    if (activity.supplementalActivityCount > 0 || activity.remicInterestCount > 0) blocking("SCHEDULE_E_PARTS_II_IV_UNSUPPORTED", "Schedule E Parts II through IV are captured but require pass-through, estate/trust, or REMIC calculation support.", `scheduleEActivities.${activityIndex}`);
    if (activity.allInvestmentAtRisk !== true || activity.passiveLossRulesReviewed !== true) blocking("SCHEDULE_E_LIMITATION_REVIEW_REQUIRED", "Schedule E at-risk and passive-activity treatment must be reviewed before calculation.", `scheduleEActivities.${activityIndex}`);
    if (Number(activity.expenses.depreciation ?? 0) !== 0 && activity.depreciationReviewed !== true) blocking("SCHEDULE_E_DEPRECIATION_REVIEW_REQUIRED", "A reviewed depreciation amount and linked basis workpaper are required.", `scheduleEActivities.${activityIndex}.expenses.depreciation`);
    if (activity.rentalQbiEligible == null) blocking("SCHEDULE_E_QBI_TREATMENT_REQUIRED", "Confirm whether this rental or royalty activity is a qualified trade or business for QBI.", `scheduleEActivities.${activityIndex}.rentalQbiEligible`);
    if (netIncomeOrLoss.isNegative()) blocking("SCHEDULE_E_LOSS_LIMITATION_UNSUPPORTED", "A Schedule E loss requires passive, basis, and at-risk limitation calculations outside the supported profile.", `scheduleEActivities.${activityIndex}`);
    return { activity, rents, royalties, expenses, netIncomeOrLoss };
  });
  const scheduleF = (input.scheduleFActivities ?? []).map((activity, activityIndex) => {
    const income = Object.fromEntries(Object.entries(activity.income).map(([key, value]) => [key, read(value ?? "0", `scheduleFActivities.${activityIndex}.income.${key}`)])) as Record<string, Decimal>;
    const grossIncome = whole(sum([income.livestockSalesPurchased?.minus(income.livestockCostOrBasis ?? 0) ?? 0, income.livestockProduceSales ?? 0, income.cooperativeTaxable ?? 0, income.agriculturalProgramTaxable ?? 0, income.cccLoansReportedElection ?? 0, income.cccLoansTaxable ?? 0, income.cropInsuranceTaxable ?? 0, income.customHireIncome ?? 0, income.otherIncome ?? 0]));
    const expenses = whole(sum([...Object.entries(activity.expenses).map(([category, value]) => read(value ?? "0", `scheduleFActivities.${activityIndex}.expenses.${category}`)), read(activity.otherExpenses, `scheduleFActivities.${activityIndex}.otherExpenses`)]));
    const netProfit = grossIncome.minus(expenses);
    if (activity.accountingMethod !== "cash" || Object.values(activity.accrualAmounts).some((value) => Number(value) !== 0)) blocking("SCHEDULE_F_ACCRUAL_METHOD_UNSUPPORTED", "Accrual-method Schedule F amounts are preserved, but Part III calculation is outside the supported profile.", `scheduleFActivities.${activityIndex}.accountingMethod`);
    if (activity.materiallyParticipated !== true) blocking("SCHEDULE_F_MATERIAL_PARTICIPATION_REQUIRED", "The supported Schedule F profile requires confirmed material participation.", `scheduleFActivities.${activityIndex}.materiallyParticipated`);
    if (Number(activity.income.cropInsuranceDeferred ?? 0) !== 0 && activity.cropInsuranceElectionReviewed !== true) blocking("SCHEDULE_F_CROP_INSURANCE_ELECTION_REVIEW_REQUIRED", "Deferred crop-insurance proceeds require a reviewed election.", `scheduleFActivities.${activityIndex}.income.cropInsuranceDeferred`);
    if (activity.qbiEligible !== true) blocking("SCHEDULE_F_QBI_TREATMENT_REQUIRED", "A supported Schedule F activity requires confirmed simplified QBI eligibility.", `scheduleFActivities.${activityIndex}.qbiEligible`);
    if (activity.selfEmploymentTreatmentConfirmed !== true) blocking("SCHEDULE_F_SE_TREATMENT_REQUIRED", "Schedule F self-employment treatment must be confirmed.", `scheduleFActivities.${activityIndex}.selfEmploymentTreatmentConfirmed`);
    if (netProfit.isNegative()) blocking("SCHEDULE_F_LOSS_LIMITATION_UNSUPPORTED", "A Schedule F loss requires limitation and carryover support outside the supported profile.", `scheduleFActivities.${activityIndex}`);
    return { activity, grossIncome, expenses, netProfit };
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
  const rentalRealEstateRoyalties = whole(sum(scheduleE.map(({ netIncomeOrLoss }) => netIncomeOrLoss)));
  const farmIncome = whole(sum(scheduleF.map(({ netProfit }) => netProfit)));
  const qbiActivityIncome = whole(businessIncome.plus(farmIncome).plus(sum(scheduleE.filter(({ activity }) => activity.rentalQbiEligible === true).map(({ netIncomeOrLoss }) => netIncomeOrLoss))));
  const shortTermCarryover = capitalProfile.enabled ? whole(read(capitalProfile.shortTermLossCarryover, "advancedFederal.adjustments.capitalGains.shortTermLossCarryover")) : new Decimal(0);
  const longTermCarryover = capitalProfile.enabled ? whole(read(capitalProfile.longTermLossCarryover, "advancedFederal.adjustments.capitalGains.longTermLossCarryover")) : new Decimal(0);
  if ((shortTermCarryover.gt(0) || longTermCarryover.gt(0)) && capitalProfile.carryoverSourceYear == null) blocking("CAPITAL_CARRYOVER_SOURCE_YEAR_REQUIRED", "Capital-loss carryovers require their source tax year.", "advancedFederal.adjustments.capitalGains.carryoverSourceYear");
  const shortTermGainOrLoss = whole(sum(brokerTransactions.filter(({ term }) => term === "short").map(({ gainOrLoss }) => gainOrLoss)).minus(shortTermCarryover));
  const capitalGainDistributions = whole(sum(dividends.map(({ capitalGainDistributionAmount }) => capitalGainDistributionAmount)));
  const longTermGainOrLoss = whole(sum([...brokerTransactions.filter(({ term }) => term === "long").map(({ gainOrLoss }) => gainOrLoss), capitalGainDistributions]).minus(longTermCarryover));
  const netCapitalGainOrLoss = whole(shortTermGainOrLoss.plus(longTermGainOrLoss));
  const netCapitalGainForPreferentialTax = Decimal.max(0, whole(longTermGainOrLoss.plus(Decimal.min(0, shortTermGainOrLoss))));
  const capitalLossLimit = amount(input.filingStatus === "married_filing_separately" ? 1500 : 3000);
  const capitalGainOrLoss = Decimal.max(capitalLossLimit.negated(), netCapitalGainOrLoss);
  const netLossAfterOppositeTerm = {
    short: Decimal.max(0, shortTermGainOrLoss.negated().minus(Decimal.max(0, longTermGainOrLoss))),
    long: Decimal.max(0, longTermGainOrLoss.negated().minus(Decimal.max(0, shortTermGainOrLoss))),
  };
  const deductibleCapitalLoss = Decimal.min(capitalLossLimit, netLossAfterOppositeTerm.short.plus(netLossAfterOppositeTerm.long));
  const shortLossUsed = Decimal.min(netLossAfterOppositeTerm.short, deductibleCapitalLoss);
  const nextYearShortTermCarryover = whole(netLossAfterOppositeTerm.short.minus(shortLossUsed));
  const nextYearLongTermCarryover = whole(netLossAfterOppositeTerm.long.minus(deductibleCapitalLoss.minus(shortLossUsed)));
  const rawCollectiblesGain = whole(sum([...brokerTransactions.filter(({ category, gainOrLoss }) => category === "collectible_28_percent" && gainOrLoss.gt(0)).map(({ gainOrLoss }) => gainOrLoss), ...dividends.flatMap(({ collectiblesAmount, section1202Amount }) => [collectiblesAmount, section1202Amount])]));
  const rawUnrecapturedSection1250Gain = whole(sum([...brokerTransactions.filter(({ category, gainOrLoss }) => category === "unrecaptured_section_1250" && gainOrLoss.gt(0)).map(({ gainOrLoss }) => gainOrLoss), ...dividends.map(({ unrecaptured1250Amount }) => unrecaptured1250Amount)]));
  const unrecapturedSection1250Gain = Decimal.min(netCapitalGainForPreferentialTax, rawUnrecapturedSection1250Gain);
  const collectiblesGain = Decimal.min(nonnegative(netCapitalGainForPreferentialTax.minus(unrecapturedSection1250Gain)), rawCollectiblesGain);
  const regularNetCapitalGain = nonnegative(netCapitalGainForPreferentialTax.minus(collectiblesGain).minus(unrecapturedSection1250Gain));
  const iraGross = whole(sum(retirementCalculation.worksheets.filter(({ iraSepSimple }) => iraSepSimple).map(({ grossDistribution }) => grossDistribution)));
  const iraTaxable = whole(sum(((["taxpayer", "spouse"] as PersonRole2025[]).map((owner) => {
    const basis = iraBasisCalculation.find((row) => row.owner === owner);
    return basis?.taxableAmount ?? sum(retirementCalculation.worksheets.filter((item) => item.iraSepSimple && item.owner === owner).map(({ taxableAmount }) => taxableAmount));
  }))));
  const pensionGross = whole(sum(retirementCalculation.worksheets.filter(({ iraSepSimple }) => !iraSepSimple).map(({ grossDistribution }) => grossDistribution)));
  const pensionTaxable = whole(sum(retirementCalculation.worksheets.filter(({ iraSepSimple }) => !iraSepSimple).map(({ taxableAmount }) => taxableAmount)));
  const unemploymentCompensation = whole(sum(governmentPayments.map(({ unemployment }) => unemployment)));
  const sourceHsaTaxableDistribution = whole(sum(hsaDistributions.map(({ taxable }) => taxable)));

  const scheduleSE = roles
    .filter((owner) => input.filingStatus === "married_filing_jointly" || owner === "taxpayer")
    .map((owner) => {
      const ownerProfit = whole(sum([...scheduleC.filter(({ activity }) => activity.owner === owner).map(({ netProfit }) => netProfit), ...scheduleF.filter(({ activity }) => activity.owner === owner).map(({ netProfit }) => netProfit)]));
      const ownerSocialSecurityWages = whole(sum(wages.filter((wage) => wage.owner === owner).map(({ socialSecurityWageAmount }) => socialSecurityWageAmount)));
      return calculateScheduleSE2025(owner, ownerProfit, ownerSocialSecurityWages);
    })
    .filter(({ netProfit }) => !amount(netProfit).isZero());

  const selfEmploymentTax = whole(sum(scheduleSE.map(({ selfEmploymentTax: value }) => value)));
  const deductibleHalf = whole(sum(scheduleSE.map(({ deductibleHalf }) => deductibleHalf)));
  const medicareWagesAndTips = whole(sum(wages.map(({ medicareWageAmount }) => medicareWageAmount)));
  const medicareTaxWithheld = whole(sum(wages.map(({ medicareTaxWithheldAmount }) => medicareTaxWithheldAmount)));
  const selfEmploymentMedicareWages = whole(sum(scheduleSE.map(({ netEarnings }) => netEarnings)));
  if (advancedFederal.adjustments.hsa.enabled && hsaDistributions.length) {
    const sourceQualified = whole(sum(hsaDistributions.map(({ qualified }) => qualified)));
    const sourceNonqualified = whole(sum(hsaDistributions.map(({ taxable }) => taxable)));
    const reviewedQualified = whole(amount(advancedFederal.adjustments.hsa.qualifiedDistributions));
    const reviewedNonqualified = whole(amount(advancedFederal.adjustments.hsa.nonqualifiedDistributions));
    if (!sourceQualified.eq(reviewedQualified) || !sourceNonqualified.eq(reviewedNonqualified)) blocking("FORM_8889_DISTRIBUTION_RECONCILIATION_REQUIRED", "Reconcile the reviewed qualified and nonqualified HSA distributions to every effective Form 1099-SA.", "advancedFederal.adjustments.hsa");
  }
  const effectiveHsaTaxableDistribution = advancedFederal.adjustments.hsa.enabled ? whole(amount(advancedFederal.adjustments.hsa.nonqualifiedDistributions)) : sourceHsaTaxableDistribution;
  const schedule1AdditionalIncome = whole(businessIncome.plus(rentalRealEstateRoyalties).plus(farmIncome).plus(unemploymentCompensation).plus(effectiveHsaTaxableDistribution));
  const incomeBeforeSocialSecurity = whole(wageTotal.plus(taxableInterest).plus(ordinaryDividends).plus(iraTaxable).plus(pensionTaxable).plus(capitalGainOrLoss).plus(schedule1AdditionalIncome));
  const preliminaryAgiBeforeSocialSecurity = whole(incomeBeforeSocialSecurity.minus(deductibleHalf));
  if (socialSecurityBenefits.length && (advancedFederal.adjustments.ira.enabled || advancedFederal.adjustments.studentLoan.enabled)) blocking("SOCIAL_SECURITY_INCOME_SENSITIVE_ADJUSTMENT_UNSUPPORTED", "Social Security benefits combined with an IRA or student-loan interest deduction require an iterative modified-AGI worksheet outside the supported profile.", "advancedFederal.adjustments");
  const adjustmentCalculation = calculateAdjustments2025({ profile: advancedFederal, filingStatus: input.filingStatus, preliminaryAgi: preliminaryAgiBeforeSocialSecurity, businessIncome, farmIncome, deductibleHalfSelfEmploymentTax: deductibleHalf, hasSpouse: input.hasSpouse === true, valid1098ERecordIds: advancedFederal.valid1098ERecordIds, validActivityIds: advancedFederal.validActivityIds, block: blocking });
  const socialSecurityWorksheet = calculateSocialSecurityBenefits2025({ filingStatus: input.filingStatus, totalBenefits: sum(socialSecurityBenefits.map(({ netBenefits }) => netBenefits)), incomeBeforeBenefits: preliminaryAgiBeforeSocialSecurity, taxExemptInterest, adjustments: adjustmentCalculation.totalAdjustments });
  const totalIncome = whole(incomeBeforeSocialSecurity.plus(socialSecurityWorksheet.taxableBenefits));
  const preliminaryAgi = whole(totalIncome.minus(deductibleHalf));
  const adjustedGrossIncome = whole(preliminaryAgi.minus(adjustmentCalculation.totalAdjustments));
  const earnedIncome = whole(wageTotal.plus(Decimal.max(0, businessIncome.plus(farmIncome).minus(deductibleHalf))));
  const knownUnearnedIncome = nonnegative(whole(totalIncome.minus(earnedIncome)));
  if (input.eligibility.claimableAsDependent && knownUnearnedIncome.gt(constants2025.form8615UnearnedIncomeThreshold) && !input.eligibility.form8615ApplicabilityReviewed) {
    blocking("FORM_8615_THRESHOLD_REVIEW_REQUIRED", "Known unearned income exceeds the 2025 Form 8615 screening threshold; complete the applicability review.", "eligibility.form8615ApplicabilityReviewed");
  }
  const additionalMedicareTax = calculateAdditionalMedicareTax2025({ profile: advancedFederal, filingStatus: input.filingStatus, medicareWagesAndTips, medicareTaxWithheld, selfEmploymentWages: selfEmploymentMedicareWages, block: blocking });
  const netInvestmentIncomeTax = calculateNetInvestmentIncomeTax2025({ profile: advancedFederal, filingStatus: input.filingStatus, modifiedAdjustedGrossIncome: adjustedGrossIncome, taxableInterest, ordinaryDividends, passiveRentalIncome: rentalRealEstateRoyalties, netCapitalGain: netCapitalGainOrLoss, block: blocking });
  const scheduleAInput = input.scheduleA;
  const medicalAndDentalExpenses = read(scheduleAInput?.medicalAndDentalExpenses ?? "0.00", "scheduleA.medicalAndDentalExpenses");
  const medicalFloor = whole(adjustedGrossIncome.mul(constants2025.scheduleAMedicalFloorRate));
  const deductibleMedical = nonnegative(whole(medicalAndDentalExpenses.minus(medicalFloor)));
  const stateLocalIncomeOrSalesTaxes = read(scheduleAInput?.stateLocalIncomeOrSalesTaxes ?? "0.00", "scheduleA.stateLocalIncomeOrSalesTaxes");
  const realEstateTaxes = read(scheduleAInput?.realEstateTaxes ?? "0.00", "scheduleA.realEstateTaxes");
  const personalPropertyTaxes = read(scheduleAInput?.personalPropertyTaxes ?? "0.00", "scheduleA.personalPropertyTaxes");
  const stateAndLocalTaxesBeforeLimit = whole(stateLocalIncomeOrSalesTaxes.plus(realEstateTaxes).plus(personalPropertyTaxes));
  const baseSaltLimit = amount(constants2025.saltLimit[input.filingStatus]);
  const saltPhaseoutExcess = Decimal.max(0, adjustedGrossIncome.minus(constants2025.saltPhaseoutThreshold[input.filingStatus]));
  const stateAndLocalTaxLimit = Decimal.max(constants2025.saltMinimumLimit[input.filingStatus], whole(baseSaltLimit.minus(saltPhaseoutExcess.mul(constants2025.saltPhaseoutRate[input.filingStatus]))));
  const deductibleStateAndLocalTaxes = Decimal.min(stateAndLocalTaxesBeforeLimit, stateAndLocalTaxLimit);
  const otherTaxes = read(scheduleAInput?.otherTaxes ?? "0.00", "scheduleA.otherTaxes");
  const homeMortgageInterestAndPoints = read(scheduleAInput?.homeMortgageInterestAndPoints ?? "0.00", "scheduleA.homeMortgageInterestAndPoints");
  const investmentInterest = read(scheduleAInput?.investmentInterest ?? "0.00", "scheduleA.investmentInterest");
  const cashCharitableContributions = read(scheduleAInput?.cashCharitableContributions ?? "0.00", "scheduleA.cashCharitableContributions");
  const noncashCharitableContributions = read(scheduleAInput?.noncashCharitableContributions ?? "0.00", "scheduleA.noncashCharitableContributions");
  const charitableContributions = whole(cashCharitableContributions.plus(noncashCharitableContributions));
  const casualtyAndTheftLosses = read(scheduleAInput?.casualtyAndTheftLosses ?? "0.00", "scheduleA.casualtyAndTheftLosses");
  const otherItemizedDeductions = read(scheduleAInput?.otherItemizedDeductions ?? "0.00", "scheduleA.otherItemizedDeductions");
  const totalItemizedDeductions = whole(sum([deductibleMedical, deductibleStateAndLocalTaxes, otherTaxes, homeMortgageInterestAndPoints, investmentInterest, charitableContributions, casualtyAndTheftLosses, otherItemizedDeductions]));
  const mustItemize = input.filingStatus === "married_filing_separately" && scheduleAInput?.marriedFilingSeparatelySpouseItemizes === true;
  const usesScheduleA = Boolean(scheduleAInput?.enabled || input.eligibility.usesItemizedDeductions || mustItemize);
  const regularStandardDeduction = amount(constants2025.standardDeduction[input.filingStatus]);
  const basicStandardDeduction = input.eligibility.claimableAsDependent
    ? Decimal.min(regularStandardDeduction, Decimal.max(constants2025.dependentMinimumStandardDeduction, earnedIncome.plus(constants2025.dependentEarnedIncomeAddition)))
    : regularStandardDeduction;
  const spouseAdditionalBoxes = input.filingStatus === "married_filing_jointly"
    || (input.filingStatus === "married_filing_separately" && input.eligibility.mfsSpouseAdditionalDeductionEligible)
    ? Number(input.eligibility.spouseAge65OrOlder) + Number(input.eligibility.spouseBlind)
    : 0;
  const additionalBoxes = Number(input.eligibility.taxpayerAge65OrOlder) + Number(input.eligibility.taxpayerBlind) + spouseAdditionalBoxes;
  const additionalRate = input.filingStatus === "single" || input.filingStatus === "head_of_household"
    ? constants2025.additionalStandardDeduction.unmarried
    : constants2025.additionalStandardDeduction.married;
  const additionalStandardDeduction = amount(additionalBoxes * additionalRate);
  const standardDeduction = mustItemize ? new Decimal(0) : whole(basicStandardDeduction.plus(additionalStandardDeduction));
  const deductionUsed = usesScheduleA ? totalItemizedDeductions : standardDeduction;
  const taxableBeforeQbi = nonnegative(whole(adjustedGrossIncome.minus(deductionUsed)));

  if (taxableBeforeQbi.gt(constants2025.qbiSimplifiedThreshold[input.filingStatus]) && (qbiActivityIncome.gt(0) || section199ADividends.gt(0))) {
    blocking("FORM_8995_A_REQUIRED", "Taxable income exceeds the simplified Form 8995 threshold; Form 8995-A is outside Phase 1.", "forms.form8995");
    return blockedOutput(input, diagnostics, trace);
  }
  if (diagnostics.some(({ severity }) => severity === "blocking")) {
    return blockedOutput(input, diagnostics, trace);
  }

  const qbi = nonnegative(whole(qbiActivityIncome.minus(deductibleHalf)));
  const qbiComponent = whole(qbi.mul("0.20"));
  const reitComponent = whole(section199ADividends.mul("0.20"));
  const incomeLimitationBase = nonnegative(whole(taxableBeforeQbi.minus(qualifiedDividends)));
  const incomeLimitation = whole(incomeLimitationBase.mul("0.20"));
  const qbiDeduction = Decimal.min(qbiComponent.plus(reitComponent), incomeLimitation);
  const taxableIncome = nonnegative(whole(taxableBeforeQbi.minus(qbiDeduction)));

  const preferentialIncome = whole(qualifiedDividends.plus(netCapitalGainForPreferentialTax));
  const specialCapitalRateApplies = collectiblesGain.gt(0) || unrecapturedSection1250Gain.gt(0);
  const preferential = preferentialIncome.gt(0)
    ? specialCapitalRateApplies
      ? scheduleDCapitalGainTax2025({ taxableIncome, qualifiedDividends, regularNetCapitalGain, collectiblesGain, unrecapturedSection1250Gain, filingStatus: input.filingStatus })
      : qualifiedDividendTax2025(taxableIncome, preferentialIncome, input.filingStatus)
    : null;
  const calculatedIncomeTax = preferential?.tax ?? ordinaryIncomeTax2025(taxableIncome, input.filingStatus);
  const incomeTax = input.approvedOverrides?.form1040IncomeTax == null
    ? calculatedIncomeTax
    : whole(read(input.approvedOverrides.form1040IncomeTax, "approvedOverrides.form1040IncomeTax"));
  if (input.approvedOverrides?.form1040IncomeTax != null) diagnostics.push({ code: "MANUAL_OVERRIDE_APPLIED", severity: "warning", message: `Approved income-tax override replaced the calculated ${calculatedIncomeTax.toFixed(0)} result.`, path: "form-1040.income-tax" });
  const alternativeMinimumTax = calculateAlternativeMinimumTax2025({
    profile: advancedFederal,
    filingStatus: input.filingStatus,
    taxableIncomeBeforeQbi: taxableBeforeQbi,
    regularIncomeTax: incomeTax,
    standardDeductionUsed: standardDeduction,
    usesScheduleA,
    deductibleStateAndLocalTaxes,
    deductibleOtherTaxes: otherTaxes,
    itemizedReviewNeeded: [homeMortgageInterestAndPoints, investmentInterest, casualtyAndTheftLosses, otherItemizedDeductions].some((value) => !value.isZero()),
    qbiComponentBeforeLimitation: qbiComponent.plus(reitComponent),
    preferentialIncome,
    claimableAsDependent: input.eligibility.claimableAsDependent,
    form8615Required: input.eligibility.form8615Required === true,
    block: blocking,
  });
  const dependents = input.dependents ?? [];
  const qualifyingChildren = dependents.filter(({ qualifiesForChildTaxCredit }) => qualifiesForChildTaxCredit);
  const otherDependents = dependents.filter(({ qualifiesForOtherDependentCredit, qualifiesForChildTaxCredit }) => qualifiesForOtherDependentCredit && !qualifiesForChildTaxCredit);
  const potentialChildTaxCredit = amount(qualifyingChildren.length * constants2025.childTaxCreditPerChild);
  const potentialOtherDependentCredit = amount(otherDependents.length * constants2025.otherDependentCreditPerDependent);
  const potentialDependentCredits = potentialChildTaxCredit.plus(potentialOtherDependentCredit);
  const phaseoutExcess = Decimal.max(0, adjustedGrossIncome.minus(constants2025.childTaxCreditPhaseoutThreshold[input.filingStatus]));
  const phaseoutReduction = Decimal.min(potentialDependentCredits, phaseoutExcess.isZero() ? 0 : phaseoutExcess.div(1000).ceil().mul(50));
  const dependentCreditsAfterPhaseout = Decimal.max(0, potentialDependentCredits.minus(phaseoutReduction));
  const nonrefundableDependentCredit = Decimal.min(incomeTax, dependentCreditsAfterPhaseout);
  const unusedDependentCredit = Decimal.max(0, dependentCreditsAfterPhaseout.minus(nonrefundableDependentCredit));
  const earnedIncomeRefundLimit = whole(Decimal.max(0, earnedIncome.minus(constants2025.childTaxCreditEarnedIncomeFloor)).mul("0.15"));
  const perChildRefundLimit = amount(qualifyingChildren.length * constants2025.refundableChildTaxCreditPerChild);
  const withheldPayrollTaxes = whole(sum(wages.flatMap(({ socialSecurityTaxWithheldAmount, medicareTaxWithheldAmount }) => [socialSecurityTaxWithheldAmount, medicareTaxWithheldAmount])));
  const threeChildAlternativeLimit = whole(withheldPayrollTaxes.plus(deductibleHalf).plus(selfEmploymentTax));
  const refundableIncomeLimit = qualifyingChildren.length >= 3 ? Decimal.max(earnedIncomeRefundLimit, threeChildAlternativeLimit) : earnedIncomeRefundLimit;
  const additionalChildTaxCredit = Decimal.min(unusedDependentCredit, refundableIncomeLimit, perChildRefundLimit);
  const ownerEarnedIncome = Object.fromEntries(roles.map((role) => {
    const ownerWages = sum(wages.filter(({ owner }) => owner === role).map(({ wageAmount }) => wageAmount));
    const ownerBusiness = sum(scheduleC.filter(({ activity }) => activity.owner === role).map(({ netProfit }) => netProfit));
    const ownerFarm = sum(scheduleF.filter(({ activity }) => activity.owner === role).map(({ netProfit }) => netProfit));
    const ownerDeductibleHalf = sum(scheduleSE.filter(({ owner }) => owner === role).map(({ deductibleHalf }) => deductibleHalf));
    return [role, whole(ownerWages.plus(Decimal.max(0, ownerBusiness.plus(ownerFarm).minus(ownerDeductibleHalf))))];
  })) as Record<PersonRole2025, Decimal>;
  const federalCredits = calculateFederalCredits2025({ input, adjustedGrossIncome, earnedIncome, taxAfterDependentCredits: Decimal.max(0, incomeTax.minus(nonrefundableDependentCredit)), ownerEarnedIncome, block: blocking });
  const dueDiligence = validateDueDiligence2025({ profile: advancedFederal, signatureCurrent: advancedFederal.dueDiligenceSignatureCurrent, claims: { eitc: federalCredits.earnedIncomeCredit.gt(0), childTaxCredits: potentialDependentCredits.gt(0), aotc: federalCredits.form8863.students.some(({ creditType }) => creditType === "aotc"), headOfHousehold: input.filingStatus === "head_of_household" }, block: blocking });
  const premiumTaxCredit = calculatePremiumTaxCredit2025({ profile: advancedFederal, modifiedAgi: adjustedGrossIncome.plus(taxExemptInterest), filingStatus: input.filingStatus, valid1095ARecordIds: advancedFederal.valid1095ARecordIds, block: blocking });
  const advancedPayments = calculatePayments2025({ profile: advancedFederal, wages: input.wages, filingStatus: input.filingStatus, block: blocking });
  if (diagnostics.some(({ severity }) => severity === "blocking")) return blockedOutput(input, diagnostics, trace);
  const schedule3NonrefundableCredits = federalCredits.dependentCareCredit.plus(federalCredits.educationNonrefundableCredit);
  const schedule3OtherPayments = premiumTaxCredit.premiumTaxCredit.plus(advancedPayments.extensionPayment).plus(advancedPayments.otherPayments).plus(advancedPayments.excessSocialSecurity);
  const part1AdditionalTax = alternativeMinimumTax.alternativeMinimumTax.plus(premiumTaxCredit.excessAdvancePtcRepayment);
  const part2OtherTaxes = selfEmploymentTax.plus(additionalMedicareTax.additionalMedicareTax).plus(netInvestmentIncomeTax.netInvestmentIncomeTax).plus(retirementCalculation.form5329.additionalTax).plus(adjustmentCalculation.additionalHsaTax);
  const totalAdditionalTaxes = part1AdditionalTax.plus(part2OtherTaxes);
  const totalTax = Decimal.max(0, incomeTax.plus(part1AdditionalTax).minus(nonrefundableDependentCredit).minus(schedule3NonrefundableCredits)).plus(part2OtherTaxes);
  const federalWithholding = whole(sum([
    ...wages.map(({ withholdingAmount }) => withholdingAmount),
    ...interest.map(({ withholdingAmount }) => withholdingAmount),
    ...dividends.map(({ withholdingAmount }) => withholdingAmount),
    ...businessWithholding,
    ...brokerTransactions.map(({ withholdingAmount }) => withholdingAmount),
    ...retirementCalculation.worksheets.map(({ withholdingAmount }) => withholdingAmount),
    ...governmentPayments.map(({ withholdingAmount }) => withholdingAmount),
    ...socialSecurityBenefits.map(({ withholdingAmount }) => withholdingAmount),
    ...paymentCardReceipts.map(({ withholdingAmount }) => withholdingAmount),
  ]));
  const totalPayments = federalWithholding.plus(additionalMedicareTax.additionalMedicareWithholding).plus(additionalChildTaxCredit).plus(federalCredits.earnedIncomeCredit).plus(federalCredits.refundableAmericanOpportunityCredit).plus(premiumTaxCredit.premiumTaxCredit).plus(advancedPayments.totalOtherPayments);
  const refund = Decimal.max(0, totalPayments.minus(totalTax));
  const amountOwed = Decimal.max(0, totalTax.minus(totalPayments));
  const scheduleBRequired = taxableInterest.gt(constants2025.scheduleBThreshold)
    || ordinaryDividends.gt(constants2025.scheduleBThreshold)
    || input.scheduleBScreening.foreignAccount === "yes"
    || input.scheduleBScreening.foreignTrust === "yes"
    || input.scheduleBScreening.otherScheduleBTrigger === "yes";

  addTrace(trace, "schedule-c.net-profit", "Schedule C, line 31", "SCH-C-NET-PROFIT", { grossReceipts: dollars(sum(scheduleC.map(({ grossReceipts }) => grossReceipts))), returnsAndAllowances: dollars(sum(scheduleC.map(({ returnsAndAllowances }) => returnsAndAllowances))), costOfGoodsSold: dollars(sum(scheduleC.map(({ costOfGoodsSold }) => costOfGoodsSold))), expenses: dollars(sum(scheduleC.map(({ expenses }) => expenses))) }, businessIncome);
  addTrace(trace, "schedule-e.net-income-loss", "Schedule E, line 26", "SCH-E-PART-I-NET", { rents: dollars(sum(scheduleE.map(({ rents }) => rents))), royalties: dollars(sum(scheduleE.map(({ royalties }) => royalties))), expenses: dollars(sum(scheduleE.map(({ expenses }) => expenses))) }, rentalRealEstateRoyalties);
  addTrace(trace, "schedule-f.net-profit", "Schedule F, line 34", "SCH-F-CASH-NET-PROFIT", { grossIncome: dollars(sum(scheduleF.map(({ grossIncome }) => grossIncome))), expenses: dollars(sum(scheduleF.map(({ expenses }) => expenses))) }, farmIncome);
  addTrace(trace, "schedule-d.net-gain-loss", "Schedule D, lines 6-16", "SCHEDULE-D-TRANSACTIONS-AND-CARRYOVERS", { shortTermCarryover: shortTermCarryover.toFixed(0), longTermCarryover: longTermCarryover.toFixed(0), shortTerm: shortTermGainOrLoss.toFixed(0), longTerm: longTermGainOrLoss.toFixed(0) }, netCapitalGainOrLoss);
  addTrace(trace, "schedule-d.next-year-carryover", "Capital Loss Carryover Worksheet", "SCHEDULE-D-CARRYOVER-2025", { lossLimit: capitalLossLimit.toFixed(0), deductibleLoss: deductibleCapitalLoss.toFixed(0) }, nextYearShortTermCarryover.plus(nextYearLongTermCarryover));
  addTrace(trace, "schedule-1.unemployment", "Schedule 1, line 7", "FORM-1099-G-UNEMPLOYMENT", { sourceCount: String(governmentPayments.length) }, unemploymentCompensation);
  addTrace(trace, "form-1040.social-security-benefits", "Form 1040, lines 6a–6b", "SOCIAL-SECURITY-BENEFITS-WORKSHEET-2025", { sourceCount: String(socialSecurityBenefits.length), totalBenefits: socialSecurityWorksheet.totalBenefits.toFixed(0), provisionalIncome: socialSecurityWorksheet.provisionalIncome.toFixed(0), baseAmount: socialSecurityWorksheet.baseAmount.toFixed(0), adjustedBaseAmount: socialSecurityWorksheet.adjustedBaseAmount.toFixed(0) }, socialSecurityWorksheet.taxableBenefits);
  addTrace(trace, "form-8889.distributions", "Form 8889, lines 14a-16", "FORM-8889-2025", { sourceCount: String(hsaDistributions.length), grossDistribution: dollars(sum(hsaDistributions.map(({ gross }) => gross))), contributionLimit: adjustmentCalculation.hsaContributionLimit.toFixed(0) }, effectiveHsaTaxableDistribution);
  addTrace(trace, "schedule-se.tax", "Schedule SE, line 12", "SCH-SE-REGULAR", { netProfit: businessIncome.plus(farmIncome).toFixed(0), wageBase: String(constants2025.socialSecurityWageBase) }, selfEmploymentTax);
  addTrace(trace, "schedule-1.se-deduction", "Schedule 1, line 15", "SCH-SE-DEDUCTIBLE-HALF", { selfEmploymentTax: selfEmploymentTax.toFixed(0) }, deductibleHalf);
  addTrace(trace, "schedule-1.adjustments", "Schedule 1, lines 11-26", "SCHEDULE-1-ADJUSTMENTS-2025", { preliminaryAgi: preliminaryAgi.toFixed(0) }, adjustmentCalculation.totalAdjustments);
  addTrace(trace, "form-8995.deduction", "Form 8995, line 15", "FORM-8995-SIMPLIFIED", { qbi: qbi.toFixed(0), section199ADividends: section199ADividends.toFixed(0), incomeLimitationBase: incomeLimitationBase.toFixed(0) }, qbiDeduction);
  addTrace(trace, "schedule-a.total-itemized-deductions", "Schedule A, line 17", "SCHEDULE-A-2025", { adjustedGrossIncome: adjustedGrossIncome.toFixed(0), medicalFloor: medicalFloor.toFixed(0), saltLimit: stateAndLocalTaxLimit.toFixed(0) }, totalItemizedDeductions);
  addTrace(trace, "form-1040.standard-deduction", "Form 1040, line 12e", input.eligibility.claimableAsDependent ? "DEPENDENT-STANDARD-DEDUCTION-WORKSHEET" : additionalBoxes ? "AGE-BLINDNESS-STANDARD-DEDUCTION-CHART" : "STANDARD-DEDUCTION-2025", { regularStandardDeduction: regularStandardDeduction.toFixed(0), earnedIncome: earnedIncome.toFixed(0), basicStandardDeduction: basicStandardDeduction.toFixed(0), additionalBoxes: String(additionalBoxes), additionalStandardDeduction: additionalStandardDeduction.toFixed(0) }, standardDeduction);
  addTrace(trace, "form-1040.taxable-income", "Form 1040, line 15", "FORM-1040-TAXABLE-INCOME", { adjustedGrossIncome: adjustedGrossIncome.toFixed(0), deductionUsed: deductionUsed.toFixed(0), qbiDeduction: qbiDeduction.toFixed(0) }, taxableIncome);
  addTrace(trace, "form-1040.income-tax", "Form 1040, line 16", input.approvedOverrides?.form1040IncomeTax != null ? "APPROVED-MANUAL-OVERRIDE" : preferential ? "QD-CAPITAL-GAIN-WORKSHEET" : taxableIncome.lt(100000) ? "IRS-TAX-TABLE" : "IRS-TAX-COMPUTATION-WORKSHEET", { taxableIncome: taxableIncome.toFixed(0), qualifiedDividends: qualifiedDividends.toFixed(0), netCapitalGain: netCapitalGainForPreferentialTax.toFixed(0), calculatedIncomeTax: calculatedIncomeTax.toFixed(0) }, incomeTax);
  addTrace(trace, "schedule-8812.credit", "Schedule 8812 / Form 1040, line 19", "SCHEDULE-8812-CTC-ODC-2025", { qualifyingChildren: String(qualifyingChildren.length), otherDependents: String(otherDependents.length), phaseoutReduction: phaseoutReduction.toFixed(0) }, nonrefundableDependentCredit);
  addTrace(trace, "schedule-8812.additional-child-tax-credit", "Schedule 8812 / Form 1040, line 28", "SCHEDULE-8812-ACTC-2025", { earnedIncome: earnedIncome.toFixed(0), unusedCredit: unusedDependentCredit.toFixed(0), perChildLimit: perChildRefundLimit.toFixed(0), threeChildAlternativeLimit: threeChildAlternativeLimit.toFixed(0) }, additionalChildTaxCredit);
  addTrace(trace, "schedule-eic.credit", "Form 1040, line 27a", "EITC-2025", { earnedIncome: earnedIncome.toFixed(0), adjustedGrossIncome: adjustedGrossIncome.toFixed(0), qualifyingChildren: String(federalCredits.scheduleEic.qualifyingChildren.length) }, federalCredits.earnedIncomeCredit);
  addTrace(trace, "form-2441.credit", "Schedule 3, line 2", "FORM-2441-2025", { qualifiedExpenses: federalCredits.form2441.qualifiedExpenses, applicablePercentage: federalCredits.form2441.applicablePercentage }, federalCredits.dependentCareCredit);
  addTrace(trace, "form-8863.credit", "Schedule 3, line 3", "FORM-8863-2025", { aotc: federalCredits.form8863.tentativeAmericanOpportunityCredit, llc: federalCredits.form8863.tentativeLifetimeLearningCredit, phaseoutFactor: federalCredits.form8863.phaseoutFactor }, federalCredits.educationNonrefundableCredit);
  addTrace(trace, "form-8962.credit", "Schedule 3, line 9 / Schedule 2, line 2", "FORM-8962-2025", { householdIncome: premiumTaxCredit.householdIncome, percentFpl: premiumTaxCredit.householdIncomePercentFpl, advancePtc: premiumTaxCredit.totalAdvancePtc }, premiumTaxCredit.premiumTaxCredit.minus(premiumTaxCredit.excessAdvancePtcRepayment));
  addTrace(trace, "form-6251.alternative-minimum-tax", "Schedule 2, line 1", "FORM-6251-2025", { alternativeMinimumTaxableIncome: alternativeMinimumTax.alternativeMinimumTaxableIncome.toFixed(0), exemption: alternativeMinimumTax.exemption.toFixed(0), tentativeMinimumTax: alternativeMinimumTax.tentativeMinimumTax.toFixed(0), regularTax: alternativeMinimumTax.regularTax.toFixed(0) }, alternativeMinimumTax.alternativeMinimumTax);
  addTrace(trace, "form-8959.additional-medicare-tax", "Schedule 2, line 11", "FORM-8959-2025", { medicareWagesAndTips: additionalMedicareTax.medicareWagesAndTips.toFixed(0), selfEmploymentWages: additionalMedicareTax.selfEmploymentWages.toFixed(0), threshold: additionalMedicareTax.threshold.toFixed(0), excessWages: additionalMedicareTax.excessWages.toFixed(0) }, additionalMedicareTax.additionalMedicareTax);
  addTrace(trace, "form-8959.additional-withholding", "Form 1040, line 25c", "FORM-8959-WITHHOLDING-2025", { medicareTaxWithheld: medicareTaxWithheld.toFixed(0), regularMedicareTax: medicareWagesAndTips.mul("0.0145").toFixed(0) }, additionalMedicareTax.additionalMedicareWithholding);
  addTrace(trace, "form-8960.net-investment-income-tax", "Schedule 2, line 12", "FORM-8960-2025", { netInvestmentIncome: netInvestmentIncomeTax.netInvestmentIncome.toFixed(0), modifiedAdjustedGrossIncome: netInvestmentIncomeTax.modifiedAdjustedGrossIncome.toFixed(0), threshold: netInvestmentIncomeTax.threshold.toFixed(0), excessMagi: netInvestmentIncomeTax.excessMagi.toFixed(0) }, netInvestmentIncomeTax.netInvestmentIncomeTax);
  for (const basis of iraBasisCalculation) addTrace(trace, `form-8606.${basis.owner}`, "Form 8606, lines 1-14", "FORM-8606-PRO-RATA-2025", { priorYearBasis: basis.priorYearBasis.toFixed(0), currentNondeductibleContributions: basis.currentYearNondeductibleContributions.toFixed(0), distributions: basis.traditionalIraDistributions.toFixed(0), conversions: basis.rothConversions.toFixed(0), yearEndValue: basis.yearEndTraditionalIraValue.toFixed(0) }, basis.taxableAmount);
  addTrace(trace, "form-5329.additional-tax", "Schedule 2, line 8", "FORM-5329-EARLY-DISTRIBUTIONS-2025", { earlyDistributions: retirementCalculation.form5329.earlyDistributions.toFixed(0), exceptions: retirementCalculation.form5329.exceptionAmount.toFixed(0), subjectToTax: retirementCalculation.form5329.amountSubjectToAdditionalTax.toFixed(0) }, retirementCalculation.form5329.additionalTax);
  addTrace(trace, "form-8867.due-diligence", "Form 8867", "PAID-PREPARER-DUE-DILIGENCE", { required: String(dueDiligence.required), currentSignature: String(dueDiligence.signedForCurrentRevision) }, new Decimal(dueDiligence.required && !dueDiligence.signedForCurrentRevision ? 0 : 1));
  addTrace(trace, "form-1040.total-tax", "Form 1040, line 24", "FORM-1040-TOTAL-TAX", { incomeTax: incomeTax.toFixed(0), dependentCredit: nonrefundableDependentCredit.toFixed(0), schedule3Credits: schedule3NonrefundableCredits.toFixed(0), additionalTaxes: totalAdditionalTaxes.toFixed(0) }, totalTax);
  addTrace(trace, "form-1040.payments", "Form 1040, line 25d", "ACTIVE-SOURCE-WITHHOLDING", { sourceCount: String(wages.length + interest.length + dividends.length + businessWithholding.length + brokerTransactions.length + retirementDistributions.length + governmentPayments.length + socialSecurityBenefits.length + paymentCardReceipts.length) }, federalWithholding);

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
      filingStatus: input.filingStatus,
      dependents: dependents.map(({ id, legalName, relationship, qualifiesForChildTaxCredit, qualifiesForOtherDependentCredit }) => ({ id, legalName, relationship, childTaxCredit: qualifiesForChildTaxCredit, otherDependentCredit: qualifiesForOtherDependentCredit && !qualifiesForChildTaxCredit })),
      scheduleA: {
        required: usesScheduleA, medicalAndDentalExpenses: medicalAndDentalExpenses.toFixed(0), medicalFloor: medicalFloor.toFixed(0), deductibleMedical: deductibleMedical.toFixed(0),
        stateAndLocalTaxesBeforeLimit: stateAndLocalTaxesBeforeLimit.toFixed(0), stateAndLocalTaxLimit: stateAndLocalTaxLimit.toFixed(0), deductibleStateAndLocalTaxes: deductibleStateAndLocalTaxes.toFixed(0), otherTaxes: otherTaxes.toFixed(0),
        homeMortgageInterestAndPoints: homeMortgageInterestAndPoints.toFixed(0), investmentInterest: investmentInterest.toFixed(0), charitableContributions: charitableContributions.toFixed(0), casualtyAndTheftLosses: casualtyAndTheftLosses.toFixed(0), otherItemizedDeductions: otherItemizedDeductions.toFixed(0), totalItemizedDeductions: totalItemizedDeductions.toFixed(0),
      },
      schedule8812: { qualifyingChildren: qualifyingChildren.length, otherDependents: otherDependents.length, potentialChildTaxCredit: potentialChildTaxCredit.toFixed(0), potentialOtherDependentCredit: potentialOtherDependentCredit.toFixed(0), phaseoutReduction: phaseoutReduction.toFixed(0), nonrefundableCredit: nonrefundableDependentCredit.toFixed(0), additionalChildTaxCredit: additionalChildTaxCredit.toFixed(0) },
      scheduleB: { required: scheduleBRequired, taxableInterest: taxableInterest.toFixed(0), ordinaryDividends: ordinaryDividends.toFixed(0) },
      scheduleC: scheduleC.map(({ activity, grossReceipts, returnsAndAllowances, costOfGoodsSold, grossIncome, expenses, netProfit }) => ({ activityId: activity.id, grossReceipts: grossReceipts.toFixed(0), returnsAndAllowances: returnsAndAllowances.toFixed(0), costOfGoodsSold: costOfGoodsSold.toFixed(0), grossIncome: grossIncome.toFixed(0), expenses: expenses.toFixed(0), netProfit: netProfit.toFixed(0) })),
      scheduleE: scheduleE.map(({ activity, rents, royalties, expenses, netIncomeOrLoss }) => ({ activityId: activity.id, rents: rents.toFixed(0), royalties: royalties.toFixed(0), expenses: expenses.toFixed(0), netIncomeOrLoss: netIncomeOrLoss.toFixed(0) })),
      scheduleF: scheduleF.map(({ activity, grossIncome, expenses, netProfit }) => ({ activityId: activity.id, grossIncome: grossIncome.toFixed(0), expenses: expenses.toFixed(0), netProfit: netProfit.toFixed(0) })),
      form8949: brokerTransactions.map(({ id, description, term, proceeds, costBasis, adjustmentCode, adjustment, section1202Exclusion, category, gainOrLoss, basisReportedToIrs }) => ({ transactionId: id, description, term, proceeds: proceeds.toFixed(0), costBasis: costBasis.toFixed(0), adjustmentCode, adjustment: adjustment.toFixed(0), section1202Exclusion: section1202Exclusion.toFixed(0), category, gainOrLoss: gainOrLoss.toFixed(0), basisReportedToIrs })),
      scheduleD: { shortTermCarryover: shortTermCarryover.toFixed(0), longTermCarryover: longTermCarryover.toFixed(0), shortTermGainOrLoss: shortTermGainOrLoss.toFixed(0), longTermGainOrLoss: longTermGainOrLoss.toFixed(0), netGainOrLoss: netCapitalGainOrLoss.toFixed(0), deductibleLoss: Decimal.min(0, capitalGainOrLoss).toFixed(0), nextYearShortTermCarryover: nextYearShortTermCarryover.toFixed(0), nextYearLongTermCarryover: nextYearLongTermCarryover.toFixed(0) },
      capitalGainTaxWorksheet: { required: preferentialIncome.gt(0), regularNetCapitalGain: regularNetCapitalGain.toFixed(0), collectiblesGain: collectiblesGain.toFixed(0), unrecapturedSection1250Gain: unrecapturedSection1250Gain.toFixed(0), tax: calculatedIncomeTax.toFixed(0) },
      form8889: hsaDistributions.map(({ owner, gross, qualified, taxable }) => ({ owner, grossDistribution: gross.toFixed(0), qualifiedMedicalExpenses: qualified.toFixed(0), taxableDistribution: taxable.toFixed(0) })),
      form8889Summary: { required: advancedFederal.adjustments.hsa.enabled || hsaDistributions.length > 0, contributionLimit: adjustmentCalculation.hsaContributionLimit.toFixed(0), deductibleContribution: adjustmentCalculation.hsaDeduction.toFixed(0), taxableDistribution: effectiveHsaTaxableDistribution.toFixed(0), additionalTax: adjustmentCalculation.additionalHsaTax.toFixed(0) },
      form8606: iraBasisCalculation.map((row) => ({ owner: row.owner, priorYearBasis: row.priorYearBasis.toFixed(0), currentYearNondeductibleContributions: row.currentYearNondeductibleContributions.toFixed(0), totalBasis: row.totalBasis.toFixed(0), traditionalIraDistributions: row.traditionalIraDistributions.toFixed(0), rothConversions: row.rothConversions.toFixed(0), yearEndTraditionalIraValue: row.yearEndTraditionalIraValue.toFixed(0), nontaxableAmount: row.nontaxableAmount.toFixed(0), taxableAmount: row.taxableAmount.toFixed(0), basisCarryforward: row.basisCarryforward.toFixed(0) })),
      retirementWorksheets: retirementCalculation.worksheets.map((row) => ({ distributionId: row.distributionId, owner: row.owner, treatment: row.treatment, grossDistribution: row.grossDistribution.toFixed(0), taxableAmount: row.taxableAmount.toFixed(0), rolloverAmount: row.rolloverAmount.toFixed(0), qcdAmount: row.qcdAmount.toFixed(0), annuityExclusion: row.annuityExclusion.toFixed(0), exceptionAmount: row.exceptionAmount.toFixed(0), additionalTax: row.additionalTax.toFixed(0) })),
      form5329: { required: retirementCalculation.form5329.required, earlyDistributions: retirementCalculation.form5329.earlyDistributions.toFixed(0), exceptionAmount: retirementCalculation.form5329.exceptionAmount.toFixed(0), amountSubjectToAdditionalTax: retirementCalculation.form5329.amountSubjectToAdditionalTax.toFixed(0), additionalTax: retirementCalculation.form5329.additionalTax.toFixed(0) },
      scheduleSE,
      form8995: { qbi: qbi.toFixed(0), section199ADividends: section199ADividends.toFixed(0), incomeLimitationBase: incomeLimitationBase.toFixed(0), deduction: qbiDeduction.toFixed(0) },
      schedule1: { businessIncome: businessIncome.toFixed(0), rentalRealEstateRoyalties: rentalRealEstateRoyalties.toFixed(0), farmIncome: farmIncome.toFixed(0), unemploymentCompensation: unemploymentCompensation.toFixed(0), deductiblePartOfSelfEmploymentTax: deductibleHalf.toFixed(0), educatorExpenses: adjustmentCalculation.educatorExpenses.toFixed(0), iraDeduction: adjustmentCalculation.iraDeduction.toFixed(0), studentLoanInterestDeduction: adjustmentCalculation.studentLoanInterestDeduction.toFixed(0), hsaDeduction: adjustmentCalculation.hsaDeduction.toFixed(0), selfEmployedHealthInsuranceDeduction: adjustmentCalculation.selfEmployedHealthInsuranceDeduction.toFixed(0), retirementPlanDeduction: adjustmentCalculation.retirementPlanDeduction.toFixed(0), totalAdjustments: deductibleHalf.plus(adjustmentCalculation.totalAdjustments).toFixed(0) },
      form6251: {
        required: alternativeMinimumTax.required,
        taxableIncomeBeforeQbi: alternativeMinimumTax.taxableIncomeBeforeQbi.toFixed(0),
        standardOrItemizedTaxAddback: alternativeMinimumTax.standardOrItemizedTaxAddback.toFixed(0),
        preferenceAdjustments: alternativeMinimumTax.preferenceAdjustments.toFixed(0),
        alternativeMinimumTaxableIncome: alternativeMinimumTax.alternativeMinimumTaxableIncome.toFixed(0),
        exemption: alternativeMinimumTax.exemption.toFixed(0), taxableExcess: alternativeMinimumTax.taxableExcess.toFixed(0),
        tentativeMinimumTax: alternativeMinimumTax.tentativeMinimumTax.toFixed(0), regularTax: alternativeMinimumTax.regularTax.toFixed(0), alternativeMinimumTax: alternativeMinimumTax.alternativeMinimumTax.toFixed(0),
      },
      form8959: { required: additionalMedicareTax.required, medicareWagesAndTips: additionalMedicareTax.medicareWagesAndTips.toFixed(0), unreportedTips: additionalMedicareTax.unreportedTips.toFixed(0), selfEmploymentWages: additionalMedicareTax.selfEmploymentWages.toFixed(0), railroadRetirementCompensation: additionalMedicareTax.railroadRetirementCompensation.toFixed(0), threshold: additionalMedicareTax.threshold.toFixed(0), excessWages: additionalMedicareTax.excessWages.toFixed(0), additionalMedicareTax: additionalMedicareTax.additionalMedicareTax.toFixed(0), additionalMedicareWithholding: additionalMedicareTax.additionalMedicareWithholding.toFixed(0) },
      form8960: { required: netInvestmentIncomeTax.required, taxableInterest: netInvestmentIncomeTax.taxableInterest.toFixed(0), ordinaryDividends: netInvestmentIncomeTax.ordinaryDividends.toFixed(0), annuities: netInvestmentIncomeTax.annuities.toFixed(0), rentalAndPassiveIncome: netInvestmentIncomeTax.rentalAndPassiveIncome.toFixed(0), capitalGain: netInvestmentIncomeTax.capitalGain.toFixed(0), otherInvestmentIncome: netInvestmentIncomeTax.otherInvestmentIncome.toFixed(0), investmentIncomeAdjustments: netInvestmentIncomeTax.investmentIncomeAdjustments.toFixed(0), investmentExpenses: netInvestmentIncomeTax.investmentExpenses.toFixed(0), netInvestmentIncome: netInvestmentIncomeTax.netInvestmentIncome.toFixed(0), modifiedAdjustedGrossIncome: netInvestmentIncomeTax.modifiedAdjustedGrossIncome.toFixed(0), threshold: netInvestmentIncomeTax.threshold.toFixed(0), excessMagi: netInvestmentIncomeTax.excessMagi.toFixed(0), netInvestmentIncomeTax: netInvestmentIncomeTax.netInvestmentIncomeTax.toFixed(0) },
      schedule2: { alternativeMinimumTax: alternativeMinimumTax.alternativeMinimumTax.toFixed(0), selfEmploymentTax: selfEmploymentTax.toFixed(0), additionalMedicareTax: additionalMedicareTax.additionalMedicareTax.toFixed(0), netInvestmentIncomeTax: netInvestmentIncomeTax.netInvestmentIncomeTax.toFixed(0), additionalRetirementTax: retirementCalculation.form5329.additionalTax.toFixed(0), additionalHsaTax: adjustmentCalculation.additionalHsaTax.toFixed(0), excessAdvancePtcRepayment: premiumTaxCredit.excessAdvancePtcRepayment.toFixed(0), part1AdditionalTax: part1AdditionalTax.toFixed(0), part2OtherTaxes: part2OtherTaxes.toFixed(0), totalAdditionalTaxes: totalAdditionalTaxes.toFixed(0) },
      scheduleEic: federalCredits.scheduleEic,
      form2441: federalCredits.form2441,
      form8863: federalCredits.form8863,
      form8867: dueDiligence,
      form8962: { ...premiumTaxCredit, premiumTaxCredit: premiumTaxCredit.premiumTaxCredit.toFixed(0), excessAdvancePtcRepayment: premiumTaxCredit.excessAdvancePtcRepayment.toFixed(0) },
      schedule3: { dependentCareCredit: federalCredits.dependentCareCredit.toFixed(0), educationCredit: federalCredits.educationNonrefundableCredit.toFixed(0), premiumTaxCredit: premiumTaxCredit.premiumTaxCredit.toFixed(0), extensionPayment: advancedPayments.extensionPayment.toFixed(0), excessSocialSecurity: advancedPayments.excessSocialSecurity.toFixed(0), totalNonrefundableCredits: schedule3NonrefundableCredits.toFixed(0), totalOtherPayments: schedule3OtherPayments.toFixed(0) },
      form1040: {
        wages: wageTotal.toFixed(0), taxExemptInterest: taxExemptInterest.toFixed(0), taxableInterest: taxableInterest.toFixed(0),
        qualifiedDividends: qualifiedDividends.toFixed(0), ordinaryDividends: ordinaryDividends.toFixed(0), iraDistributions: iraGross.toFixed(0), taxableIraDistributions: iraTaxable.toFixed(0),
        pensionsAndAnnuities: pensionGross.toFixed(0), taxablePensionsAndAnnuities: pensionTaxable.toFixed(0), socialSecurityBenefits: socialSecurityWorksheet.totalBenefits.toFixed(0), taxableSocialSecurityBenefits: socialSecurityWorksheet.taxableBenefits.toFixed(0), capitalGainOrLoss: capitalGainOrLoss.toFixed(0), schedule1AdditionalIncome: schedule1AdditionalIncome.toFixed(0), totalIncome: totalIncome.toFixed(0),
        adjustedGrossIncome: adjustedGrossIncome.toFixed(0), basicStandardDeduction: basicStandardDeduction.toFixed(0), additionalStandardDeduction: additionalStandardDeduction.toFixed(0), standardDeduction: standardDeduction.toFixed(0), itemizedDeductions: usesScheduleA ? totalItemizedDeductions.toFixed(0) : "0", deductionUsed: deductionUsed.toFixed(0), qbiDeduction: qbiDeduction.toFixed(0),
        taxableIncome: taxableIncome.toFixed(0), incomeTax: incomeTax.toFixed(0), alternativeMinimumTax: alternativeMinimumTax.alternativeMinimumTax.toFixed(0), childTaxCreditAndOtherDependentCredit: nonrefundableDependentCredit.toFixed(0), dependentCareCredit: federalCredits.dependentCareCredit.toFixed(0), educationCredit: federalCredits.educationNonrefundableCredit.toFixed(0), schedule3NonrefundableCredits: schedule3NonrefundableCredits.toFixed(0), selfEmploymentTax: selfEmploymentTax.toFixed(0), totalTax: totalTax.toFixed(0),
        federalWithholding: federalWithholding.toFixed(0), additionalMedicareWithholding: additionalMedicareTax.additionalMedicareWithholding.toFixed(0), estimatedTaxPayments: advancedPayments.estimatedPayments.toFixed(0), extensionPayment: advancedPayments.extensionPayment.toFixed(0), priorYearAndOtherPayments: advancedPayments.otherPayments.toFixed(0), excessSocialSecurity: advancedPayments.excessSocialSecurity.toFixed(0), premiumTaxCredit: premiumTaxCredit.premiumTaxCredit.toFixed(0), excessAdvancePtcRepayment: premiumTaxCredit.excessAdvancePtcRepayment.toFixed(0), additionalChildTaxCredit: additionalChildTaxCredit.toFixed(0), earnedIncomeCredit: federalCredits.earnedIncomeCredit.toFixed(0), refundableAmericanOpportunityCredit: federalCredits.refundableAmericanOpportunityCredit.toFixed(0), totalPayments: totalPayments.toFixed(0), refund: refund.toFixed(0), amountOwed: amountOwed.toFixed(0),
      },
    },
    trace,
    dependencyManifest: graphResolution.order.map((nodeId) => ({ nodeId, dependsOn: dependencies[nodeId] ?? [], status: "evaluated" })),
  };
}

const dependencies: Record<string, string[]> = {
  "schedule-b": ["interest", "dividends", "schedule-b-screening"],
  "schedule-c": ["business-receipts", "business-expenses"],
  "schedule-e": ["rental-royalty-receipts", "rental-expenses", "passive-at-risk-review"],
  "schedule-f": ["farm-receipts", "farm-expenses"],
  "form-8949": ["broker-transactions"],
  "schedule-d": ["form-8949"],
  "form-8889": ["hsa-contributions", "hsa-distributions"],
  "form-8606": ["ira-basis", "retirement-distributions", "ira-contributions"],
  "retirement-worksheets": ["retirement-distributions", "form-8606"],
  "form-5329": ["retirement-worksheets"],
  "schedule-se": ["schedule-c", "schedule-f", "w2-social-security-wages"],
  "schedule-1": ["schedule-c", "schedule-e", "schedule-f", "schedule-se", "government-payments", "form-8889", "above-line-adjustments"],
  "form-6251": ["filing-status", "schedule-a", "form-8995", "qualified-dividends", "schedule-d", "income-tax"],
  "form-8959": ["w2-medicare-wages", "schedule-se", "filing-status"],
  "form-8960": ["interest", "dividends", "schedule-d", "schedule-e", "adjusted-gross-income", "filing-status"],
  "schedule-2": ["form-6251", "schedule-se", "form-8889", "form-8959", "form-8960", "form-5329", "form-8962"],
  "form-8995": ["schedule-c", "schedule-e", "schedule-f", "schedule-se", "qualified-dividends"],
  "schedule-a": ["filing-status", "adjusted-gross-income", "itemized-deduction-facts"],
  "schedule-8812": ["filing-status", "dependents", "adjusted-gross-income", "earned-income", "income-tax"],
  "schedule-eic": ["filing-status", "dependents", "adjusted-gross-income", "earned-income", "investment-income"],
  "form-2441": ["filing-status", "care-providers", "qualifying-persons", "earned-income", "adjusted-gross-income"],
  "form-8863": ["education-students", "form-1098-t", "adjusted-gross-income", "income-tax"],
  "form-8867": ["filing-status", "dependents", "schedule-eic", "schedule-8812", "form-8863"],
  "form-8962": ["form-1095-a", "household-income", "schedule-1"],
  "social-security-benefits-worksheet": ["ssa-1099", "rrb-1099", "tax-exempt-interest", "schedule-1"],
  "schedule-3": ["form-2441", "form-8863", "form-8962", "federal-payments"],
  "qualified-dividend-worksheet": ["form-8995", "qualified-dividends", "schedule-d"],
  "form-1040": ["schedule-1", "schedule-2", "schedule-3", "schedule-a", "schedule-8812", "schedule-eic", "schedule-b", "schedule-d", "retirement-distributions", "social-security-benefits-worksheet", "form-8995", "qualified-dividend-worksheet", "withholding-ledger"],
};

function validateEligibility(input: CalculationInput2025, blocking: (code: string, message: string, path?: string | null) => void): void {
  const e = input.eligibility;
  if (!e.fullYearUsResident) blocking("RESIDENCY_UNSUPPORTED", "Phase 1 supports only full-year U.S. residents.", "eligibility.fullYearUsResident");
  if (e.claimableAsDependent && !e.form8615ApplicabilityReviewed) blocking("FORM_8615_APPLICABILITY_REVIEW_REQUIRED", "Review the dependent taxpayer's age, student, support, earned-income and unearned-income facts for Form 8615 applicability.", "eligibility.form8615ApplicabilityReviewed");
  if (e.claimableAsDependent && e.form8615Required) blocking("FORM_8615_REQUIRED", "The reviewed facts require Form 8615, which is outside the current supported calculation profile.", "eligibility.form8615Required");
  const ageBlindnessApplies = e.taxpayerAge65OrOlder || e.taxpayerBlind || e.spouseAge65OrOlder || e.spouseBlind;
  if (ageBlindnessApplies && !e.ageBlindnessFactsReviewed) blocking("ADDITIONAL_STANDARD_DEDUCTION_REVIEW_REQUIRED", "Review the taxpayer and spouse age/blindness facts before claiming the additional standard deduction.", "eligibility.ageBlindnessFactsReviewed");
  if ((input.filingStatus === "single" || input.filingStatus === "head_of_household" || input.filingStatus === "qualifying_surviving_spouse") && (e.spouseAge65OrOlder || e.spouseBlind)) blocking("SPOUSE_ADDITIONAL_DEDUCTION_INVALID_FOR_STATUS", "Spouse age/blindness boxes cannot be used for this filing status.", "eligibility");
  if (input.filingStatus === "married_filing_separately" && (e.spouseAge65OrOlder || e.spouseBlind) && !e.mfsSpouseAdditionalDeductionEligible) blocking("MFS_SPOUSE_ADDITIONAL_DEDUCTION_ELIGIBILITY_REQUIRED", "On Married Filing Separately, spouse age/blindness boxes require confirmation that the spouse had no income, is not filing a return, and cannot be claimed as a dependent.", "eligibility.mfsSpouseAdditionalDeductionEligible");
  if (input.filingStatusEligibilityConfirmed === false) blocking("FILING_STATUS_ELIGIBILITY_UNCONFIRMED", "The selected filing status must be supported by reviewed eligibility facts.", "filingStatusEligibilityConfirmed");
  if ((input.filingStatus === "married_filing_jointly" || input.filingStatus === "married_filing_separately") && input.hasSpouse === false) blocking("SPOUSE_PROFILE_REQUIRED", "A spouse profile is required for a married filing status.", "hasSpouse");
  const dependents = input.dependents ?? [];
  if (e.hasDependents && dependents.length === 0) blocking("DEPENDENT_DETAILS_REQUIRED", "Dependent details are required when intake indicates dependents.", "dependents");
  dependents.forEach((dependent, index) => {
    const birthDate = /^\d{4}-\d{2}-\d{2}$/.test(dependent.dateOfBirth) ? new Date(`${dependent.dateOfBirth}T00:00:00Z`) : null;
    if (!dependent.legalName.trim() || !birthDate || Number.isNaN(birthDate.valueOf()) || !dependent.relationship.trim()) blocking("DEPENDENT_IDENTITY_INCOMPLETE", "Each dependent requires a legal name, valid date of birth, and relationship.", `dependents.${index}`);
    if (!dependent.eligibilityReviewed || !dependent.qualifiesAsDependent) blocking("DEPENDENT_ELIGIBILITY_UNCONFIRMED", "Each claimed dependent requires a reviewed qualifying-child or qualifying-relative determination.", `dependents.${index}`);
    if (dependent.qualifiesForChildTaxCredit && !dependent.hasValidSsnForChildTaxCredit) blocking("CHILD_TAX_CREDIT_SSN_REQUIRED", "A qualifying child needs a valid Social Security number for the child tax credit.", `dependents.${index}.hasValidSsnForChildTaxCredit`);
    if (dependent.qualifiesForChildTaxCredit && birthDate && new Date("2025-12-31T00:00:00Z").getUTCFullYear() - birthDate.getUTCFullYear() >= 17) blocking("CHILD_TAX_CREDIT_AGE_INVALID", "A child must be under age 17 at the end of 2025 for the child tax credit.", `dependents.${index}.dateOfBirth`);
    if (dependent.qualifiesForChildTaxCredit && dependent.qualifiesForOtherDependentCredit) blocking("DEPENDENT_CREDIT_CLASSIFICATION_CONFLICT", "A dependent cannot be counted for both the child tax credit and the credit for other dependents.", `dependents.${index}`);
  });
  if ((input.filingStatus === "head_of_household" || input.filingStatus === "qualifying_surviving_spouse") && dependents.length === 0) blocking("QUALIFYING_PERSON_REQUIRED", "This filing status requires a reviewed qualifying person.", "dependents");
  if (e.usesItemizedDeductions && !input.scheduleA?.enabled) blocking("SCHEDULE_A_DETAILS_REQUIRED", "Schedule A details are required when itemized deductions apply.", "scheduleA");
  if (input.scheduleA?.enabled) {
    if (!input.scheduleA.saltEligibilityConfirmed && [input.scheduleA.stateLocalIncomeOrSalesTaxes, input.scheduleA.realEstateTaxes, input.scheduleA.personalPropertyTaxes, input.scheduleA.otherTaxes].some((value) => Number(value) !== 0)) blocking("SCHEDULE_A_SALT_REVIEW_REQUIRED", "Confirm that imported state and local taxes are deductible personal taxes and do not include disallowed amounts.", "scheduleA.saltEligibilityConfirmed");
    if (!input.scheduleA.mortgageLimitsApplied && Number(input.scheduleA.homeMortgageInterestAndPoints) !== 0) blocking("SCHEDULE_A_MORTGAGE_LIMIT_REVIEW_REQUIRED", "Mortgage-interest debt and use limitations must be reviewed before using the amount.", "scheduleA.mortgageLimitsApplied");
    if (!input.scheduleA.charityLimitsApplied && (Number(input.scheduleA.cashCharitableContributions) !== 0 || Number(input.scheduleA.noncashCharitableContributions) !== 0)) blocking("SCHEDULE_A_CHARITY_LIMIT_REVIEW_REQUIRED", "Contribution eligibility and AGI limitations must be reviewed before using charitable amounts.", "scheduleA.charityLimitsApplied");
    if (!input.scheduleA.casualtyLimitsApplied && Number(input.scheduleA.casualtyAndTheftLosses) !== 0) blocking("SCHEDULE_A_CASUALTY_LIMIT_REVIEW_REQUIRED", "Only an already-computed eligible disaster loss may be entered for the supported Schedule A profile.", "scheduleA.casualtyLimitsApplied");
  }
  if (input.filingStatus === "married_filing_separately" && input.scheduleA?.marriedFilingSeparatelySpouseItemizes == null) blocking("MFS_SPOUSE_ITEMIZATION_REQUIRED", "Married Filing Separately requires confirmation whether the spouse itemizes deductions.", "scheduleA.marriedFilingSeparatelySpouseItemizes");
  if (!e.allRequiredIntakeAnswered) blocking("INTAKE_INCOMPLETE", "All required intake questions must be answered before calculation.", "eligibility.allRequiredIntakeAnswered");
  if (!e.documentsCompleteAttested) blocking("DOCUMENTS_NOT_ATTESTED", "A preparer completeness attestation is required before calculation.", "eligibility.documentsCompleteAttested");
  for (const topic of e.unsupportedApplicableTopics) blocking("UNSUPPORTED_TOPIC_APPLIES", `Unsupported intake topic applies: ${topic}.`, "eligibility.unsupportedApplicableTopics");
  for (const [topic, answer] of Object.entries(e.treatmentScreens)) {
    if (answer === "unknown") blocking("TREATMENT_SCREEN_UNKNOWN", `Required treatment screen is unanswered: ${topic}.`, `eligibility.treatmentScreens.${topic}`);
    const supported = topic === "alternativeMinimumTax" && input.advancedFederal?.adjustments.alternativeMinimumTax.enabled
      || topic === "netInvestmentIncomeTax" && input.advancedFederal?.adjustments.netInvestmentIncomeTax.enabled
      || topic === "additionalMedicareTax" && input.advancedFederal?.adjustments.additionalMedicareTax.enabled
      || topic === "estimatedOrExtensionPayments" && input.advancedFederal?.payments.payments.some(({ status }) => status === "current");
    if (answer === "applies" && !supported) blocking("TREATMENT_OUTSIDE_SUPPORTED_SCOPE", `Required treatment is outside the enabled 2025 profile: ${topic}.`, `eligibility.treatmentScreens.${topic}`);
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
