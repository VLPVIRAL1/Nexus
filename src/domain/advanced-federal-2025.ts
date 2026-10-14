import { z } from "zod";

const money = z.string().regex(/^\d+\.\d{2}$/, "Use a nonnegative amount with exactly two decimal places.");
const uuid = z.string().uuid();
const reviewedAnswer = z.enum(["yes", "no", "unknown"]);

export const evidenceReferenceSchema2025 = z.object({
  id: uuid,
  sourceDocumentId: uuid.nullable(),
  page: z.number().int().positive().nullable(),
  description: z.string().trim().min(1).max(500),
  verified: z.boolean(),
}).strict();

const dueDiligenceSection = z.object({
  applies: z.boolean(),
  interviewComplete: z.boolean(),
  knowledgeDocumented: z.boolean(),
  documentsReviewed: z.boolean(),
  consistencyResolved: z.boolean(),
  notes: z.string().trim().max(4000),
}).strict();

export const dueDiligenceProfileSchema2025 = z.object({
  schemaVersion: z.literal("2025.1"),
  paidPreparer: z.boolean(),
  sections: z.object({
    eitc: dueDiligenceSection,
    childTaxCredits: dueDiligenceSection,
    aotc: dueDiligenceSection,
    headOfHousehold: dueDiligenceSection,
  }).strict(),
  clientInterviewDate: z.iso.date().nullable(),
  residencyDocumentsReviewed: reviewedAnswer,
  relationshipDocumentsReviewed: reviewedAnswer,
  incomeDocumentsReviewed: reviewedAnswer,
  additionalInquiries: z.string().trim().max(6000),
  preparerNotes: z.string().trim().max(6000),
  evidence: z.array(evidenceReferenceSchema2025).max(100),
}).strict();

export const marketplaceMonthSchema2025 = z.object({
  month: z.number().int().min(1).max(12),
  enrollmentPremium: money,
  slcspPremium: money,
  advancePtc: money,
}).strict();

export const marketplacePolicySchema2025 = z.object({
  id: uuid,
  form1095ARecordId: uuid.nullable(),
  marketplaceIdentifier: z.string().trim().min(1).max(200),
  policyNumberLast4: z.string().regex(/^\d{4}$/),
  coveredPersonIds: z.array(uuid).min(1).max(20),
  allocationPercentage: z.string().regex(/^\d{1,3}\.\d{2}$/),
  allocationReviewed: z.boolean(),
  months: z.array(marketplaceMonthSchema2025).min(1).max(12),
}).strict();

export const premiumTaxCreditProfileSchema2025 = z.object({
  schemaVersion: z.literal("2025.1"),
  enabled: z.boolean(),
  householdSize: z.number().int().min(1).max(20),
  householdModifiedAgiOther: money,
  federalPovertyLine: money,
  stateCode: z.string().regex(/^[A-Z]{2}$/),
  householdMembersReconciled: z.boolean(),
  sharedPoliciesReviewed: z.boolean(),
  marriageAlternativeApplies: z.boolean(),
  marriageAlternativeReviewed: z.boolean(),
  belowPovertyException: z.enum(["none", "marketplace_estimated_100_percent"]).default("none"),
  belowPovertyExceptionReviewed: z.boolean().default(false),
  mfsException: z.enum(["none", "domestic_abuse", "spousal_abandonment"]).default("none"),
  mfsExceptionReviewed: z.boolean().default(false),
  householdMembers: z.array(z.object({ id: uuid, personId: uuid.nullable(), name: z.string().trim().min(1).max(200), modifiedAgi: money, includedInTaxFamily: z.boolean(), reviewed: z.boolean() }).strict()).max(20).default([]),
  marriageMonth: z.number().int().min(1).max(12).nullable().default(null),
  alternativeMarriageHouseholds: z.object({
    taxpayer: z.object({ familySize: z.number().int().min(1).max(20), modifiedAgi: money, federalPovertyLine: money }).strict(),
    spouse: z.object({ familySize: z.number().int().min(1).max(20), modifiedAgi: money, federalPovertyLine: money }).strict(),
  }).strict().default({ taxpayer: { familySize: 1, modifiedAgi: "0.00", federalPovertyLine: "0.00" }, spouse: { familySize: 1, modifiedAgi: "0.00", federalPovertyLine: "0.00" } }),
  policies: z.array(marketplacePolicySchema2025).max(20),
}).strict();

