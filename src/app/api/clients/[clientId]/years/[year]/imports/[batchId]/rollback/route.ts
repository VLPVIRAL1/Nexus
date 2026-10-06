import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireSafeMutationRequest } from "@/server/api-guards";
import { rollbackPersistedImport } from "@/server/import-persistence-service";
import { requestAuthorizationContext } from "@/server/request-auth";

const routeParams = z.object({ clientId: z.string().uuid(), year: z.coerce.number().int().min(2025).max(2200), batchId: z.string().uuid() });

export async function POST(request: Request, { params }: { params: Promise<{ clientId: string; year: string; batchId: string }> }) {
  try {
    requireSafeMutationRequest(request);
    const values = routeParams.parse(await params);
    const context = await requestAuthorizationContext();
    return NextResponse.json(await rollbackPersistedImport(context, values.clientId, values.year, values.batchId));
  } catch (error) {
    return apiError(error);
  }
}
