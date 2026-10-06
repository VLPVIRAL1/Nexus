import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireSafeMutationRequest } from "@/server/api-guards";
import { requestChanges } from "@/server/review-service";
import { requestAuthorizationContext } from "@/server/request-auth";

const routeParams = z.object({ clientId: z.string().uuid(), year: z.coerce.number().int().min(2025).max(2200), reviewPointId: z.string().uuid() });
const bodySchema = z.object({ expectedRevision: z.number().int().positive(), expectedVersion: z.number().int().positive() }).strict();
export async function POST(request: Request, { params }: { params: Promise<{ clientId: string; year: string; reviewPointId: string }> }) {
  try { requireSafeMutationRequest(request); const values = routeParams.parse(await params); const body = bodySchema.parse(await request.json()); return NextResponse.json(await requestChanges(await requestAuthorizationContext(), values.clientId, values.year, values.reviewPointId, body.expectedRevision, body.expectedVersion)); }
  catch (error) { return apiError(error); }
}
