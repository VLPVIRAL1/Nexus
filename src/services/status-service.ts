import type { Diagnostic } from "./diagnostics";

export type PreparationState = "not_started" | "documents_pending" | "in_preparation" | "ready_for_review" | "changes_requested" | "reviewed_draft" | "archived";
export type CalculationState = "not_run" | "queued" | "running" | "partial" | "complete" | "failed" | "stale";

export interface ReadinessContext {
  currentRevision: number;
  calculationRevision: number | null;
  calculationState: CalculationState;
  diagnostics: Diagnostic[];
  intakeComplete: boolean;
  requiredOutputsSucceeded: boolean;
  reviewerAuthorized: boolean;
  independentReviewer: boolean;
  requiredSignoffsCurrent: boolean;
}

export function canRequestReview(context: ReadinessContext): { allowed: boolean; reasons: string[] } {
  const reasons = completenessReasons(context);
  return { allowed: reasons.length === 0, reasons };
}

export function canMarkReviewedDraft(context: ReadinessContext): { allowed: boolean; reasons: string[] } {
  const reasons = completenessReasons(context);
  if (!context.reviewerAuthorized) reasons.push("Reviewer permission is required.");
  if (!context.independentReviewer) reasons.push("Independent review is required unless an audited self-review policy applies.");
  if (!context.requiredSignoffsCurrent) reasons.push("Required sign-offs do not match the current revision.");
  return { allowed: reasons.length === 0, reasons };
}

function completenessReasons(context: ReadinessContext): string[] {
  const reasons: string[] = [];
  if (!context.intakeComplete) reasons.push("Required intake is incomplete.");
  if (context.diagnostics.some((issue) => issue.severity === "blocking" || issue.severity === "error")) reasons.push("Blocking diagnostics remain unresolved.");
  if (context.calculationState !== "complete") reasons.push("A complete supported calculation is required.");
  if (context.calculationRevision !== context.currentRevision) reasons.push("The calculation is stale for the current revision.");
  if (!context.requiredOutputsSucceeded) reasons.push("Required draft outputs are missing, failed, or stale.");
  return reasons;
}

export function nextStateAfterRelevantEdit(current: PreparationState): PreparationState {
  return current === "reviewed_draft" || current === "ready_for_review" ? "changes_requested" : current;
}
