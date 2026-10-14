import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireSafeMutationRequest } from "@/server/api-guards";
import { saveReturnProfile } from "@/server/return-profile-service";
import { requestAuthorizationContext } from "@/server/request-auth";
import { standardDeductionFactsSchema2025 } from "@/domain/standard-deduction-2025";

const paramsSchema = z.object({ clientId: z.string().uuid(), year: z.coerce.number().int().min(2025).max(2200) });
const money = z.string().regex(/^\d+\.\d{2}$/, "Use a nonnegative amount with exactly two decimal places.");
const scheduleA = z.object({
  enabled: z.boolean(), marriedFilingSeparatelySpouseItemizes: z.boolean().nullable(), medicalAndDentalExpenses: money,
  stateLocalIncomeOrSalesTaxes: money, realEstateTaxes: money, personalPropertyTaxes: money, otherTaxes: money,
  homeMortgageInterestAndPoints: money, investmentInterest: money, cashCharitableContributions: money, noncashCharitableContributions: money,
  casualtyAndTheftLosses: money, otherItemizedDeductions: money, saltEligibilityConfirmed: z.boolean(), mortgageLimitsApplied: z.boolean(),
  charityLimitsApplied: z.boolean(), casualtyLimitsApplied: z.boolean(),
}).strict();
const bodySchema = z.object({
  expectedRevision: z.number().int().positive(), expectedVersion: z.number().int().positive(),
  filingStatus: z.enum(["single", "married_filing_jointly", "married_filing_separately", "head_of_household", "qualifying_surviving_spouse"]),
  filingStatusEligibilityConfirmed: z.boolean(), standardDeductionFacts: standardDeductionFactsSchema2025, scheduleA,
  dependents: z.array(z.object({
    id: z.string().uuid(), legalName: z.string().trim().min(1).max(200), dateOfBirth: z.iso.date(), relationship: z.string().trim().min(1).max(100),
    monthsLivedWithTaxpayer: z.number().int().min(0).max(12), qualifiesAsDependent: z.boolean(), qualifiesForChildTaxCredit: z.boolean(),
    hasValidSsnForChildTaxCredit: z.boolean(), qualifiesForOtherDependentCredit: z.boolean(), eligibilityReviewed: z.boolean(),
  }).strict()).max(50),
}).strict();

export async function PUT(request: Request, { params }: { params: Promise<{ clientId: string; year: string }> }) {
  try {
    requireSafeMutationRequest(request);
    const parsedParams = paramsSchema.parse(await params);
    const body = bodySchema.parse(await request.json());
    return NextResponse.json(await saveReturnProfile(await requestAuthorizationContext(), parsedParams.clientId, parsedParams.year, body));
  } catch (error) { return apiError(error); }
}
