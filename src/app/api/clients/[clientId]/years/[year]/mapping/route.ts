import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireSafeMutationRequest } from "@/server/api-guards";
import { createActivity, getMappingState } from "@/server/mapping-persistence-service";
import { requestAuthorizationContext } from "@/server/request-auth";

const routeParams = z.object({ clientId: z.string().uuid(), year: z.coerce.number().int().min(2025).max(2200) });
const money = z.string().regex(/^\d{1,16}\.\d{2}$/);
const bodySchema = z.object({
  expectedRevision: z.number().int().positive(),
  type: z.enum(["schedule_c", "schedule_e", "schedule_f", "schedule_1_other"]),
  name: z.string().trim().min(1).max(200),
  ownerRole: z.enum(["taxpayer", "spouse"]),
  implementationStatus: z.enum(["supported", "mapping_only"]),
  receiptBasis: z.enum(["source_plus_additional_receipts", "total_books_receipts"]).nullable(),
  additionalReceipts: money,
  receiptNote: z.string().trim().max(2000).nullable(),
}).strict();

export async function GET(_request: Request, { params }: { params: Promise<{ clientId: string; year: string }> }) {
  try {
    const values = routeParams.parse(await params);
    return NextResponse.json(await getMappingState(await requestAuthorizationContext(), values.clientId, values.year));
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request, { params }: { params: Promise<{ clientId: string; year: string }> }) {
  try {
    requireSafeMutationRequest(request);
    const values = routeParams.parse(await params);
    const { expectedRevision, ...body } = bodySchema.parse(await request.json());
    return NextResponse.json(await createActivity(await requestAuthorizationContext(), values.clientId, values.year, expectedRevision, body), { status: 201 });
  } catch (error) { return apiError(error); }
}
