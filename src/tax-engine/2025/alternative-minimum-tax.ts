import Decimal from "decimal.js";
import type { AdvancedFederalProfile2025 } from "@/domain/advanced-federal-2025";
import { amount, nonnegative, sum, whole } from "./math";
import type { FilingStatus2025 } from "./types";

type Block = (code: string, message: string, path?: string | null) => void;

export interface AlternativeMinimumTaxCalculation2025 {
  required: boolean;
  taxableIncomeBeforeQbi: Decimal;
  standardOrItemizedTaxAddback: Decimal;
  preferenceAdjustments: Decimal;
  alternativeMinimumTaxableIncome: Decimal;
  exemption: Decimal;
  taxableExcess: Decimal;
  tentativeMinimumTax: Decimal;
  regularTax: Decimal;
  alternativeMinimumTax: Decimal;
}

const exemptionByStatus: Record<FilingStatus2025, Decimal> = {
  single: amount(88100),
  married_filing_jointly: amount(137000),
  married_filing_separately: amount(68500),
  head_of_household: amount(88100),
  qualifying_surviving_spouse: amount(137000),
};

const exemptionPhaseoutByStatus: Record<FilingStatus2025, Decimal> = {
  single: amount(626350),
  married_filing_jointly: amount(1252700),
  married_filing_separately: amount(626350),
  head_of_household: amount(626350),
  qualifying_surviving_spouse: amount(1252700),
};

const rateBreakpointByStatus: Record<FilingStatus2025, Decimal> = {
  single: amount(239100),
  married_filing_jointly: amount(239100),
  married_filing_separately: amount(119550),
  head_of_household: amount(239100),
  qualifying_surviving_spouse: amount(239100),
};

const capitalGainThresholds: Record<FilingStatus2025, { zero: Decimal; fifteen: Decimal }> = {
  single: { zero: amount(48350), fifteen: amount(533400) },
  married_filing_jointly: { zero: amount(96700), fifteen: amount(600050) },
  married_filing_separately: { zero: amount(48350), fifteen: amount(300000) },
  head_of_household: { zero: amount(64750), fifteen: amount(566700) },
  qualifying_surviving_spouse: { zero: amount(96700), fifteen: amount(600050) },
};

export function calculateAlternativeMinimumTax2025(args: {
  profile: AdvancedFederalProfile2025;
  filingStatus: FilingStatus2025;
  taxableIncomeBeforeQbi: Decimal;
  regularIncomeTax: Decimal;
  standardDeductionUsed: Decimal;
  usesScheduleA: boolean;
  deductibleStateAndLocalTaxes: Decimal;
  deductibleOtherTaxes: Decimal;
  itemizedReviewNeeded: boolean;
  qbiComponentBeforeLimitation: Decimal;
  preferentialIncome: Decimal;
  claimableAsDependent: boolean;
  form8615Required: boolean;
  block: Block;
}): AlternativeMinimumTaxCalculation2025 {
  const { profile, filingStatus, taxableIncomeBeforeQbi, regularIncomeTax, standardDeductionUsed, usesScheduleA, deductibleStateAndLocalTaxes, deductibleOtherTaxes, itemizedReviewNeeded, qbiComponentBeforeLimitation, preferentialIncome, claimableAsDependent, form8615Required, block } = args;
  const value = profile.adjustments.alternativeMinimumTax;
  const zero = empty(taxableIncomeBeforeQbi, regularIncomeTax);
  if (!value.enabled) return zero;

  if (!value.applicabilityReviewed) block("AMT_APPLICABILITY_REVIEW_REQUIRED", "Complete the Alternative Minimum Tax applicability review before calculating Form 6251.", "advancedFederal.adjustments.alternativeMinimumTax.applicabilityReviewed");
  if (value.priorYearMinimumTaxCreditApplies) block("FORM_8801_REQUIRED", "A prior-year minimum tax credit requires Form 8801, which is outside this supported Form 6251 slice.", "advancedFederal.adjustments.alternativeMinimumTax.priorYearMinimumTaxCreditApplies");
  if (value.unsupportedAdjustmentApplies) block("AMT_UNSUPPORTED_ADJUSTMENT", value.unsupportedAdjustmentDescription || "An Alternative Minimum Tax adjustment outside the supported Form 6251 fields applies.", "advancedFederal.adjustments.alternativeMinimumTax.unsupportedAdjustmentApplies");
  if (usesScheduleA && itemizedReviewNeeded && !value.itemizedDeductionTreatmentReviewed) block("AMT_ITEMIZED_TREATMENT_REVIEW_REQUIRED", "Review mortgage, investment-interest, casualty and other itemized deductions for AMT treatment.", "advancedFederal.adjustments.alternativeMinimumTax.itemizedDeductionTreatmentReviewed");
  if (claimableAsDependent || form8615Required) block("AMT_DEPENDENT_CHILD_WORKSHEET_REQUIRED", "A claimable taxpayer or Form 8615 case requires the dependent-child AMT exemption worksheet outside this supported slice.", "advancedFederal.adjustments.alternativeMinimumTax");

  const standardOrItemizedTaxAddback = usesScheduleA
    ? whole(deductibleStateAndLocalTaxes.plus(deductibleOtherTaxes))
    : whole(standardDeductionUsed);
  const preferenceAdjustments = whole(sum([
    read(value.privateActivityBondInterest, "privateActivityBondInterest", block),
    read(value.incentiveStockOptionAdjustment, "incentiveStockOptionAdjustment", block),
    read(value.depreciationAdjustment, "depreciationAdjustment", block),
    read(value.passiveActivityAdjustment, "passiveActivityAdjustment", block),
    read(value.lossLimitationAdjustment, "lossLimitationAdjustment", block),
    read(value.otherAdjustment, "otherAdjustment", block),
  ]));
  const incomeBeforeAmtQbi = whole(taxableIncomeBeforeQbi.plus(standardOrItemizedTaxAddback).plus(preferenceAdjustments));
  const amtQbiLimitBase = nonnegative(whole(incomeBeforeAmtQbi.minus(preferentialIncome)));
  const amtQbiDeduction = Decimal.min(qbiComponentBeforeLimitation, whole(amtQbiLimitBase.mul("0.20")));
  const alternativeMinimumTaxableIncome = nonnegative(whole(incomeBeforeAmtQbi.minus(amtQbiDeduction)));
  const phaseoutReduction = whole(Decimal.max(0, alternativeMinimumTaxableIncome.minus(exemptionPhaseoutByStatus[filingStatus])).mul("0.25"));
  const exemption = nonnegative(whole(exemptionByStatus[filingStatus].minus(phaseoutReduction)));
  const taxableExcess = nonnegative(whole(alternativeMinimumTaxableIncome.minus(exemption)));
  const tentativeMinimumTax = preferentialIncome.gt(0)
    ? preferentialTentativeMinimumTax(taxableExcess, Decimal.min(preferentialIncome, taxableExcess), filingStatus)
    : ordinaryTentativeMinimumTax(taxableExcess, filingStatus);
  const alternativeMinimumTax = nonnegative(whole(tentativeMinimumTax.minus(regularIncomeTax)));

  return {
    required: true,
    taxableIncomeBeforeQbi: whole(taxableIncomeBeforeQbi),
    standardOrItemizedTaxAddback,
    preferenceAdjustments,
    alternativeMinimumTaxableIncome,
    exemption,
    taxableExcess,
    tentativeMinimumTax,
    regularTax: whole(regularIncomeTax),
    alternativeMinimumTax,
  };
}

