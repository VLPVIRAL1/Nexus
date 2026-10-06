import { createHash } from "node:crypto";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";

export interface ReturnPackageManifest {
  taxYear: 2025;
  inputRevision: number;
  calculationRunId: string;
  engineVersion: string;
  ruleVersion: string;
  requiredForms: string[];
  renderedForms: string[];
  missingForms: string[];
  supportStatus: "partial" | "complete_supported_draft";
}

export interface ReturnPackageResult { bytes: Uint8Array; sha256: string; manifest: ReturnPackageManifest; }

export async function generateDraftReturnPackage(manifest: ReturnPackageManifest): Promise<ReturnPackageResult> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([612, 792]);
  page.drawText("NEXUS TAX — FEDERAL RETURN PACKAGE", { x: 48, y: 720, size: 18, font: bold, color: rgb(.09, .21, .36) });
  page.drawText("DRAFT — NOT FOR FILING", { x: 48, y: 685, size: 16, font: bold, color: rgb(.7, .1, .08) });
  const rows = [
    ["Tax year", "2025"], ["Input revision", String(manifest.inputRevision)], ["Calculation run", manifest.calculationRunId],
    ["Support status", manifest.supportStatus === "partial" ? "PARTIAL — APPROVAL DISABLED" : "Complete supported draft"],
    ["Engine / rule", `${manifest.engineVersion} / ${manifest.ruleVersion}`], ["Rendered forms", manifest.renderedForms.join(", ") || "None"],
    ["Missing required forms", manifest.missingForms.join(", ") || "None"],
  ];
  rows.forEach(([label, value], index) => { const y = 635 - index * 34; page.drawText(label, { x: 48, y, size: 10, font: bold }); page.drawText(value, { x: 190, y, size: 10, font }); });
  if (manifest.missingForms.length) page.drawText("This package is incomplete. Missing forms and affected results must remain visible.", { x: 48, y: 360, size: 10, font: bold, color: rgb(.55, .34, 0) });
  page.drawText("DRAFT — NOT FOR FILING", { x: 112, y: 240, size: 36, font: bold, color: rgb(.88, .88, .88), rotate: degrees(32) });
  const bytes = await pdf.save({ useObjectStreams: false });
  return { bytes, sha256: createHash("sha256").update(bytes).digest("hex"), manifest };
}
