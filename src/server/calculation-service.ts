import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type pg from "pg";
import { addMoney, asDecimalString, money } from "@/domain/money";
import { phase1IntakeQuestions } from "@/domain/intake";
import { authorize, type AuthorizationContext } from "@/services/authorization";
import { calculateFederalReturn2025, rulePackage2025, type CalculationInput2025, type PersonRole2025, type SupportedExpenseCategory, supportedExpenseCategories } from "@/tax-engine/2025";
import { WorkflowError } from "./client-workflow-service";
import { databasePool } from "./database";

const engineVersion = "nexus-federal-2025-v1";
const formRegistryVersion = "2025-supported-forms-v1";

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
  const [people, answersResult, attestation, dependents, sources, activities, mappings, externalBlockers, overrides] = await Promise.all([
    client.query<{ role: string }>("SELECT role FROM people WHERE tax_year_id=$1", [taxYearId]),
    client.query<{ question_id: string; answer: "yes" | "no" | "unknown" }>("SELECT DISTINCT ON (question_id) question_id,answer FROM intake_answers WHERE tax_year_id=$1 ORDER BY question_id,answer_revision DESC", [taxYearId]),
    client.query("SELECT 1 FROM completeness_attestations WHERE tax_year_id=$1 AND tax_year_revision=$2", [taxYearId, revision]),
    client.query("SELECT 1 FROM dependents WHERE tax_year_id=$1 LIMIT 1", [taxYearId]),
    client.query<{ id: string; form_type: string; owner_role: string; normalized_data: Record<string, unknown> }>("SELECT id,form_type,owner_role,normalized_data FROM source_form_records WHERE tax_year_id=$1 AND effective AND NOT void ORDER BY created_at,id", [taxYearId]),
    client.query<{ id: string; name: string; owner_role: string; receipt_basis: string | null; additional_receipts: string; details: Record<string, unknown> }>("SELECT id,name,owner_role,receipt_basis,additional_receipts::text,details FROM activities WHERE tax_year_id=$1 AND active AND activity_type='schedule_c' AND implementation_status='supported' ORDER BY name,id", [taxYearId]),
    client.query<{ target_activity_id: string; allocated_amount: string }>(`SELECT sm.target_activity_id,sm.allocated_amount::text FROM source_mappings sm JOIN source_form_records sfr ON sfr.id=sm.source_record_id WHERE sm.tax_year_id=$1 AND sm.effective AND sm.mapping_status IN ('accepted','reviewed') AND sm.target_type='schedule_c' AND sfr.effective AND NOT sfr.void`, [taxYearId]),
    client.query<{ code: string; message: string }>("SELECT code,message FROM validation_issues WHERE tax_year_id=$1 AND resolved_at IS NULL AND severity IN ('blocking','error') AND category <> 'calculation_engine' AND code <> 'OVERRIDE_RECALCULATION_REQUIRED' ORDER BY code", [taxYearId]),
    client.query<{ override_point: string; override_value: string }>("SELECT override_point,override_value::text FROM manual_overrides WHERE tax_year_id=$1 AND active AND override_status='approved'", [taxYearId]),
  ]);
  const answers = new Map(answersResult.rows.map(({ question_id, answer }) => [question_id, answer]));
  const answer = (id: string) => answers.get(id) ?? "unknown";
  const unsupportedApplicableTopics = phase1IntakeQuestions.filter((question) => {
    const value = answer(question.id);
    return value === "yes" ? !question.supportedWhenYes : value === "no" ? question.supportedWhenYes : false;
  }).map(({ affirmativeTreatment }) => affirmativeTreatment);
  unsupportedApplicableTopics.push(...externalBlockers.rows.map(({ code, message }) => `${code}: ${message}`));
  const roles = new Set(people.rows.map(({ role }) => role));
  const owner = (role: string): PersonRole2025 => role === "spouse" ? "spouse" : "taxpayer";
  const amountAt = (data: Record<string, unknown>, paths: string[]) => {
    for (const path of paths) { const value = objectAtPath(data, path); if (typeof value === "string" || typeof value === "number") { try { return asDecimalString(money(value)); } catch { /* continue */ } } }
    return "0.00" as const;
  };
  const sourcesByType = Map.groupBy(sources.rows, ({ form_type }) => form_type);
  const wages = (sourcesByType.get("W2") ?? []).map((source) => ({ id: source.id, owner: owner(source.owner_role), wages: amountAt(source.normalized_data, ["federal.box1", "box_1_wages_tips_other_compensation", "box1"]), federalWithholding: amountAt(source.normalized_data, ["federal.box2", "box_2_federal_income_tax_withheld", "box2"]), socialSecurityWages: amountAt(source.normalized_data, ["federal.box3", "box_3_social_security_wages", "box3"]) }));
  const interest = (sourcesByType.get("1099-INT") ?? []).map((source) => ({ id: source.id, payerName: stringAt(source.normalized_data, ["payer.name"]) ?? "Payer not named", ordinaryInterest: amountAt(source.normalized_data, ["boxes.interestIncome", "box_1_interest_income"]), treasuryInterest: amountAt(source.normalized_data, ["boxes.usSavingsBondInterest", "box_3_interest_on_us_savings_bonds_and_treasury_obligations"]), taxExemptInterest: amountAt(source.normalized_data, ["boxes.taxExemptInterest", "box_8_tax_exempt_interest"]), federalWithholding: amountAt(source.normalized_data, ["boxes.federalWithholding", "box_4_federal_income_tax_withheld"]) }));
  const dividends = (sourcesByType.get("1099-DIV") ?? []).map((source) => ({ id: source.id, payerName: stringAt(source.normalized_data, ["payer.name"]) ?? "Payer not named", ordinaryDividends: amountAt(source.normalized_data, ["boxes.ordinaryDividends", "box_1a_total_ordinary_dividends"]), qualifiedDividends: amountAt(source.normalized_data, ["boxes.qualifiedDividends", "box_1b_qualified_dividends"]), exemptInterestDividends: amountAt(source.normalized_data, ["boxes.exemptInterestDividends", "box_12_exempt_interest_dividends"]), section199ADividends: amountAt(source.normalized_data, ["boxes.section199ADividends", "box_5_section_199a_dividends"]), federalWithholding: amountAt(source.normalized_data, ["boxes.federalWithholding", "box_4_federal_income_tax_withheld"]) }));
  const mappedByActivity = new Map<string, string[]>();
  for (const mapping of mappings.rows) mappedByActivity.set(mapping.target_activity_id, [...(mappedByActivity.get(mapping.target_activity_id) ?? []), mapping.allocated_amount]);
  const scheduleCActivities = activities.rows.map((activity) => {
    const details = activity.details ?? {};
    const rawExpenses = details.expenses && typeof details.expenses === "object" && !Array.isArray(details.expenses) ? details.expenses as Record<string, unknown> : {};
    const expenses = Object.fromEntries(supportedExpenseCategories.flatMap((category) => typeof rawExpenses[category] === "string" || typeof rawExpenses[category] === "number" ? [[category, asDecimalString(money(rawExpenses[category] as string | number))]] : [])) as Partial<Record<SupportedExpenseCategory, string>>;
    return { id: activity.id, name: activity.name, owner: owner(activity.owner_role), grossReceipts: addMoney([...(mappedByActivity.get(activity.id) ?? []), activity.additional_receipts]), expenses, qbiEligible: details.qbiEligible === true, receiptBasis: "source_plus_additional_receipts" as const };
  });
  const businessWithholding = [...(sourcesByType.get("1099-NEC") ?? []), ...(sourcesByType.get("1099-MISC") ?? [])].map((source) => ({ sourceId: source.id, sourceType: source.form_type as "1099-NEC" | "1099-MISC", federalWithholding: amountAt(source.normalized_data, ["boxes.federalWithholding", "box_4_federal_income_tax_withheld"]) }));
  const override = overrides.rows.find(({ override_point }) => override_point === "form-1040.income-tax");
  return {
    calculationId, inputRevision: revision, filingStatus: roles.has("spouse") ? "married_filing_jointly" : "single",
    eligibility: {
      fullYearUsResident: answer("identity.full_year_resident") === "yes", claimableAsDependent: answer("identity.claimable_dependent") !== "no", hasDependents: Boolean(dependents.rowCount), taxpayerAge65OrOlder: answer("identity.age_or_blindness") !== "no", taxpayerBlind: answer("identity.age_or_blindness") !== "no", spouseAge65OrOlder: roles.has("spouse") && answer("identity.age_or_blindness") !== "no", spouseBlind: roles.has("spouse") && answer("identity.age_or_blindness") !== "no", usesItemizedDeductions: answer("deductions.itemize") !== "no", allRequiredIntakeAnswered: phase1IntakeQuestions.every(({ id }) => answers.has(id) && answer(id) !== "unknown"), documentsCompleteAttested: Boolean(attestation.rowCount), unsupportedApplicableTopics,
      treatmentScreens: { earnedIncomeCredit: screen(answer("deductions.credits")), otherCredits: screen(answer("deductions.credits")), alternativeMinimumTax: screen(answer("taxes.alternative_minimum")), netInvestmentIncomeTax: screen(answer("taxes.net_investment_income")), additionalMedicareTax: screen(answer("taxes.additional_medicare")), schedule1AAdditionalDeductions: screen(answer("deductions.schedule1a")), estimatedOrExtensionPayments: screen(answer("payments.other")), specialFilingElection: screen(answer("identity.special_election")) },
    },
    scheduleBScreening: { foreignAccount: answer("schedule_b.foreign_account"), foreignTrust: answer("schedule_b.foreign_trust"), otherScheduleBTrigger: answer("schedule_b.other_trigger") },
    wages, interest, dividends, scheduleCActivities, businessWithholding,
    ...(override ? { approvedOverrides: { form1040IncomeTax: override.override_value } } : {}),
  };
}

