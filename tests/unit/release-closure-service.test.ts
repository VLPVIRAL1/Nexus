import { describe, expect, it } from "vitest";
import { comparisonMismatchCount } from "../../src/server/release-closure-service";

describe("release closure comparison", () => {
  it("counts missing, extra, and changed named values deterministically", () => {
    expect(comparisonMismatchCount(
      { "1040.1a": "100.00", "1040.25a": "10.00", "schedule-c.31": "90.00" },
      { "1040.1a": "100.00", "1040.25a": "11.00", "schedule-se.12": "12.72" },
    )).toBe(3);
    expect(comparisonMismatchCount({ a: "1", b: "2" }, { b: "2", a: "1" })).toBe(0);
  });
});
