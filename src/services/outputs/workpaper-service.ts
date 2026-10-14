import ExcelJS from "exceljs";
import type { CanonicalTaxReturnData } from "@/domain/canonical";
import type { Diagnostic } from "@/services/diagnostics";
import { neutralizeSpreadsheetText } from "@/services/redaction";
import type { CalculationOutput2025 } from "@/tax-engine/2025";

export interface WorkpaperOverride {
  overridePoint: string;
  engineValue: string;
  overrideValue: string;
  reason: string;
  evidence: string;
  requestedBy: string;
  approvedBy: string | null;
  status: string;
}

export interface WorkpaperInput {
  data: CanonicalTaxReturnData;
  runId: string;
  calculationStatus: "partial" | "complete_supported_draft";
  diagnostics: Diagnostic[];
  calculationResult?: CalculationOutput2025 | Record<string, unknown>;
  requiredForms?: string[];
  renderedForms?: string[];
  overrides?: WorkpaperOverride[];
}

export async function generateWorkpaper(input: WorkpaperInput): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Nexus Tax";
  workbook.subject = "DRAFT — NOT FOR FILING";
  workbook.properties.date1904 = false;

  const cover = workbook.addWorksheet("Cover & Tax Summary", { views: [{ state: "frozen", ySplit: 5 }] });
  cover.columns = [{ width: 27 }, { width: 55 }];
  cover.addRows([
    ["NEXUS TAX WORKPAPER", "DRAFT — NOT FOR FILING"],
    ["Tax year", input.data.taxYear], ["Input revision", input.data.revision], ["Calculation run", input.runId],
    ["Support status", input.calculationStatus === "partial" ? "Partial — approval disabled" : "Complete supported draft"],
    ["Workbook note", "This workbook supplements the engine. Editing it does not update the application."],
  ]);
  styleHeader(cover.getRow(1));

  const sourceIndex = workbook.addWorksheet("Source Index", { views: [{ state: "frozen", ySplit: 1 }] });
  sourceIndex.columns = ["Ref", "File", "Form", "Issuer", "Recipient", "Key information", "Return destination", "Status"].map((header) => ({ header, key: key(header), width: header === "File" || header === "Key information" ? 35 : 20 }));
  for (const document of input.data.sourceDocuments) {
    const related = input.data.sourceForms.filter(({ sourceDocumentId }) => sourceDocumentId === document.id);
    sourceIndex.addRow({ ref: document.id, file: safe(document.fileName), form: document.documentType, issuer: safe(document.issuer ?? ""), recipient: document.recipientRole, key_information: safe(related.map(sourceKeyInformation).filter(Boolean).join("; ")), return_destination: safe(related.map(sourceDestination).filter(Boolean).join("; ")), status: document.disposition });
  }
  addTable(sourceIndex, "SourceIndexTable");

  const income = workbook.addWorksheet("Income & Withholding", { views: [{ state: "frozen", ySplit: 1 }] });
  income.columns = ["Source", "File", "Form", "Owner", "Gross income", "Qualified amount", "Federal withholding", "State withholding", "Return destination", "Review status"].map((header) => ({ header, key: key(header), width: header === "File" || header === "Return destination" ? 30 : 20 }));
  const documentNames = new Map(input.data.sourceDocuments.map(({ id, fileName }) => [id, fileName]));
  let grossTotal = 0; let qualifiedTotal = 0; let federalTotal = 0; let stateTotal = 0;
  for (const source of input.data.sourceForms) {
    const values = sourceSummary(source as unknown as Record<string, unknown>);
    grossTotal += values.grossIncome; qualifiedTotal += values.qualifiedAmount; federalTotal += values.federalWithholding; stateTotal += values.stateWithholding;
    income.addRow({ source: source.id, file: safe(documentNames.get(source.sourceDocumentId) ?? ""), form: source.formType, owner: source.owner, gross_income: values.grossIncome, qualified_amount: values.qualifiedAmount, federal_withholding: values.federalWithholding, state_withholding: values.stateWithholding, return_destination: values.destination, review_status: values.reviewStatus });
  }
  const totalRow = income.addRow({ source: "TOTAL", gross_income: totalValue("E", income.rowCount, grossTotal), qualified_amount: totalValue("F", income.rowCount, qualifiedTotal), federal_withholding: totalValue("G", income.rowCount, federalTotal), state_withholding: totalValue("H", income.rowCount, stateTotal) });
  totalRow.font = { bold: true };
  ["gross_income", "qualified_amount", "federal_withholding", "state_withholding"].forEach((column) => { income.getColumn(column).numFmt = "$#,##0.00;[Red]($#,##0.00)"; });
  addTable(income, "IncomeWithholdingTable");

  const findings = workbook.addWorksheet("Open Review Points", { views: [{ state: "frozen", ySplit: 1 }] });
  findings.columns = ["Severity", "Code", "Record", "Field", "Message", "Resolution action"].map((header) => ({ header, key: header.toLowerCase().replace(" ", "_"), width: header === "Message" || header === "Resolution action" ? 42 : 18 }));
  for (const issue of input.diagnostics) findings.addRow({ severity: issue.severity, code: issue.code, record: issue.recordId ?? "", field: issue.fieldPath ?? "", message: safe(issue.message), resolution_action: safe(issue.resolutionAction) });
  addTable(findings, "ReviewPointsTable");

  const reconciliation = workbook.addWorksheet("Mapping Reconciliation", { views: [{ state: "frozen", ySplit: 1 }] });
  reconciliation.columns = ["Source record", "Source field", "Source amount", "Target", "Allocated amount", "Status"].map((header) => ({ header, key: header.toLowerCase().replaceAll(" ", "_"), width: 22 }));
  for (const mapping of input.data.mappings) reconciliation.addRow({ source_record: mapping.sourceRecordId, source_field: mapping.sourceField, source_amount: Number(mapping.sourceAmount), target: mapping.targetType, allocated_amount: Number(mapping.allocatedAmount), status: mapping.status });
  reconciliation.getColumn("source_amount").numFmt = "$#,##0.00;[Red]($#,##0.00)";
  reconciliation.getColumn("allocated_amount").numFmt = "$#,##0.00;[Red]($#,##0.00)";
  addTable(reconciliation, "MappingReconciliationTable");

  const activities = workbook.addWorksheet("Schedule Activities", { views: [{ state: "frozen", ySplit: 1 }] });
  activities.columns = ["Activity", "Schedule", "Owner", "Coverage", "Additional receipts", "Active", "Version", "Form data JSON"].map((header) => ({ header, key: key(header), width: header === "Form data JSON" ? 70 : 22 }));
  for (const activity of input.data.activities) activities.addRow({ activity: safe(activity.name), schedule: activity.type.replace("schedule_", "Schedule ").toUpperCase(), owner: activity.owner, coverage: activity.implementationStatus, additional_receipts: Number(activity.additionalReceipts ?? 0), active: activity.active ? "Yes" : "No", version: activity.version ?? 1, form_data_json: safe(JSON.stringify(activity.formData ?? {})) });
  activities.getColumn("additional_receipts").numFmt = "$#,##0.00;[Red]($#,##0.00)";
  addTable(activities, "ScheduleActivitiesTable");

  const formStatus = workbook.addWorksheet("Required Forms", { views: [{ state: "frozen", ySplit: 1 }] });
  formStatus.columns = ["Form", "Required", "Rendered", "Status", "Calculation run"].map((header) => ({ header, key: key(header), width: header === "Calculation run" ? 38 : 22 }));
  const requiredForms = input.requiredForms ?? [];
  const renderedForms = input.renderedForms ?? [];
  for (const form of unique([...requiredForms, ...renderedForms])) formStatus.addRow({ form, required: requiredForms.includes(form) ? "Yes" : "No", rendered: renderedForms.includes(form) ? "Yes" : "No", status: !requiredForms.includes(form) || renderedForms.includes(form) ? "Rendered" : "Missing — package incomplete", calculation_run: input.runId });
  addTable(formStatus, "RequiredFormsTable");

  const unsupported = workbook.addWorksheet("Unsupported Treatments", { views: [{ state: "frozen", ySplit: 1 }] });
  unsupported.columns = ["Severity", "Code", "Field", "Message", "Resolution action"].map((header) => ({ header, key: key(header), width: header === "Message" || header === "Resolution action" ? 48 : 20 }));
  for (const issue of input.diagnostics.filter(isUnsupported)) unsupported.addRow({ severity: issue.severity, code: issue.code, field: issue.fieldPath ?? "", message: safe(issue.message), resolution_action: safe(issue.resolutionAction) });
  addTable(unsupported, "UnsupportedTreatmentsTable");

  const overrides = workbook.addWorksheet("Manual Overrides", { views: [{ state: "frozen", ySplit: 1 }] });
  overrides.columns = ["Override point", "Engine value", "Override value", "Reason", "Evidence", "Requested by", "Approved by", "Status"].map((header) => ({ header, key: key(header), width: header === "Reason" || header === "Evidence" ? 42 : 22 }));
  for (const override of input.overrides ?? []) overrides.addRow({ override_point: override.overridePoint, engine_value: Number(override.engineValue), override_value: Number(override.overrideValue), reason: safe(override.reason), evidence: safe(override.evidence), requested_by: safe(override.requestedBy), approved_by: safe(override.approvedBy ?? ""), status: override.status });
  overrides.getColumn("engine_value").numFmt = "$#,##0.00;[Red]($#,##0.00)";
  overrides.getColumn("override_value").numFmt = "$#,##0.00;[Red]($#,##0.00)";
  addTable(overrides, "ManualOverridesTable");

  const trace = workbook.addWorksheet("Calculation Trace", { views: [{ state: "frozen", ySplit: 1 }] });
  trace.columns = ["Node", "Form line", "Rule", "Operands", "Result", "Rounding", "Calculation run"].map((header) => ({ header, key: key(header), width: header === "Operands" ? 60 : header === "Calculation run" ? 38 : 24 }));
  for (const step of calculationTrace(input.calculationResult)) trace.addRow({ node: step.nodeId, form_line: step.formLine, rule: step.ruleId, operands: safe(JSON.stringify(step.operands)), result: Number(step.result), rounding: step.rounding, calculation_run: input.runId });
  trace.getColumn("result").numFmt = "$#,##0;[Red]($#,##0)";
  addTable(trace, "CalculationTraceTable");

  const additionalTaxes = workbook.addWorksheet("Additional Taxes", { views: [{ state: "frozen", ySplit: 1 }] });
  additionalTaxes.columns = ["Form", "Line or concept", "Source / calculation", "Amount", "Calculation run"].map((header) => ({ header, key: key(header), width: header === "Source / calculation" ? 52 : header === "Calculation run" ? 38 : 24 }));
  const calculatedForms = calculationForms(input.calculationResult);
  if (calculatedForms) {
    const rows: Array<[string, string, string, string]> = [
      ["Form 8959", "Medicare wages and tips", "W-2 box 5", calculatedForms.form8959.medicareWagesAndTips],
      ["Form 8959", "Self-employment wages", "Schedule SE net earnings", calculatedForms.form8959.selfEmploymentWages],
      ["Form 8959", "Filing-status threshold", "2025 rule package", calculatedForms.form8959.threshold],
      ["Form 8959", "Additional Medicare Tax", "0.9% of compensation above threshold", calculatedForms.form8959.additionalMedicareTax],
      ["Form 8959", "Additional Medicare withholding", "W-2 box 6 less regular 1.45% component", calculatedForms.form8959.additionalMedicareWithholding],
      ["Form 8960", "Gross investment income", "Interest, dividends, annuities, passive income, dispositions and other investment income", String(Number(calculatedForms.form8960.netInvestmentIncome) + Number(calculatedForms.form8960.investmentIncomeAdjustments) + Number(calculatedForms.form8960.investmentExpenses))],
      ["Form 8960", "Investment income adjustments", "Reviewed exclusions and disposition adjustments", calculatedForms.form8960.investmentIncomeAdjustments],
      ["Form 8960", "Properly allocable deductions", "Reviewed investment and passive deductions", calculatedForms.form8960.investmentExpenses],
      ["Form 8960", "Net investment income", "Gross income less adjustments and deductions", calculatedForms.form8960.netInvestmentIncome],
      ["Form 8960", "MAGI above threshold", "Modified AGI less filing-status threshold", calculatedForms.form8960.excessMagi],
      ["Form 8960", "Net Investment Income Tax", "3.8% of the lesser of net investment income or excess MAGI", calculatedForms.form8960.netInvestmentIncomeTax],
    ];
    for (const [form, line, source, value] of rows) additionalTaxes.addRow({ form, line_or_concept: line, source_calculation: source, amount: Number(value), calculation_run: input.runId });
  }
  additionalTaxes.getColumn("amount").numFmt = "$#,##0;[Red]($#,##0)";
  addTable(additionalTaxes, "AdditionalTaxesTable");

  const capital = workbook.addWorksheet("Capital Gains", { views: [{ state: "frozen", ySplit: 1 }] });
  capital.columns = ["Source / line", "Term", "Category", "Adjustment code", "Proceeds", "Basis", "Adjustment", "Gain or loss", "Calculation run"].map((header) => ({ header, key: key(header), width: header === "Source / line" ? 32 : header === "Calculation run" ? 38 : 20 }));
  if (calculatedForms) {
    for (const transaction of calculatedForms.form8949) capital.addRow({ source_line: transaction.transactionId, term: transaction.term, category: transaction.category, adjustment_code: transaction.adjustmentCode, proceeds: Number(transaction.proceeds), basis: Number(transaction.costBasis), adjustment: Number(transaction.adjustment) - Number(transaction.section1202Exclusion), gain_or_loss: Number(transaction.gainOrLoss), calculation_run: input.runId });
    capital.addRow({ source_line: "Schedule D carryover into 2025", term: "short", category: "carryover", gain_or_loss: -Number(calculatedForms.scheduleD.shortTermCarryover), calculation_run: input.runId });
    capital.addRow({ source_line: "Schedule D carryover into 2025", term: "long", category: "carryover", gain_or_loss: -Number(calculatedForms.scheduleD.longTermCarryover), calculation_run: input.runId });
    capital.addRow({ source_line: "2026 carryover", term: "short", category: "carryover", gain_or_loss: -Number(calculatedForms.scheduleD.nextYearShortTermCarryover), calculation_run: input.runId });
    capital.addRow({ source_line: "2026 carryover", term: "long", category: "carryover", gain_or_loss: -Number(calculatedForms.scheduleD.nextYearLongTermCarryover), calculation_run: input.runId });
  }
  for (const column of ["proceeds", "basis", "adjustment", "gain_or_loss"]) capital.getColumn(column).numFmt = "$#,##0;[Red]($#,##0)";
  addTable(capital, "CapitalGainsTable");

  const premiumTaxCredit = workbook.addWorksheet("Premium Tax Credit", { views: [{ state: "frozen", ySplit: 1 }] });
  premiumTaxCredit.columns = ["Month", "Enrollment premium", "SLCSP", "Household contribution", "Allowed PTC", "Advance PTC", "Difference", "Calculation run"].map((header) => ({ header, key: key(header), width: header === "Calculation run" ? 38 : 24 }));
  if (calculatedForms) for (const month of calculatedForms.form8962.months) premiumTaxCredit.addRow({ month: month.month, enrollment_premium: Number(month.premium), slcsp: Number(month.slcsp), household_contribution: Number(month.contribution), allowed_ptc: Number(month.allowedPtc), advance_ptc: Number(month.advancePtc), difference: Number(month.allowedPtc) - Number(month.advancePtc), calculation_run: input.runId });
  for (const column of ["enrollment_premium", "slcsp", "household_contribution", "allowed_ptc", "advance_ptc", "difference"]) premiumTaxCredit.getColumn(column).numFmt = "$#,##0;[Red]($#,##0)";
  addTable(premiumTaxCredit, "PremiumTaxCreditTable");

  const retirement = workbook.addWorksheet("Retirement & IRA", { views: [{ state: "frozen", ySplit: 1 }] });
  retirement.columns = ["Form", "Owner / source", "Line or concept", "Treatment", "Amount", "Calculation run"].map((header) => ({ header, key: key(header), width: header === "Line or concept" ? 42 : header === "Calculation run" ? 38 : 24 }));
  if (calculatedForms) {
    for (const basis of calculatedForms.form8606) {
      const rows: Array<[string, string]> = [
        ["Prior-year basis", basis.priorYearBasis],
        ["Current nondeductible contributions", basis.currentYearNondeductibleContributions],
        ["Total basis", basis.totalBasis],
        ["Distributions", basis.traditionalIraDistributions],
        ["Roth conversions", basis.rothConversions],
        ["Year-end IRA value", basis.yearEndTraditionalIraValue],
        ["Nontaxable amount", basis.nontaxableAmount],
        ["Taxable amount", basis.taxableAmount],
        ["Basis carryforward", basis.basisCarryforward],
      ];
      for (const [line, value] of rows) retirement.addRow({ form: "Form 8606", owner_source: basis.owner, line_or_concept: line, treatment: "Pro-rata basis", amount: Number(value), calculation_run: input.runId });
    }
    for (const distribution of calculatedForms.retirementWorksheets) {
      retirement.addRow({ form: "1099-R worksheet", owner_source: distribution.distributionId, line_or_concept: "Taxable distribution", treatment: distribution.treatment.replaceAll("_", " "), amount: Number(distribution.taxableAmount), calculation_run: input.runId });
      if (Number(distribution.rolloverAmount)) retirement.addRow({ form: "1099-R worksheet", owner_source: distribution.distributionId, line_or_concept: "Rollover", treatment: distribution.treatment.replaceAll("_", " "), amount: Number(distribution.rolloverAmount), calculation_run: input.runId });
      if (Number(distribution.qcdAmount)) retirement.addRow({ form: "1099-R worksheet", owner_source: distribution.distributionId, line_or_concept: "Qualified charitable distribution", treatment: distribution.treatment.replaceAll("_", " "), amount: Number(distribution.qcdAmount), calculation_run: input.runId });
      if (Number(distribution.additionalTax)) retirement.addRow({ form: "Form 5329", owner_source: distribution.distributionId, line_or_concept: "Additional tax", treatment: distribution.treatment.replaceAll("_", " "), amount: Number(distribution.additionalTax), calculation_run: input.runId });
    }
    retirement.addRow({ form: "Form 5329", owner_source: "Return total", line_or_concept: "Amount subject to additional tax", treatment: "Early distributions less reviewed exceptions", amount: Number(calculatedForms.form5329.amountSubjectToAdditionalTax), calculation_run: input.runId });
    retirement.addRow({ form: "Form 5329", owner_source: "Return total", line_or_concept: "Additional tax", treatment: "10%", amount: Number(calculatedForms.form5329.additionalTax), calculation_run: input.runId });
    retirement.addRow({ form: "Schedule 1", owner_source: "Return total", line_or_concept: "Self-employed retirement-plan deduction", treatment: "Reviewed plan limits", amount: Number(calculatedForms.schedule1.retirementPlanDeduction), calculation_run: input.runId });
  }
  retirement.getColumn("amount").numFmt = "$#,##0;[Red]($#,##0)";
  addTable(retirement, "RetirementIraTable");

  const rawFields = workbook.addWorksheet("Raw Source Fields", { views: [{ state: "frozen", ySplit: 1 }] });
  rawFields.columns = ["Source record", "Form", "Field kind", "Label", "Code", "Value", "Page", "Reason"].map((header) => ({ header, key: key(header), width: header === "Value" || header === "Reason" ? 40 : 20 }));
  for (const source of input.data.sourceForms) {
    for (const [fieldKind, fields] of [["Raw", source.rawFields], ["Unmapped", source.unmappedSourceFields]] as const) {
      for (const field of fields) rawFields.addRow({ source_record: source.id, form: source.formType, field_kind: fieldKind, label: safe(field.label), code: safe(field.code ?? ""), value: safe(field.value), page: field.page, reason: safe(field.reason ?? "") });
    }
  }
  addTable(rawFields, "RawSourceFieldsTable");

  for (const sheet of workbook.worksheets) {
    sheet.autoFilter = sheet.rowCount > 1 ? { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } } : undefined;
    sheet.getRow(1).font = { bold: true };
    sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

