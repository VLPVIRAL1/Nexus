import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireSafeMutationRequest } from "@/server/api-guards";
import { beginSupabasePasswordLogin, trustedAuthenticationNetwork } from "@/server/supabase-auth-service";

const loginSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(1024),
  firmId: z.uuid().nullable().optional(),
}).strict();

export async function POST(request: Request) {
  try {
    requireSafeMutationRequest(request);
    const input = loginSchema.parse(await request.json());
    const result = await beginSupabasePasswordLogin({
      ...input,
      networkIdentifier: trustedAuthenticationNetwork(request),
      userAgent: request.headers.get("user-agent"),
    });
    const cookieStore = await cookies();
    if (result.status === "authenticated") {
      cookieStore.set({ ...result.session.cookie, value: result.session.token, priority: "high" });
      cookieStore.delete("nexus_auth_flow");
      return NextResponse.json({ status: result.status }, { headers: { "Cache-Control": "no-store" } });
    }
    cookieStore.set({
      name: "nexus_auth_flow",
      value: result.flowCookie,
      httpOnly: true,
      secure: process.env.APP_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 5 * 60,
      priority: "high",
    });
    return NextResponse.json({ status: result.status, factors: result.factors, enrollment: result.enrollment }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
