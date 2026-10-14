import { z } from "zod";

export const standardDeductionFactsSchema2025 = z.object({
  schemaVersion: z.literal("2025.1"),
  taxpayerClaimableAsDependent: z.boolean(),
  form8615ApplicabilityReviewed: z.boolean(),
  form8615Required: z.boolean(),
  taxpayerAge65OrOlder: z.boolean(),
  taxpayerBlind: z.boolean(),
  spouseAge65OrOlder: z.boolean(),
  spouseBlind: z.boolean(),
  ageBlindnessFactsReviewed: z.boolean(),
  mfsSpouseAdditionalDeductionEligible: z.boolean(),
}).strict();

export type StandardDeductionFacts2025 = z.infer<typeof standardDeductionFactsSchema2025>;

export const emptyStandardDeductionFacts2025: StandardDeductionFacts2025 = {
  schemaVersion: "2025.1",
  taxpayerClaimableAsDependent: false,
  form8615ApplicabilityReviewed: false,
  form8615Required: false,
  taxpayerAge65OrOlder: false,
  taxpayerBlind: false,
  spouseAge65OrOlder: false,
  spouseBlind: false,
  ageBlindnessFactsReviewed: false,
  mfsSpouseAdditionalDeductionEligible: false,
};

export function parseStandardDeductionFacts2025(value: unknown): StandardDeductionFacts2025 {
  return standardDeductionFactsSchema2025.parse(value);
}
