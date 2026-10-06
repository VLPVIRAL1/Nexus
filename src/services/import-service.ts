import { createHash, randomUUID } from "node:crypto";
import { canonicalTaxReturnSchema } from "@/lib/canonical-schema";

export type ImportDecision = "use_imported" | "keep_existing" | "review_later";
export type ImportPathSegment = { key: string } | { id: string };

export interface ImportChange {
  id: string;
  path: string;
  kind: "add" | "change" | "clear";
  existingValue: unknown;
  importedValue: unknown;
  decision: ImportDecision;
  segments: ImportPathSegment[];
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
  validateImportShape(parsed);
  const checked = canonicalTaxReturnSchema.safeParse(parsed);
  if (!checked.success) {
    const issue = checked.error.issues[0];
    throw new ImportError("IMPORT_SCHEMA_INVALID", `${issue.path.join(".") || "root"}: ${issue.message}`);
  }
  const imported = checked.data as unknown as Record<string, unknown>;
  const warnings = Array.isArray(imported.review_points) && imported.review_points.length > 0
    ? ["Imported review points are preserved only in the staged payload; they cannot create authoritative application review records."]
    : [];
  return { previewId: randomUUID(), batchHash, baseRevision, parsed: imported, changes: diffObjects(effective, imported), warnings };
}

export function commitImport(preview: ImportPreview, current: Record<string, unknown>, currentRevision: number, previousCommits: Map<string, ImportCommitResult>): ImportCommitResult {
  const replay = previousCommits.get(preview.batchHash);
  if (replay) return replay;
  if (currentRevision !== preview.baseRevision) throw new ImportError("IMPORT_PREVIEW_STALE", "The return changed after preview. Generate and review a new difference preview.");
  const result = structuredClone(current);
  let changeCount = 0;
  for (const change of preview.changes) {
    if (change.decision !== "use_imported") continue;
    setAtPath(result, change.segments, structuredClone(change.importedValue));
    changeCount += 1;
  }
  const committed: ImportCommitResult = { importId: randomUUID(), batchHash: preview.batchHash, committedRevision: currentRevision + 1, result, changeCount };
  previousCommits.set(preview.batchHash, committed);
  return committed;
}

function diffObjects(existing: unknown, imported: unknown, segments: ImportPathSegment[] = []): ImportChange[] {
  if (Array.isArray(imported)) {
    if (imported.length === 0) return [];
    const current = Array.isArray(existing) ? existing : [];
    if (hasStableIds(imported) && (current.length === 0 || hasStableIds(current))) {
      const byId = new Map(current.filter(isIdentifiedObject).map((item) => [item.id, item]));
      return imported.flatMap((item) => {
        const itemSegments = [...segments, { id: item.id }];
        const prior = byId.get(item.id);
        return prior === undefined
          ? [change(itemSegments, "add", undefined, item)]
          : diffObjects(prior, item, itemSegments);
      });
    }
    if (JSON.stringify(existing) === JSON.stringify(imported)) return [];
    return [change(segments, existing === undefined ? "add" : "change", existing, imported)];
  }
  if (imported && typeof imported === "object") {
    const current = existing && typeof existing === "object" && !Array.isArray(existing) ? existing as Record<string, unknown> : {};
    return Object.entries(imported as Record<string, unknown>).flatMap(([key, value]) => {
      if (segments.length === 0 && key === "review_points") return [];
      return diffObjects(current[key], value, [...segments, { key }]);
    });
  }
  if (Object.is(existing, imported)) return [];
  return [change(segments, imported === null ? "clear" : existing === undefined ? "add" : "change", existing, imported)];
}

function setAtPath(target: Record<string, unknown>, segments: ImportPathSegment[], value: unknown) {
  let cursor: unknown = target;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const last = index === segments.length - 1;
    const nextSegment = segments[index + 1];
    if ("key" in segment) {
      if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) throw new ImportError("IMPORT_PATH_INVALID", "The reviewed import path no longer matches the return structure.");
      const record = cursor as Record<string, unknown>;
      if (last) { record[segment.key] = value; return; }
      if (!(segment.key in record) || record[segment.key] == null) record[segment.key] = nextSegment && "id" in nextSegment ? [] : {};
      cursor = record[segment.key];
    } else {
      if (!Array.isArray(cursor)) throw new ImportError("IMPORT_PATH_INVALID", "The reviewed child-row path no longer matches the return structure.");
      const found = cursor.findIndex((item) => isIdentifiedObject(item) && item.id === segment.id);
      if (last) {
        if (found >= 0) cursor[found] = value;
        else cursor.push(value);
        return;
      }
      if (found < 0) {
        const created: Record<string, unknown> = { id: segment.id };
        cursor.push(created);
        cursor = created;
      } else cursor = cursor[found];
    }
  }
  throw new ImportError("IMPORT_PATH_INVALID", "The reviewed import change has an empty path.");
}

function change(segments: ImportPathSegment[], kind: ImportChange["kind"], existingValue: unknown, importedValue: unknown): ImportChange {
  return { id: randomUUID(), path: displayPath(segments), segments, kind, existingValue, importedValue, decision: "review_later" };
}

function displayPath(segments: ImportPathSegment[]): string {
  return segments.map((segment, index) => "key" in segment ? `${index === 0 ? "" : "."}${segment.key}` : `[id=${segment.id}]`).join("");
}

function isIdentifiedObject(value: unknown): value is Record<string, unknown> & { id: string } {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && typeof (value as Record<string, unknown>).id === "string");
}

function hasStableIds(values: unknown[]): values is Array<Record<string, unknown> & { id: string }> {
  return values.every(isIdentifiedObject);
}

function validateImportShape(value: unknown): void {
  let records = 0;
  function visit(current: unknown, depth: number): void {
    if (depth > 64) throw new ImportError("IMPORT_NESTING_LIMIT", "JSON import exceeds the maximum nesting depth.");
    if (Array.isArray(current)) {
      records += current.length;
      if (records > 10_000) throw new ImportError("IMPORT_RECORD_LIMIT", "JSON import contains too many repeated records.");
      for (const item of current) visit(item, depth + 1);
      return;
    }
    if (current && typeof current === "object") {
      for (const [key, child] of Object.entries(current as Record<string, unknown>)) {
        if (key === "__proto__" || key === "prototype" || key === "constructor") throw new ImportError("IMPORT_UNSAFE_KEY", `JSON import contains a prohibited key: ${key}.`);
        visit(child, depth + 1);
      }
    }
  }
  visit(value, 0);
  if (value && typeof value === "object") {
    const forms = (value as Record<string, unknown>).forms;
    if (forms && typeof forms === "object") {
      const formRecordCount = Object.values(forms as Record<string, unknown>).reduce<number>((count, rows) => count + (Array.isArray(rows) ? rows.length : 0), 0);
      if (formRecordCount > 1_000) throw new ImportError("IMPORT_FORM_RECORD_LIMIT", "JSON import exceeds the 1,000 source-form record limit.");
    }
  }
}
