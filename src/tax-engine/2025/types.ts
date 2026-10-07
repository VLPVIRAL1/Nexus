export type FilingStatus2025 = "single" | "married_filing_jointly";
export type PersonRole2025 = "taxpayer" | "spouse";
export type DollarInput = string;

export const supportedExpenseCategories = [
  "advertising",
  "office",
  "supplies",
  "business_insurance",
  "professional_fees",
  "business_rent",
  "repairs",
  "utilities",
] as const;

export type SupportedExpenseCategory = (typeof supportedExpenseCategories)[number];

export interface WageInput2025 {
  id: string;
  owner: PersonRole2025;
  wages: DollarInput;
  federalWithholding: DollarInput;
  socialSecurityWages: DollarInput;
}

export interface InterestInput2025 {
  id: string;
  payerName: string;
  ordinaryInterest: DollarInput;
  treasuryInterest: DollarInput;
  taxExemptInterest: DollarInput;
  federalWithholding: DollarInput;
}

export interface DividendInput2025 {
  id: string;
  payerName: string;
  ordinaryDividends: DollarInput;
  qualifiedDividends: DollarInput;
  exemptInterestDividends: DollarInput;
  section199ADividends: DollarInput;
  federalWithholding: DollarInput;
}

export interface ScheduleCActivityInput2025 {
  id: string;
  name: string;
  owner: PersonRole2025;
  grossReceipts: DollarInput;
  expenses: Partial<Record<SupportedExpenseCategory, DollarInput>>;
  qbiEligible: boolean;
  receiptBasis: "source_plus_additional_receipts";
}

export interface BusinessWithholdingInput2025 {
  sourceId: string;
  sourceType: "1099-NEC" | "1099-MISC";
  federalWithholding: DollarInput;
}

export interface EligibilityInput2025 {
  fullYearUsResident: boolean;
  claimableAsDependent: boolean;
  hasDependents: boolean;
  taxpayerAge65OrOlder: boolean;
  taxpayerBlind: boolean;
  spouseAge65OrOlder: boolean;
  spouseBlind: boolean;
  usesItemizedDeductions: boolean;
  allRequiredIntakeAnswered: boolean;
  documentsCompleteAttested: boolean;
  unsupportedApplicableTopics: string[];
  treatmentScreens: Record<
    | "earnedIncomeCredit"
    | "otherCredits"
    | "alternativeMinimumTax"
    | "netInvestmentIncomeTax"
    | "additionalMedicareTax"
    | "schedule1AAdditionalDeductions"
    | "estimatedOrExtensionPayments"
    | "specialFilingElection",
    "ruled_out" | "applies" | "unknown"
  >;
}

export interface ScheduleBScreening2025 {
  foreignAccount: "yes" | "no" | "unknown";
  foreignTrust: "yes" | "no" | "unknown";
  otherScheduleBTrigger: "yes" | "no" | "unknown";
}

export interface CalculationInput2025 {
  calculationId: string;
  inputRevision: number;
  filingStatus: FilingStatus2025;
  eligibility: EligibilityInput2025;
  scheduleBScreening: ScheduleBScreening2025;
  wages: WageInput2025[];
  interest: InterestInput2025[];
  dividends: DividendInput2025[];
  scheduleCActivities: ScheduleCActivityInput2025[];
  businessWithholding: BusinessWithholdingInput2025[];
  approvedOverrides?: { form1040IncomeTax?: DollarInput };
}

export interface CalculationDiagnostic2025 {
  code: string;
  severity: "blocking" | "warning";
  message: string;
  path: string | null;
}

export interface CalculationTraceStep2025 {
  nodeId: string;
  formLine: string;
  ruleId: string;
  operands: Record<string, string>;
  result: string;
  rounding: "none" | "nearest_whole_dollar_half_up";
}

export interface ScheduleSEOutput2025 {
  owner: PersonRole2025;
  netProfit: string;
  netEarnings: string;
  socialSecurityWages: string;
  socialSecurityTax: string;
  medicareTax: string;
  selfEmploymentTax: string;
  deductibleHalf: string;
}

export interface CalculationOutput2025 {
  taxYear: 2025;
  rulePackageId: string;
  rulePackageVersion: string;
  rulePackageApproval: "research_unapproved" | "approved";
  calculationId: string;
  inputRevision: number;
  status: "blocked" | "calculated_draft";
  diagnostics: CalculationDiagnostic2025[];
  forms: {
    scheduleB: { required: boolean; taxableInterest: string; ordinaryDividends: string };
    scheduleC: Array<{ activityId: string; grossReceipts: string; expenses: string; netProfit: string }>;
    scheduleSE: ScheduleSEOutput2025[];
    form8995: { qbi: string; section199ADividends: string; incomeLimitationBase: string; deduction: string };
    schedule1: { businessIncome: string; deductiblePartOfSelfEmploymentTax: string };
    schedule2: { selfEmploymentTax: string };
    form1040: {
      wages: string;
      taxExemptInterest: string;
      taxableInterest: string;
      qualifiedDividends: string;
      ordinaryDividends: string;
      totalIncome: string;
      adjustedGrossIncome: string;
      standardDeduction: string;
      qbiDeduction: string;
      taxableIncome: string;
      incomeTax: string;
      selfEmploymentTax: string;
      totalTax: string;
      federalWithholding: string;
      refund: string;
      amountOwed: string;
    };
  } | null;
  trace: CalculationTraceStep2025[];
  dependencyManifest: Array<{ nodeId: string; dependsOn: string[]; status: "evaluated" | "blocked" }>;
}
