import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthenticationError } from "./session-service";
import { WorkflowError } from "./client-workflow-service";
import { ImportError } from "@/services/import-service";
import { RateLimitError } from "./rate-limit-service";

const maximumWorkflowBodyBytes = 64 * 1024;

export function requireSafeMutationRequest(request: Request): void {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(length) && length > maximumWorkflowBodyBytes) throw new WorkflowError("invalid", "Request body is too large.");
  requireSameOrigin(request);
}

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) {
    if (process.env.APP_ENV === "production") throw new WorkflowError("forbidden", "A same-origin request is required.");
    return;
  }
  try {
    const originUrl = new URL(origin);
    const requestUrl = new URL(request.url);
    const requestHost = request.headers.get("host") ?? requestUrl.host;
    const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",", 1)[0]?.trim();
    const requestProtocol = forwardedProtocol ? `${forwardedProtocol}:` : requestUrl.protocol;
    if (originUrl.host !== requestHost || originUrl.protocol !== requestProtocol) {
      throw new WorkflowError("forbidden", "Cross-origin mutation denied.");
    }
  } catch (error) {
    if (error instanceof WorkflowError) throw error;
    throw new WorkflowError("forbidden", "Cross-origin mutation denied.");
  }
}

export function apiError(error: unknown): NextResponse {
  if (error instanceof RateLimitError) return NextResponse.json({ error: "rate_limited", message: error.message }, { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } });
  if (error instanceof AuthenticationError) return NextResponse.json({ error: "authentication_required" }, { status: 401 });
  if (error instanceof WorkflowError) {
    const status = { forbidden: 403, not_found: 404, conflict: 409, invalid: 400 }[error.code];
    return NextResponse.json({ error: error.code, message: error.message }, { status });
  }
  if (error instanceof ImportError) return NextResponse.json({ error: error.code, message: error.message }, { status: error.code === "IMPORT_TOO_LARGE" ? 413 : error.code === "IMPORT_PREVIEW_STALE" ? 409 : 400 });
  if (error instanceof ZodError) return NextResponse.json({ error: "invalid", issues: error.issues.map(({ path, message }) => ({ path, message })) }, { status: 400 });
  if (error instanceof SyntaxError) return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  return NextResponse.json({ error: "internal_error" }, { status: 500 });
}
