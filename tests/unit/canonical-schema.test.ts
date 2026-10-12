import { describe, expect, it } from "vitest";
import template from "../../examples/2025/blank-taxpayer-template.json";
import { canonicalTaxReturnSchema, decimalString } from "../../src/lib/canonical-schema";
import { createDefaultActivityForm2025 } from "../../src/domain/activity-forms-2025";
import { createBlankCanonicalTemplate2025 } from "../../src/services/outputs/json-export-service";

describe("canonical schema", () => {
  it("accepts the blank 2025 template", () => {
    expect(canonicalTaxReturnSchema.safeParse(template).success).toBe(true);
    expect(template).toEqual(createBlankCanonicalTemplate2025());
  });

  it("requires decimal money strings", () => {
    expect(decimalString.safeParse("86000.00").success).toBe(true);
    expect(decimalString.safeParse(86000).success).toBe(false);
    expect(decimalString.safeParse("86,000").success).toBe(false);
  });

  it("rejects a different tax year", () => {
    expect(canonicalTaxReturnSchema.safeParse({ ...template, tax_year: 2024 }).success).toBe(false);
  });

  it("strictly validates activity allocations and keeps Schedule E/F income on their form lines", () => {
    const payload = structuredClone(template) as any;
    const activityId = "30000000-0000-4000-8000-000000000010";
    payload.activities.schedule_e = [{ id: activityId, name: "Rental", owner_role: "taxpayer", implementation_status: "supported", additional_receipts: "1.00", receipt_note: null, active: true, version: 1, form_data: createDefaultActivityForm2025("schedule_e") }];
    expect(canonicalTaxReturnSchema.safeParse(payload).success).toBe(false);

    payload.activities.schedule_e[0].additional_receipts = "0.00";
    payload.mappings = [{ id: "40000000-0000-4000-8000-000000000010", sourceRecordId: "50000000-0000-4000-8000-000000000010", sourceField: "boxes.rents", sourceAmount: "1000.00", targetType: "schedule_e", targetActivityId: activityId, allocationMethod: "amount", allocatedAmount: "1000.00", percentage: null, reason: null, status: "accepted", version: 1, unexpected: true }];
    expect(canonicalTaxReturnSchema.safeParse(payload).success).toBe(false);
    delete payload.mappings[0].unexpected;
    expect(canonicalTaxReturnSchema.safeParse(payload).success).toBe(true);
  });
});
