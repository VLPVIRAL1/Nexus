import type { FederalCreditProfile2025 } from "@/domain/federal-credits-2025";
import type { AdvancedFederalProfile2025 } from "@/domain/advanced-federal-2025";

export type FilingStatus2025 =
  | "single"
  | "married_filing_jointly"
  | "married_filing_separately"
  | "head_of_household"
  | "qualifying_surviving_spouse";
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
  socialSecurityTaxWithheld?: DollarInput;
  medicareTaxWithheld?: DollarInput;
}
export interface DependentInput2025 {
  id: string;
  legalName: string;
  dateOfBirth: string;
  relationship: string;
  monthsLivedWithTaxpayer: number;
  qualifiesAsDependent: boolean;
  qualifiesForChildTaxCredit: boolean;
  hasValidSsnForChildTaxCredit: boolean;
  qualifiesForOtherDependentCredit: boolean;
  eligibilityReviewed: boolean;
}

export interface ScheduleAInput2025 {
  enabled: boolean;
  marriedFilingSeparatelySpouseItemizes: boolean | null;
  medicalAndDentalExpenses: DollarInput;
  stateLocalIncomeOrSalesTaxes: DollarInput;
  realEstateTaxes: DollarInput;
  personalPropertyTaxes: DollarInput;
  otherTaxes: DollarInput;
  homeMortgageInterestAndPoints: DollarInput;
  investmentInterest: DollarInput;
  cashCharitableContributions: DollarInput;
  noncashCharitableContributions: DollarInput;
  casualtyAndTheftLosses: DollarInput;
  otherItemizedDeductions: DollarInput;
  saltEligibilityConfirmed: boolean;
  mortgageLimitsApplied: boolean;
  charityLimitsApplied: boolean;
  casualtyLimitsApplied: boolean;
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
  capitalGainDistributions?: DollarInput;
  federalWithholding: DollarInput;
}

export interface ScheduleCActivityInput2025 {
  id: string;
  name: string;
  owner: PersonRole2025;
  grossReceipts: DollarInput;
  returnsAndAllowances?: DollarInput;
  costOfGoodsSold?: DollarInput;
  otherIncome?: DollarInput;
  expenses: Partial<Record<string, DollarInput>>;
  otherExpenses?: DollarInput;
  homeOfficeDeduction?: DollarInput;
  accountingMethod?: "cash" | "accrual" | "other";
  vehicleUsed?: boolean;
  homeOfficeClaimed?: boolean;
  qbiEligible: boolean;
  selfEmploymentTreatmentConfirmed?: boolean;
  receiptBasis: "source_plus_additional_receipts";
}

export interface ScheduleEActivityInput2025 {
  id: string; name: string; owner: PersonRole2025; rentsReceived: DollarInput; royaltiesReceived: DollarInput;
  expenses: Partial<Record<string, DollarInput>>; otherExpenses: DollarInput; propertyType: string; personalUseDays: number;
  qualifiedJointVenture: boolean | null; allInvestmentAtRisk: boolean | null; passiveLossRulesReviewed: boolean | null;
  depreciationReviewed: boolean | null; rentalQbiEligible: boolean | null; supplementalActivityCount: number; remicInterestCount: number;
}

export interface ScheduleFActivityInput2025 {
  id: string; name: string; owner: PersonRole2025; income: Partial<Record<string, DollarInput>>; expenses: Partial<Record<string, DollarInput>>;
  otherExpenses: DollarInput; accountingMethod: "cash" | "accrual"; accrualAmounts: Partial<Record<string, DollarInput>>;
  materiallyParticipated: boolean | null; qbiEligible: boolean | null; selfEmploymentTreatmentConfirmed: boolean | null; cropInsuranceElectionReviewed: boolean | null;
}

export interface BusinessWithholdingInput2025 {
  sourceId: string;
  sourceType: "1099-NEC" | "1099-MISC" | "1099-K";
  federalWithholding: DollarInput;
}

export interface BrokerTransactionInput2025 {
  id: string;
  description: string;
  term: "short" | "long";
  proceeds: DollarInput;
  costBasis: DollarInput;
  federalWithholding: DollarInput;
  basisReportedToIrs: boolean;
  adjustmentAmount: DollarInput;
  adjustmentCode: string;
}

export interface RetirementDistributionInput2025 {
  id: string;
  owner: PersonRole2025;
  grossDistribution: DollarInput;
  taxableAmount: DollarInput;
  federalWithholding: DollarInput;
  distributionCode: string;
  iraSepSimple: boolean;
  taxableAmountNotDetermined: boolean;
}

