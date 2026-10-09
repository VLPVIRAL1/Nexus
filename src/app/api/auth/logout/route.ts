import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiError, requireSafeMutationRequest } from "@/server/api-guards";
import { revokeSession } from "@/server/session-service";

export async function POST(request: Request) {
  try {
    requireSafeMutationRequest(request);
    const cookieStore = await cookies();
    const token = cookieStore.get("nexus_session")?.value;
    if (token) await revokeSession(token, "User signed out");
    cookieStore.delete("nexus_session");
    cookieStore.delete("nexus_auth_flow");
    return NextResponse.json({ status: "signed_out" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
