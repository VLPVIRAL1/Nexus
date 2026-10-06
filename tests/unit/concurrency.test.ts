import { describe, expect, it } from "vitest";
import { applyVersionedUpdate } from "../../src/services/concurrency";

describe("optimistic concurrency", () => {
  it("increments a matching version", () => expect(applyVersionedUpdate({ value: "old", version: 4 }, 4, "new")).toEqual({ value: "new", version: 5 }));
  it("returns base/current/proposed on conflict", () => expect(applyVersionedUpdate({ value: "current", version: 5 }, 4, "proposed")).toEqual({ kind: "conflict", baseVersion: 4, current: { value: "current", version: 5 }, proposed: "proposed" }));
});
