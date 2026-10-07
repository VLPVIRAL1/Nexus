import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireSafeMutationRequest } from "@/server/api-guards";
import { commitPersistedImport } from "@/server/import-persistence-service";
import { enforceRateLimit } from "@/server/rate-limit-service";
import { requestAuthorizationContext } from "@/server/request-auth";

const routeParams = z.object({ clientId: z.string().uuid(), year: z.coerce.number().int().min(2025).max(2200), batchId: z.string().uuid() });
const bodySchema = z.object({ decisions: z.array(z.object({ changeId: z.string().uuid(), decision: z.enum(["use_imported", "keep_existing", "review_later"]) }).strict()).max(10_000) }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ clientId: string; year: string; batchId: string }> }) {
  try {
    requireSafeMutationRequest(request);
    const values = routeParams.parse(await params);
    const body = bodySchema.parse(await request.json());
    const context = await requestAuthorizationContext();
    await enforceRateLimit(context, "import.commit");
    return NextResponse.json(await commitPersistedImport(context, values.clientId, values.year, values.batchId, body.decisions));
  } catch (error) {
    return apiError(error);
  }
}
