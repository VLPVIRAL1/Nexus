import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireSafeMutationRequest } from "@/server/api-guards";
import { requestSupabasePasswordRecovery, trustedAuthenticationNetwork } from "@/server/supabase-auth-service";

const recoverySchema = z.object({ email: z.string().trim().email().max(320) }).strict();

export async function POST(request: Request) {
  try {
    requireSafeMutationRequest(request);
    const { email } = recoverySchema.parse(await request.json());
    await requestSupabasePasswordRecovery(email, trustedAuthenticationNetwork(request));
    return NextResponse.json({ status: "accepted" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
