import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireSafeMutationRequest } from "@/server/api-guards";
import { createReviewPoint, getReviewState } from "@/server/review-service";
import { requestAuthorizationContext } from "@/server/request-auth";

const routeParams = z.object({ clientId: z.string().uuid(), year: z.coerce.number().int().min(2025).max(2200) });
const bodySchema = z.object({
  expectedRevision: z.number().int().positive(), category: z.enum(["confirm", "fyi", "pending", "correction", "information_required"]),
  subject: z.string().trim().min(1).max(200), description: z.string().trim().min(1).max(4000), sourceRecordId: z.string().uuid().nullable(),
  relatedForm: z.string().trim().max(100).nullable(), relatedActivityId: z.string().uuid().nullable(), ownerRole: z.enum(["taxpayer", "spouse", "return"]).nullable(),
  assignedUserId: z.string().uuid().nullable(), dueDate: z.iso.date().nullable(),
}).strict();

export async function GET(_request: Request, { params }: { params: Promise<{ clientId: string; year: string }> }) {
  try { const values = routeParams.parse(await params); return NextResponse.json(await getReviewState(await requestAuthorizationContext(), values.clientId, values.year)); }
  catch (error) { return apiError(error); }
}
export async function POST(request: Request, { params }: { params: Promise<{ clientId: string; year: string }> }) {
  try { requireSafeMutationRequest(request); const values = routeParams.parse(await params); const { expectedRevision, ...body } = bodySchema.parse(await request.json()); return NextResponse.json(await createReviewPoint(await requestAuthorizationContext(), values.clientId, values.year, expectedRevision, body), { status: 201 }); }
  catch (error) { return apiError(error); }
}
