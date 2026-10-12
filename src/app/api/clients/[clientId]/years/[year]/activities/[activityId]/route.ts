import { NextResponse } from "next/server";
import { z } from "zod";
import { activityFormDataSchema2025, money2025 } from "@/domain/activity-forms-2025";
import { apiError, requireSafeMutationRequest } from "@/server/api-guards";
import { saveActivityForm } from "@/server/activity-form-service";
import { deactivateActivity } from "@/server/mapping-persistence-service";
import { requestAuthorizationContext } from "@/server/request-auth";

const paramsSchema = z.object({ clientId: z.string().uuid(), year: z.coerce.number().int().min(2025).max(2200), activityId: z.string().uuid() });
const putSchema = z.object({
  expectedRevision: z.number().int().positive(), expectedVersion: z.number().int().positive(), name: z.string().trim().min(1).max(200),
  ownerRole: z.enum(["taxpayer", "spouse"]), additionalReceipts: money2025, receiptNote: z.string().trim().max(2000).nullable(),
  changeReason: z.string().trim().min(1).max(1000), formData: activityFormDataSchema2025,
}).strict();
const deleteSchema = z.object({ expectedRevision: z.number().int().positive(), expectedVersion: z.number().int().positive() }).strict();

export async function PUT(request: Request, { params }: { params: Promise<{ clientId: string; year: string; activityId: string }> }) {
  try { requireSafeMutationRequest(request); const values = paramsSchema.parse(await params); const body = putSchema.parse(await request.json()); return NextResponse.json(await saveActivityForm(await requestAuthorizationContext(), values.clientId, values.year, values.activityId, body)); }
  catch (error) { return apiError(error); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ clientId: string; year: string; activityId: string }> }) {
  try { requireSafeMutationRequest(request); const values = paramsSchema.parse(await params); const body = deleteSchema.parse(await request.json()); return NextResponse.json(await deactivateActivity(await requestAuthorizationContext(), values.clientId, values.year, values.activityId, body.expectedRevision, body.expectedVersion)); }
  catch (error) { return apiError(error); }
}
