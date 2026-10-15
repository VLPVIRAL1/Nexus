import { NextResponse } from "next/server";
import { apiError } from "@/server/api-guards";
import { getDiagnosticAdministrationState } from "@/server/diagnostic-administration-service";
import { requestAuthorizationContext } from "@/server/request-auth";

export async function GET() {
  try { return NextResponse.json(await getDiagnosticAdministrationState(await requestAuthorizationContext())); }
  catch (error) { return apiError(error); }
}
