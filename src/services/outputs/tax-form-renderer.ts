import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export interface TaxFormLine {
  line: string;
  label: string;
  value: string;
  traceNodeId?: string;
}

export interface TaxFormData {
  formName: string;
  title: string;
  instanceLabel?: string;
  lines: TaxFormLine[];
}

export interface TaxFormRenderer {
  render(formData: TaxFormData, taxYear: number): Promise<Uint8Array>;
}

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const FIRST_ROW_Y = 644;
const ROW_HEIGHT = 28;
const ROWS_PER_PAGE = 18;

/**
 * Controlled, year-labelled facsimile used until an independently verified
 * official-template map is approved. It consumes calculated form data only;
 * no tax arithmetic is performed here.
 */
export class InternalPreviewTaxFormRenderer implements TaxFormRenderer {
  async render(formData: TaxFormData, taxYear: number): Promise<Uint8Array> {
    const document = await PDFDocument.create();
    const regular = await document.embedFont(StandardFonts.Helvetica);
    const bold = await document.embedFont(StandardFonts.HelveticaBold);
    const chunks = chunk(formData.lines, ROWS_PER_PAGE);
    const pages = chunks.length > 0 ? chunks : [[]];

    document.setTitle(`${taxYear} ${formData.formName} — Nexus internal preview`);
    document.setSubject("DRAFT — NOT FOR FILING");
    document.setCreator("Nexus Tax");
    document.setProducer("Nexus Tax controlled internal form renderer");

    pages.forEach((lines, pageIndex) => {
      const page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      drawHeader(page, regular, bold, formData, taxYear, pageIndex + 1, pages.length);
      drawRows(page, regular, bold, lines);
      drawWatermark(page, bold);
      drawFooter(page, regular);
    });

    return document.save({ useObjectStreams: false, addDefaultPage: false });
  }
}

function drawHeader(page: PDFPage, regular: PDFFont, bold: PDFFont, formData: TaxFormData, taxYear: number, pageNumber: number, pageCount: number) {
  page.drawRectangle({ x: 36, y: 704, width: 540, height: 52, borderWidth: 1.2, borderColor: rgb(.09, .21, .36) });
  page.drawText(`${taxYear} ${formData.formName}`, { x: 48, y: 733, size: 15, font: bold, color: rgb(.09, .21, .36) });
  page.drawText(fit(formData.title, 70), { x: 48, y: 714, size: 9, font: regular });
  if (formData.instanceLabel) page.drawText(fit(formData.instanceLabel, 34), { x: 360, y: 733, size: 9, font: bold });
  page.drawText(`Page ${pageNumber} of ${pageCount}`, { x: 494, y: 714, size: 8, font: regular });
  page.drawText("CONTROLLED INTERNAL PREVIEW — NOT AN OFFICIAL IRS FORM", { x: 48, y: 684, size: 9, font: bold, color: rgb(.62, .14, .08) });
  page.drawRectangle({ x: 36, y: 655, width: 540, height: 22, color: rgb(.91, .94, .97) });
  page.drawText("Line", { x: 44, y: 662, size: 8, font: bold });
  page.drawText("Calculated field", { x: 99, y: 662, size: 8, font: bold });
  page.drawText("Amount / value", { x: 430, y: 662, size: 8, font: bold });
}

function drawRows(page: PDFPage, regular: PDFFont, bold: PDFFont, lines: TaxFormLine[]) {
  lines.forEach((line, index) => {
    const y = FIRST_ROW_Y - index * ROW_HEIGHT;
    if (index % 2 === 1) page.drawRectangle({ x: 36, y: y - 7, width: 540, height: ROW_HEIGHT, color: rgb(.975, .98, .985) });
    page.drawText(fit(line.line, 8), { x: 44, y: y + 2, size: 8, font: bold });
    page.drawText(fit(line.label, 52), { x: 99, y: y + 2, size: 8.5, font: regular });
    page.drawText(fit(line.value, 20), { x: 430, y: y + 2, size: 9, font: bold });
    if (line.traceNodeId) page.drawText(fit(`Trace: ${line.traceNodeId}`, 58), { x: 99, y: y - 8, size: 6.5, font: regular, color: rgb(.35, .4, .45) });
    page.drawLine({ start: { x: 36, y: y - 8 }, end: { x: 576, y: y - 8 }, thickness: .3, color: rgb(.82, .84, .87) });
  });
}

function drawWatermark(page: PDFPage, bold: PDFFont) {
  page.drawText("DRAFT — NOT FOR FILING", { x: 78, y: 292, size: 38, font: bold, color: rgb(.88, .88, .88), rotate: degrees(32) });
}

function drawFooter(page: PDFPage, regular: PDFFont) {
  page.drawText("Values are rendered from the named immutable calculation run; this page performs no calculations.", { x: 48, y: 31, size: 7, font: regular, color: rgb(.3, .34, .38) });
  page.drawText("DRAFT — NOT FOR FILING", { x: 465, y: 31, size: 7, font: regular, color: rgb(.62, .14, .08) });
}

function chunk<T>(values: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
}

function fit(value: string, maximum: number): string {
  return value.length <= maximum ? value : `${value.slice(0, Math.max(0, maximum - 1))}…`;
}
