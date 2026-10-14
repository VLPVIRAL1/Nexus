import Decimal from "decimal.js";
import { amount, whole } from "./math";
import type { FilingStatus2025 } from "./types";

export interface SocialSecurityWorksheet2025 {
  totalBenefits: Decimal;
  provisionalIncome: Decimal;
  baseAmount: Decimal;
  adjustedBaseAmount: Decimal;
  taxableBenefits: Decimal;
}

export function calculateSocialSecurityBenefits2025(input: {
  filingStatus: FilingStatus2025;
  totalBenefits: Decimal;
  incomeBeforeBenefits: Decimal;
  taxExemptInterest: Decimal;
  adjustments: Decimal;
}): SocialSecurityWorksheet2025 {
  const marriedJoint = input.filingStatus === "married_filing_jointly";
  const baseAmount = amount(marriedJoint ? 32000 : 25000);
  const adjustedBaseAmount = amount(marriedJoint ? 44000 : 34000);
  const provisionalIncome = whole(input.incomeBeforeBenefits.minus(input.adjustments).plus(input.taxExemptInterest).plus(input.totalBenefits.mul("0.50")));
  const halfBenefits = input.totalBenefits.mul("0.50");
  const eightyFivePercentBenefits = input.totalBenefits.mul("0.85");
  let taxableBenefits = new Decimal(0);
  if (provisionalIncome.gt(baseAmount) && provisionalIncome.lte(adjustedBaseAmount)) {
    taxableBenefits = Decimal.min(halfBenefits, provisionalIncome.minus(baseAmount).mul("0.50"));
  } else if (provisionalIncome.gt(adjustedBaseAmount)) {
    const baseTier = Decimal.min(halfBenefits, adjustedBaseAmount.minus(baseAmount).mul("0.50"));
    taxableBenefits = Decimal.min(eightyFivePercentBenefits, provisionalIncome.minus(adjustedBaseAmount).mul("0.85").plus(baseTier));
  }
  return { totalBenefits: whole(input.totalBenefits), provisionalIncome, baseAmount, adjustedBaseAmount, taxableBenefits: whole(taxableBenefits) };
}
