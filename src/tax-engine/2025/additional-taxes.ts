import Decimal from "decimal.js";
import type { AdvancedFederalProfile2025 } from "@/domain/advanced-federal-2025";
import { amount, nonnegative, sum, whole } from "./math";
import { constants2025 } from "./rule-package";
import type { FilingStatus2025 } from "./types";

type Block = (code: string, message: string, path: string) => void;

export function calculateAdditionalMedicareTax2025(args: {
  profile: AdvancedFederalProfile2025;
  filingStatus: FilingStatus2025;
  medicareWagesAndTips: Decimal;
  medicareTaxWithheld: Decimal;
  selfEmploymentWages: Decimal;
  block: Block;
}) {
  const { profile, filingStatus, medicareWagesAndTips, medicareTaxWithheld, selfEmploymentWages, block } = args;
  const facts = profile.adjustments.additionalMedicareTax;
  const unreportedTips = read(facts.unreportedTips, "advancedFederal.adjustments.additionalMedicareTax.unreportedTips", block);
  const railroadRetirementCompensation = read(facts.railroadRetirementCompensation, "advancedFederal.adjustments.additionalMedicareTax.railroadRetirementCompensation", block);
  const railroadMedicareTaxWithheld = read(facts.railroadMedicareTaxWithheld, "advancedFederal.adjustments.additionalMedicareTax.railroadMedicareTaxWithheld", block);
  const threshold = amount(constants2025.additionalMedicareThreshold[filingStatus]);
  const regularCompensation = whole(medicareWagesAndTips.plus(unreportedTips));
  const wageExcess = nonnegative(regularCompensation.minus(threshold));
  const remainingThreshold = nonnegative(threshold.minus(regularCompensation));
  const selfEmploymentExcess = nonnegative(selfEmploymentWages.minus(remainingThreshold));
  const railroadExcess = nonnegative(railroadRetirementCompensation.minus(threshold));
  const excessWages = whole(wageExcess.plus(selfEmploymentExcess).plus(railroadExcess));
  const required = facts.enabled || excessWages.gt(0) || railroadMedicareTaxWithheld.gt(0);

  if (required && !facts.enabled) block("ADDITIONAL_MEDICARE_PROFILE_REQUIRED", "Complete the Form 8959 interview because Medicare compensation crosses the filing-status threshold.", "advancedFederal.adjustments.additionalMedicareTax.enabled");
  if (facts.enabled && !facts.applicabilityReviewed) block("ADDITIONAL_MEDICARE_REVIEW_REQUIRED", "Review all Medicare wages, tips, self-employment earnings and filing-status thresholds before calculating Form 8959.", "advancedFederal.adjustments.additionalMedicareTax.applicabilityReviewed");
  if ((railroadRetirementCompensation.gt(0) || railroadMedicareTaxWithheld.gt(0)) && !facts.railroadFactsReviewed) block("ADDITIONAL_MEDICARE_RRTA_REVIEW_REQUIRED", "Railroad retirement compensation and Tier 1 Medicare withholding require reviewed Form W-2 facts.", "advancedFederal.adjustments.additionalMedicareTax.railroadFactsReviewed");

  const wageAdditionalWithholding = nonnegative(medicareTaxWithheld.minus(medicareWagesAndTips.mul("0.0145")));
  const railroadAdditionalWithholding = nonnegative(railroadMedicareTaxWithheld.minus(railroadRetirementCompensation.mul("0.0145")));
  const additionalMedicareWithholding = whole(wageAdditionalWithholding.plus(railroadAdditionalWithholding));
  if (facts.enabled && additionalMedicareWithholding.gt(0) && !facts.withholdingReconciled) block("ADDITIONAL_MEDICARE_WITHHOLDING_REVIEW_REQUIRED", "Reconcile Form W-2 Medicare withholding before claiming the additional withholding credit.", "advancedFederal.adjustments.additionalMedicareTax.withholdingReconciled");

  return {
    required,
    medicareWagesAndTips: whole(medicareWagesAndTips),
    unreportedTips: whole(unreportedTips),
    selfEmploymentWages: whole(selfEmploymentWages),
    railroadRetirementCompensation: whole(railroadRetirementCompensation),
    threshold,
    excessWages,
    additionalMedicareTax: whole(excessWages.mul("0.009")),
    additionalMedicareWithholding,
  };
}

