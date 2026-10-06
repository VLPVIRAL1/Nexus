import { describe, expect, it } from "vitest";
import { canMarkReviewedDraft, canRequestReview, nextStateAfterRelevantEdit } from "../../src/services/status-service";

const ready = {
  currentRevision: 8, calculationRevision: 8, calculationState: "complete" as const, diagnostics: [], intakeComplete: true,
  requiredOutputsSucceeded: true, reviewerAuthorized: true, independentReviewer: true, requiredSignoffsCurrent: true,
};

describe("review status guards", () => {
  it("allows only a complete current supported draft", () => expect(canMarkReviewedDraft(ready).allowed).toBe(true));
  it("blocks a stale calculation", () => expect(canRequestReview({ ...ready, calculationRevision: 7 }).reasons).toContain("The calculation is stale for the current revision."));
  it("blocks approval when a blocking diagnostic exists", () => expect(canMarkReviewedDraft({ ...ready, diagnostics: [{ code: "X", severity: "blocking", category: "completeness", recordId: null, fieldPath: null, message: "Missing", resolutionAction: "Fix" }] }).allowed).toBe(false));
  it("invalidates reviewed status after a relevant edit", () => expect(nextStateAfterRelevantEdit("reviewed_draft")).toBe("changes_requested"));
});
