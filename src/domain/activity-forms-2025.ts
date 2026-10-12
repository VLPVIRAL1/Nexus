import { z } from "zod";

export const activityFormSchemaVersion2025 = "2025.1" as const;
export const money2025 = z.string().regex(/^\d+\.\d{2}$/, "Use a nonnegative decimal amount with exactly two places.");
const optionalText = z.string().trim().max(500).default("");
const reviewedBoolean = z.boolean().nullable().default(null);
const moneyRecord = <T extends readonly string[]>(keys: T) => z.object(Object.fromEntries(keys.map((key) => [key, money2025.default("0.00")])) as { [K in T[number]]: z.ZodDefault<typeof money2025> }).strict();

export const scheduleCExpenseKeys = [
  "advertising", "carAndTruck", "commissionsAndFees", "contractLabor", "depletion", "depreciationAndSection179",
  "employeeBenefits", "businessInsurance", "mortgageInterest", "otherInterest", "legalAndProfessional", "office",
  "pensionAndProfitSharing", "rentVehiclesMachinery", "rentOtherProperty", "repairsAndMaintenance", "supplies",
  "taxesAndLicenses", "travel", "deductibleMeals", "utilities", "wages", "energyEfficientBuildingsDeduction",
] as const;

export const scheduleEExpenseKeys = [
  "advertising", "autoAndTravel", "cleaningAndMaintenance", "commissions", "insurance", "legalAndProfessional",
  "managementFees", "mortgageInterest", "otherInterest", "repairs", "supplies", "taxes", "utilities", "depreciation",
] as const;

export const scheduleFExpenseKeys = [
  "carAndTruck", "chemicals", "conservation", "customHire", "depreciationAndSection179", "employeeBenefits", "feed",
  "fertilizersAndLime", "freightAndTrucking", "gasolineFuelOil", "insurance", "mortgageInterest", "otherInterest",
  "laborHired", "pensionAndProfitSharing", "rentVehiclesMachinery", "rentLandAnimals", "repairsAndMaintenance", "seedsAndPlants",
  "storageAndWarehousing", "supplies", "taxes", "utilities", "veterinaryBreedingMedicine",
] as const;

export const scheduleCIncomeKeys = ["returnsAndAllowances", "otherIncome"] as const;
export const scheduleCCogsKeys = ["beginningInventory", "purchases", "costOfLabor", "materialsAndSupplies", "otherCosts", "endingInventory"] as const;
export const scheduleEIncomeKeys = ["rentsReceived", "royaltiesReceived"] as const;
export const scheduleFIncomeKeys = [
  "livestockSalesPurchased", "livestockCostOrBasis", "livestockProduceSales", "cooperativeDistributions", "cooperativeTaxable",
  "agriculturalProgramPayments", "agriculturalProgramTaxable", "cccLoansReportedElection", "cccLoansForfeited", "cccLoansTaxable",
  "cropInsuranceReceived", "cropInsuranceTaxable", "cropInsuranceDeferred", "customHireIncome", "otherIncome",
] as const;
export const scheduleFAccrualKeys = [
  "livestockProduceSales", "beginningInventory", "purchases", "costOfItemsWithdrawn", "endingInventory", "otherAccrualIncome",
] as const;

const otherExpense = z.object({ id: z.string().uuid(), description: z.string().trim().min(1).max(200), amount: money2025 }).strict();

const scheduleC = z.object({
  schemaVersion: z.literal(activityFormSchemaVersion2025), scheduleType: z.literal("schedule_c"),
  businessName: optionalText, businessCode: z.string().trim().max(6).default(""), ein: z.string().trim().max(20).default(""), businessAddress: optionalText,
  accountingMethod: z.enum(["cash", "accrual", "other"]).default("cash"), accountingMethodOther: optionalText,
  materiallyParticipated: reviewedBoolean, startedOrAcquiredIn2025: reviewedBoolean, payments1099Required: reviewedBoolean, payments1099Filed: reviewedBoolean,
  income: moneyRecord(scheduleCIncomeKeys), costOfGoodsSold: moneyRecord(scheduleCCogsKeys).extend({ method: z.enum(["cost", "lower_cost_market", "other"]).default("cost"), methodOther: optionalText, inventoryChanged: reviewedBoolean }),
  expenses: moneyRecord(scheduleCExpenseKeys), otherExpenses: z.array(otherExpense).max(100).default([]),
  vehicle: z.object({ used: z.boolean().default(false), placedInServiceDate: z.string().default(""), businessMiles: z.number().int().min(0).default(0), commutingMiles: z.number().int().min(0).default(0), otherMiles: z.number().int().min(0).default(0), availableForPersonalUse: reviewedBoolean, anotherVehicleAvailable: reviewedBoolean, evidenceAvailable: reviewedBoolean, writtenEvidence: reviewedBoolean }).strict(),
  homeOffice: z.object({ claimed: z.boolean().default(false), reviewedDeduction: money2025.default("0.00"), method: z.enum(["simplified", "actual", "none"]).default("none") }).strict(),
  qbiEligible: reviewedBoolean, selfEmploymentTreatmentConfirmed: reviewedBoolean,
}).strict();

