import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireSafeMutationRequest } from "@/server/api-guards";
import { upsertPerson } from "@/server/client-workflow-service";
import { requestAuthorizationContext } from "@/server/request-auth";

const routeParams = z.object({
  clientId: z.string().uuid(),
  year: z.coerce.number().int().min(2025).max(2200),
  role: z.enum(["taxpayer", "spouse"]),
});
const bodySchema = z.object({
  legalName: z.string().trim().min(1).max(200),
  dateOfBirth: z.iso.date().nullable(),
  address: z.record(z.string(), z.unknown()),
  facts: z.record(z.string(), z.unknown()),
  expectedVersion: z.number().int().positive().nullable(),
}).strict();

export async function PUT(request: Request, { params }: { params: Promise<{ clientId: string; year: string; role: string }> }) {
  try {
    requireSafeMutationRequest(request);
    const parsedParams = routeParams.parse(await params);
    const context = await requestAuthorizationContext();
    const body = bodySchema.parse(await request.json());
    return NextResponse.json(await upsertPerson(context, parsedParams.clientId, parsedParams.year, { ...body, role: parsedParams.role }));
  } catch (error) {
    return apiError(error);
  }
}
