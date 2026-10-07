import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireSafeMutationRequest } from "@/server/api-guards";
import { createClient } from "@/server/client-workflow-service";
import { listDashboardClients } from "@/server/client-repository";
import { requestAuthorizationContext } from "@/server/request-auth";

const createClientSchema = z.object({
  clientCode: z.string().trim().min(1).max(30).regex(/^[A-Za-z0-9_-]+$/),
  displayName: z.string().trim().min(1).max(200),
}).strict();

const listSchema = z.object({ query: z.string().trim().max(100).optional(), limit: z.coerce.number().int().min(1).max(200).default(100) });

export async function GET(request: Request) {
  try {
    const context = await requestAuthorizationContext();
    const url = new URL(request.url);
    const options = listSchema.parse({ query: url.searchParams.get("query") || undefined, limit: url.searchParams.get("limit") || undefined });
    return NextResponse.json({ clients: await listDashboardClients(context, options) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    requireSafeMutationRequest(request);
    const context = await requestAuthorizationContext();
    const input = createClientSchema.parse(await request.json());
    return NextResponse.json(await createClient(context, input), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
