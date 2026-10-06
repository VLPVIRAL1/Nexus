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

export async function GET() {
  try {
    const context = await requestAuthorizationContext();
    return NextResponse.json({ clients: await listDashboardClients(context) });
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
