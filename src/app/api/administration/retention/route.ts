import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireSafeMutationRequest } from "@/server/api-guards";
import { enforceRateLimit } from "@/server/rate-limit-service";
import { disposableRetentionCategories, executeRetentionDisposal, getRetentionState, placeLegalHold, previewRetentionDisposal, releaseLegalHold, retentionCategories, saveRetentionPolicy } from "@/server/retention-service";
import { requestAuthorizationContext } from "@/server/request-auth";

const bodySchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("save_policy"), category: z.enum(retentionCategories), retentionMonths: z.number().int().min(1).max(1200), disposition: z.enum(["review", "archive", "delete"]), policyBasis: z.string().trim().min(1).max(2000), expectedVersion: z.number().int().positive().nullable() }).strict(),
  z.object({ operation: z.literal("place_hold"), taxYearId: z.string().uuid(), reference: z.string().trim().min(1).max(200), reason: z.string().trim().min(1).max(2000) }).strict(),
  z.object({ operation: z.literal("release_hold"), holdId: z.string().uuid(), expectedVersion: z.number().int().positive(), reason: z.string().trim().min(1).max(2000) }).strict(),
  z.object({ operation: z.literal("preview_disposal"), category: z.enum(disposableRetentionCategories) }).strict(),
  z.object({ operation: z.literal("execute_disposal"), category: z.enum(disposableRetentionCategories), expectedPolicyVersion: z.number().int().positive(), previewCutoffAt: z.string().datetime(), authorizationReference: z.string().trim().min(1).max(200), confirmation: z.string() }).strict(),
]);

export async function GET() {
  try { return NextResponse.json(await getRetentionState(await requestAuthorizationContext())); }
  catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    requireSafeMutationRequest(request);
    const context = await requestAuthorizationContext();
    const body = bodySchema.parse(await request.json());
    await enforceRateLimit(context, body.operation === "execute_disposal" ? "retention.dispose" : "retention.modify");
    if (body.operation === "save_policy") return NextResponse.json(await saveRetentionPolicy(context, body));
    if (body.operation === "place_hold") return NextResponse.json(await placeLegalHold(context, body));
    if (body.operation === "release_hold") return NextResponse.json(await releaseLegalHold(context, body));
    if (body.operation === "preview_disposal") return NextResponse.json(await previewRetentionDisposal(context, body.category));
    return NextResponse.json(await executeRetentionDisposal(context, body));
  } catch (error) { return apiError(error); }
}
