import Decimal from "decimal.js";
import { constants2025 } from "./rule-package";
import { whole } from "./math";
import type { PersonRole2025, ScheduleSEOutput2025 } from "./types";

export function calculateScheduleSE2025(owner: PersonRole2025, netProfit: Decimal, socialSecurityWages: Decimal): ScheduleSEOutput2025 {
  const netEarnings = netProfit.gt(0) ? whole(netProfit.mul("0.9235")) : whole(netProfit);
  if (netEarnings.lt(400)) {
    return {
      owner,
      netProfit: netProfit.toFixed(0),
      netEarnings: netEarnings.toFixed(0),
      socialSecurityWages: socialSecurityWages.toFixed(0),
      socialSecurityTax: "0",
      medicareTax: "0",
      selfEmploymentTax: "0",
      deductibleHalf: "0",
    };
  }
  const remainingWageBase = Decimal.max(0, new Decimal(constants2025.socialSecurityWageBase).minus(socialSecurityWages));
  const socialSecurityTax = whole(Decimal.min(netEarnings, remainingWageBase).mul("0.124"));
  const medicareTax = whole(netEarnings.mul("0.029"));
  const selfEmploymentTax = socialSecurityTax.plus(medicareTax);
  return {
    owner,
    netProfit: netProfit.toFixed(0),
    netEarnings: netEarnings.toFixed(0),
    socialSecurityWages: socialSecurityWages.toFixed(0),
    socialSecurityTax: socialSecurityTax.toFixed(0),
    medicareTax: medicareTax.toFixed(0),
    selfEmploymentTax: selfEmploymentTax.toFixed(0),
    deductibleHalf: whole(selfEmploymentTax.mul("0.50")).toFixed(0),
  };
}
