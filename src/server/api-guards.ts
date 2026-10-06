import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthenticationError } from "./session-service";
import { WorkflowError } from "./client-workflow-service";

const maximumWorkflowBodyBytes = 64 * 1024;

export function requireSafeMutationRequest(request: Request): void {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(length) && length > maximumWorkflowBodyBytes) throw new WorkflowError("invalid", "Request body is too large.");
  const origin = request.headers.get("origin");
  if (!origin) {
    if (process.env.APP_ENV === "production") throw new WorkflowError("forbidden", "A same-origin request is required.");
    return;
  }
  if (new URL(origin).origin !== new URL(request.url).origin) throw new WorkflowError("forbidden", "Cross-origin mutation denied.");
}

export function apiError(error: unknown): NextResponse {
  if (error instanceof AuthenticationError) return NextResponse.json({ error: "authentication_required" }, { status: 401 });
  if (error instanceof WorkflowError) {
    const status = { forbidden: 403, not_found: 404, conflict: 409, invalid: 400 }[error.code];
    return NextResponse.json({ error: error.code, message: error.message }, { status });
  }
  if (error instanceof ZodError) return NextResponse.json({ error: "invalid", issues: error.issues.map(({ path, message }) => ({ path, message })) }, { status: 400 });
  if (error instanceof SyntaxError) return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  return NextResponse.json({ error: "internal_error" }, { status: 500 });
}
