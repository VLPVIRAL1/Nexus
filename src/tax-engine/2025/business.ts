import Decimal from "decimal.js";
import { amount, nonnegative, whole } from "./math";
import type { DepreciableAssetInput2025, HomeOfficeInput2025, BusinessVehicleInput2025 } from "./types";

type Block = (code: string, message: string, path?: string | null) => void;

const macrsHalfYear: Partial<Record<number, number[]>> = {
  3: [0.3333, 0.4445, 0.1481, 0.0741],
  5: [0.2, 0.32, 0.192, 0.1152, 0.1152, 0.0576],
  7: [0.1429, 0.2449, 0.1749, 0.1249, 0.0893, 0.0892, 0.0893, 0.0446],
  10: [0.1, 0.18, 0.144, 0.1152, 0.0922, 0.0737, 0.0655, 0.0655, 0.0656, 0.0655, 0.0328],
  15: [0.05, 0.095, 0.0855, 0.077, 0.0693, 0.0623, 0.059, 0.059, 0.0591, 0.059, 0.0591, 0.059, 0.0591, 0.059, 0.0591, 0.0295],
  20: [0.0375, 0.0722, 0.0668, 0.0618, 0.0571, 0.0529, 0.0489, 0.0452, 0.0446, 0.0446, 0.0446, 0.0446, 0.0446, 0.0446, 0.0446, 0.0446, 0.0446, 0.0446, 0.0446, 0.0446, 0.0223],
};

export interface DepreciationResult2025 {
  rows: Array<{ activityId: string; assetId: string; description: string; basis: Decimal; businessBasis: Decimal; section179: Decimal; bonusDepreciation: Decimal; macrsDepreciation: Decimal; currentDepreciation: Decimal; accumulatedDepreciation: Decimal; dispositionGainOrLoss: Decimal }>;
  currentDepreciation: Decimal;
}

export function calculateDepreciation2025(args: { activityId: string; assets: DepreciableAssetInput2025[]; path: string; block: Block }): DepreciationResult2025 {
  const rows = args.assets.map((asset, index) => {
    const path = `${args.path}.${index}`;
    const basis = nonnegative(amount(asset.basis));
    const businessUse = new Decimal(asset.businessUsePercentage || "0");
    const bonusRate = new Decimal(asset.bonusPercentage || "0");
    const priorDepreciation = nonnegative(amount(asset.priorDepreciation));
    const section179Entered = nonnegative(amount(asset.section179Election));
    const proceeds = nonnegative(amount(asset.dispositionProceeds));
    if (businessUse.lt(0) || businessUse.gt(100)) args.block("BUSINESS_USE_PERCENTAGE_INVALID", "Business-use percentage must be between 0 and 100.", `${path}.businessUsePercentage`);
    if (bonusRate.lt(0) || bonusRate.gt(100)) args.block("BONUS_PERCENTAGE_INVALID", "Bonus-depreciation percentage must be between 0 and 100.", `${path}.bonusPercentage`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asset.placedInServiceDate) || Number(asset.placedInServiceDate.slice(0, 4)) > 2025) args.block("PLACED_IN_SERVICE_DATE_INVALID", "Each depreciable asset needs a valid placed-in-service date no later than 2025.", `${path}.placedInServiceDate`);
    if (asset.category === "vehicle" && !asset.listedPropertyEvidenceReviewed) args.block("LISTED_PROPERTY_EVIDENCE_REQUIRED", "Vehicle depreciation requires reviewed business-use and listed-property evidence.", `${path}.listedPropertyEvidenceReviewed`);
    const businessBasis = whole(basis.mul(Decimal.max(0, Decimal.min(100, businessUse))).div(100));
    const section179 = Decimal.min(section179Entered, businessBasis);
    if (section179Entered.gt(businessBasis)) args.block("SECTION_179_EXCEEDS_BASIS", "Section 179 cannot exceed the asset's business basis.", `${path}.section179Election`);
    const basisAfter179 = nonnegative(businessBasis.minus(section179));
    const bonusDepreciation = whole(basisAfter179.mul(Decimal.max(0, Decimal.min(100, bonusRate))).div(100));
    const depreciableAfterBonus = nonnegative(basisAfter179.minus(bonusDepreciation));
    const placedYear = Number(asset.placedInServiceDate.slice(0, 4));
    const yearIndex = Math.max(0, 2025 - placedYear);
    let rate = new Decimal(0);
    const table = macrsHalfYear[asset.recoveryPeriodYears];
    if (asset.method !== "straight_line" && table) rate = new Decimal(table[yearIndex] ?? 0);
    else if (asset.recoveryPeriodYears === 27.5 || asset.recoveryPeriodYears === 39) {
      const month = Number(asset.placedInServiceDate.slice(5, 7));
      const fraction = placedYear === 2025 ? new Decimal(12.5 - month).div(12) : new Decimal(1);
      rate = fraction.div(asset.recoveryPeriodYears);
    } else {
      const fraction = placedYear === 2025 ? new Decimal(0.5) : new Decimal(1);
      rate = yearIndex <= asset.recoveryPeriodYears ? fraction.div(asset.recoveryPeriodYears) : new Decimal(0);
    }
    const remainingBeforeCurrent = nonnegative(businessBasis.minus(priorDepreciation).minus(section179).minus(bonusDepreciation));
    const macrsDepreciation = Decimal.min(remainingBeforeCurrent, whole(depreciableAfterBonus.mul(rate)));
    const currentDepreciation = whole(section179.plus(bonusDepreciation).plus(macrsDepreciation));
    const accumulatedDepreciation = Decimal.min(businessBasis, whole(priorDepreciation.plus(currentDepreciation)));
    const adjustedBasis = nonnegative(businessBasis.minus(accumulatedDepreciation));
    const dispositionGainOrLoss = asset.disposedIn2025 ? whole(proceeds.minus(adjustedBasis)) : new Decimal(0);
    if (asset.disposedIn2025) args.block("FORM_4797_ASSET_DISPOSITION_REQUIRED", "A disposed business asset requires depreciation recapture and Form 4797 treatment outside the current supported filing profile.", `${path}.disposedIn2025`);
    return { activityId: args.activityId, assetId: asset.id, description: asset.description, basis, businessBasis, section179, bonusDepreciation, macrsDepreciation, currentDepreciation, accumulatedDepreciation, dispositionGainOrLoss };
  });
  return { rows, currentDepreciation: whole(rows.reduce((total, row) => total.plus(row.currentDepreciation), new Decimal(0))) };
}

