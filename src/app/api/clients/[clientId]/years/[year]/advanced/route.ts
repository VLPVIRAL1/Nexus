import { NextResponse } from "next/server";
import { z } from "zod";
import { advancedFederalProfileSchema2025 } from "@/domain/advanced-federal-2025";
import { apiError, requireSafeMutationRequest } from "@/server/api-guards";
import { saveAdvancedFederalProfile } from "@/server/advanced-federal-service";
import { requestAuthorizationContext } from "@/server/request-auth";

const paramsSchema = z.object({ clientId: z.string().uuid(), year: z.coerce.number().int().min(2025).max(2200) });
const versionsSchema = z.object({ dueDiligence: z.number().int().positive(), premiumTaxCredit: z.number().int().positive(), adjustments: z.number().int().positive(), payments: z.number().int().positive(), formPackage: z.number().int().positive() }).strict();
const bodySchema = z.object({ expectedRevision: z.number().int().positive(), expectedVersions: versionsSchema, profile: advancedFederalProfileSchema2025 }).strict();

export async function PUT(request: Request, { params }: { params: Promise<{ clientId: string; year: string }> }) {
  try {
    requireSafeMutationRequest(request);
    const parsedParams = paramsSchema.parse(await params);
    return NextResponse.json(await saveAdvancedFederalProfile(await requestAuthorizationContext(), parsedParams.clientId, parsedParams.year, bodySchema.parse(await request.json())));
  } catch (error) { return apiError(error); }
}
