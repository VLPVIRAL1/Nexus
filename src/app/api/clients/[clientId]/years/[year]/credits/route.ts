import { NextResponse } from "next/server";
import { z } from "zod";
import { federalCreditProfileSchema2025 } from "@/domain/federal-credits-2025";
import { apiError, requireSafeMutationRequest } from "@/server/api-guards";
import { saveFederalCreditProfile } from "@/server/federal-credit-service";
import { requestAuthorizationContext } from "@/server/request-auth";

const paramsSchema = z.object({ clientId: z.string().uuid(), year: z.coerce.number().int().min(2025).max(2200) });
const bodySchema = z.object({ expectedRevision: z.number().int().positive(), expectedVersion: z.number().int().positive(), profile: federalCreditProfileSchema2025 }).strict();

export async function PUT(request: Request, { params }: { params: Promise<{ clientId: string; year: string }> }) {
  try {
    requireSafeMutationRequest(request);
    const parsedParams = paramsSchema.parse(await params);
    return NextResponse.json(await saveFederalCreditProfile(await requestAuthorizationContext(), parsedParams.clientId, parsedParams.year, bodySchema.parse(await request.json())));
  } catch (error) { return apiError(error); }
}
