import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireSafeMutationRequest } from "@/server/api-guards";
import { attestCompleteness } from "@/server/intake-service";
import { requestAuthorizationContext } from "@/server/request-auth";

const routeParams = z.object({ clientId: z.string().uuid(), year: z.coerce.number().int().min(2025).max(2200) });
const bodySchema = z.object({ expectedRevision: z.number().int().positive(), evidence: z.string().trim().min(1).max(2000), missingDocumentExplanation: z.string().trim().max(2000).nullable() }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ clientId: string; year: string }> }) {
  try {
    requireSafeMutationRequest(request);
    const values = routeParams.parse(await params);
    const body = bodySchema.parse(await request.json());
    return NextResponse.json(await attestCompleteness(await requestAuthorizationContext(), values.clientId, values.year, body.expectedRevision, body.evidence, body.missingDocumentExplanation));
  } catch (error) { return apiError(error); }
}
