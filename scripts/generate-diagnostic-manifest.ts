import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

const root = resolve(process.cwd());
const sourceRoot = resolve(root, "src");
const outputPath = resolve(root, "src/diagnostics/diagnostic-manifest-2025.json");

type Entry = {
  code: string;
  taxYear: number;
  jurisdiction: "federal";
  filingChannel: "preparation";
  diagnosticClass: string;
  defaultSeverity: "blocking" | "error" | "warning" | "information";
  evaluationStage: string;
  supportState: "legacy_supported";
  authorityReviewStatus: "pending";
  owner: string;
  disposition: "retain";
  sourceLocations: string[];
  messageTemplate: string;
  resolutionTemplate: string;
  definitionHash: string;
};

const files = await collect(sourceRoot);
const found = new Map<string, Set<string>>();
for (const file of files) {
  const text = await readFile(file, "utf8");
  const path = relative(root, file).replaceAll("\\", "/");
  const patterns = [
    /\bcode\s*:\s*["']([A-Z][A-Z0-9_]{2,})["']/g,
    /\bcode\s*=\s*["']([A-Z][A-Z0-9_]{2,})["']/g,
    /validation_issues[\s\S]{0,450}?VALUES\s*\([^;]{0,250}?["']([A-Z][A-Z0-9_]{2,})["']/g,
    /["']([A-Z][A-Z0-9_]{3,})["']/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) add(match[1], path, text, match.index ?? 0);
  }

  if (path === "src/domain/intake.ts") {
    for (const match of text.matchAll(/\bid:\s*["']([a-z][a-z0-9_.]+)["']/g)) {
      const token = match[1].toUpperCase().replaceAll(".", "_");
      add(`INTAKE_${token}_UNKNOWN`, path, text, match.index ?? 0);
      add(`UNSUPPORTED_${token}`, path, text, match.index ?? 0);
    }
  }
}

const generatedAt = "2026-10-15T00:00:00.000Z";
const entries = [...found.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([code, locations]): Entry => {
  const sourceLocations = [...locations].sort();
  const context = sourceLocations.join(" ");
  const defaultSeverity = inferSeverity(code);
  const diagnosticClass = inferClass(code);
  const evaluationStage = inferStage(context, diagnosticClass);
  const base = {
    code,
    taxYear: 2025,
    jurisdiction: "federal" as const,
    filingChannel: "preparation" as const,
    diagnosticClass,
    defaultSeverity,
    evaluationStage,
    supportState: "legacy_supported" as const,
    authorityReviewStatus: "pending" as const,
    owner: inferOwner(context),
    disposition: "retain" as const,
    sourceLocations,
    messageTemplate: "Existing evaluator supplies a contextual preparer-facing message.",
    resolutionTemplate: "Correct the cited facts or complete the required supported workflow, then reevaluate.",
  };
  return { ...base, definitionHash: sha256(stable(base)) };
});

const manifestBase = {
  schemaVersion: "1.0",
  taxYear: 2025,
  jurisdiction: "federal",
  filingChannel: "preparation",
  generatedAt,
  sourceRoot: "src",
  definitionCount: entries.length,
  externalGates: {
    mef: "disabled_pending_authorization",
    drakeComparison: "pending_licensed_observation",
    proconnectComparison: "pending_licensed_observation",
    cchComparison: "pending_licensed_observation",
    independentTaxApproval: "pending",
  },
  definitions: entries,
};
const manifest = { ...manifestBase, manifestHash: sha256(stable(manifestBase)) };
const serialized = `${JSON.stringify(manifest, null, 2)}\n`;

if (process.argv.includes("--check")) {
  let current = "";
  try { current = await readFile(outputPath, "utf8"); } catch { /* handled below */ }
  if (current !== serialized) {
    throw new Error("Diagnostic manifest is stale. Run npm run diagnostics:generate and commit the result.");
  }
  process.stdout.write(`Diagnostic manifest is current (${entries.length} definitions).\n`);
} else {
  await mkdir(resolve(outputPath, ".."), { recursive: true });
  await writeFile(outputPath, serialized);
  process.stdout.write(`Generated ${relative(root, outputPath)} with ${entries.length} definitions.\n`);
}

function add(code: string | undefined, path: string, text: string, index: number) {
  if (!code || !code.includes("_") || /^(APP_ENV|DATABASE_URL|NODE_ENV|NEXUS_AUTH_RECOVERY_REDIRECT_URL|SUPABASE_PUBLISHABLE_KEY|SUPABASE_URL)$/.test(code)) return;
  const line = text.slice(0, index).split("\n").length;
  const locations = found.get(code) ?? new Set<string>();
  locations.add(`${path}:${line}`);
  found.set(code, locations);
}

async function collect(directory: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...await collect(path));
    else if (/\.tsx?$/.test(entry.name)) result.push(path);
  }
  return result;
}

function inferSeverity(code: string): Entry["defaultSeverity"] {
  if (/UNAPPROVED|UNSUPPORTED|UNKNOWN|MISSING|INCOMPLETE|REQUIRED|INVALID|MISMATCH|CONFLICT|EXCEEDS|STALE|UNRESOLVED|NOT_REVIEWED|NOT_ALLOWED|OVER_ALLOCATED|RECALCULATION/.test(code)) return "blocking";
  if (/WARNING|UNCLASSIFIED|DUPLICATE|REVIEW|ADVISORY/.test(code)) return "warning";
  return "error";
}

function inferClass(code: string) {
  if (/UNSUPPORTED|UNAPPROVED/.test(code)) return "unsupported_or_research_pending";
  if (/MISSING|UNKNOWN|INCOMPLETE|REQUIRED|NOT_REVIEWED/.test(code)) return "completeness";
  if (/MAPPING|RECONCIL|MISMATCH|TIE_OUT|DUPLICATE/.test(code)) return "reconciliation";
  if (/OUTPUT|PACKAGE|PDF|WORKBOOK|ARTIFACT/.test(code)) return "output_package";
  if (/8867|DUE_DILIGENCE|EVIDENCE|SIGNATURE/.test(code)) return "due_diligence_and_substantiation";
  if (/INVALID|FORMAT|STRUCTURE|SCHEMA/.test(code)) return "schema_and_structural_validity";
  if (/ELIGIB|QUALIFY|FILING_STATUS/.test(code)) return "eligibility";
  return "calculation_domain";
}

function inferStage(context: string, diagnosticClass: string) {
  if (context.includes("services/outputs") || diagnosticClass === "output_package") return "output";
  if (context.includes("import")) return "import";
  if (context.includes("review")) return "review";
  if (context.includes("tax-engine") || context.includes("calculation")) return "calculation";
  if (context.includes("source")) return "source";
  return "save";
}

function inferOwner(context: string) {
  if (context.includes("tax-engine/2025")) return "federal-tax-engine";
  if (context.includes("services/outputs")) return "return-output";
  if (context.includes("server/import") || context.includes("services/import")) return "data-import";
  if (context.includes("source")) return "source-forms";
  return "federal-diagnostics";
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => `${JSON.stringify(key)}:${stable(nested)}`).join(",")}}`;
  return JSON.stringify(value);
}

function sha256(value: string) { return createHash("sha256").update(value).digest("hex"); }