const ownerAdjustment = z.object({ taxpayer: money, spouse: money }).strict();
const ownerBoolean = z.object({ taxpayer: z.boolean(), spouse: z.boolean() }).strict();
const iraBasisOwner = z.object({
  enabled: z.boolean(),
  priorYearBasis: money,
  currentYearNondeductibleContributions: money,
  traditionalIraDistributions: money,
  rothConversions: money,
  yearEndTraditionalIraValue: money,
  outstandingRollovers: money,
  recharacterizedContributions: money,
  sourceAmountsReconciled: z.boolean(),
  basisReviewed: z.boolean(),
}).strict();

const retirementDistributionTreatment = z.object({
  id: uuid,
  sourceRecordId: uuid,
  treatment: z.enum(["normal", "early_distribution", "direct_rollover", "indirect_rollover", "qcd", "disability", "death", "roth_qualified", "inherited", "annuity_simplified"]),
  rolloverAmount: money,
  qcdAmount: money,
  exceptionAmount: money,
  exceptionCode: z.string().trim().max(10),
  investmentInContract: money,
  expectedMonthlyPayments: z.number().int().min(0).max(1000),
  paymentsReceivedThisYear: z.number().int().min(0).max(12),
  reviewed: z.boolean(),
}).strict();

const capitalTransactionTreatment = z.object({
  id: uuid,
  sourceRecordId: uuid,
  category: z.enum(["regular", "collectible_28_percent", "unrecaptured_section_1250", "section_1202"]),
  section1202Exclusion: money,
  adjustmentReviewed: z.boolean(),
}).strict();

const qbiTrade = z.object({
  id: uuid,
  activityId: uuid.nullable(),
  name: z.string().trim().min(1).max(200),
  specifiedServiceTradeOrBusiness: z.boolean(),
  w2Wages: money,
  unadjustedBasisImmediatelyAfterAcquisition: money,
  qualifiedIncomeAdjustment: z.string().regex(/^-?\d+\.\d{2}$/),
  patronReduction: money,
  aggregationGroup: z.string().trim().max(100),
  classificationReviewed: z.boolean(),
}).strict();

