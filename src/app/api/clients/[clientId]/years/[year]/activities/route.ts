import { NextResponse } from "next/server";
import { z } from "zod";
import { createDefaultActivityForm2025 } from "@/domain/activity-forms-2025";
import { apiError, requireSafeMutationRequest } from "@/server/api-guards";
import { getActivityFormState } from "@/server/activity-form-service";
import { createActivity } from "@/server/mapping-persistence-service";
import { requestAuthorizationContext } from "@/server/request-auth";

const paramsSchema = z.object({ clientId: z.string().uuid(), year: z.coerce.number().int().min(2025).max(2200) });
const bodySchema = z.object({
  expectedRevision: z.number().int().positive(), type: z.enum(["schedule_c", "schedule_e", "schedule_f"]),
  name: z.string().trim().min(1).max(200), ownerRole: z.enum(["taxpayer", "spouse"]),
}).strict();

export async function GET(_request: Request, { params }: { params: Promise<{ clientId: string; year: string }> }) {
  try { const values = paramsSchema.parse(await params); return NextResponse.json(await getActivityFormState(await requestAuthorizationContext(), values.clientId, values.year)); }
  catch (error) { return apiError(error); }
}

export async function POST(request: Request, { params }: { params: Promise<{ clientId: string; year: string }> }) {
  try {
    requireSafeMutationRequest(request);
    const values = paramsSchema.parse(await params); const body = bodySchema.parse(await request.json());
    const result = await createActivity(await requestAuthorizationContext(), values.clientId, values.year, body.expectedRevision, {
      type: body.type, name: body.name, ownerRole: body.ownerRole, implementationStatus: "supported",
      receiptBasis: "source_plus_additional_receipts", additionalReceipts: "0.00", receiptNote: null,
    });
    return NextResponse.json({ ...result, formData: createDefaultActivityForm2025(body.type) }, { status: 201 });
  } catch (error) { return apiError(error); }
}