function screen(value: "yes" | "no" | "unknown") { return value === "yes" ? "applies" as const : value === "no" ? "ruled_out" as const : "unknown" as const; }
function objectAtPath(value: Record<string, unknown>, path: string): unknown { return path.split(".").reduce<unknown>((current, segment) => current && typeof current === "object" && !Array.isArray(current) ? (current as Record<string, unknown>)[segment] : undefined, value); }
function stringAt(value: Record<string, unknown>, paths: string[]) { for (const path of paths) { const found=objectAtPath(value,path); if(typeof found==="string"&&found.trim()) return found.trim(); } return null; }
function canonicalJson(value: unknown): string { if(Array.isArray(value))return`[${value.map(canonicalJson).join(",")}]`;if(value&&typeof value==="object")return`{${Object.entries(value as Record<string,unknown>).filter(([,child])=>child!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([key,child])=>`${JSON.stringify(key)}:${canonicalJson(child)}`).join(",")}}`;return JSON.stringify(value); }
async function refreshCalculationDiagnostics(client:pg.PoolClient,taxYearId:string,revision:number,diagnostics:Array<{code:string;severity:string;message:string;path:string|null}>,approval:string){await client.query("UPDATE validation_issues SET resolved_revision=$2,resolved_at=now(),resolution='Superseded by current calculation run' WHERE tax_year_id=$1 AND category='calculation_engine' AND resolved_at IS NULL",[taxYearId,revision]);for(const diagnostic of diagnostics)await client.query("INSERT INTO validation_issues(tax_year_id,code,severity,category,field_path,message,resolution_action,creation_revision) VALUES($1,$2,$3,'calculation_engine',$4,$5,'Resolve the cited dependency and run a new calculation.',$6)",[taxYearId,diagnostic.code,diagnostic.severity,diagnostic.path,diagnostic.message,revision]);if(approval!=="approved")await client.query("INSERT INTO validation_issues(tax_year_id,code,severity,category,message,resolution_action,creation_revision) VALUES($1,'TAX_RULE_PACKAGE_UNAPPROVED','blocking','calculation_engine','The 2025 research rule package has not received independent tax-professional approval.','Obtain and record qualified independent tax-rule approval before a supported draft.',$2)",[taxYearId,revision]);}
async function authorizedTaxYear(client:pg.PoolClient,context:AuthorizationContext,clientId:string,year:number,action:"client.view"|"calculation.run",lock:boolean){const result=await client.query<{id:string;revision:number;firm_id:string;calculation_status:string}>(`SELECT ty.id,ty.revision,c.firm_id,ty.calculation_status FROM tax_years ty JOIN clients c ON c.id=ty.client_id WHERE c.id=$1 AND ty.tax_year=$2 AND c.firm_id=$3 AND c.archived_at IS NULL ${lock?"FOR UPDATE OF ty":""}`,[clientId,year,context.firmId]);const row=result.rows[0];if(!row)throw new WorkflowError("not_found","Tax year was not found.");if(!authorize(context,action,{firmId:row.firm_id,clientId}))throw new WorkflowError("forbidden","Calculation access is not permitted.");return{taxYearId:row.id,revision:row.revision,calculationStatus:row.calculation_status};}
function assertRevision(current:number,expected:number){if(current!==expected)throw new WorkflowError("conflict",`Tax year changed from revision ${expected} to ${current}; reload before calculating.`);}
async function appendAuditEvent(client:pg.PoolClient,context:AuthorizationContext,taxYearId:string,eventType:string,recordType:string,recordId:string,metadata:Record<string,unknown>){await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[context.firmId]);const previous=await client.query<{event_hash:string}>("SELECT event_hash FROM audit_events WHERE firm_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1",[context.firmId]);const previousHash=previous.rows[0]?.event_hash??null;const payload=JSON.stringify({firmId:context.firmId,taxYearId,actorId:context.userId,eventType,recordType,recordId,metadata,previousHash});const eventHash=createHash("sha256").update(payload).digest("hex");await client.query("INSERT INTO audit_events(firm_id,tax_year_id,actor_id,event_type,record_type,record_id,metadata,previous_hash,event_hash) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)",[context.firmId,taxYearId,context.userId,eventType,recordType,recordId,JSON.stringify(metadata),previousHash,eventHash]);}
async function inTransaction<T>(work:(client:pg.PoolClient)=>Promise<T>){const client=await databasePool().connect();try{await client.query("BEGIN");const result=await work(client);await client.query("COMMIT");return result;}catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}}
