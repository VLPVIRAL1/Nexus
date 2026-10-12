import { z } from "zod";

const decimalString = z.string().regex(/^-?\d+\.\d{2}$/, "Use a decimal string with exactly two places");
const ownership = z.enum(["taxpayer", "spouse", "joint", "dependent", "unknown"]);
const filingStatus = z.enum(["single", "married_filing_jointly", "married_filing_separately", "head_of_household", "qualifying_surviving_spouse"]);
const dependent = z.object({
  id: z.uuid(), legal_name: z.string().trim().min(1).max(200), date_of_birth: z.iso.date(), relationship: z.string().trim().min(1).max(100),
  months_lived_with_taxpayer: z.int().min(0).max(12), qualifies_as_dependent: z.boolean(), qualifies_for_child_tax_credit: z.boolean(),
  has_valid_ssn_for_child_tax_credit: z.boolean(), qualifies_for_other_dependent_credit: z.boolean(), eligibility_reviewed: z.boolean(),
}).strict();
const scheduleA = z.object({
  enabled: z.boolean(), married_filing_separately_spouse_itemizes: z.boolean().nullable(), medical_and_dental_expenses: decimalString,
  state_local_income_or_sales_taxes: decimalString, real_estate_taxes: decimalString, personal_property_taxes: decimalString, other_taxes: decimalString,
  home_mortgage_interest_and_points: decimalString, investment_interest: decimalString, cash_charitable_contributions: decimalString,
  noncash_charitable_contributions: decimalString, casualty_and_theft_losses: decimalString, other_itemized_deductions: decimalString,
  salt_eligibility_confirmed: z.boolean(), mortgage_limits_applied: z.boolean(), charity_limits_applied: z.boolean(), casualty_limits_applied: z.boolean(),
}).strict();

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
  filing_profile: z.object({ status: filingStatus, eligibility_confirmed: z.boolean() }).strict(),
  taxpayer: z.record(z.string(), z.unknown()), spouse: z.record(z.string(), z.unknown()).nullable().optional(),
  dependents: z.array(dependent), schedule_a: scheduleA, source_documents: z.array(z.record(z.string(), z.unknown())),
  forms: z.object({
    w2: z.array(sourceRecord.passthrough()), form_1099_nec: z.array(sourceRecord.passthrough()),
    form_1099_misc: z.array(sourceRecord.passthrough()), form_1099_int: z.array(sourceRecord.passthrough()),
    form_1099_div: z.array(sourceRecord.passthrough()),
    form_1099_b: z.array(sourceRecord.passthrough()), form_1099_g: z.array(sourceRecord.passthrough()),
    form_1099_k: z.array(sourceRecord.passthrough()), form_1099_r: z.array(sourceRecord.passthrough()),
    form_1099_sa: z.array(sourceRecord.passthrough()),
  }),
  activities: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))), mappings: z.array(z.record(z.string(), z.unknown())),
  payments: z.record(z.string(), z.unknown()), review_points: z.array(z.record(z.string(), z.unknown())), metadata: z.record(z.string(), z.unknown()),
});

export type CanonicalTaxReturn = z.infer<typeof canonicalTaxReturnSchema>;
export { decimalString };
