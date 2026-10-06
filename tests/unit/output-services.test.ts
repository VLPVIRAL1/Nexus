import ExcelJS from "exceljs";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { canonicalReturnFixture } from "../fixtures/canonical-return";
import { exportCanonicalJson } from "../../src/services/outputs/json-export-service";
import { generateDraftReturnPackage } from "../../src/services/outputs/return-package-service";
import { generateWorkpaper } from "../../src/services/outputs/workpaper-service";

describe("output integrity foundations", () => {
  it("exports source-only data with an exclusion manifest", () => {
    const result = exportCanonicalJson(canonicalReturnFixture, "source_only");
    const parsed = JSON.parse(new TextDecoder().decode(result.bytes));
    expect(parsed.sourceDocuments).toHaveLength(1);
    expect(parsed.activities).toBeUndefined();
    expect(result.exclusions).toContain("system audit events");
    expect(result.sha256).toHaveLength(64);
  });

  it("generates a workbook with required foundation sheets and run identity", async () => {
    const bytes = await generateWorkpaper({ data: canonicalReturnFixture, runId: "CALC-SYNTHETIC", calculationStatus: "partial", diagnostics: [] });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes.buffer as ArrayBuffer);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["Cover & Tax Summary", "Source Index", "Open Review Points", "Mapping Reconciliation"]);
    expect(workbook.getWorksheet("Cover & Tax Summary")?.getCell("B4").value).toBe("CALC-SYNTHETIC");
  });

  it("generates an explicitly partial draft PDF cover", async () => {
    const result = await generateDraftReturnPackage({ taxYear: 2025, inputRevision: 28, calculationRunId: "CALC-SYNTHETIC", engineVersion: "not-approved", ruleVersion: "not-approved", requiredForms: ["1040", "Schedule E"], renderedForms: ["1040"], missingForms: ["Schedule E"], supportStatus: "partial" });
    const pdf = await PDFDocument.load(result.bytes);
    expect(pdf.getPageCount()).toBe(1);
    expect(result.manifest.missingForms).toEqual(["Schedule E"]);
    expect(result.sha256).toHaveLength(64);
  });
});