export const adjustmentProfileSchema2025 = z.object({
  schemaVersion: z.literal("2025.1"),
  educator: z.object({ enabled: z.boolean(), expenses: ownerAdjustment, reimbursements: ownerAdjustment, eligible: ownerBoolean }).strict(),
  ira: z.object({ enabled: z.boolean(), contributions: ownerAdjustment, workplacePlanCovered: ownerBoolean, age50OrOlder: ownerBoolean, eligibilityReviewed: z.boolean(), nondeductibleBasisApplies: z.boolean() }).strict(),
  iraBasis: z.object({ schemaVersion: z.literal("2025.1"), taxpayer: iraBasisOwner, spouse: iraBasisOwner }).strict().default({
    schemaVersion: "2025.1",
    taxpayer: { enabled: false, priorYearBasis: "0.00", currentYearNondeductibleContributions: "0.00", traditionalIraDistributions: "0.00", rothConversions: "0.00", yearEndTraditionalIraValue: "0.00", outstandingRollovers: "0.00", recharacterizedContributions: "0.00", sourceAmountsReconciled: false, basisReviewed: false },
    spouse: { enabled: false, priorYearBasis: "0.00", currentYearNondeductibleContributions: "0.00", traditionalIraDistributions: "0.00", rothConversions: "0.00", yearEndTraditionalIraValue: "0.00", outstandingRollovers: "0.00", recharacterizedContributions: "0.00", sourceAmountsReconciled: false, basisReviewed: false },
  }),
  retirementDistributions: z.object({ schemaVersion: z.literal("2025.1"), enabled: z.boolean(), allSourceRecordsReviewed: z.boolean(), treatments: z.array(retirementDistributionTreatment).max(100) }).strict().default({ schemaVersion: "2025.1", enabled: false, allSourceRecordsReviewed: false, treatments: [] }),
  capitalGains: z.object({
    schemaVersion: z.literal("2025.1"), enabled: z.boolean(), carryoversReviewed: z.boolean(),
    shortTermLossCarryover: money, longTermLossCarryover: money, carryoverSourceYear: z.number().int().min(1900).max(2024).nullable(),
    treatments: z.array(capitalTransactionTreatment).max(2000),
  }).strict().default({ schemaVersion: "2025.1", enabled: false, carryoversReviewed: false, shortTermLossCarryover: "0.00", longTermLossCarryover: "0.00", carryoverSourceYear: null, treatments: [] }),
  qualifiedBusinessIncome: z.object({
    schemaVersion: z.literal("2025.1"), enabled: z.boolean(), priorQualifiedBusinessLoss: money, lossesReviewed: z.boolean(), aggregationReviewed: z.boolean(),
    publiclyTradedPartnershipIncome: z.string().regex(/^-?\d+\.\d{2}$/), publiclyTradedPartnershipLossCarryover: money, trades: z.array(qbiTrade).max(200),
  }).strict().default({ schemaVersion: "2025.1", enabled: false, priorQualifiedBusinessLoss: "0.00", lossesReviewed: false, aggregationReviewed: false, publiclyTradedPartnershipIncome: "0.00", publiclyTradedPartnershipLossCarryover: "0.00", trades: [] }),
  studentLoan: z.object({ enabled: z.boolean(), interestPaid: money, form1098ERecordId: uuid.nullable(), eligibilityReviewed: z.boolean() }).strict(),
  hsa: z.object({
    enabled: z.boolean(), owner: z.enum(["taxpayer", "spouse"]), coverageType: z.enum(["self", "family"]), eligibleMonths: z.number().int().min(0).max(12),
    age55OrOlder: z.boolean(), personalContributions: money, employerContributions: money, qualifiedDistributions: money,
    nonqualifiedDistributions: money, excessContributions: money, lastMonthRuleUsed: z.boolean(), testingPeriodSatisfied: z.boolean(),
    additionalTaxException: z.enum(["none", "death", "disability", "age65"]), additionalTaxExceptionReviewed: z.boolean(),
  }).strict(),
  selfEmployedHealthInsurance: z.object({ enabled: z.boolean(), premiums: money, activityId: uuid.nullable(), employerEligibleMonths: z.number().int().min(0).max(12), eligibilityReviewed: z.boolean() }).strict(),
  retirementPlan: z.object({
    enabled: z.boolean(), planType: z.enum(["sep", "simple", "qualified"]), contributions: ownerAdjustment,
    employeeDeferrals: ownerAdjustment.default({ taxpayer: "0.00", spouse: "0.00" }),
    employerContributions: ownerAdjustment.default({ taxpayer: "0.00", spouse: "0.00" }),
    catchUpEligible: ownerBoolean.default({ taxpayer: false, spouse: false }),
    simpleEmployerContributionType: z.enum(["match_3_percent", "nonelective_2_percent", "manual_reviewed"]).default("match_3_percent"),
    activityId: uuid.nullable(), limitReviewed: z.boolean(),
  }).strict(),
  alternativeMinimumTax: z.object({
    enabled: z.boolean(),
    applicabilityReviewed: z.boolean(),
    itemizedDeductionTreatmentReviewed: z.boolean(),
    privateActivityBondInterest: money,
    incentiveStockOptionAdjustment: money,
    depreciationAdjustment: money,
    passiveActivityAdjustment: money,
    lossLimitationAdjustment: money,
    otherAdjustment: money,
    unsupportedAdjustmentApplies: z.boolean(),
    unsupportedAdjustmentDescription: z.string().trim().max(2000),
    priorYearMinimumTaxCreditApplies: z.boolean(),
  }).strict().default({
    enabled: false, applicabilityReviewed: false, itemizedDeductionTreatmentReviewed: false,
    privateActivityBondInterest: "0.00", incentiveStockOptionAdjustment: "0.00", depreciationAdjustment: "0.00",
    passiveActivityAdjustment: "0.00", lossLimitationAdjustment: "0.00", otherAdjustment: "0.00",
    unsupportedAdjustmentApplies: false, unsupportedAdjustmentDescription: "", priorYearMinimumTaxCreditApplies: false,
  }),
  additionalMedicareTax: z.object({
    enabled: z.boolean(),
    applicabilityReviewed: z.boolean(),
    unreportedTips: money,
    railroadRetirementCompensation: money,
    railroadMedicareTaxWithheld: money,
    railroadFactsReviewed: z.boolean(),
    withholdingReconciled: z.boolean(),
  }).strict().default({
    enabled: false, applicabilityReviewed: false, unreportedTips: "0.00",
    railroadRetirementCompensation: "0.00", railroadMedicareTaxWithheld: "0.00",
    railroadFactsReviewed: false, withholdingReconciled: false,
  }),
  netInvestmentIncomeTax: z.object({
    enabled: z.boolean(),
    applicabilityReviewed: z.boolean(),
    classificationsReviewed: z.boolean(),
    annuityInvestmentIncome: money,
    estateTrustInvestmentIncome: money,
    otherInvestmentIncome: money,
    nonpassiveIncomeExcluded: money,
    excludedDispositionGain: money,
    investmentInterestExpense: money,
    stateLocalTaxExpense: money,
    miscellaneousInvestmentExpenses: money,
    passiveLossDeduction: money,
  }).strict().default({
    enabled: false, applicabilityReviewed: false, classificationsReviewed: false,
    annuityInvestmentIncome: "0.00", estateTrustInvestmentIncome: "0.00", otherInvestmentIncome: "0.00",
    nonpassiveIncomeExcluded: "0.00", excludedDispositionGain: "0.00", investmentInterestExpense: "0.00",
    stateLocalTaxExpense: "0.00", miscellaneousInvestmentExpenses: "0.00", passiveLossDeduction: "0.00",
  }),
}).strict();

