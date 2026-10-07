import { NextResponse } from "next/server";
import { apiError } from "@/server/api-guards";
import { getArtifactJobMetrics } from "@/server/operations-service";
import { requestAuthorizationContext } from "@/server/request-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try { return NextResponse.json(await getArtifactJobMetrics(await requestAuthorizationContext())); }
  catch (error) { return apiError(error); }
}