function ordinaryTentativeMinimumTax(taxableExcess: Decimal, filingStatus: FilingStatus2025): Decimal {
  const breakpoint = rateBreakpointByStatus[filingStatus];
  return whole(Decimal.min(taxableExcess, breakpoint).mul("0.26").plus(Decimal.max(0, taxableExcess.minus(breakpoint)).mul("0.28")));
}

function preferentialTentativeMinimumTax(taxableExcess: Decimal, preferentialIncome: Decimal, filingStatus: FilingStatus2025): Decimal {
  const ordinaryIncome = nonnegative(taxableExcess.minus(preferentialIncome));
  const thresholds = capitalGainThresholds[filingStatus];
  const zeroRateCapacity = Decimal.max(0, thresholds.zero.minus(ordinaryIncome));
  const zeroRateAmount = Decimal.min(preferentialIncome, zeroRateCapacity);
  const remainingAfterZero = preferentialIncome.minus(zeroRateAmount);
  const fifteenRateCapacity = Decimal.max(0, thresholds.fifteen.minus(Decimal.max(ordinaryIncome, thresholds.zero)));
  const fifteenRateAmount = Decimal.min(remainingAfterZero, fifteenRateCapacity);
  const twentyRateAmount = Decimal.max(0, remainingAfterZero.minus(fifteenRateAmount));
  return whole(ordinaryTentativeMinimumTax(ordinaryIncome, filingStatus).plus(fifteenRateAmount.mul("0.15")).plus(twentyRateAmount.mul("0.20")));
}

function read(value: string, field: string, block: Block): Decimal {
  try { return amount(value); }
  catch {
    block("INVALID_AMOUNT", "Enter a valid nonnegative AMT adjustment.", `advancedFederal.adjustments.alternativeMinimumTax.${field}`);
    return new Decimal(0);
  }
}

function empty(taxableIncomeBeforeQbi: Decimal, regularTax: Decimal): AlternativeMinimumTaxCalculation2025 {
  return {
    required: false, taxableIncomeBeforeQbi: whole(taxableIncomeBeforeQbi), standardOrItemizedTaxAddback: new Decimal(0), preferenceAdjustments: new Decimal(0),
    alternativeMinimumTaxableIncome: new Decimal(0), exemption: new Decimal(0), taxableExcess: new Decimal(0), tentativeMinimumTax: new Decimal(0), regularTax: whole(regularTax), alternativeMinimumTax: new Decimal(0),
  };
}
