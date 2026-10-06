import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireSafeMutationRequest } from "@/server/api-guards";
import { updateReviewPointStatus } from "@/server/review-service";
import { requestAuthorizationContext } from "@/server/request-auth";

const routeParams = z.object({ clientId: z.string().uuid(), year: z.coerce.number().int().min(2025).max(2200), reviewPointId: z.string().uuid() });
const bodySchema = z.object({ expectedRevision: z.number().int().positive(), expectedVersion: z.number().int().positive(), status: z.enum(["waiting", "resolved", "not_applicable"]), resolution: z.string().trim().max(4000).nullable() }).strict();
export async function PATCH(request: Request, { params }: { params: Promise<{ clientId: string; year: string; reviewPointId: string }> }) {
  try { requireSafeMutationRequest(request); const values = routeParams.parse(await params); const body = bodySchema.parse(await request.json()); return NextResponse.json(await updateReviewPointStatus(await requestAuthorizationContext(), values.clientId, values.year, values.reviewPointId, body.expectedRevision, body.expectedVersion, body.status, body.resolution)); }
  catch (error) { return apiError(error); }
}
