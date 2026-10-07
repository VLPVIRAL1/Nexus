import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireSafeMutationRequest } from "@/server/api-guards";
import { getAssignmentState, setClientAssignment } from "@/server/assignment-service";
import { enforceRateLimit } from "@/server/rate-limit-service";
import { requestAuthorizationContext } from "@/server/request-auth";

const paramsSchema = z.object({ clientId: z.string().uuid() });
const bodySchema = z.object({ userId: z.string().uuid(), kind: z.enum(["preparer", "reviewer", "read_only"]), assigned: z.boolean() }).strict();

export async function GET(_request: Request, { params }: { params: Promise<{ clientId: string }> }) {
  try { const { clientId } = paramsSchema.parse(await params); return NextResponse.json(await getAssignmentState(await requestAuthorizationContext(), clientId)); }
  catch (error) { return apiError(error); }
}

export async function PUT(request: Request, { params }: { params: Promise<{ clientId: string }> }) {
  try {
    requireSafeMutationRequest(request);
    const context = await requestAuthorizationContext();
    await enforceRateLimit(context, "assignment.modify");
    const { clientId } = paramsSchema.parse(await params);
    const body = bodySchema.parse(await request.json());
    return NextResponse.json(await setClientAssignment(context, clientId, body.userId, body.kind, body.assigned));
  } catch (error) { return apiError(error); }
}
