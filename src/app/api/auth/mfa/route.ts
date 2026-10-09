import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireSafeMutationRequest } from "@/server/api-guards";
import { AuthenticationError } from "@/server/session-service";
import { completeSupabaseMfa, trustedAuthenticationNetwork } from "@/server/supabase-auth-service";

const mfaSchema = z.object({ factorId: z.uuid(), code: z.string().trim().regex(/^\d{6}$/) }).strict();

export async function POST(request: Request) {
  try {
    requireSafeMutationRequest(request);
    const input = mfaSchema.parse(await request.json());
    const cookieStore = await cookies();
    const flowCookie = cookieStore.get("nexus_auth_flow")?.value;
    if (!flowCookie) throw new AuthenticationError();
    const session = await completeSupabaseMfa({
      ...input,
      flowCookie,
      networkIdentifier: trustedAuthenticationNetwork(request),
      userAgent: request.headers.get("user-agent"),
    });
    cookieStore.set({ ...session.cookie, value: session.token, priority: "high" });
    cookieStore.delete("nexus_auth_flow");
    return NextResponse.json({ status: "authenticated" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
