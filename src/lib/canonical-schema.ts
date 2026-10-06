import { z } from "zod";

const decimalString = z.string().regex(/^-?\d+\.\d{2}$/, "Use a decimal string with exactly two places");
const ownership = z.enum(["taxpayer", "spouse", "joint", "dependent", "unknown"]);

const rawField = z.object({
  id: z.uuid(), label: z.string().min(1), code: z.string().nullable().optional(),
  value: z.union([z.string(), decimalString]), page: z.int().positive().nullable(), reason: z.string().nullable(),
});

const sourceRecord = z.object({
  id: z.uuid(), external_source_id: z.string().nullable(), source_document_id: z.uuid(), form_year: z.literal(2025),
  recipient_role: ownership, corrected: z.boolean(), void: z.boolean(), raw_fields: z.array(rawField),
  unmapped_source_fields: z.array(rawField), version: z.int().positive(),
});

export const canonicalTaxReturnSchema = z.object({
  schema_version: z.literal("1.0.0"), tax_year: z.literal(2025), return_type: z.literal("1040"),
  _instructions: z.record(z.string(), z.unknown()).optional(), client: z.record(z.string(), z.unknown()),
  taxpayer: z.record(z.string(), z.unknown()), spouse: z.record(z.string(), z.unknown()).nullable().optional(),
  dependents: z.array(z.record(z.string(), z.unknown())), source_documents: z.array(z.record(z.string(), z.unknown())),
  forms: z.object({
    w2: z.array(sourceRecord.passthrough()), form_1099_nec: z.array(sourceRecord.passthrough()),
    form_1099_misc: z.array(sourceRecord.passthrough()), form_1099_int: z.array(sourceRecord.passthrough()),
    form_1099_div: z.array(sourceRecord.passthrough()),
  }),
  activities: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))), mappings: z.array(z.record(z.string(), z.unknown())),
  payments: z.record(z.string(), z.unknown()), review_points: z.array(z.record(z.string(), z.unknown())), metadata: z.record(z.string(), z.unknown()),
});

export type CanonicalTaxReturn = z.infer<typeof canonicalTaxReturnSchema>;
export { decimalString };
