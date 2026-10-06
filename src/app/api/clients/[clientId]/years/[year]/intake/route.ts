import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireSafeMutationRequest } from "@/server/api-guards";
import { getIntakeState, saveIntakeAnswers } from "@/server/intake-service";
import { requestAuthorizationContext } from "@/server/request-auth";

const routeParams = z.object({ clientId: z.string().uuid(), year: z.coerce.number().int().min(2025).max(2200) });
const bodySchema = z.object({
  expectedRevision: z.number().int().positive(),
  answers: z.array(z.object({ questionId: z.string().min(1).max(100), answer: z.enum(["yes", "no", "unknown"]), evidence: z.string().trim().min(1).max(1000) }).strict()).min(1).max(100),
}).strict();

export async function GET(_request: Request, { params }: { params: Promise<{ clientId: string; year: string }> }) {
  try {
    const values = routeParams.parse(await params);
    return NextResponse.json(await getIntakeState(await requestAuthorizationContext(), values.clientId, values.year));
  } catch (error) { return apiError(error); }
}

export async function PUT(request: Request, { params }: { params: Promise<{ clientId: string; year: string }> }) {
  try {
    requireSafeMutationRequest(request);
    const values = routeParams.parse(await params);
    const body = bodySchema.parse(await request.json());
    return NextResponse.json(await saveIntakeAnswers(await requestAuthorizationContext(), values.clientId, values.year, body.expectedRevision, body.answers));
  } catch (error) { return apiError(error); }
}
