import { describe, expect, it } from "vitest";
import { boundedNumberInput, formatCurrencyInput, maskProtectedIdentifier, safeDraftStorageKey, sanitizeCurrencyInput } from "@/domain/workbench-field-format";

describe("preparer workbench field formatting", () => {
  it("normalizes currency without floating-point calculation", () => {
    expect(sanitizeCurrencyInput("$1,234.567")).toBe("1234.56");
    expect(formatCurrencyInput("1234.5")).toBe("1234.50");
    expect(formatCurrencyInput("-18.2", true)).toBe("-18.20");
    expect(formatCurrencyInput("-18.2")).toBe("18.20");
  });

  it("masks protected identifiers and bounds counts", () => {
    expect(maskProtectedIdentifier("123456789")).toBe("•••••6789");
    expect(boundedNumberInput("13", 0, 12)).toBe(12);
    expect(boundedNumberInput("", 0, 12)).toBeNull();
  });

  it("allows only scoped non-sensitive draft keys", () => {
    expect(safeDraftStorageKey("firm-user", "preparer-note")).toBe("nexus:safe-draft:v1:firm-user:preparer-note");
    expect(() => safeDraftStorageKey("firm/user", "note")).toThrow(/Draft keys/);
  });
});