function safe(value: string) { return neutralizeSpreadsheetText(value); }
function key(value: string) { return value.toLowerCase().replaceAll(" ", "_"); }
function styleHeader(row: ExcelJS.Row) { row.font = { bold: true, color: { argb: "FFFFFFFF" } }; row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF17365D" } }; }
function addTable(sheet: ExcelJS.Worksheet, name: string) {
  if (sheet.rowCount < 1) return;
  const headerValues = sheet.getRow(1).values;
  const headers = Array.isArray(headerValues) ? headerValues.slice(1) : [];
  const rows = Array.from({ length: Math.max(0, sheet.rowCount - 1) }, (_, index) => {
    const values = sheet.getRow(index + 2).values;
    return Array.isArray(values) ? values.slice(1) : [];
  });
  sheet.addTable({ name, ref: "A1", headerRow: true, totalsRow: false, style: { theme: "TableStyleMedium2", showRowStripes: true }, columns: headers.map((value) => ({ name: String(value) })), rows });
}

function sourceKeyInformation(source: CanonicalTaxReturnData["sourceForms"][number]): string {
  const values = sourceSummary(source as unknown as Record<string, unknown>);
  return `${formatMoney(values.grossIncome)} income; ${formatMoney(values.federalWithholding)} federal withholding`;
}

function sourceDestination(source: CanonicalTaxReturnData["sourceForms"][number]): string {
  return sourceSummary(source as unknown as Record<string, unknown>).destination;
}

function sourceSummary(source: Record<string, unknown>) {
  const type = String(source.formType ?? "");
  const boxes = record(source.boxes);
  const federal = record(source.federal);
  let grossIncome = 0; let qualifiedAmount = 0; let federalWithholding = 0; let destination = "Review mapping";
  if (type === "W2") { grossIncome = numeric(federal.box1); federalWithholding = numeric(federal.box2); destination = "Form 1040 wages"; }
  if (type === "1099-NEC") { grossIncome = numeric(boxes.nonemployeeCompensation); federalWithholding = numeric(boxes.federalWithholding); destination = "Schedule C / mapping review"; }
  if (type === "1099-MISC") { grossIncome = sumKeys(boxes, ["rents", "royalties", "otherIncome", "fishingBoatProceeds", "medicalPayments", "substitutePayments", "cropInsuranceProceeds", "attorneyGrossProceeds", "nonqualifiedDeferredCompensation"]); federalWithholding = numeric(boxes.federalWithholding); destination = "Activity / Schedule 1 mapping review"; }
  if (type === "1099-INT") { grossIncome = numeric(boxes.interestIncome); federalWithholding = numeric(boxes.federalWithholding); destination = "Form 1040 interest / Schedule B"; }
  if (type === "1099-DIV") { grossIncome = numeric(boxes.ordinaryDividends); qualifiedAmount = numeric(boxes.qualifiedDividends); federalWithholding = numeric(boxes.federalWithholding); destination = "Form 1040 dividends / Schedule B"; }
  if (type === "1099-B") { grossIncome = numeric(boxes.proceeds) - numeric(boxes.costBasis) + numeric(boxes.adjustmentAmount); federalWithholding = numeric(boxes.federalWithholding); destination = "Form 8949 / Schedule D"; }
  if (type === "1099-G") { grossIncome = numeric(boxes.unemploymentCompensation); federalWithholding = numeric(boxes.federalWithholding); destination = "Schedule 1 unemployment"; }
  if (type === "1099-K") { grossIncome = numeric(boxes.grossPaymentAmount); federalWithholding = numeric(boxes.federalWithholding); destination = "Schedule C / mapping reconciliation"; }
  if (type === "1099-R") { grossIncome = numeric(boxes.taxableAmount); federalWithholding = numeric(boxes.federalWithholding); destination = boxes.iraSepSimple ? "Form 1040 IRA distributions" : "Form 1040 pensions and annuities"; }
  if (type === "1099-SA") { grossIncome = Math.max(0, numeric(boxes.grossDistribution) - numeric(boxes.qualifiedMedicalExpenses)); destination = "Form 8889 HSA distributions"; }
  const stateRows = Array.isArray(source.stateRows) ? source.stateRows : [];
  const stateWithholding = stateRows.reduce((total, row) => total + numeric(record(row).stateTaxWithheld), 0);
  return { grossIncome, qualifiedAmount, federalWithholding, stateWithholding, destination, reviewStatus: source.corrected ? "Corrected active version" : "Active" };
}

function calculationTrace(result: WorkpaperInput["calculationResult"]): Array<{ nodeId: string; formLine: string; ruleId: string; operands: Record<string, string>; result: string; rounding: string }> {
  if (!result || typeof result !== "object" || !("trace" in result) || !Array.isArray(result.trace)) return [];
  return result.trace as Array<{ nodeId: string; formLine: string; ruleId: string; operands: Record<string, string>; result: string; rounding: string }>;
}

function calculationForms(result: WorkpaperInput["calculationResult"]): CalculationOutput2025["forms"] {
  if (!result || typeof result !== "object" || !("status" in result) || result.status !== "calculated_draft" || !("forms" in result)) return null;
  return (result as CalculationOutput2025).forms;
}

function isUnsupported(issue: Diagnostic): boolean {
  return issue.category === "calculation_support" || /UNSUPPORTED|OUTSIDE_SUPPORTED|REVIEW_REQUIRED|RULE_PACKAGE/i.test(issue.code);
}

function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function numeric(value: unknown): number { const result = Number(value ?? 0); return Number.isFinite(result) ? result : 0; }
function sumKeys(values: Record<string, unknown>, keys: string[]): number { return keys.reduce((total, current) => total + numeric(values[current]), 0); }
function formatMoney(value: number): string { return value.toLocaleString("en-US", { style: "currency", currency: "USD" }); }
function totalValue(column: string, lastDataRow: number, result: number): number | ExcelJS.CellFormulaValue { return lastDataRow < 2 ? 0 : { formula: `SUM(${column}2:${column}${lastDataRow})`, result }; }
function unique(values: string[]): string[] { return [...new Set(values)]; }
