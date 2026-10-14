import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type pg from "pg";
import { addMoney, asDecimalString, money } from "@/domain/money";
import { parseActivityForm2025, type ScheduleCFormData2025, type ScheduleEFormData2025, type ScheduleFFormData2025 } from "@/domain/activity-forms-2025";
import { evaluateIntakeSupport2025, phase1IntakeQuestions } from "@/domain/intake";
import { emptyFederalCreditProfile2025, parseFederalCreditProfile2025 } from "@/domain/federal-credits-2025";
import { emptyAdvancedFederalProfile2025, parseAdvancedFederalProfile2025 } from "@/domain/advanced-federal-2025";
import { emptyStandardDeductionFacts2025, parseStandardDeductionFacts2025 } from "@/domain/standard-deduction-2025";
import { authorize, type AuthorizationContext } from "@/services/authorization";
import { calculateFederalReturn2025, rulePackage2025, type CalculationInput2025, type FilingStatus2025, type PersonRole2025, type ScheduleAInput2025 } from "@/tax-engine/2025";
import { emptyScheduleA2025 } from "./return-profile-service";
import { WorkflowError } from "./client-workflow-service";
import { databasePool } from "./database";

const engineVersion = "nexus-federal-2025-v8-amt-review";
const formRegistryVersion = "2025-supported-forms-v8-amt-review";

export async function runPersistedCalculation(context: AuthorizationContext, clientId: string, year: number, expectedRevision: number) {
  if (year !== 2025) throw new WorkflowError("invalid", "Only the 2025 federal calculation package is available.");
  return inTransaction(async (client) => {
    const scope = await authorizedTaxYear(client, context, clientId, year, "calculation.run", true);
    assertRevision(scope.revision, expectedRevision);
    const calculationId = randomUUID();
    const input = await assembleInput(client, scope.taxYearId, scope.revision, calculationId);
    const inputJson = canonicalJson(input);
    const { calculationId: _ephemeralCalculationId, ...hashableInput } = input;
    const inputHash = createHash("sha256").update(canonicalJson(hashableInput)).digest("hex");
    const existing = await client.query<{ id: string; calculation_status: string; result: unknown; result_hash: string | null }>("SELECT id,calculation_status,result,result_hash FROM calculation_runs WHERE tax_year_id=$1 AND input_hash=$2 AND engine_version=$3 AND rule_version=$4 ORDER BY created_at DESC LIMIT 1", [scope.taxYearId, inputHash, engineVersion, rulePackage2025.version]);
    if (existing.rows[0]) return { id: existing.rows[0].id, revision: scope.revision, status: existing.rows[0].calculation_status, result: existing.rows[0].result, resultHash: existing.rows[0].result_hash, replayed: true };

    const output = calculateFederalReturn2025(input);
    const status = output.status === "blocked" || output.rulePackageApproval !== "approved" ? "partial" : "complete";
    const resultJson = canonicalJson(output);
    const resultHash = createHash("sha256").update(resultJson).digest("hex");
    const inserted = await client.query<{ id: string }>(`INSERT INTO calculation_runs(id,tax_year_id,input_revision,input_hash,engine_version,rule_version,form_registry_version,calculation_status,result,input_snapshot,requested_by_id,result_hash,completed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,now()) RETURNING id`, [calculationId, scope.taxYearId, scope.revision, inputHash, engineVersion, rulePackage2025.version, formRegistryVersion, status, resultJson, inputJson, context.userId, resultHash]);
    if (!inserted.rows[0]) throw new Error("Calculation snapshot insert failed.");
    await refreshCalculationDiagnostics(client, scope.taxYearId, scope.revision, output.diagnostics, output.rulePackageApproval);
    await client.query("UPDATE tax_years SET calculation_status=$2,validation_status=$3 WHERE id=$1", [scope.taxYearId, status, status === "complete" ? "validated" : "incomplete"]);
    await client.query("UPDATE validation_issues SET resolved_revision=$2,resolved_at=now(),resolution='Current recalculation completed' WHERE tax_year_id=$1 AND code='OVERRIDE_RECALCULATION_REQUIRED' AND resolved_at IS NULL", [scope.taxYearId, scope.revision]);
    await appendAuditEvent(client, context, scope.taxYearId, "calculation.completed", "calculation_run", calculationId, { revision: scope.revision, inputHash, resultHash, status, outputStatus: output.status, engineVersion, ruleVersion: rulePackage2025.version });
    return { id: calculationId, revision: scope.revision, status, result: output, resultHash, replayed: false };
  });
}

