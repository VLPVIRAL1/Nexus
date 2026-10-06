import type { Activity, DecimalString, SourceMapping } from "@/domain/canonical";
import { asDecimalString, money } from "@/domain/money";

export type MappingStatus = "unmapped" | "partially_mapped" | "fully_mapped" | "not_applicable" | "needs_review";

export interface MappingReconciliation {
  sourceAmount: DecimalString;
  allocatedAmount: DecimalString;
  excludedAmount: DecimalString;
  unresolvedAmount: DecimalString;
  status: MappingStatus;
}

export function reconcileMappings(sourceAmount: DecimalString, mappings: SourceMapping[]): MappingReconciliation {
  const source = money(sourceAmount);
  const accepted = mappings.filter((item) => item.status !== "suggested");
  const allocated = accepted.filter((item) => item.targetType !== "excluded").reduce((sum, item) => sum.plus(item.allocatedAmount), money(0));
  const excluded = accepted.filter((item) => item.targetType === "excluded").reduce((sum, item) => sum.plus(item.allocatedAmount), money(0));
  const unresolved = source.minus(allocated).minus(excluded);
  if (unresolved.lt(0)) throw new Error("MAPPING_OVER_ALLOCATED");
  const status: MappingStatus = unresolved.eq(0) ? (allocated.eq(0) && excluded.eq(source) ? "not_applicable" : "fully_mapped") : allocated.plus(excluded).eq(0) ? "unmapped" : "partially_mapped";
  return { sourceAmount, allocatedAmount: asDecimalString(allocated), excludedAmount: asDecimalString(excluded), unresolvedAmount: asDecimalString(unresolved), status };
}

export function validateMappingReferences(mapping: SourceMapping, activities: Activity[], taxYearSourceRecordIds: Set<string>): string[] {
  const errors: string[] = [];
  if (!taxYearSourceRecordIds.has(mapping.sourceRecordId)) errors.push("Source record does not belong to this tax year.");
  if (mapping.targetType !== "excluded") {
    const activity = activities.find((item) => item.id === mapping.targetActivityId);
    if (!activity) errors.push("Target activity does not exist.");
    else if (!activity.active) errors.push("Target activity is inactive.");
    else if (activity.type !== mapping.targetType) errors.push("Target type does not match the activity type.");
  } else if (!mapping.reason?.trim()) errors.push("A substantiated exclusion requires a reason.");
  if (money(mapping.allocatedAmount).lt(0)) errors.push("Negative allocation treatment is not supported.");
  return errors;
}
