import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireSafeMutationRequest } from "@/server/api-guards";
import { saveExpectedDocument } from "@/server/intake-service";
import { requestAuthorizationContext } from "@/server/request-auth";

const routeParams = z.object({ clientId: z.string().uuid(), year: z.coerce.number().int().min(2025).max(2200) });
const bodySchema = z.object({
  expectedTaxYearRevision: z.number().int().positive(),
  documentKey: z.string().trim().min(1).max(100).regex(/^[a-z0-9_.-]+$/),
  label: z.string().trim().min(1).max(200),
  status: z.enum(["expected", "received", "unavailable", "not_applicable"]),
  evidence: z.string().trim().max(1000).nullable(),
  sourceDocumentId: z.string().uuid().nullable(),
  expectedVersion: z.number().int().positive().nullable(),
}).strict();

export async function PUT(request: Request, { params }: { params: Promise<{ clientId: string; year: string }> }) {
  try {
    requireSafeMutationRequest(request);
    const values = routeParams.parse(await params);
    const body = bodySchema.parse(await request.json());
    const { expectedTaxYearRevision, ...input } = body;
    return NextResponse.json(await saveExpectedDocument(await requestAuthorizationContext(), values.clientId, values.year, expectedTaxYearRevision, input));
  } catch (error) { return apiError(error); }
}
