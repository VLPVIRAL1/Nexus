import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireSafeMutationRequest } from "@/server/api-guards";
import { saveAllocations } from "@/server/mapping-persistence-service";
import { requestAuthorizationContext } from "@/server/request-auth";

const routeParams = z.object({ clientId: z.string().uuid(), year: z.coerce.number().int().min(2025).max(2200) });
const decimal = z.string().regex(/^\d{1,16}(?:\.\d{1,4})?$/);
const bodySchema = z.object({
  expectedRevision: z.number().int().positive(),
  sourceRecordId: z.string().uuid(),
  sourceField: z.string().min(1).max(200),
  allocations: z.array(z.object({
    targetType: z.enum(["schedule_c", "schedule_e", "schedule_f", "schedule_1_other", "excluded"]),
    targetActivityId: z.string().uuid().nullable(),
    allocationMethod: z.enum(["amount", "percentage"]),
    allocatedAmount: decimal.nullable(),
    percentage: decimal.nullable(),
    reason: z.string().trim().max(2000).nullable(),
    note: z.string().trim().max(2000).nullable(),
    status: z.enum(["accepted", "reviewed"]),
    residualRecipient: z.boolean().optional(),
  }).strict()).max(20),
}).strict();

export async function PUT(request: Request, { params }: { params: Promise<{ clientId: string; year: string }> }) {
  try {
    requireSafeMutationRequest(request);
    const values = routeParams.parse(await params);
    const body = bodySchema.parse(await request.json());
    return NextResponse.json(await saveAllocations(await requestAuthorizationContext(), values.clientId, values.year, body.sourceRecordId, body.sourceField, body.expectedRevision, body.allocations));
  } catch (error) { return apiError(error); }
}
