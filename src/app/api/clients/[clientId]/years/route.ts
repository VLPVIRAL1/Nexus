import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireSafeMutationRequest } from "@/server/api-guards";
import { createTaxYear } from "@/server/client-workflow-service";
import { requestAuthorizationContext } from "@/server/request-auth";

const routeParams = z.object({ clientId: z.string().uuid() });
const bodySchema = z.object({ year: z.number().int().min(2025).max(2200) }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ clientId: string }> }) {
  try {
    requireSafeMutationRequest(request);
    const { clientId } = routeParams.parse(await params);
    const context = await requestAuthorizationContext();
    return NextResponse.json(await createTaxYear(context, clientId, bodySchema.parse(await request.json())), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
