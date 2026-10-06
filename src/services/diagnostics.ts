import type { CanonicalTaxReturnData, SourceForm } from "@/domain/canonical";
import { phase1IntakeQuestions } from "@/domain/intake";
import { money } from "@/domain/money";

export type DiagnosticSeverity = "info" | "warning" | "error" | "blocking";
export type DiagnosticCategory = "structural" | "source_consistency" | "tax_logic" | "mapping" | "calculation_support" | "completeness";

export interface Diagnostic {
  code: string;
  severity: DiagnosticSeverity;
  category: DiagnosticCategory;
  recordId: string | null;
  fieldPath: string | null;
  message: string;
  resolutionAction: string;
}

export function validateReturn(data: CanonicalTaxReturnData): Diagnostic[] {
  const issues: Diagnostic[] = [];
  const answers = new Map(data.intakeAnswers.map((answer) => [answer.questionId, answer]));

  for (const question of phase1IntakeQuestions.filter((item) => item.required)) {
    const answer = answers.get(question.id);
    if (!answer || answer.answer === "unknown") {
      issues.push({
        code: `INTAKE_${question.id.toUpperCase().replaceAll(".", "_")}_UNKNOWN`, severity: "blocking", category: "completeness",
        recordId: answer?.id ?? null, fieldPath: `intake.${question.id}`, message: `Required intake answer is ${answer ? "unknown" : "missing"}: ${question.prompt}`,
        resolutionAction: "Answer the intake question and attach supporting evidence where appropriate.",
      });
    } else if (answer.answer === "yes" && !question.supportedWhenYes) {
      issues.push({
        code: `UNSUPPORTED_${question.id.toUpperCase().replaceAll(".", "_")}`, severity: "blocking", category: "calculation_support",
        recordId: answer.id, fieldPath: `intake.${question.id}`, message: `${question.affirmativeTreatment} is outside the Phase 1 calculation boundary.`,
        resolutionAction: "Retain the facts and prepare a partial draft until the treatment is implemented.",
      });
    }
  }

  for (const form of data.sourceForms) validateSourceForm(form, issues);

  for (const mapping of data.mappings) {
    const allocated = data.mappings.filter((item) => item.sourceRecordId === mapping.sourceRecordId && item.sourceField === mapping.sourceField && item.status !== "suggested")
      .reduce((sum, item) => sum.plus(item.allocatedAmount), money(0));
    if (allocated.gt(mapping.sourceAmount)) {
      issues.push({ code: "MAPPING_OVER_ALLOCATED", severity: "blocking", category: "mapping", recordId: mapping.sourceRecordId, fieldPath: mapping.sourceField, message: `Accepted allocations ${allocated.toFixed(2)} exceed source amount ${mapping.sourceAmount}.`, resolutionAction: "Reduce or remove allocations until they reconcile exactly." });
    }
    const activity = data.activities.find((item) => item.id === mapping.targetActivityId);
    if (mapping.status !== "suggested" && activity?.implementationStatus === "mapping_only") {
      issues.push({ code: "MAPPING_TARGET_UNSUPPORTED", severity: "blocking", category: "calculation_support", recordId: mapping.sourceRecordId, fieldPath: mapping.sourceField, message: `${activity.name} is preserved as a mapping-only destination.`, resolutionAction: "Keep the mapping visible and issue a partial draft." });
    }
  }

  return dedupeDiagnostics(issues);
}

function validateSourceForm(form: SourceForm, issues: Diagnostic[]) {
  if (form.owner === "unknown" || !form.ownerPersonId) {
    issues.push({ code: "SOURCE_OWNER_UNKNOWN", severity: "blocking", category: "source_consistency", recordId: form.id, fieldPath: "owner", message: `${form.formType} ownership is unresolved.`, resolutionAction: "Assign the source to a year-specific person record." });
  }
  if (form.unmappedSourceFields.length > 0) {
    issues.push({ code: "UNKNOWN_SOURCE_FIELD", severity: "blocking", category: "calculation_support", recordId: form.id, fieldPath: "unmappedSourceFields", message: `${form.unmappedSourceFields.length} source field(s) have no classified treatment.`, resolutionAction: "Classify each field as consumed, informational, substantiated exclusion, or unsupported." });
  }
  if (form.formType === "1099-DIV" && form.boxes.qualifiedDividends && form.boxes.ordinaryDividends && money(form.boxes.qualifiedDividends).gt(form.boxes.ordinaryDividends)) {
    issues.push({ code: "DIV_QUALIFIED_GT_ORDINARY", severity: "blocking", category: "tax_logic", recordId: form.id, fieldPath: "boxes.qualifiedDividends", message: "Qualified dividends exceed ordinary dividends.", resolutionAction: "Verify the source Form 1099-DIV." });
  }
  if (form.formType === "W2") {
    for (const entry of form.box12) {
      if (!/^[A-Z]{1,2}$/.test(entry.code)) issues.push({ code: "W2_BOX12_INVALID_FORMAT", severity: "blocking", category: "source_consistency", recordId: form.id, fieldPath: `box12.${entry.id}.code`, message: `Box 12 code ${entry.code} has an invalid format.`, resolutionAction: "Verify the code against the 2025 W-2 source." });
    }
    for (const entry of form.box14.filter((item) => !item.classification)) {
      issues.push({ code: "W2_BOX14_UNCLASSIFIED", severity: "warning", category: "calculation_support", recordId: form.id, fieldPath: `box14.${entry.id}`, message: `Box 14 item ${entry.label} has no classified disposition.`, resolutionAction: "Choose an informational, supported, excluded, or unsupported disposition." });
    }
  }
}

function dedupeDiagnostics(issues: Diagnostic[]) {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = [issue.code, issue.recordId, issue.fieldPath].join(":");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
