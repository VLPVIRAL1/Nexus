import { z } from "zod";
import { activityFormSchemas2025 } from "@/domain/activity-forms-2025";
import { federalCreditProfileSchema2025 } from "@/domain/federal-credits-2025";

const decimalString = z.string().regex(/^-?\d+\.\d{2}$/, "Use a decimal string with exactly two places");
const nonnegativeDecimalString = decimalString.refine((value) => !value.startsWith("-"), "Use a nonnegative decimal string");
const ownership = z.enum(["taxpayer", "spouse", "joint", "dependent", "unknown"]);
const filingStatus = z.enum(["single", "married_filing_jointly", "married_filing_separately", "head_of_household", "qualifying_surviving_spouse"]);
const personProfile = z.object({
  legal_name: z.string().trim().min(1).max(200).optional(),
  legalName: z.string().trim().min(1).max(200).optional(),
  date_of_birth: z.iso.date().nullable().optional(),
  dateOfBirth: z.iso.date().nullable().optional(),
  occupation: z.string().trim().max(200).optional(),
  address: z.record(z.string(), z.unknown()).optional(),
  facts: z.record(z.string(), z.unknown()).optional(),
}).passthrough();
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
const activityBase = { id: z.uuid(), name: z.string().trim().min(1).max(200), owner_role: z.enum(["taxpayer", "spouse"]), implementation_status: z.enum(["supported", "mapping_only"]), additional_receipts: nonnegativeDecimalString, receipt_note: z.string().trim().max(2000).nullable(), active: z.boolean(), version: z.int().positive() };
const scheduleCActivity = z.object({ ...activityBase, form_data: activityFormSchemas2025.schedule_c }).strict();
const noAdditionalReceipts = (activity: { additional_receipts: string }, context: z.core.$RefinementCtx) => {
  if (Number(activity.additional_receipts) !== 0) context.addIssue({ code: "custom", path: ["additional_receipts"], message: "Schedule E and F manual income belongs on the schedule income lines; additional receipts are reserved for Schedule C." });
};
const scheduleEActivity = z.object({ ...activityBase, form_data: activityFormSchemas2025.schedule_e }).strict().superRefine(noAdditionalReceipts);
const scheduleFActivity = z.object({ ...activityBase, form_data: activityFormSchemas2025.schedule_f }).strict().superRefine(noAdditionalReceipts);
const otherIncomeActivity = z.object({ id: z.uuid(), name: z.string().trim().min(1).max(200), owner_role: z.enum(["taxpayer", "spouse"]), implementation_status: z.literal("mapping_only"), active: z.boolean(), version: z.int().positive() }).strict();

const rawField = z.object({
  id: z.uuid(), label: z.string().min(1), code: z.string().nullable().optional(),
  value: z.union([z.string(), decimalString]), page: z.int().positive().nullable(), reason: z.string().nullable(),
});

const sourceRecord = z.object({
  id: z.uuid(), external_source_id: z.string().nullable(), source_document_id: z.uuid(), form_year: z.literal(2025),
  recipient_role: ownership, corrected: z.boolean(), void: z.boolean(), raw_fields: z.array(rawField),
  unmapped_source_fields: z.array(rawField), version: z.int().positive(),
});

const sourceMapping = z.object({
  id: z.uuid(), sourceRecordId: z.uuid(), sourceField: z.string().trim().min(1).max(200), sourceAmount: nonnegativeDecimalString,
  targetType: z.enum(["schedule_c", "schedule_e", "schedule_f", "schedule_1_other", "excluded"]), targetActivityId: z.uuid().nullable(),
  allocationMethod: z.enum(["amount", "percentage"]), allocatedAmount: nonnegativeDecimalString, percentage: nonnegativeDecimalString.nullable(),
  reason: z.string().trim().min(1).max(2000).nullable(), status: z.enum(["accepted", "reviewed"]), version: z.int().positive(),
}).strict().superRefine((mapping, context) => {
  if (mapping.targetType === "excluded" && (mapping.targetActivityId !== null || mapping.reason === null)) context.addIssue({ code: "custom", message: "An excluded mapping requires a reason and no target activity." });
  if (mapping.targetType !== "excluded" && mapping.targetActivityId === null) context.addIssue({ code: "custom", message: "A schedule mapping requires a target activity." });
  if (mapping.allocationMethod === "amount" && mapping.percentage !== null) context.addIssue({ code: "custom", message: "Amount mappings cannot include a percentage." });
  if (mapping.allocationMethod === "percentage" && (mapping.percentage === null || Number(mapping.percentage) <= 0 || Number(mapping.percentage) > 100)) context.addIssue({ code: "custom", message: "Percentage mappings require a percentage greater than 0 and no more than 100." });
});

export const canonicalTaxReturnSchema = z.object({
  schema_version: z.enum(["1.0.0", "1.1.0"]), tax_year: z.literal(2025), return_type: z.literal("1040"),
  _instructions: z.record(z.string(), z.unknown()).optional(), client: z.record(z.string(), z.unknown()),
  filing_profile: z.object({ status: filingStatus, eligibility_confirmed: z.boolean() }).strict(),
  taxpayer: personProfile, spouse: personProfile.nullable().optional(),
  dependents: z.array(dependent), schedule_a: scheduleA, credits: federalCreditProfileSchema2025.optional(), source_documents: z.array(z.record(z.string(), z.unknown())),
  forms: z.object({
    w2: z.array(sourceRecord.passthrough()), form_1099_nec: z.array(sourceRecord.passthrough()),
    form_1099_misc: z.array(sourceRecord.passthrough()), form_1099_int: z.array(sourceRecord.passthrough()),
    form_1099_div: z.array(sourceRecord.passthrough()),
    form_1099_b: z.array(sourceRecord.passthrough()), form_1099_g: z.array(sourceRecord.passthrough()),
    form_1099_k: z.array(sourceRecord.passthrough()), form_1099_r: z.array(sourceRecord.passthrough()),
    form_1099_sa: z.array(sourceRecord.passthrough()), form_1098_t: z.array(sourceRecord.passthrough()).optional(),
  }),
  activities: z.object({ schedule_c: z.array(scheduleCActivity), schedule_e: z.array(scheduleEActivity), schedule_f: z.array(scheduleFActivity), other_income: z.array(otherIncomeActivity) }).strict(), mappings: z.array(sourceMapping),
  payments: z.record(z.string(), z.unknown()), review_points: z.array(z.record(z.string(), z.unknown())), metadata: z.record(z.string(), z.unknown()),
});

export type CanonicalTaxReturn = z.infer<typeof canonicalTaxReturnSchema>;
export { decimalString };