export const federalPaymentSchema2025 = z.object({
  id: uuid,
  type: z.enum(["estimated", "extension", "prior_year_overpayment", "other_supported"]),
  amount: money,
  paidOn: z.iso.date(),
  appliedTaxYear: z.literal(2025),
  owner: z.enum(["taxpayer", "spouse", "joint"]),
  confirmationReference: z.string().trim().min(1).max(200),
  sourceDocumentId: uuid.nullable(),
  evidenceReviewed: z.boolean(),
  status: z.enum(["current", "corrected", "void"]),
}).strict();

export const paymentProfileSchema2025 = z.object({
  schemaVersion: z.literal("2025.1"),
  payments: z.array(federalPaymentSchema2025).max(100),
  excessSocialSecurityReviewed: z.boolean(),
}).strict();

export const formPackagePreferencesSchema2025 = z.object({
  schemaVersion: z.literal("2025.1"),
  packageMode: z.enum(["internal_draft", "client_copy"]),
  includeWorkpapers: z.boolean(),
  includeSourceSummary: z.boolean(),
}).strict();

export const advancedFederalProfileSchema2025 = z.object({
  schemaVersion: z.literal("2025.1"),
  dueDiligence: dueDiligenceProfileSchema2025,
  premiumTaxCredit: premiumTaxCreditProfileSchema2025,
  adjustments: adjustmentProfileSchema2025,
  payments: paymentProfileSchema2025,
  formPackage: formPackagePreferencesSchema2025,
}).strict();