const scheduleEProperty = z.object({
  propertyType: z.enum(["single_family", "multi_family", "vacation_short_term", "commercial", "land", "royalties", "self_rental", "other"]),
  propertyTypeOther: optionalText, address: optionalText, fairRentalDays: z.number().int().min(0).max(366).default(0), personalUseDays: z.number().int().min(0).max(366).default(0), qualifiedJointVenture: reviewedBoolean,
}).strict();
const supplementalActivity = z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(200), ein: z.string().trim().max(20).default(""), passive: reviewedBoolean, incomeOrLoss: z.string().regex(/^-?\d+\.\d{2}$/), basisAndAtRiskReviewed: z.boolean().default(false) }).strict();
const remicActivity = z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(200), ein: z.string().trim().max(20).default(""), excessInclusion: money2025, taxableIncomeOrLoss: z.string().regex(/^-?\d+\.\d{2}$/) }).strict();
const scheduleE = z.object({
  schemaVersion: z.literal(activityFormSchemaVersion2025), scheduleType: z.literal("schedule_e"), property: scheduleEProperty,
  income: moneyRecord(scheduleEIncomeKeys), expenses: moneyRecord(scheduleEExpenseKeys), otherExpenses: z.array(otherExpense).max(100).default([]),
  activeRentalRealEstateParticipant: reviewedBoolean, allInvestmentAtRisk: reviewedBoolean, passiveLossRulesReviewed: reviewedBoolean,
  depreciationReviewed: reviewedBoolean, rentalQbiEligible: reviewedBoolean,
  partnershipsAndSCorporations: z.array(supplementalActivity).max(100).default([]), estatesAndTrusts: z.array(supplementalActivity).max(100).default([]), remicInterests: z.array(remicActivity).max(100).default([]),
}).strict();

const scheduleF = z.object({
  schemaVersion: z.literal(activityFormSchemaVersion2025), scheduleType: z.literal("schedule_f"), principalProduct: optionalText,
  agriculturalActivityCode: z.string().trim().max(6).default(""), ein: z.string().trim().max(20).default(""), accountingMethod: z.enum(["cash", "accrual"]).default("cash"),
  materiallyParticipated: reviewedBoolean, payments1099Required: reviewedBoolean, payments1099Filed: reviewedBoolean,
  income: moneyRecord(scheduleFIncomeKeys), expenses: moneyRecord(scheduleFExpenseKeys), otherExpenses: z.array(otherExpense).max(100).default([]),
  accrual: moneyRecord(scheduleFAccrualKeys), inventoryMethod: z.enum(["cost", "lower_cost_market", "farm_price", "unit_livestock", "other"]).default("cost"), inventoryMethodOther: optionalText,
  qbiEligible: reviewedBoolean, selfEmploymentTreatmentConfirmed: reviewedBoolean, cropInsuranceElectionReviewed: reviewedBoolean,
}).strict();

export const activityFormDataSchema2025 = z.discriminatedUnion("scheduleType", [scheduleC, scheduleE, scheduleF]);
export type ActivityFormData2025 = z.infer<typeof activityFormDataSchema2025>;
export type ScheduleCFormData2025 = z.infer<typeof scheduleC>;
export type ScheduleEFormData2025 = z.infer<typeof scheduleE>;
export type ScheduleFFormData2025 = z.infer<typeof scheduleF>;

const zeros = <T extends readonly string[]>(keys: T) => Object.fromEntries(keys.map((key) => [key, "0.00"])) as Record<T[number], string>;
export function createDefaultActivityForm2025(type: "schedule_c" | "schedule_e" | "schedule_f"): ActivityFormData2025 {
  if (type === "schedule_c") return scheduleC.parse({ schemaVersion: activityFormSchemaVersion2025, scheduleType: type, income: zeros(scheduleCIncomeKeys), costOfGoodsSold: zeros(scheduleCCogsKeys), expenses: zeros(scheduleCExpenseKeys), vehicle: {}, homeOffice: {} });
  if (type === "schedule_e") return scheduleE.parse({ schemaVersion: activityFormSchemaVersion2025, scheduleType: type, property: { propertyType: "single_family" }, income: zeros(scheduleEIncomeKeys), expenses: zeros(scheduleEExpenseKeys) });
  return scheduleF.parse({ schemaVersion: activityFormSchemaVersion2025, scheduleType: type, income: zeros(scheduleFIncomeKeys), expenses: zeros(scheduleFExpenseKeys), accrual: zeros(scheduleFAccrualKeys) });
}

export function parseActivityForm2025(type: "schedule_c" | "schedule_e" | "schedule_f", value: unknown): ActivityFormData2025 {
  const defaults = createDefaultActivityForm2025(type) as unknown as Record<string, unknown>;
  const supplied = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const merged: Record<string, unknown> = { ...defaults, ...supplied, schemaVersion: activityFormSchemaVersion2025, scheduleType: type };
  for (const key of ["income", "expenses", "costOfGoodsSold", "vehicle", "homeOffice", "property", "accrual"] as const) {
    if (key in defaults) merged[key] = { ...(defaults[key] as Record<string, unknown>), ...((supplied[key] && typeof supplied[key] === "object" && !Array.isArray(supplied[key])) ? supplied[key] as Record<string, unknown> : {}) };
  }
  const parsed = activityFormDataSchema2025.parse(merged);
  if (parsed.scheduleType !== type) throw new Error("Activity form type does not match the activity destination.");
  return parsed;
}

export const activityFormSchemas2025 = { schedule_c: scheduleC, schedule_e: scheduleE, schedule_f: scheduleF } as const;
