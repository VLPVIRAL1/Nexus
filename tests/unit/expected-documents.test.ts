import { describe, expect, it } from "vitest";
import { expectedDocumentRegistry2025, expectedDocumentRegistryForAnswers } from "../../src/domain/expected-documents";
import { phase1IntakeQuestions } from "../../src/domain/intake";

describe("2025 expected-document registry", () => {
  it("has stable unique entries for every supported source family without requesting prohibited secrets", () => {
    expect(new Set(expectedDocumentRegistry2025.map(({ id }) => id)).size).toBe(expectedDocumentRegistry2025.length);
    expect(expectedDocumentRegistry2025.map(({ id }) => id)).toEqual(expect.arrayContaining(["w2", "1099_nec", "1099_misc", "1099_int", "1099_div"]));
    expect(JSON.stringify(expectedDocumentRegistry2025).toLowerCase()).not.toMatch(/bank credential|e-file signature pin/);
  });

  it("only suggests conditional evidence from affirmative registered intake answers", () => {
    const questionIds = new Set(phase1IntakeQuestions.map(({ id }) => id));
    for (const definition of expectedDocumentRegistry2025) for (const trigger of definition.triggerQuestionIds) expect(questionIds.has(trigger)).toBe(true);
    const registry = expectedDocumentRegistryForAnswers(new Map([["deductions.marketplace", "yes"], ["income.retirement", "no"]]));
    expect(registry.find(({ id }) => id === "prior_year_return")?.suggested).toBe(true);
    expect(registry.find(({ id }) => id === "marketplace_1095a")?.suggested).toBe(true);
    expect(registry.find(({ id }) => id === "retirement_statement")?.suggested).toBe(false);
  });
});