export function calculateVehicleDeduction2025(vehicle: BusinessVehicleInput2025 | undefined, path: string, block: Block): Decimal {
  if (!vehicle?.used) return new Decimal(0);
  if (vehicle.method === "none") { block("VEHICLE_METHOD_REQUIRED", "Select standard mileage or actual expenses for a claimed vehicle deduction.", `${path}.method`); return new Decimal(0); }
  if (vehicle.evidenceAvailable !== true || vehicle.writtenEvidence !== true) block("VEHICLE_EVIDENCE_REQUIRED", "A vehicle deduction requires contemporaneous mileage or expense evidence.", path);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vehicle.placedInServiceDate)) block("VEHICLE_SERVICE_DATE_REQUIRED", "Enter the vehicle's placed-in-service date.", `${path}.placedInServiceDate`);
  return vehicle.method === "standard_mileage" ? whole(new Decimal(vehicle.businessMiles).mul("0.70")) : whole(nonnegative(amount(vehicle.actualExpenses)));
}

export function calculateHomeOffice2025(args: { activityId: string; input: HomeOfficeInput2025 | undefined; profitBeforeHomeOffice: Decimal; path: string; block: Block }) {
  const input = args.input;
  if (!input?.claimed) return { activityId: args.activityId, method: "simplified" as const, areaPercentage: new Decimal(0), tentativeDeduction: new Decimal(0), allowedDeduction: new Decimal(0), carryforward: new Decimal(0) };
  if (input.method === "none") args.block("HOME_OFFICE_METHOD_REQUIRED", "Select the simplified or actual home-office method.", `${args.path}.method`);
  if (!input.exclusiveRegularUseReviewed) args.block("HOME_OFFICE_ELIGIBILITY_REVIEW_REQUIRED", "Confirm exclusive and regular business use before claiming a home-office deduction.", `${args.path}.exclusiveRegularUseReviewed`);
  if (input.officeSquareFeet <= 0 || (input.method === "actual" && (input.homeSquareFeet <= 0 || input.officeSquareFeet > input.homeSquareFeet))) args.block("HOME_OFFICE_AREA_INVALID", "Enter valid office and total-home square footage.", args.path);
  const areaPercentage = input.homeSquareFeet > 0 ? Decimal.min(1, new Decimal(input.officeSquareFeet).div(input.homeSquareFeet)) : new Decimal(0);
  const tentativeDeduction = input.method === "simplified"
    ? whole(new Decimal(Math.min(300, input.officeSquareFeet)).mul(5))
    : whole(amount(input.directExpenses).plus(amount(input.indirectExpenses).mul(areaPercentage)).plus(amount(input.priorCarryover)));
  const allowedDeduction = Decimal.min(nonnegative(args.profitBeforeHomeOffice), tentativeDeduction);
  const carryforward = input.method === "actual" ? nonnegative(whole(tentativeDeduction.minus(allowedDeduction))) : new Decimal(0);
  return { activityId: args.activityId, method: input.method === "actual" ? "actual" as const : "simplified" as const, areaPercentage, tentativeDeduction, allowedDeduction, carryforward };
}

export function limitBusinessLoss2025(args: { currentResult: Decimal; priorDisallowedLoss: Decimal; reviewed: boolean; limits: Decimal[]; path: string; block: Block }) {
  const currentLoss = Decimal.max(0, args.currentResult.negated());
  if (currentLoss.isZero() && args.priorDisallowedLoss.isZero()) return { allowedResult: args.currentResult, currentLoss, allowedLoss: new Decimal(0), carryforward: new Decimal(0) };
  if (!args.reviewed) args.block("BUSINESS_LOSS_LIMITATION_REVIEW_REQUIRED", "Review basis, at-risk, passive, and applicable excess-loss limits before deducting this loss.", args.path);
  const totalLoss = whole(currentLoss.plus(args.priorDisallowedLoss));
  const allowedLoss = args.reviewed ? Decimal.min(totalLoss, ...args.limits.map(nonnegative)) : new Decimal(0);
  const allowedResult = args.currentResult.isNegative() ? allowedLoss.negated() : whole(args.currentResult.minus(allowedLoss));
  return { allowedResult, currentLoss, allowedLoss, carryforward: nonnegative(whole(totalLoss.minus(allowedLoss))) };
}

