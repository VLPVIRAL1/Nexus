import ExcelJS from "exceljs";
import type { CanonicalTaxReturnData } from "@/domain/canonical";
import type { Diagnostic } from "@/services/diagnostics";
import { neutralizeSpreadsheetText } from "@/services/redaction";

export interface WorkpaperInput {
  data: CanonicalTaxReturnData;
  runId: string;
  calculationStatus: "partial" | "complete_supported_draft";
  diagnostics: Diagnostic[];
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
  sourceIndex.columns = ["Ref", "File", "Form", "Issuer", "Recipient", "Status"].map((header) => ({ header, key: header.toLowerCase(), width: header === "File" ? 35 : 20 }));
  for (const document of input.data.sourceDocuments) sourceIndex.addRow({ ref: document.id, file: safe(document.fileName), form: document.documentType, issuer: safe(document.issuer ?? ""), recipient: document.recipientRole, status: document.disposition });
  addTable(sourceIndex, "SourceIndexTable");

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

  for (const sheet of workbook.worksheets) {
    sheet.autoFilter = sheet.rowCount > 1 ? { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } } : undefined;
    sheet.getRow(1).font = { bold: true };
    sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

function safe(value: string) { return neutralizeSpreadsheetText(value); }
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
