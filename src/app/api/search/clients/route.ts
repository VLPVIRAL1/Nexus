import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireSafeMutationRequest } from "@/server/api-guards";
import { listDashboardClients } from "@/server/client-repository";
import { enforceRateLimit } from "@/server/rate-limit-service";
import { requestAuthorizationContext } from "@/server/request-auth";

const bodySchema = z.object({ query: z.string().trim().min(2).max(100) }).strict();

export async function POST(request: Request) {
  try {
    requireSafeMutationRequest(request);
    const context = await requestAuthorizationContext();
    await enforceRateLimit(context, "client.search");
    const body = bodySchema.parse(await request.json());
    const clients = await listDashboardClients(context, { query: body.query, limit: 20 });
    return NextResponse.json({ clients }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