export interface QbiTradeCalculation2025 {
  id: string; name: string; specifiedServiceTradeOrBusiness: boolean; qualifiedBusinessIncome: Decimal; w2Wages: Decimal; ubia: Decimal;
  aggregationGroup: string; applicablePercentage: Decimal; wagePropertyLimit: Decimal; tentativeDeduction: Decimal; allowedDeduction: Decimal; patronReduction: Decimal;
}

export function calculateComplexQbi2025(args: {
  taxableIncomeBeforeQbi: Decimal; threshold: Decimal; phaseInRange: Decimal; deductibleHalfSelfEmploymentTax: Decimal;
  priorQualifiedBusinessLoss: Decimal; publiclyTradedPartnershipIncome: Decimal; publiclyTradedPartnershipLossCarryover: Decimal;
  trades: Array<{ id: string; name: string; specifiedServiceTradeOrBusiness: boolean; qualifiedBusinessIncome: Decimal; w2Wages: Decimal; ubia: Decimal; patronReduction: Decimal; aggregationGroup: string }>;
}) {
  const positiveTotal = args.trades.reduce((total, trade) => total.plus(Decimal.max(0, trade.qualifiedBusinessIncome)), new Decimal(0));
  const currentLosses = args.trades.reduce((total, trade) => total.plus(Decimal.max(0, trade.qualifiedBusinessIncome.negated())), new Decimal(0));
  const offsets = whole(currentLosses.plus(args.priorQualifiedBusinessLoss).plus(args.deductibleHalfSelfEmploymentTax));
  const usableOffsets = Decimal.min(positiveTotal, offsets);
  const phaseInPercentage = Decimal.max(0, Decimal.min(1, args.taxableIncomeBeforeQbi.minus(args.threshold).div(args.phaseInRange)));
  let remainingOffset = usableOffsets;
  let remainingPositiveQbi = positiveTotal;
  const rows: QbiTradeCalculation2025[] = args.trades.map((trade) => {
    const positiveQbi = Decimal.max(0, trade.qualifiedBusinessIncome);
    const allocatedOffset = positiveQbi.isZero() || remainingPositiveQbi.isZero()
      ? new Decimal(0)
      : positiveQbi.eq(remainingPositiveQbi) ? remainingOffset : Decimal.min(remainingOffset, whole(remainingOffset.mul(positiveQbi).div(remainingPositiveQbi)));
    remainingOffset = nonnegative(remainingOffset.minus(allocatedOffset));
    remainingPositiveQbi = nonnegative(remainingPositiveQbi.minus(positiveQbi));
    const netQbi = nonnegative(whole(positiveQbi.minus(allocatedOffset)));
    const applicablePercentage = trade.specifiedServiceTradeOrBusiness ? nonnegative(new Decimal(1).minus(phaseInPercentage)) : new Decimal(1);
    const qualifiedBusinessIncome = whole(netQbi.mul(applicablePercentage));
    const w2Wages = whole(trade.w2Wages.mul(applicablePercentage));
    const ubia = whole(trade.ubia.mul(applicablePercentage));
    const wagePropertyLimit = Decimal.max(whole(w2Wages.mul("0.50")), whole(w2Wages.mul("0.25").plus(ubia.mul("0.025"))));
    const tentativeDeduction = whole(qualifiedBusinessIncome.mul("0.20"));
    const limitedDeduction = phaseInPercentage.isZero()
      ? tentativeDeduction
      : nonnegative(whole(tentativeDeduction.minus(nonnegative(tentativeDeduction.minus(wagePropertyLimit)).mul(phaseInPercentage))));
    const allowedDeduction = nonnegative(whole(limitedDeduction.minus(trade.patronReduction)));
    return { ...trade, qualifiedBusinessIncome, w2Wages, ubia, applicablePercentage, wagePropertyLimit, tentativeDeduction, allowedDeduction };
  });
  const ptpQualifiedIncome = nonnegative(whole(args.publiclyTradedPartnershipIncome.minus(args.publiclyTradedPartnershipLossCarryover)));
  const ptpDeduction = whole(ptpQualifiedIncome.mul("0.20"));
  const qualifiedBusinessLossCarryforward = nonnegative(whole(offsets.minus(positiveTotal)));
  return { rows, phaseInPercentage, currentQualifiedBusinessLoss: currentLosses, ptpQualifiedIncome, ptpDeduction, qualifiedBusinessLossCarryforward, tradeDeduction: whole(rows.reduce((total, row) => total.plus(row.allowedDeduction), new Decimal(0))) };
}
