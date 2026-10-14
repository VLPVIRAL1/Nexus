import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireSafeMutationRequest } from "@/server/api-guards";
import { signDueDiligence } from "@/server/advanced-federal-service";
import { requestAuthorizationContext } from "@/server/request-auth";

const paramsSchema = z.object({ clientId: z.string().uuid(), year: z.coerce.number().int().min(2025).max(2200) });
const bodySchema = z.object({ expectedRevision: z.number().int().positive(), expectedProfileVersion: z.number().int().positive(), certification: z.string().trim().min(20).max(1000) }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ clientId: string; year: string }> }) {
  try {
    requireSafeMutationRequest(request);
    const parsedParams = paramsSchema.parse(await params);
    return NextResponse.json(await signDueDiligence(await requestAuthorizationContext(), parsedParams.clientId, parsedParams.year, bodySchema.parse(await request.json())));
  } catch (error) { return apiError(error); }
}