export async function getCalculationState(context: AuthorizationContext, clientId: string, year: number) {
  const client = await databasePool().connect();
  try {
    const scope = await authorizedTaxYear(client, context, clientId, year, "client.view", false);
    const [run, issues] = await Promise.all([
      client.query<{ id: string; input_revision: number; input_hash: string; engine_version: string; rule_version: string; form_registry_version: string; calculation_status: string; result: Record<string, unknown>; result_hash: string | null; created_at: Date; completed_at: Date | null }>("SELECT id,input_revision,input_hash,engine_version,rule_version,form_registry_version,calculation_status,result,result_hash,created_at,completed_at FROM calculation_runs WHERE tax_year_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1", [scope.taxYearId]),
      client.query<{ code: string; severity: string; message: string; field_path: string | null }>("SELECT code,severity,message,field_path FROM validation_issues WHERE tax_year_id=$1 AND resolved_at IS NULL ORDER BY CASE severity WHEN 'blocking' THEN 0 WHEN 'error' THEN 1 ELSE 2 END,created_at", [scope.taxYearId]),
    ]);
    const row = run.rows[0];
    return { revision: scope.revision, calculationStatus: scope.calculationStatus, issues: issues.rows.map((issue) => ({ code: issue.code, severity: issue.severity, message: issue.message, fieldPath: issue.field_path })), latestRun: row ? { id: row.id, inputRevision: row.input_revision, current: row.input_revision === scope.revision, inputHash: row.input_hash, engineVersion: row.engine_version, ruleVersion: row.rule_version, formRegistryVersion: row.form_registry_version, status: row.calculation_status, result: row.result, resultHash: row.result_hash, createdAt: row.created_at.toISOString(), completedAt: row.completed_at?.toISOString() ?? null } : null };
  } finally { client.release(); }
}

