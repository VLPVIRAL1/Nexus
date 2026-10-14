export const coverageSurfaces2025 = [
  "manual",
  "json",
  "persistence",
  "calculation",
  "trace",
  "pdf",
  "xlsx",
  "unit",
  "database",
  "browser",
] as const;

export type CoverageSurface2025 = (typeof coverageSurfaces2025)[number];
export type CoverageState2025 = "implemented" | "blocked" | "deferred";

export interface CoverageEntry2025 {
  id: string;
  title: string;
  facts: readonly string[];
  forms: readonly string[];
  state: CoverageState2025;
  surfaces: Record<CoverageSurface2025, boolean>;
  blockerCode?: string;
  scopeNote?: string;
}

const complete = Object.fromEntries(coverageSurfaces2025.map((surface) => [surface, true])) as Record<CoverageSurface2025, boolean>;
const pending = Object.fromEntries(coverageSurfaces2025.map((surface) => [surface, false])) as Record<CoverageSurface2025, boolean>;

export const coverageLedger2025: readonly CoverageEntry2025[] = [
  implemented("core-return", "Core Form 1040 return", ["filing_profile", "taxpayer", "spouse", "dependents", "forms.W2", "forms.1099-INT", "forms.1099-DIV"], ["Form 1040", "Schedule B"]),
  implemented("itemized-dependent", "Schedule A and dependent credits", ["schedule_a", "standard_deduction_facts", "dependents"], ["Schedule A", "Schedule 8812"]),
  implemented("social-security", "Social Security and tier-1 railroad benefits", ["forms.SSA-1099", "forms.RRB-1099"], ["Form 1040", "Social Security Benefits Worksheet"]),
  implemented("amt", "Alternative Minimum Tax", ["advanced_federal.adjustments.alternativeMinimumTax"], ["Form 6251", "Schedule 2", "Form 1040"]),
  implemented("federal-credits", "EITC, care and education credits", ["credits", "forms.1098-T"], ["Schedule EIC", "Form 2441", "Form 8863", "Schedule 3", "Form 1040"]),
  implemented("due-diligence", "Paid-preparer due diligence", ["advanced_federal.dueDiligence"], ["Form 8867"]),
  implemented("base-ptc", "Base Premium Tax Credit reconciliation", ["advanced_federal.premiumTaxCredit", "forms.1095-A"], ["Form 8962", "Schedule 2", "Schedule 3", "Form 1040"]),
  implemented("base-adjustments-payments", "Schedule 1 adjustments and federal payments", ["advanced_federal.adjustments", "advanced_federal.payments", "forms.1098-E", "forms.1099-SA", "forms.5498-SA"], ["Schedule 1", "Schedule 3", "Form 8889", "Form 1040"]),
  implemented("additional-medicare", "Additional Medicare Tax", ["forms.W2.federal.box5", "forms.W2.federal.box6", "schedule_c", "schedule_f", "advanced_federal.adjustments.additionalMedicareTax"], ["Form 8959", "Schedule 2", "Form 1040"]),
  implemented("niit", "Net Investment Income Tax", ["forms.1099-INT", "forms.1099-DIV", "forms.1099-B", "schedule_e", "advanced_federal.adjustments.netInvestmentIncomeTax"], ["Form 8960", "Schedule 2", "Form 1040"]),
  implemented("ira-basis", "Nondeductible IRA basis and distributions", ["advanced_federal.adjustments.ira", "advanced_federal.adjustments.iraBasis", "forms.1099-R", "forms.5498"], ["Form 8606", "Form 1040"]),
  implemented("complex-retirement", "Complex retirement distributions", ["advanced_federal.adjustments.retirementDistributions", "forms.1099-R"], ["Retirement Distribution Worksheet", "Form 5329", "Schedule 2", "Form 1040"]),
  implemented("self-employed-retirement", "Self-employed SEP, SIMPLE and qualified-plan contributions", ["advanced_federal.adjustments.retirementPlan", "activities.schedule_c", "activities.schedule_f"], ["Schedule 1", "Form 1040"]),
  implemented("capital-carryovers", "Capital adjustments and loss carryovers", ["forms.1099-B", "forms.1099-DIV", "advanced_federal.adjustments.capitalGains"], ["Form 8949", "Schedule D", "Schedule D Tax Worksheet", "Form 1040"]),
  blocked("complex-qbi", "Complex qualified business income", ["schedule_c", "schedule_e", "schedule_f", "forms.1099-DIV.boxes.section199ADividends"], ["Form 8995-A", "Form 1040"], "FORM_8995_A_REQUIRED"),
  blocked("business-completion", "Business, rental and farm completion", ["activities.schedule_c", "activities.schedule_e", "activities.schedule_f"], ["Schedule C", "Schedule E", "Schedule F", "Form 4562", "Form 8829", "Form 6198", "Form 8582"], "BUSINESS_ADVANCED_TREATMENT_REQUIRED"),
  implemented("ptc-exceptions", "Premium Tax Credit exception workflows", ["advanced_federal.premiumTaxCredit", "forms.1095-A"], ["Form 8962", "Form 8962 Monthly Reconciliation", "Schedule 2", "Schedule 3", "Form 1040"]),
  deferred("state-local", "State and local returns", ["state_local"], [], "Deferred by product-owner direction on October 14, 2026; federal outputs must not imply state filing coverage."),
] as const;

export function coverageLedgerProblems2025(entries: readonly CoverageEntry2025[] = coverageLedger2025): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.id)) problems.push(`Duplicate coverage entry: ${entry.id}`);
    ids.add(entry.id);
    if (!entry.facts.length) problems.push(`${entry.id} has no declared facts.`);
    if (entry.state === "implemented") {
      for (const surface of coverageSurfaces2025) if (!entry.surfaces[surface]) problems.push(`${entry.id} is implemented but missing ${surface}.`);
      if (entry.blockerCode) problems.push(`${entry.id} is implemented but still declares blocker ${entry.blockerCode}.`);
    } else {
      if (!entry.blockerCode) problems.push(`${entry.id} is ${entry.state} without an explicit blocker code.`);
      if (!entry.scopeNote) problems.push(`${entry.id} is ${entry.state} without a scope note.`);
      if (Object.values(entry.surfaces).some(Boolean)) problems.push(`${entry.id} is ${entry.state} but claims a completed surface.`);
    }
  }
  return problems;
}

function implemented(id: string, title: string, facts: readonly string[], forms: readonly string[]): CoverageEntry2025 {
  return { id, title, facts, forms, state: "implemented", surfaces: { ...complete } };
}

function blocked(id: string, title: string, facts: readonly string[], forms: readonly string[], blockerCode: string): CoverageEntry2025 {
  return { id, title, facts, forms, state: "blocked", surfaces: { ...pending }, blockerCode, scopeNote: "Scheduled for the next federal completion waves; the current engine must block instead of silently omitting this treatment." };
}

function deferred(id: string, title: string, facts: readonly string[], forms: readonly string[], scopeNote: string): CoverageEntry2025 {
  return { id, title, facts, forms, state: "deferred", surfaces: { ...pending }, blockerCode: "MODULE_DEFERRED_BY_PRODUCT_SCOPE", scopeNote };
}
