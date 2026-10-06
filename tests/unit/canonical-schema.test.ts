import { describe, expect, it } from "vitest";
import template from "../../examples/2025/blank-taxpayer-template.json";
import { canonicalTaxReturnSchema, decimalString } from "../../src/lib/canonical-schema";

describe("canonical schema", () => {
  it("accepts the blank 2025 template", () => {
    expect(canonicalTaxReturnSchema.safeParse(template).success).toBe(true);
  });

  it("requires decimal money strings", () => {
    expect(decimalString.safeParse("86000.00").success).toBe(true);
    expect(decimalString.safeParse(86000).success).toBe(false);
    expect(decimalString.safeParse("86,000").success).toBe(false);
  });

  it("rejects a different tax year", () => {
    expect(canonicalTaxReturnSchema.safeParse({ ...template, tax_year: 2024 }).success).toBe(false);
  });
});