async function assembleInput(client: pg.PoolClient, taxYearId: string, revision: number, calculationId: string): Promise<CalculationInput2025> {
  const [people, answersResult, attestation, dependents, profileResult, creditProfileResult, dueProfileResult, ptcProfileResult, adjustmentProfileResult, paymentProfileResult, packageProfileResult, dueSignatureResult, sources, activities, mappings, externalBlockers, overrides] = await Promise.all([
    client.query<{ role: string }>("SELECT role FROM people WHERE tax_year_id=$1", [taxYearId]),
    client.query<{ question_id: string; answer: "yes" | "no" | "unknown" }>("SELECT DISTINCT ON (question_id) question_id,answer FROM intake_answers WHERE tax_year_id=$1 ORDER BY question_id,answer_revision DESC", [taxYearId]),
    client.query("SELECT 1 FROM completeness_attestations WHERE tax_year_id=$1 AND tax_year_revision=$2", [taxYearId, revision]),
    client.query<{ id: string; legal_name: string; facts: Record<string, unknown> }>("SELECT id,legal_name,facts FROM dependents WHERE tax_year_id=$1 ORDER BY legal_name,id", [taxYearId]),
    client.query<{ filing_status: FilingStatus2025; filing_status_eligibility_confirmed: boolean; schedule_a: ScheduleAInput2025; standard_deduction_facts: unknown }>("SELECT filing_status,filing_status_eligibility_confirmed,schedule_a,standard_deduction_facts FROM return_profiles WHERE tax_year_id=$1", [taxYearId]),
    client.query<{ profile: unknown }>("SELECT profile FROM federal_credit_profiles WHERE tax_year_id=$1", [taxYearId]),
    client.query<{ profile: unknown; version: number }>("SELECT profile,version FROM due_diligence_profiles WHERE tax_year_id=$1", [taxYearId]),
    client.query<{ profile: unknown }>("SELECT profile FROM premium_tax_credit_profiles WHERE tax_year_id=$1", [taxYearId]),
    client.query<{ profile: unknown }>("SELECT profile FROM adjustment_profiles WHERE tax_year_id=$1", [taxYearId]),
    client.query<{ profile: unknown }>("SELECT profile FROM federal_payment_profiles WHERE tax_year_id=$1", [taxYearId]),
    client.query<{ preferences: unknown }>("SELECT preferences FROM output_package_preferences WHERE tax_year_id=$1", [taxYearId]),
    client.query<{ tax_year_revision: number; profile_version: number }>("SELECT tax_year_revision,profile_version FROM due_diligence_signatures WHERE tax_year_id=$1 AND invalidated_at IS NULL ORDER BY signed_at DESC,id DESC LIMIT 1", [taxYearId]),
    client.query<{ id: string; form_type: string; owner_role: string; normalized_data: Record<string, unknown> }>("SELECT id,form_type,owner_role,normalized_data FROM source_form_records WHERE tax_year_id=$1 AND effective AND NOT void AND record_disposition NOT IN ('void','duplicate_excluded') ORDER BY created_at,id", [taxYearId]),
    client.query<{ id: string; activity_type: "schedule_c"|"schedule_e"|"schedule_f"; name: string; owner_role: string; receipt_basis: string | null; additional_receipts: string; details: Record<string, unknown> }>("SELECT id,activity_type,name,owner_role,receipt_basis,additional_receipts::text,details FROM activities WHERE tax_year_id=$1 AND active AND activity_type IN ('schedule_c','schedule_e','schedule_f') AND implementation_status='supported' ORDER BY activity_type,name,id", [taxYearId]),
    client.query<{ source_record_id: string; source_field: string; target_type: "schedule_c"|"schedule_e"|"schedule_f"; target_activity_id: string; allocated_amount: string }>(`SELECT sm.source_record_id,sm.source_field,sm.target_type,sm.target_activity_id,sm.allocated_amount::text FROM source_mappings sm JOIN source_form_records sfr ON sfr.id=sm.source_record_id WHERE sm.tax_year_id=$1 AND sm.effective AND sm.mapping_status IN ('accepted','reviewed') AND sm.target_type IN ('schedule_c','schedule_e','schedule_f') AND sfr.effective AND NOT sfr.void AND sfr.record_disposition NOT IN ('void','duplicate_excluded')`, [taxYearId]),
    client.query<{ code: string; message: string }>("SELECT code,message FROM validation_issues WHERE tax_year_id=$1 AND resolved_at IS NULL AND severity IN ('blocking','error') AND category <> 'calculation_engine' AND code <> 'OVERRIDE_RECALCULATION_REQUIRED' ORDER BY code", [taxYearId]),
    client.query<{ override_point: string; override_value: string }>("SELECT override_point,override_value::text FROM manual_overrides WHERE tax_year_id=$1 AND active AND override_status='approved'", [taxYearId]),
  ]);
  const answers = new Map(answersResult.rows.map(({ question_id, answer }) => [question_id, answer]));
  const answer = (id: string) => answers.get(id) ?? "unknown";
  const unsupportedApplicableTopics: string[] = [];
  const roles = new Set(people.rows.map(({ role }) => role));
  const profile = profileResult.rows[0];
  const creditProfile = creditProfileResult.rows[0] ? parseFederalCreditProfile2025(creditProfileResult.rows[0].profile) : emptyFederalCreditProfile2025;
  const storedOr = <T>(stored: unknown, fallback: T): T => withDefaults(fallback, stored);
  const advancedProfile = parseAdvancedFederalProfile2025({
    schemaVersion: "2025.1",
    dueDiligence: storedOr(dueProfileResult.rows[0]?.profile, emptyAdvancedFederalProfile2025.dueDiligence),
    premiumTaxCredit: storedOr(ptcProfileResult.rows[0]?.profile, emptyAdvancedFederalProfile2025.premiumTaxCredit),
    adjustments: storedOr(adjustmentProfileResult.rows[0]?.profile, emptyAdvancedFederalProfile2025.adjustments),
    payments: storedOr(paymentProfileResult.rows[0]?.profile, emptyAdvancedFederalProfile2025.payments),
    formPackage: storedOr(packageProfileResult.rows[0]?.preferences, emptyAdvancedFederalProfile2025.formPackage),
  });
  const standardFacts = profile?.standard_deduction_facts
    ? parseStandardDeductionFacts2025(profile.standard_deduction_facts)
    : emptyStandardDeductionFacts2025;
  const ageBlindnessPresent = standardFacts.taxpayerAge65OrOlder || standardFacts.taxpayerBlind || standardFacts.spouseAge65OrOlder || standardFacts.spouseBlind;
  const intakeSupportIssues = evaluateIntakeSupport2025(answers, {
    premiumTaxCreditEnabled: advancedProfile.premiumTaxCredit.enabled,
    currentFederalPaymentPresent: advancedProfile.payments.payments.some(({ status }) => status === "current"),
    supportedScheduleEOrFActivityPresent: activities.rows.some(({ activity_type }) => activity_type === "schedule_e" || activity_type === "schedule_f"),
    claimableTaxpayerTreatmentPresent: standardFacts.taxpayerClaimableAsDependent,
    claimableTaxpayerTreatmentComplete: standardFacts.form8615ApplicabilityReviewed,
    ageBlindnessTreatmentPresent: ageBlindnessPresent,
    ageBlindnessTreatmentComplete: standardFacts.ageBlindnessFactsReviewed,
    socialSecurityBenefitPresent: sources.rows.some(({ form_type }) => form_type === "SSA-1099" || form_type === "RRB-1099"),
    alternativeMinimumTaxEnabled: advancedProfile.adjustments.alternativeMinimumTax.enabled,
    alternativeMinimumTaxComplete: advancedProfile.adjustments.alternativeMinimumTax.applicabilityReviewed,
  });
  unsupportedApplicableTopics.push(...intakeSupportIssues.map(({ message }) => message));
  unsupportedApplicableTopics.push(...externalBlockers.rows.map(({ code, message }) => `${code}: ${message}`));
  if (answer("credits.eitc") === "yes" && !creditProfile.eitc.enabled) unsupportedApplicableTopics.push("EITC intake applies, but the EITC credit interview has not been enabled and completed.");
  if (answer("credits.dependent_care") === "yes" && !creditProfile.dependentCare.enabled) unsupportedApplicableTopics.push("Dependent-care intake applies, but the Form 2441 profile has not been enabled and completed.");
  if (answer("credits.education") === "yes" && !creditProfile.education.enabled) unsupportedApplicableTopics.push("Education-credit intake applies, but the Form 8863 profile has not been enabled and completed.");
  const filingStatus = profile?.filing_status ?? (roles.has("spouse") ? "married_filing_jointly" : "single");
  const scheduleA = { ...emptyScheduleA2025, ...(profile?.schedule_a ?? {}) };
  const owner = (role: string): PersonRole2025 => role === "spouse" ? "spouse" : "taxpayer";
  const amountAt = (data: Record<string, unknown>, paths: string[]) => {
    for (const path of paths) { const value = objectAtPath(data, path); if (typeof value === "string" || typeof value === "number") { try { return asDecimalString(money(value)); } catch { /* continue */ } } }
    return "0.00" as const;
  };
  const sourcesByType = Map.groupBy(sources.rows, ({ form_type }) => form_type);
  const wages = (sourcesByType.get("W2") ?? []).map((source) => ({ id: source.id, owner: owner(source.owner_role), wages: amountAt(source.normalized_data, ["federal.box1", "box_1_wages_tips_other_compensation", "box1"]), federalWithholding: amountAt(source.normalized_data, ["federal.box2", "box_2_federal_income_tax_withheld", "box2"]), socialSecurityWages: amountAt(source.normalized_data, ["federal.box3", "box_3_social_security_wages", "box3"]), socialSecurityTaxWithheld: amountAt(source.normalized_data, ["federal.box4", "box_4_social_security_tax_withheld", "box4"]), medicareWagesAndTips: amountAt(source.normalized_data, ["federal.box5", "box_5_medicare_wages_and_tips", "box5"]), medicareTaxWithheld: amountAt(source.normalized_data, ["federal.box6", "box_6_medicare_tax_withheld", "box6"]) }));
  const employerDependentCareBenefits = addMoney((sourcesByType.get("W2") ?? []).map((source) => amountAt(source.normalized_data, ["federal.box10", "box_10_dependent_care_benefits", "box10"])));
  const interest = (sourcesByType.get("1099-INT") ?? []).map((source) => ({ id: source.id, payerName: stringAt(source.normalized_data, ["payer.name"]) ?? "Payer not named", ordinaryInterest: amountAt(source.normalized_data, ["boxes.interestIncome", "box_1_interest_income"]), treasuryInterest: amountAt(source.normalized_data, ["boxes.usSavingsBondInterest", "box_3_interest_on_us_savings_bonds_and_treasury_obligations"]), taxExemptInterest: amountAt(source.normalized_data, ["boxes.taxExemptInterest", "box_8_tax_exempt_interest"]), federalWithholding: amountAt(source.normalized_data, ["boxes.federalWithholding", "box_4_federal_income_tax_withheld"]) }));
  const dividends = (sourcesByType.get("1099-DIV") ?? []).map((source) => ({ id: source.id, payerName: stringAt(source.normalized_data, ["payer.name"]) ?? "Payer not named", ordinaryDividends: amountAt(source.normalized_data, ["boxes.ordinaryDividends", "box_1a_total_ordinary_dividends"]), qualifiedDividends: amountAt(source.normalized_data, ["boxes.qualifiedDividends", "box_1b_qualified_dividends"]), capitalGainDistributions: amountAt(source.normalized_data, ["boxes.capitalGainDistributions", "box_2a_total_capital_gain_distributions"]), unrecaptured1250Gain: amountAt(source.normalized_data, ["boxes.unrecaptured1250Gain"]), section1202Gain: amountAt(source.normalized_data, ["boxes.section1202Gain"]), collectiblesGain: amountAt(source.normalized_data, ["boxes.collectiblesGain"]), exemptInterestDividends: amountAt(source.normalized_data, ["boxes.exemptInterestDividends", "box_12_exempt_interest_dividends"]), section199ADividends: amountAt(source.normalized_data, ["boxes.section199ADividends", "box_5_section_199a_dividends"]), federalWithholding: amountAt(source.normalized_data, ["boxes.federalWithholding", "box_4_federal_income_tax_withheld"]) }));
  const brokerTransactions = (sourcesByType.get("1099-B") ?? []).map((source) => ({
    id: source.id, description: stringAt(source.normalized_data, ["boxes.description"]) ?? "",
    term: (stringAt(source.normalized_data, ["boxes.term"]) ?? "") as "short" | "long",
    proceeds: amountAt(source.normalized_data, ["boxes.proceeds"]), costBasis: amountAt(source.normalized_data, ["boxes.costBasis"]),
    federalWithholding: amountAt(source.normalized_data, ["boxes.federalWithholding"]), basisReportedToIrs: booleanAt(source.normalized_data, "boxes.basisReportedToIrs"),
    adjustmentAmount: amountAt(source.normalized_data, ["boxes.adjustmentAmount"]), adjustmentCode: stringAt(source.normalized_data, ["boxes.adjustmentCode"]) ?? "",
    accruedMarketDiscount: amountAt(source.normalized_data, ["boxes.accruedMarketDiscount"]), washSaleLossDisallowed: amountAt(source.normalized_data, ["boxes.washSaleLossDisallowed"]),
    collectiblesOrQof: booleanAt(source.normalized_data, "boxes.collectiblesOrQof"), lossNotAllowed: booleanAt(source.normalized_data, "boxes.lossNotAllowed"),
  }));
  const retirementDistributions = (sourcesByType.get("1099-R") ?? []).map((source) => ({
    id: source.id, owner: owner(source.owner_role), grossDistribution: amountAt(source.normalized_data, ["boxes.grossDistribution"]),
    taxableAmount: amountAt(source.normalized_data, ["boxes.taxableAmount"]), federalWithholding: amountAt(source.normalized_data, ["boxes.federalWithholding"]),
    distributionCode: stringAt(source.normalized_data, ["boxes.distributionCode"]) ?? "", iraSepSimple: booleanAt(source.normalized_data, "boxes.iraSepSimple"),
    taxableAmountNotDetermined: booleanAt(source.normalized_data, "boxes.taxableAmountNotDetermined"),
    employeeContributions: amountAt(source.normalized_data, ["boxes.employeeContributions"]),
    totalEmployeeContributions: amountAt(source.normalized_data, ["boxes.totalEmployeeContributions"]),
  }));
  const governmentPayments = (sourcesByType.get("1099-G") ?? []).map((source) => ({ id: source.id, unemploymentCompensation: amountAt(source.normalized_data, ["boxes.unemploymentCompensation"]), federalWithholding: amountAt(source.normalized_data, ["boxes.federalWithholding"]) }));
  const socialSecurityBenefits = [...(sourcesByType.get("SSA-1099") ?? []), ...(sourcesByType.get("RRB-1099") ?? [])].map((source) => ({
    id: source.id,
    owner: owner(source.owner_role),
    sourceType: source.form_type as "SSA-1099" | "RRB-1099",
    benefitsPaid: amountAt(source.normalized_data, ["boxes.benefitsPaid"]),
    benefitsRepaid: amountAt(source.normalized_data, ["boxes.benefitsRepaid"]),
    netBenefits: amountAt(source.normalized_data, ["boxes.netBenefits"]),
    federalWithholding: amountAt(source.normalized_data, ["boxes.federalWithholding"]),
    workersCompensationOffset: amountAt(source.normalized_data, ["boxes.workersCompensationOffset"]),
    lumpSumElectionApplies: booleanAt(source.normalized_data, "boxes.lumpSumElectionApplies"),
  }));
  const mappedByActivity = new Map<string, Array<{amount:string;sourceField:string;targetType:string}>>();
  const mappedBySource = new Map<string, string[]>();
  for (const mapping of mappings.rows) {
    mappedByActivity.set(mapping.target_activity_id, [...(mappedByActivity.get(mapping.target_activity_id) ?? []), {amount:mapping.allocated_amount,sourceField:mapping.source_field,targetType:mapping.target_type}]);
    if(mapping.target_type==="schedule_c")mappedBySource.set(mapping.source_record_id, [...(mappedBySource.get(mapping.source_record_id) ?? []), mapping.allocated_amount]);
    const normalizedField=mapping.source_field.replace(/[^a-z]/gi,"").toLowerCase();
    if(mapping.target_type==="schedule_e"&&!normalizedField.includes("rent")&&!normalizedField.includes("royalt"))unsupportedApplicableTopics.push(`Schedule E mapping ${mapping.source_record_id}.${mapping.source_field} is outside the supported rental/royalty source profile.`);
    if(mapping.target_type==="schedule_f"&&!normalizedField.includes("cropinsurance"))unsupportedApplicableTopics.push(`Schedule F mapping ${mapping.source_record_id}.${mapping.source_field} is outside the supported crop-insurance source profile.`);
  }
  const scheduleCActivities = activities.rows.filter((activity)=>activity.activity_type==="schedule_c").map((activity) => {
    const details=parseActivityForm2025("schedule_c",activity.details) as ScheduleCFormData2025;
    return { id: activity.id, name: activity.name, owner: owner(activity.owner_role), grossReceipts: addMoney([...(mappedByActivity.get(activity.id)??[]).map(({amount})=>amount),activity.additional_receipts]), returnsAndAllowances:details.income.returnsAndAllowances,costOfGoodsSold:addMoney([details.costOfGoodsSold.beginningInventory,details.costOfGoodsSold.purchases,details.costOfGoodsSold.costOfLabor,details.costOfGoodsSold.materialsAndSupplies,details.costOfGoodsSold.otherCosts,`-${details.costOfGoodsSold.endingInventory}`]),otherIncome:details.income.otherIncome,expenses:details.expenses,otherExpenses:addMoney(details.otherExpenses.map(({amount})=>amount)),homeOfficeDeduction:details.homeOffice.reviewedDeduction,accountingMethod:details.accountingMethod,vehicleUsed:details.vehicle.used,homeOfficeClaimed:details.homeOffice.claimed,vehicle:details.vehicle,homeOffice:details.homeOffice,assets:details.assets,lossLimitations:details.lossLimitations,qbiEligible:details.qbiEligible===true,selfEmploymentTreatmentConfirmed:details.selfEmploymentTreatmentConfirmed===true,receiptBasis:"source_plus_additional_receipts" as const };
  });
  const scheduleEActivities=activities.rows.filter((activity)=>activity.activity_type==="schedule_e").map((activity)=>{
    const details=parseActivityForm2025("schedule_e",activity.details) as ScheduleEFormData2025;const mapped=mappedByActivity.get(activity.id)??[];
    const normalized=(value:string)=>value.replace(/[^a-z]/gi,"").toLowerCase();const mappedRoyalties=mapped.filter(({sourceField})=>normalized(sourceField).includes("royalt")).map(({amount})=>amount);const mappedRents=mapped.filter(({sourceField})=>normalized(sourceField).includes("rent")).map(({amount})=>amount);
    return{id:activity.id,name:activity.name,owner:owner(activity.owner_role),rentsReceived:addMoney([...mappedRents,details.income.rentsReceived]),royaltiesReceived:addMoney([...mappedRoyalties,details.income.royaltiesReceived]),expenses:details.expenses,otherExpenses:addMoney(details.otherExpenses.map(({amount})=>amount)),propertyType:details.property.propertyType,personalUseDays:details.property.personalUseDays,qualifiedJointVenture:details.property.qualifiedJointVenture,allInvestmentAtRisk:details.allInvestmentAtRisk,passiveLossRulesReviewed:details.passiveLossRulesReviewed,depreciationReviewed:details.depreciationReviewed,rentalQbiEligible:details.rentalQbiEligible,supplementalActivityCount:details.partnershipsAndSCorporations.length+details.estatesAndTrusts.length,remicInterestCount:details.remicInterests.length,personalUseAllocationReviewed:details.personalUseAllocationReviewed,assets:details.assets,lossLimitations:details.lossLimitations,partnershipsAndSCorporations:details.partnershipsAndSCorporations,estatesAndTrusts:details.estatesAndTrusts,remicInterests:details.remicInterests};
  });
  const scheduleFActivities=activities.rows.filter((activity)=>activity.activity_type==="schedule_f").map((activity)=>{
    const details=parseActivityForm2025("schedule_f",activity.details) as ScheduleFFormData2025;const mapped=addMoney((mappedByActivity.get(activity.id)??[]).filter(({sourceField})=>sourceField.replace(/[^a-z]/gi,"").toLowerCase().includes("cropinsurance")).map(({amount})=>amount));
    return{id:activity.id,name:activity.name,owner:owner(activity.owner_role),income:{...details.income,cropInsuranceTaxable:addMoney([details.income.cropInsuranceTaxable,mapped])},expenses:details.expenses,otherExpenses:addMoney(details.otherExpenses.map(({amount})=>amount)),accountingMethod:details.accountingMethod,accrualAmounts:details.accrual,materiallyParticipated:details.materiallyParticipated,qbiEligible:details.qbiEligible,selfEmploymentTreatmentConfirmed:details.selfEmploymentTreatmentConfirmed,cropInsuranceElectionReviewed:details.cropInsuranceElectionReviewed,assets:details.assets,lossLimitations:details.lossLimitations};
  });
  const paymentCardReceipts = (sourcesByType.get("1099-K") ?? []).map((source) => ({ id: source.id, grossPaymentAmount: amountAt(source.normalized_data, ["boxes.grossPaymentAmount"]), mappedScheduleCAmount: addMoney(mappedBySource.get(source.id) ?? []), federalWithholding: amountAt(source.normalized_data, ["boxes.federalWithholding"]) }));
  const hsaDistributions = (sourcesByType.get("1099-SA") ?? []).map((source) => ({ id: source.id, owner: owner(source.owner_role), grossDistribution: amountAt(source.normalized_data, ["boxes.grossDistribution"]), qualifiedMedicalExpenses: amountAt(source.normalized_data, ["boxes.qualifiedMedicalExpenses"]), earningsOnExcessContributions: amountAt(source.normalized_data, ["boxes.earningsOnExcessContributions"]), distributionCode: stringAt(source.normalized_data, ["boxes.distributionCode"]) ?? "", accountType: (stringAt(source.normalized_data, ["boxes.accountType"]) ?? "") as "HSA" | "Archer MSA" | "Medicare Advantage MSA" }));
  const businessWithholding = [...(sourcesByType.get("1099-NEC") ?? []), ...(sourcesByType.get("1099-MISC") ?? [])].map((source) => ({ sourceId: source.id, sourceType: source.form_type as "1099-NEC" | "1099-MISC", federalWithholding: amountAt(source.normalized_data, ["boxes.federalWithholding", "box_4_federal_income_tax_withheld"]) }));
  addUnsupportedSourceFacts(unsupportedApplicableTopics, sources.rows);
  const override = overrides.rows.find(({ override_point }) => override_point === "form-1040.income-tax");
  return {
    calculationId, inputRevision: revision, filingStatus, filingStatusEligibilityConfirmed: profile?.filing_status_eligibility_confirmed ?? true, hasSpouse: roles.has("spouse"),
    dependents: dependents.rows.map((row) => ({ id: row.id, legalName: row.legal_name, dateOfBirth: String(row.facts.dateOfBirth ?? ""), relationship: String(row.facts.relationship ?? ""), monthsLivedWithTaxpayer: Number(row.facts.monthsLivedWithTaxpayer ?? 0), qualifiesAsDependent: row.facts.qualifiesAsDependent === true, qualifiesForChildTaxCredit: row.facts.qualifiesForChildTaxCredit === true, hasValidSsnForChildTaxCredit: row.facts.hasValidSsnForChildTaxCredit === true, qualifiesForOtherDependentCredit: row.facts.qualifiesForOtherDependentCredit === true, eligibilityReviewed: row.facts.eligibilityReviewed === true })),
    scheduleA,
    eligibility: {
      fullYearUsResident: answer("identity.full_year_resident") === "yes", claimableAsDependent: standardFacts.taxpayerClaimableAsDependent, form8615ApplicabilityReviewed: standardFacts.form8615ApplicabilityReviewed, form8615Required: standardFacts.form8615Required, hasDependents: Boolean(dependents.rowCount), taxpayerAge65OrOlder: standardFacts.taxpayerAge65OrOlder, taxpayerBlind: standardFacts.taxpayerBlind, spouseAge65OrOlder: standardFacts.spouseAge65OrOlder, spouseBlind: standardFacts.spouseBlind, ageBlindnessFactsReviewed: standardFacts.ageBlindnessFactsReviewed, mfsSpouseAdditionalDeductionEligible: standardFacts.mfsSpouseAdditionalDeductionEligible, usesItemizedDeductions: scheduleA.enabled || answer("deductions.itemize") === "yes", allRequiredIntakeAnswered: phase1IntakeQuestions.every(({ id }) => answers.has(id) && answer(id) !== "unknown"), documentsCompleteAttested: Boolean(attestation.rowCount), unsupportedApplicableTopics,
      treatmentScreens: { earnedIncomeCredit: "ruled_out", otherCredits: screen(answer("deductions.credits")), alternativeMinimumTax: screen(answer("taxes.alternative_minimum")), netInvestmentIncomeTax: screen(answer("taxes.net_investment_income")), additionalMedicareTax: screen(answer("taxes.additional_medicare")), schedule1AAdditionalDeductions: screen(answer("deductions.schedule1a")), estimatedOrExtensionPayments: screen(answer("payments.other")), specialFilingElection: screen(answer("identity.special_election")) },
    },
    scheduleBScreening: { foreignAccount: answer("schedule_b.foreign_account"), foreignTrust: answer("schedule_b.foreign_trust"), otherScheduleBTrigger: answer("schedule_b.other_trigger") },
    wages, interest, dividends, scheduleCActivities, scheduleEActivities, scheduleFActivities, businessWithholding, brokerTransactions, retirementDistributions, governmentPayments, socialSecurityBenefits, paymentCardReceipts, hsaDistributions,
    federalCredits: { ...creditProfile, employerDependentCareBenefits, valid1098TRecordIds: (sourcesByType.get("1098-T") ?? []).map(({ id }) => id) },
    advancedFederal: {
      ...advancedProfile,
      dueDiligenceSignatureCurrent: dueSignatureResult.rows.some((row) => row.tax_year_revision === revision && row.profile_version === (dueProfileResult.rows[0]?.version ?? 1)),
      valid1095ARecordIds: (sourcesByType.get("1095-A") ?? []).map(({ id }) => id),
      valid1098ERecordIds: (sourcesByType.get("1098-E") ?? []).map(({ id }) => id),
      validActivityIds: activities.rows.map(({ id }) => id),
    },
    ...(override ? { approvedOverrides: { form1040IncomeTax: override.override_value } } : {}),
  };
}