export function calculateNetInvestmentIncomeTax2025(args: {
  profile: AdvancedFederalProfile2025;
  filingStatus: FilingStatus2025;
  modifiedAdjustedGrossIncome: Decimal;
  taxableInterest: Decimal;
  ordinaryDividends: Decimal;
  passiveRentalIncome: Decimal;
  netCapitalGain: Decimal;
  block: Block;
}) {
  const { profile, filingStatus, modifiedAdjustedGrossIncome, taxableInterest, ordinaryDividends, passiveRentalIncome, netCapitalGain, block } = args;
  const facts = profile.adjustments.netInvestmentIncomeTax;
  const annuities = read(facts.annuityInvestmentIncome, "advancedFederal.adjustments.netInvestmentIncomeTax.annuityInvestmentIncome", block);
  const estateTrustInvestmentIncome = read(facts.estateTrustInvestmentIncome, "advancedFederal.adjustments.netInvestmentIncomeTax.estateTrustInvestmentIncome", block);
  const otherInvestmentIncome = read(facts.otherInvestmentIncome, "advancedFederal.adjustments.netInvestmentIncomeTax.otherInvestmentIncome", block);
  const nonpassiveIncomeExcluded = read(facts.nonpassiveIncomeExcluded, "advancedFederal.adjustments.netInvestmentIncomeTax.nonpassiveIncomeExcluded", block);
  const excludedDispositionGain = read(facts.excludedDispositionGain, "advancedFederal.adjustments.netInvestmentIncomeTax.excludedDispositionGain", block);
  const investmentExpenses = whole(sum([
    read(facts.investmentInterestExpense, "advancedFederal.adjustments.netInvestmentIncomeTax.investmentInterestExpense", block),
    read(facts.stateLocalTaxExpense, "advancedFederal.adjustments.netInvestmentIncomeTax.stateLocalTaxExpense", block),
    read(facts.miscellaneousInvestmentExpenses, "advancedFederal.adjustments.netInvestmentIncomeTax.miscellaneousInvestmentExpenses", block),
    read(facts.passiveLossDeduction, "advancedFederal.adjustments.netInvestmentIncomeTax.passiveLossDeduction", block),
  ]));
  const rentalAndPassiveIncome = nonnegative(passiveRentalIncome);
  const capitalGain = nonnegative(netCapitalGain);
  const grossInvestmentIncome = whole(sum([taxableInterest, ordinaryDividends, annuities, rentalAndPassiveIncome, capitalGain, estateTrustInvestmentIncome, otherInvestmentIncome]));
  const investmentIncomeAdjustments = whole(Decimal.min(grossInvestmentIncome, nonpassiveIncomeExcluded.plus(excludedDispositionGain)));
  const netInvestmentIncome = nonnegative(whole(grossInvestmentIncome.minus(investmentIncomeAdjustments).minus(investmentExpenses)));
  const threshold = amount(constants2025.netInvestmentIncomeThreshold[filingStatus]);
  const excessMagi = nonnegative(whole(modifiedAdjustedGrossIncome.minus(threshold)));
  const required = facts.enabled || (netInvestmentIncome.gt(0) && excessMagi.gt(0));

  if (required && !facts.enabled) block("NET_INVESTMENT_INCOME_PROFILE_REQUIRED", "Complete the Form 8960 interview because MAGI and net investment income cross the filing-status threshold.", "advancedFederal.adjustments.netInvestmentIncomeTax.enabled");
  if (facts.enabled && !facts.applicabilityReviewed) block("NET_INVESTMENT_INCOME_REVIEW_REQUIRED", "Review Form 8960 applicability and the modified-AGI threshold.", "advancedFederal.adjustments.netInvestmentIncomeTax.applicabilityReviewed");
  if (facts.enabled && !facts.classificationsReviewed) block("NET_INVESTMENT_CLASSIFICATION_REVIEW_REQUIRED", "Review passive, nonpassive, annuity, trust, disposition and expense classifications before calculating Form 8960.", "advancedFederal.adjustments.netInvestmentIncomeTax.classificationsReviewed");
  if (nonpassiveIncomeExcluded.plus(excludedDispositionGain).gt(grossInvestmentIncome)) block("FORM_8960_EXCLUSIONS_EXCEED_INCOME", "Form 8960 income exclusions cannot exceed gross investment income.", "advancedFederal.adjustments.netInvestmentIncomeTax");

  return {
    required,
    taxableInterest: whole(taxableInterest),
    ordinaryDividends: whole(ordinaryDividends),
    annuities: whole(annuities),
    rentalAndPassiveIncome: whole(rentalAndPassiveIncome.plus(estateTrustInvestmentIncome)),
    capitalGain: whole(capitalGain),
    otherInvestmentIncome: whole(otherInvestmentIncome),
    investmentIncomeAdjustments,
    investmentExpenses,
    netInvestmentIncome,
    modifiedAdjustedGrossIncome: whole(modifiedAdjustedGrossIncome),
    threshold,
    excessMagi,
    netInvestmentIncomeTax: whole(Decimal.min(netInvestmentIncome, excessMagi).mul("0.038")),
  };
}

function read(value: string, path: string, block: Block): Decimal {
  try {
    const parsed = amount(value);
    if (parsed.isNegative()) throw new Error("negative");
    return parsed;
  } catch {
    block("INVALID_ADDITIONAL_TAX_AMOUNT", "Enter a valid nonnegative amount.", path);
    return new Decimal(0);
  }
}
