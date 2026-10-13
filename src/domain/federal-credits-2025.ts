import { z } from "zod";

const money = z.string().regex(/^\d+\.\d{2}$/, "Use a nonnegative amount with exactly two decimal places.");
const reviewed = z.boolean();

export const eitcChildSchema2025 = z.object({
  id: z.string().uuid(), dependentId: z.string().uuid(), relationshipTest: reviewed,
  ageTest: reviewed, residencyTest: reviewed, jointReturnTest: reviewed,
  validWorkEligibleIdentifier: reviewed, notClaimedByOther: reviewed, disabilityException: reviewed,
}).strict();

export const careProviderSchema2025 = z.object({
  id: z.string().uuid(), name: z.string().trim().min(1).max(200), address: z.string().trim().min(1).max(500),
  tinLast4: z.string().regex(/^\d{4}$/), eligibleConfirmed: reviewed, amountPaid: money,
}).strict();

export const carePersonSchema2025 = z.object({
  id: z.string().uuid(), dependentId: z.string().uuid().nullable(), name: z.string().trim().min(1).max(200),
  expenses: money, qualifiesConfirmed: reviewed,
}).strict();

export const educationStudentSchema2025 = z.object({
  id: z.string().uuid(), personRole: z.enum(["taxpayer", "spouse", "dependent"]), dependentId: z.string().uuid().nullable(),
  name: z.string().trim().min(1).max(200), institutionName: z.string().trim().min(1).max(200),
  form1098TRecordId: z.string().uuid().nullable(), creditType: z.enum(["aotc", "llc"]), qualifiedExpenses: money,
  taxFreeAssistance: money, eligibleInstitution: reviewed, firstFourYears: reviewed, atLeastHalfTime: reviewed,
  degreeCandidate: reviewed, noFelonyDrugConviction: reviewed, priorAotcYears: z.number().int().min(0).max(4),
  refundabilityConfirmed: reviewed,
}).strict();

export const federalCreditProfileSchema2025 = z.object({
  schemaVersion: z.literal("2025.1"),
  eitc: z.object({
    enabled: z.boolean(), eligibilityReviewed: reviewed, taxpayerAgeAtYearEnd: z.number().int().min(0).max(120).nullable(),
    spouseAgeAtYearEnd: z.number().int().min(0).max(120).nullable(), taxpayerWorkEligibleIdentifier: reviewed, spouseWorkEligibleIdentifier: reviewed,
    notQualifyingChildOfAnother: reviewed, investmentIncome: money, noForm2555: reviewed,
    noPriorDisallowance: reviewed, noCombatPayElection: reviewed, separatedSpouseEligible: z.boolean().nullable(),
    qualifyingChildren: z.array(eitcChildSchema2025).max(20),
  }).strict(),
  dependentCare: z.object({
    enabled: z.boolean(), workRelatedExpensesConfirmed: reviewed, providers: z.array(careProviderSchema2025).max(20),
    qualifyingPersons: z.array(carePersonSchema2025).max(20), taxpayerStudentOrDisabledMonths: z.number().int().min(0).max(12),
    spouseStudentOrDisabledMonths: z.number().int().min(0).max(12), additionalEmployerBenefits: money,
  }).strict(),
  education: z.object({ enabled: z.boolean(), students: z.array(educationStudentSchema2025).max(20) }).strict(),
}).strict();

export type FederalCreditProfile2025 = z.infer<typeof federalCreditProfileSchema2025>;

export const emptyFederalCreditProfile2025: FederalCreditProfile2025 = {
  schemaVersion: "2025.1",
  eitc: { enabled: false, eligibilityReviewed: false, taxpayerAgeAtYearEnd: null, spouseAgeAtYearEnd: null, taxpayerWorkEligibleIdentifier: false, spouseWorkEligibleIdentifier: false, notQualifyingChildOfAnother: false, investmentIncome: "0.00", noForm2555: false, noPriorDisallowance: false, noCombatPayElection: false, separatedSpouseEligible: null, qualifyingChildren: [] },
  dependentCare: { enabled: false, workRelatedExpensesConfirmed: false, providers: [], qualifyingPersons: [], taxpayerStudentOrDisabledMonths: 0, spouseStudentOrDisabledMonths: 0, additionalEmployerBenefits: "0.00" },
  education: { enabled: false, students: [] },
};

export function parseFederalCreditProfile2025(value: unknown): FederalCreditProfile2025 {
  return federalCreditProfileSchema2025.parse(value);
}