function screen(value: "yes" | "no" | "unknown") { return value === "yes" ? "applies" as const : value === "no" ? "ruled_out" as const : "unknown" as const; }
function withDefaults<T>(fallback:T,value:unknown):T{if(Array.isArray(fallback))return(Array.isArray(value)?value:fallback)as T;if(fallback&&typeof fallback==="object"){const supplied=value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};return Object.fromEntries(Object.entries(fallback as Record<string,unknown>).map(([key,child])=>[key,withDefaults(child,supplied[key])]))as T;}return(value===undefined?fallback:value)as T;}
function objectAtPath(value: Record<string, unknown>, path: string): unknown { return path.split(".").reduce<unknown>((current, segment) => current && typeof current === "object" && !Array.isArray(current) ? (current as Record<string, unknown>)[segment] : undefined, value); }
function stringAt(value: Record<string, unknown>, paths: string[]) { for (const path of paths) { const found=objectAtPath(value,path); if(typeof found==="string"&&found.trim()) return found.trim(); } return null; }
function booleanAt(value: Record<string, unknown>, path: string) { return objectAtPath(value, path) === true; }
function addUnsupportedSourceFacts(blockers:string[],sources:Array<{id:string;form_type:string;normalized_data:Record<string,unknown>}>){
  const amountIsPresent=(data:Record<string,unknown>,path:string)=>{const value=objectAtPath(data,path);return (typeof value==="string"||typeof value==="number")&&Number(value)!==0;};
  const fields:Record<string,string[]>={
    "1098-T":["boxes.priorYearAdjustment","boxes.priorYearScholarshipAdjustment","boxes.insuranceContractReimbursements"],
    "1099-NEC":["boxes.excessGoldenParachutePayments"],
    "1099-INT":["boxes.earlyWithdrawalPenalty","boxes.investmentExpenses","boxes.foreignTaxPaid","boxes.privateActivityBondInterest","boxes.marketDiscount","boxes.bondPremium","boxes.treasuryBondPremium","boxes.taxExemptBondPremium"],
    "1099-DIV":["boxes.section897OrdinaryDividends","boxes.section897CapitalGain","boxes.nondividendDistributions","boxes.investmentExpenses","boxes.foreignTaxPaid","boxes.cashLiquidationDistributions","boxes.noncashLiquidationDistributions","boxes.privateActivityBondInterestDividends"],
    "1099-B":["boxes.profitLossClosedContracts","boxes.unrealizedPriorYear","boxes.unrealizedCurrentYear","boxes.aggregateProfitLoss","boxes.bartering"],
    "1099-G":["boxes.stateLocalTaxRefunds","boxes.rtaaPayments","boxes.taxableGrants","boxes.agriculturePayments","boxes.marketGain"],
    "1099-R":["boxes.capitalGain","boxes.netUnrealizedAppreciation","boxes.otherAmount","boxes.allocableIrRothContribution"],
    "1099-SA":["boxes.fairMarketValueAtDeath"],
  };
  for(const source of sources){for(const path of fields[source.form_type]??[])if(amountIsPresent(source.normalized_data,path))blockers.push(`${source.form_type} ${source.id} contains unsupported nonzero ${path.replace("boxes.","")}.`);if(source.form_type==="1099-G"&&booleanAt(source.normalized_data,"boxes.tradeBusiness"))blockers.push(`1099-G ${source.id} is marked as a trade or business payment, which is outside the unemployment-only profile.`);if(source.form_type==="1099-R"&&(objectAtPath(source.normalized_data,"boxes.taxableAmount")==null||typeof objectAtPath(source.normalized_data,"boxes.iraSepSimple")!=="boolean"))blockers.push(`1099-R ${source.id} requires an explicit taxable amount and IRA/SEP/SIMPLE indicator.`);}
}
function canonicalJson(value: unknown): string { if(Array.isArray(value))return`[${value.map(canonicalJson).join(",")}]`;if(value&&typeof value==="object")return`{${Object.entries(value as Record<string,unknown>).filter(([,child])=>child!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([key,child])=>`${JSON.stringify(key)}:${canonicalJson(child)}`).join(",")}}`;return JSON.stringify(value); }
async function refreshCalculationDiagnostics(client:pg.PoolClient,taxYearId:string,revision:number,diagnostics:Array<{code:string;severity:string;message:string;path:string|null}>,approval:string){await client.query("UPDATE validation_issues SET resolved_revision=$2,resolved_at=now(),resolution='Superseded by current calculation run' WHERE tax_year_id=$1 AND category='calculation_engine' AND resolved_at IS NULL",[taxYearId,revision]);for(const diagnostic of diagnostics)await client.query("INSERT INTO validation_issues(tax_year_id,code,severity,category,field_path,message,resolution_action,creation_revision) VALUES($1,$2,$3,'calculation_engine',$4,$5,'Resolve the cited dependency and run a new calculation.',$6)",[taxYearId,diagnostic.code,diagnostic.severity,diagnostic.path,diagnostic.message,revision]);if(approval!=="approved")await client.query("INSERT INTO validation_issues(tax_year_id,code,severity,category,message,resolution_action,creation_revision) VALUES($1,'TAX_RULE_PACKAGE_UNAPPROVED','blocking','calculation_engine','The 2025 research rule package has not received independent tax-professional approval.','Obtain and record qualified independent tax-rule approval before a supported draft.',$2)",[taxYearId,revision]);}
async function authorizedTaxYear(client:pg.PoolClient,context:AuthorizationContext,clientId:string,year:number,action:"client.view"|"calculation.run",lock:boolean){const result=await client.query<{id:string;revision:number;firm_id:string;calculation_status:string}>(`SELECT ty.id,ty.revision,c.firm_id,ty.calculation_status FROM tax_years ty JOIN clients c ON c.id=ty.client_id WHERE c.id=$1 AND ty.tax_year=$2 AND c.firm_id=$3 AND c.archived_at IS NULL ${lock?"FOR UPDATE OF ty":""}`,[clientId,year,context.firmId]);const row=result.rows[0];if(!row)throw new WorkflowError("not_found","Tax year was not found.");if(!authorize(context,action,{firmId:row.firm_id,clientId}))throw new WorkflowError("forbidden","Calculation access is not permitted.");return{taxYearId:row.id,revision:row.revision,calculationStatus:row.calculation_status};}
function assertRevision(current:number,expected:number){if(current!==expected)throw new WorkflowError("conflict",`Tax year changed from revision ${expected} to ${current}; reload before calculating.`);}
async function appendAuditEvent(client:pg.PoolClient,context:AuthorizationContext,taxYearId:string,eventType:string,recordType:string,recordId:string,metadata:Record<string,unknown>){await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[context.firmId]);const previous=await client.query<{event_hash:string}>("SELECT event_hash FROM audit_events WHERE firm_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1",[context.firmId]);const previousHash=previous.rows[0]?.event_hash??null;const payload=JSON.stringify({firmId:context.firmId,taxYearId,actorId:context.userId,eventType,recordType,recordId,metadata,previousHash});const eventHash=createHash("sha256").update(payload).digest("hex");await client.query("INSERT INTO audit_events(firm_id,tax_year_id,actor_id,event_type,record_type,record_id,metadata,previous_hash,event_hash) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)",[context.firmId,taxYearId,context.userId,eventType,recordType,recordId,JSON.stringify(metadata),previousHash,eventHash]);}
async function inTransaction<T>(work:(client:pg.PoolClient)=>Promise<T>){const client=await databasePool().connect();try{await client.query("BEGIN");const result=await work(client);await client.query("COMMIT");return result;}catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}}
