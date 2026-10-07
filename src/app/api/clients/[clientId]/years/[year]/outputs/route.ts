import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireSafeMutationRequest } from "@/server/api-guards";
import { enqueueArtifactJob } from "@/server/artifact-job-service";
import { getArtifactState } from "@/server/output-persistence-service";
import { enforceRateLimit } from "@/server/rate-limit-service";
import { requestAuthorizationContext } from "@/server/request-auth";

const routeParams = z.object({ clientId: z.string().uuid(), year: z.coerce.number().int().min(2025).max(2200) });
const bodySchema = z.object({
  expectedRevision: z.number().int().positive(),
  artifactType: z.enum(["return_package_pdf", "workpaper_xlsx", "complete_json", "source_only_json", "blank_template_json"]),
}).strict();

export async function GET(_request: Request, { params }: { params: Promise<{ clientId: string; year: string }> }) {
  try {
    const values = routeParams.parse(await params);
    return NextResponse.json(await getArtifactState(await requestAuthorizationContext(), values.clientId, values.year));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ clientId: string; year: string }> }) {
  try {
    requireSafeMutationRequest(request);
    const context = await requestAuthorizationContext();
    await enforceRateLimit(context, "artifact.enqueue");
    const values = routeParams.parse(await params);
    const body = bodySchema.parse(await request.json());
    return NextResponse.json(await enqueueArtifactJob(context, values.clientId, values.year, body.expectedRevision, body.artifactType), { status: 202 });
  } catch (error) {
    return apiError(error);
  }
}
