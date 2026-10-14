import {
  scheduleCCogsKeys, scheduleCExpenseKeys, scheduleCIncomeKeys,
  scheduleEExpenseKeys, scheduleEIncomeKeys, scheduleFAccrualKeys,
  scheduleFExpenseKeys, scheduleFIncomeKeys,
} from "@/domain/activity-forms-2025";

export interface ActivityFormRegistry2025 {
  form: "Schedule C" | "Schedule E" | "Schedule F";
  taxYear: 2025;
  registryVersion: "2025.1.0";
  sourceUrl: string;
  fields: readonly string[];
  calculationBoundary: string;
}

export const activityFormRegistries2025: Record<"schedule_c" | "schedule_e" | "schedule_f", ActivityFormRegistry2025> = {
  schedule_c: {
    form: "Schedule C", taxYear: 2025, registryVersion: "2025.1.0", sourceUrl: "https://www.irs.gov/pub/irs-prior/f1040sc--2025.pdf",
    fields: ["identity.*", ...scheduleCIncomeKeys.map((key) => `income.${key}`), ...scheduleCCogsKeys.map((key) => `costOfGoodsSold.${key}`), ...scheduleCExpenseKeys.map((key) => `expenses.${key}`), "otherExpenses[]", "vehicle.*", "homeOffice.*", "assets[]", "lossLimitations.*", "qbiEligible", "selfEmploymentTreatmentConfirmed"],
    calculationBoundary: "Reviewed sole-owner cash/accrual activity with vehicle, home-office, depreciation and loss-limitation workpapers; unresolved evidence or unsupported accounting-method details block.",
  },
  schedule_e: {
    form: "Schedule E", taxYear: 2025, registryVersion: "2025.1.0", sourceUrl: "https://www.irs.gov/pub/irs-prior/f1040se--2025.pdf",
    fields: ["property.*", ...scheduleEIncomeKeys.map((key) => `income.${key}`), ...scheduleEExpenseKeys.map((key) => `expenses.${key}`), "otherExpenses[]", "assets[]", "lossLimitations.*", "partnershipsAndSCorporations[]", "estatesAndTrusts[]", "remicInterests[]", "passiveLossRulesReviewed", "personalUseAllocationReviewed", "allInvestmentAtRisk"],
    calculationBoundary: "Reviewed Parts I-IV with structured depreciation and basis, at-risk and passive-loss ledgers; unresolved classifications, allocations or limitation facts block.",
  },
  schedule_f: {
    form: "Schedule F", taxYear: 2025, registryVersion: "2025.1.0", sourceUrl: "https://www.irs.gov/pub/irs-prior/f1040sf--2025.pdf",
    fields: ["identity.*", ...scheduleFIncomeKeys.map((key) => `income.${key}`), ...scheduleFExpenseKeys.map((key) => `expenses.${key}`), "otherExpenses[]", ...scheduleFAccrualKeys.map((key) => `accrual.${key}`), "assets[]", "lossLimitations.*", "inventoryMethod", "qbiEligible", "selfEmploymentTreatmentConfirmed"],
    calculationBoundary: "Reviewed cash- or accrual-method farm with structured depreciation and loss limits; unresolved elections, evidence or limitation facts block.",
  },
};
