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
    fields: ["identity.*", ...scheduleCIncomeKeys.map((key) => `income.${key}`), ...scheduleCCogsKeys.map((key) => `costOfGoodsSold.${key}`), ...scheduleCExpenseKeys.map((key) => `expenses.${key}`), "otherExpenses[]", "vehicle.*", "homeOffice.*", "qbiEligible", "selfEmploymentTreatmentConfirmed"],
    calculationBoundary: "Reviewed sole-owner activity; complex linked forms and unresolved limitations block calculation.",
  },
  schedule_e: {
    form: "Schedule E", taxYear: 2025, registryVersion: "2025.1.0", sourceUrl: "https://www.irs.gov/pub/irs-prior/f1040se--2025.pdf",
    fields: ["property.*", ...scheduleEIncomeKeys.map((key) => `income.${key}`), ...scheduleEExpenseKeys.map((key) => `expenses.${key}`), "otherExpenses[]", "partnershipsAndSCorporations[]", "estatesAndTrusts[]", "remicInterests[]", "passiveLossRulesReviewed", "allInvestmentAtRisk"],
    calculationBoundary: "Reviewed Part I rental/royalty profile; Parts II-IV and unresolved passive, basis, at-risk, personal-use, or depreciation treatment block.",
  },
  schedule_f: {
    form: "Schedule F", taxYear: 2025, registryVersion: "2025.1.0", sourceUrl: "https://www.irs.gov/pub/irs-prior/f1040sf--2025.pdf",
    fields: ["identity.*", ...scheduleFIncomeKeys.map((key) => `income.${key}`), ...scheduleFExpenseKeys.map((key) => `expenses.${key}`), "otherExpenses[]", ...scheduleFAccrualKeys.map((key) => `accrual.${key}`), "inventoryMethod", "qbiEligible", "selfEmploymentTreatmentConfirmed"],
    calculationBoundary: "Reviewed cash-method farm profile; accrual method and unresolved special elections or linked forms block.",
  },
};
