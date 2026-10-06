import { createHash, randomUUID } from "node:crypto";
import { canonicalTaxReturnSchema } from "@/lib/canonical-schema";

export type ImportDecision = "use_imported" | "keep_existing" | "review_later";

export interface ImportChange {
  id: string;
  path: string;
  kind: "add" | "change" | "clear";
  existingValue: unknown;
  importedValue: unknown;
  decision: ImportDecision;
}

export interface ImportPreview {
  previewId: string;
  batchHash: string;
  baseRevision: number;
  parsed: Record<string, unknown>;
  changes: ImportChange[];
  warnings: string[];
}

export interface ImportCommitResult {
  importId: string;
  batchHash: string;
  committedRevision: number;
  result: Record<string, unknown>;
  changeCount: number;
}

export class ImportError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

export function previewImport(rawBytes: Uint8Array, effective: Record<string, unknown>, baseRevision: number, maxBytes = 10 * 1024 * 1024): ImportPreview {
  if (rawBytes.byteLength > maxBytes) throw new ImportError("IMPORT_TOO_LARGE", `JSON import exceeds the ${maxBytes} byte limit.`);
  const batchHash = createHash("sha256").update(rawBytes).digest("hex");
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBytes)); }
  catch { throw new ImportError("IMPORT_INVALID_JSON", "The file is not valid UTF-8 JSON. No return data was changed."); }
  const checked = canonicalTaxReturnSchema.safeParse(parsed);
  if (!checked.success) {
    const issue = checked.error.issues[0];
    throw new ImportError("IMPORT_SCHEMA_INVALID", `${issue.path.join(".") || "root"}: ${issue.message}`);
  }
  const imported = checked.data as unknown as Record<string, unknown>;
  return { previewId: randomUUID(), batchHash, baseRevision, parsed: imported, changes: diffObjects(effective, imported), warnings: [] };
}

export function commitImport(preview: ImportPreview, current: Record<string, unknown>, currentRevision: number, previousCommits: Map<string, ImportCommitResult>): ImportCommitResult {
  const replay = previousCommits.get(preview.batchHash);
  if (replay) return replay;
  if (currentRevision !== preview.baseRevision) throw new ImportError("IMPORT_PREVIEW_STALE", "The return changed after preview. Generate and review a new difference preview.");
  const result = structuredClone(current);
  let changeCount = 0;
  for (const change of preview.changes) {
    if (change.decision !== "use_imported") continue;
    setAtPath(result, change.path.split("."), structuredClone(change.importedValue));
    changeCount += 1;
  }
  const committed: ImportCommitResult = { importId: randomUUID(), batchHash: preview.batchHash, committedRevision: currentRevision + 1, result, changeCount };
  previousCommits.set(preview.batchHash, committed);
  return committed;
}

function diffObjects(existing: unknown, imported: unknown, prefix = ""): ImportChange[] {
  if (Array.isArray(imported)) {
    if (JSON.stringify(existing) === JSON.stringify(imported)) return [];
    return [{ id: randomUUID(), path: prefix, kind: existing === undefined ? "add" : "change", existingValue: existing, importedValue: imported, decision: "review_later" }];
  }
  if (imported && typeof imported === "object") {
    const current = existing && typeof existing === "object" && !Array.isArray(existing) ? existing as Record<string, unknown> : {};
    return Object.entries(imported as Record<string, unknown>).flatMap(([key, value]) => diffObjects(current[key], value, prefix ? `${prefix}.${key}` : key));
  }
  if (Object.is(existing, imported)) return [];
  return [{ id: randomUUID(), path: prefix, kind: imported === null ? "clear" : existing === undefined ? "add" : "change", existingValue: existing, importedValue: imported, decision: "review_later" }];
}

function setAtPath(target: Record<string, unknown>, path: string[], value: unknown) {
  let cursor = target;
  for (const key of path.slice(0, -1)) {
    const next = cursor[key];
    if (!next || typeof next !== "object" || Array.isArray(next)) cursor[key] = {};
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[path.at(-1)!] = value;
}
