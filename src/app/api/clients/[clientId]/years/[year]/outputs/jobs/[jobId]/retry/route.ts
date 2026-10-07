import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireSafeMutationRequest } from "@/server/api-guards";
import { retryArtifactJob } from "@/server/artifact-job-service";
import { requestAuthorizationContext } from "@/server/request-auth";

const routeParams = z.object({ clientId: z.string().uuid(), year: z.coerce.number().int().min(2025).max(2200), jobId: z.string().uuid() });

export async function POST(request: Request, { params }: { params: Promise<{ clientId: string; year: string; jobId: string }> }) {
  try {
    requireSafeMutationRequest(request);
    const values = routeParams.parse(await params);
    return NextResponse.json(await retryArtifactJob(await requestAuthorizationContext(), values.clientId, values.year, values.jobId), { status: 202 });
  } catch (error) {
    return apiError(error);
  }
}