export type DueDiligenceProfile2025 = z.infer<typeof dueDiligenceProfileSchema2025>;
export type PremiumTaxCreditProfile2025 = z.infer<typeof premiumTaxCreditProfileSchema2025>;
export type AdjustmentProfile2025 = z.infer<typeof adjustmentProfileSchema2025>;
export type PaymentProfile2025 = z.infer<typeof paymentProfileSchema2025>;
export type FormPackagePreferences2025 = z.infer<typeof formPackagePreferencesSchema2025>;
export type AdvancedFederalProfile2025 = z.infer<typeof advancedFederalProfileSchema2025>;

const blankSection = { applies: false, interviewComplete: false, knowledgeDocumented: false, documentsReviewed: false, consistencyResolved: false, notes: "" };
export const emptyDueDiligenceProfile2025: DueDiligenceProfile2025 = {
  schemaVersion: "2025.1", paidPreparer: false, sections: { eitc: { ...blankSection }, childTaxCredits: { ...blankSection }, aotc: { ...blankSection }, headOfHousehold: { ...blankSection } },
  clientInterviewDate: null, residencyDocumentsReviewed: "unknown", relationshipDocumentsReviewed: "unknown", incomeDocumentsReviewed: "unknown", additionalInquiries: "", preparerNotes: "", evidence: [],
};
export const emptyPremiumTaxCreditProfile2025: PremiumTaxCreditProfile2025 = { schemaVersion: "2025.1", enabled: false, householdSize: 1, householdModifiedAgiOther: "0.00", federalPovertyLine: "0.00", stateCode: "IL", householdMembersReconciled: false, sharedPoliciesReviewed: false, marriageAlternativeApplies: false, marriageAlternativeReviewed: false, belowPovertyException: "none", belowPovertyExceptionReviewed: false, mfsException: "none", mfsExceptionReviewed: false, householdMembers: [], marriageMonth: null, alternativeMarriageHouseholds: { taxpayer: { familySize: 1, modifiedAgi: "0.00", federalPovertyLine: "0.00" }, spouse: { familySize: 1, modifiedAgi: "0.00", federalPovertyLine: "0.00" } }, policies: [] };
const zeroOwners = { taxpayer: "0.00", spouse: "0.00" } as const;
const falseOwners = { taxpayer: false, spouse: false } as const;
export const emptyAdjustmentProfile2025: AdjustmentProfile2025 = {
  schemaVersion: "2025.1", educator: { enabled: false, expenses: { ...zeroOwners }, reimbursements: { ...zeroOwners }, eligible: { ...falseOwners } },
  ira: { enabled: false, contributions: { ...zeroOwners }, workplacePlanCovered: { ...falseOwners }, age50OrOlder: { ...falseOwners }, eligibilityReviewed: false, nondeductibleBasisApplies: false },
  iraBasis: {
    schemaVersion: "2025.1",
    taxpayer: { enabled: false, priorYearBasis: "0.00", currentYearNondeductibleContributions: "0.00", traditionalIraDistributions: "0.00", rothConversions: "0.00", yearEndTraditionalIraValue: "0.00", outstandingRollovers: "0.00", recharacterizedContributions: "0.00", sourceAmountsReconciled: false, basisReviewed: false },
    spouse: { enabled: false, priorYearBasis: "0.00", currentYearNondeductibleContributions: "0.00", traditionalIraDistributions: "0.00", rothConversions: "0.00", yearEndTraditionalIraValue: "0.00", outstandingRollovers: "0.00", recharacterizedContributions: "0.00", sourceAmountsReconciled: false, basisReviewed: false },
  },
  retirementDistributions: { schemaVersion: "2025.1", enabled: false, allSourceRecordsReviewed: false, treatments: [] },
  capitalGains: { schemaVersion: "2025.1", enabled: false, carryoversReviewed: false, shortTermLossCarryover: "0.00", longTermLossCarryover: "0.00", carryoverSourceYear: null, treatments: [] },
  qualifiedBusinessIncome: { schemaVersion: "2025.1", enabled: false, priorQualifiedBusinessLoss: "0.00", lossesReviewed: false, aggregationReviewed: false, publiclyTradedPartnershipIncome: "0.00", publiclyTradedPartnershipLossCarryover: "0.00", trades: [] },
  studentLoan: { enabled: false, interestPaid: "0.00", form1098ERecordId: null, eligibilityReviewed: false },
  hsa: { enabled: false, owner: "taxpayer", coverageType: "self", eligibleMonths: 0, age55OrOlder: false, personalContributions: "0.00", employerContributions: "0.00", qualifiedDistributions: "0.00", nonqualifiedDistributions: "0.00", excessContributions: "0.00", lastMonthRuleUsed: false, testingPeriodSatisfied: false, additionalTaxException: "none", additionalTaxExceptionReviewed: false },
  selfEmployedHealthInsurance: { enabled: false, premiums: "0.00", activityId: null, employerEligibleMonths: 0, eligibilityReviewed: false },
  retirementPlan: { enabled: false, planType: "sep", contributions: { ...zeroOwners }, employeeDeferrals: { ...zeroOwners }, employerContributions: { ...zeroOwners }, catchUpEligible: { ...falseOwners }, simpleEmployerContributionType: "match_3_percent", activityId: null, limitReviewed: false },
  alternativeMinimumTax: {
    enabled: false, applicabilityReviewed: false, itemizedDeductionTreatmentReviewed: false,
    privateActivityBondInterest: "0.00", incentiveStockOptionAdjustment: "0.00", depreciationAdjustment: "0.00",
    passiveActivityAdjustment: "0.00", lossLimitationAdjustment: "0.00", otherAdjustment: "0.00",
    unsupportedAdjustmentApplies: false, unsupportedAdjustmentDescription: "", priorYearMinimumTaxCreditApplies: false,
  },
  additionalMedicareTax: {
    enabled: false, applicabilityReviewed: false, unreportedTips: "0.00", railroadRetirementCompensation: "0.00",
    railroadMedicareTaxWithheld: "0.00", railroadFactsReviewed: false, withholdingReconciled: false,
  },
  netInvestmentIncomeTax: {
    enabled: false, applicabilityReviewed: false, classificationsReviewed: false, annuityInvestmentIncome: "0.00",
    estateTrustInvestmentIncome: "0.00", otherInvestmentIncome: "0.00", nonpassiveIncomeExcluded: "0.00",
    excludedDispositionGain: "0.00", investmentInterestExpense: "0.00", stateLocalTaxExpense: "0.00",
    miscellaneousInvestmentExpenses: "0.00", passiveLossDeduction: "0.00",
  },
};
export const emptyPaymentProfile2025: PaymentProfile2025 = { schemaVersion: "2025.1", payments: [], excessSocialSecurityReviewed: false };
export const emptyFormPackagePreferences2025: FormPackagePreferences2025 = { schemaVersion: "2025.1", packageMode: "internal_draft", includeWorkpapers: true, includeSourceSummary: true };
export const emptyAdvancedFederalProfile2025: AdvancedFederalProfile2025 = { schemaVersion: "2025.1", dueDiligence: emptyDueDiligenceProfile2025, premiumTaxCredit: emptyPremiumTaxCreditProfile2025, adjustments: emptyAdjustmentProfile2025, payments: emptyPaymentProfile2025, formPackage: emptyFormPackagePreferences2025 };

export function parseAdvancedFederalProfile2025(value: unknown): AdvancedFederalProfile2025 { return advancedFederalProfileSchema2025.parse(value); }
