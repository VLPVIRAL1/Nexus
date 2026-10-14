import { describe, expect, it } from "vitest";
import { coverageLedger2025, coverageLedgerProblems2025, coverageSurfaces2025 } from "@/tax-engine/2025/coverage-ledger";

describe("2025 end-to-end coverage ledger", () => {
  it("requires every implemented module to cover every delivery surface", () => {
    expect(coverageLedgerProblems2025()).toEqual([]);
    for (const entry of coverageLedger2025.filter(({ state }) => state === "implemented")) {
      expect(Object.keys(entry.surfaces).sort()).toEqual([...coverageSurfaces2025].sort());
      expect(Object.values(entry.surfaces).every(Boolean)).toBe(true);
    }
  });

  it("keeps every incomplete module explicitly blocked or deliberately deferred", () => {
    const incomplete = coverageLedger2025.filter(({ state }) => state !== "implemented");
    expect(incomplete.length).toBeGreaterThan(0);
    for (const entry of incomplete) {
      expect(entry.blockerCode).toBeTruthy();
      expect(entry.scopeNote).toBeTruthy();
      expect(Object.values(entry.surfaces).every((value) => value === false)).toBe(true);
    }
    expect(coverageLedger2025.find(({ id }) => id === "state-local")?.state).toBe("deferred");
  });
});
