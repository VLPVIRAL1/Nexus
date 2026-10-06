import { describe, expect, it } from "vitest";
import type { SourceMapping } from "../../src/domain/canonical";
import { allocateByPercent } from "../../src/domain/money";
import { reconcileMappings } from "../../src/services/mapping-service";

const mapping = (id: string, amount: `${number}.${number}`, targetType: SourceMapping["targetType"] = "schedule_c"): SourceMapping => ({
  id, sourceRecordId: "source-1", sourceField: "boxes.nonemployeeCompensation", sourceAmount: "100000.00",
  targetType, targetActivityId: targetType === "excluded" ? null : `activity-${id}`, allocationMethod: "amount", allocatedAmount: amount,
  percentage: null, reason: targetType === "excluded" ? "Documented non-taxable amount" : null, status: "accepted", version: 1,
});

describe("mapping reconciliation", () => {
  it("reconciles a split allocation exactly", () => {
    expect(reconcileMappings("100000.00", [mapping("a", "75000.00"), mapping("b", "25000.00")])).toEqual({
      sourceAmount: "100000.00", allocatedAmount: "100000.00", excludedAmount: "0.00", unresolvedAmount: "0.00", status: "fully_mapped",
    });
  });

  it("reports a partial allocation", () => {
    expect(reconcileMappings("100000.00", [mapping("a", "75000.00")]).unresolvedAmount).toBe("25000.00");
  });

  it("rejects over-allocation", () => {
    expect(() => reconcileMappings("100000.00", [mapping("a", "100000.01")])).toThrow("MAPPING_OVER_ALLOCATED");
  });

  it("assigns percentage rounding residual deterministically", () => {
    expect(allocateByPercent("100.00", ["33.33", "33.33", "33.34"])).toEqual(["33.33", "33.33", "33.34"]);
  });
});