export interface GovernmentPaymentInput2025 {
  id: string;
  unemploymentCompensation: DollarInput;
  federalWithholding: DollarInput;
}

export interface SocialSecurityBenefitInput2025 {
  id: string;
  owner: PersonRole2025;
  sourceType: "SSA-1099" | "RRB-1099";
  benefitsPaid: DollarInput;
  benefitsRepaid: DollarInput;
  netBenefits: DollarInput;
  federalWithholding: DollarInput;
  workersCompensationOffset: DollarInput;
  lumpSumElectionApplies: boolean;
}

export interface PaymentCardInput2025 {
  id: string;
  grossPaymentAmount: DollarInput;
  mappedScheduleCAmount: DollarInput;
  federalWithholding: DollarInput;
}

export interface HsaDistributionInput2025 {
  id: string;
  owner: PersonRole2025;
  grossDistribution: DollarInput;
  qualifiedMedicalExpenses: DollarInput;
  earningsOnExcessContributions: DollarInput;
  distributionCode: string;
  accountType: "HSA" | "Archer MSA" | "Medicare Advantage MSA";
}

export interface EligibilityInput2025 {
  fullYearUsResident: boolean;
  claimableAsDependent: boolean;
  form8615ApplicabilityReviewed?: boolean;
  form8615Required?: boolean;
  hasDependents: boolean;
  taxpayerAge65OrOlder: boolean;
  taxpayerBlind: boolean;
  spouseAge65OrOlder: boolean;
  spouseBlind: boolean;
  ageBlindnessFactsReviewed?: boolean;
  mfsSpouseAdditionalDeductionEligible?: boolean;
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
  filingStatusEligibilityConfirmed?: boolean;
  hasSpouse?: boolean;
  dependents?: DependentInput2025[];
  scheduleA?: ScheduleAInput2025;
  eligibility: EligibilityInput2025;
  scheduleBScreening: ScheduleBScreening2025;
  wages: WageInput2025[];
  interest: InterestInput2025[];
  dividends: DividendInput2025[];
  scheduleCActivities: ScheduleCActivityInput2025[];
  scheduleEActivities?: ScheduleEActivityInput2025[];
  scheduleFActivities?: ScheduleFActivityInput2025[];
  businessWithholding: BusinessWithholdingInput2025[];
  brokerTransactions?: BrokerTransactionInput2025[];
  retirementDistributions?: RetirementDistributionInput2025[];
  governmentPayments?: GovernmentPaymentInput2025[];
  socialSecurityBenefits?: SocialSecurityBenefitInput2025[];
  paymentCardReceipts?: PaymentCardInput2025[];
  hsaDistributions?: HsaDistributionInput2025[];
  federalCredits?: FederalCreditProfile2025 & { employerDependentCareBenefits: DollarInput; valid1098TRecordIds: string[] };
  advancedFederal?: AdvancedFederalProfile2025 & { dueDiligenceSignatureCurrent: boolean; valid1095ARecordIds: string[]; valid1098ERecordIds: string[]; validActivityIds: string[] };
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
    filingStatus: FilingStatus2025;
    dependents: Array<{ id: string; legalName: string; relationship: string; childTaxCredit: boolean; otherDependentCredit: boolean }>;
    scheduleA: {
      required: boolean;
      medicalAndDentalExpenses: string;
      medicalFloor: string;
      deductibleMedical: string;
      stateAndLocalTaxesBeforeLimit: string;
      stateAndLocalTaxLimit: string;
      deductibleStateAndLocalTaxes: string;
      otherTaxes: string;
      homeMortgageInterestAndPoints: string;
      investmentInterest: string;
      charitableContributions: string;
      casualtyAndTheftLosses: string;
      otherItemizedDeductions: string;
      totalItemizedDeductions: string;
    };
    schedule8812: {
      qualifyingChildren: number;
      otherDependents: number;
      potentialChildTaxCredit: string;
      potentialOtherDependentCredit: string;
      phaseoutReduction: string;
      nonrefundableCredit: string;
      additionalChildTaxCredit: string;
    };
    scheduleB: { required: boolean; taxableInterest: string; ordinaryDividends: string };
    scheduleC: Array<{ activityId: string; grossReceipts: string; returnsAndAllowances: string; costOfGoodsSold: string; grossIncome: string; expenses: string; netProfit: string }>;
    scheduleE: Array<{ activityId: string; rents: string; royalties: string; expenses: string; netIncomeOrLoss: string }>;
    scheduleF: Array<{ activityId: string; grossIncome: string; expenses: string; netProfit: string }>;
    form8949: Array<{ transactionId: string; description: string; term: "short" | "long"; proceeds: string; costBasis: string; adjustment: string; gainOrLoss: string; basisReportedToIrs: boolean }>;
    scheduleD: { shortTermGainOrLoss: string; longTermGainOrLoss: string; netGainOrLoss: string; deductibleLoss: string };
    form8889: Array<{ owner: PersonRole2025; grossDistribution: string; qualifiedMedicalExpenses: string; taxableDistribution: string }>;
    form8889Summary: { required: boolean; contributionLimit: string; deductibleContribution: string; taxableDistribution: string; additionalTax: string };
    form6251: { required: boolean; taxableIncomeBeforeQbi: string; standardOrItemizedTaxAddback: string; preferenceAdjustments: string; alternativeMinimumTaxableIncome: string; exemption: string; taxableExcess: string; tentativeMinimumTax: string; regularTax: string; alternativeMinimumTax: string };
    scheduleSE: ScheduleSEOutput2025[];
    form8995: { qbi: string; section199ADividends: string; incomeLimitationBase: string; deduction: string };
    schedule1: { businessIncome: string; rentalRealEstateRoyalties: string; farmIncome: string; unemploymentCompensation: string; deductiblePartOfSelfEmploymentTax: string; educatorExpenses: string; iraDeduction: string; studentLoanInterestDeduction: string; hsaDeduction: string; selfEmployedHealthInsuranceDeduction: string; retirementPlanDeduction: string; totalAdjustments: string };
    schedule2: { alternativeMinimumTax: string; selfEmploymentTax: string; additionalHsaTax: string; excessAdvancePtcRepayment: string; part1AdditionalTax: string; part2OtherTaxes: string; totalAdditionalTaxes: string };
    scheduleEic: { required: boolean; qualifyingChildren: Array<{ dependentId: string }>; earnedIncome: string; adjustedGrossIncome: string; investmentIncome: string; credit: string };
    form2441: { required: boolean; providerCount: number; qualifyingPersonCount: number; qualifiedExpenses: string; earnedIncomeLimit: string; applicablePercentage: string; credit: string; employerBenefits: string };
    form8863: { required: boolean; students: Array<{ studentId: string; creditType: "aotc" | "llc"; adjustedExpenses: string; tentativeCredit: string }>; tentativeAmericanOpportunityCredit: string; tentativeLifetimeLearningCredit: string; phaseoutFactor: string; nonrefundableCredit: string; refundableAmericanOpportunityCredit: string };
    form8867: { required: boolean; signedForCurrentRevision: boolean };
    form8962: { required: boolean; householdIncome: string; householdIncomePercentFpl: string; applicablePercentage: string; annualContribution: string; totalPremium: string; totalSlcsp: string; totalAdvancePtc: string; premiumTaxCredit: string; excessAdvancePtcRepayment: string };
    schedule3: { dependentCareCredit: string; educationCredit: string; premiumTaxCredit: string; extensionPayment: string; excessSocialSecurity: string; totalNonrefundableCredits: string; totalOtherPayments: string };
    form1040: {
      wages: string;
      taxExemptInterest: string;
      taxableInterest: string;
      qualifiedDividends: string;
      ordinaryDividends: string;
      iraDistributions: string;
      taxableIraDistributions: string;
      pensionsAndAnnuities: string;
      taxablePensionsAndAnnuities: string;
      socialSecurityBenefits: string;
      taxableSocialSecurityBenefits: string;
      capitalGainOrLoss: string;
      schedule1AdditionalIncome: string;
      totalIncome: string;
      adjustedGrossIncome: string;
      basicStandardDeduction: string;
      additionalStandardDeduction: string;
      standardDeduction: string;
      itemizedDeductions: string;
      deductionUsed: string;
      qbiDeduction: string;
      taxableIncome: string;
      incomeTax: string;
      alternativeMinimumTax: string;
      childTaxCreditAndOtherDependentCredit: string;
      dependentCareCredit: string;
      educationCredit: string;
      schedule3NonrefundableCredits: string;
      selfEmploymentTax: string;
      totalTax: string;
      federalWithholding: string;
      estimatedTaxPayments: string;
      extensionPayment: string;
      priorYearAndOtherPayments: string;
      excessSocialSecurity: string;
      premiumTaxCredit: string;
      excessAdvancePtcRepayment: string;
      additionalChildTaxCredit: string;
      earnedIncomeCredit: string;
      refundableAmericanOpportunityCredit: string;
      totalPayments: string;
      refund: string;
      amountOwed: string;
    };
  } | null;
  trace: CalculationTraceStep2025[];
  dependencyManifest: Array<{ nodeId: string; dependsOn: string[]; status: "evaluated" | "blocked" }>;
}
