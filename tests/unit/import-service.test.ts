import { describe, expect, it } from "vitest";
import template from "../../examples/2025/blank-taxpayer-template.json";
import { commitImport, ImportError, previewImport, type ImportCommitResult } from "../../src/services/import-service";

const recordId = "81000000-0000-4000-8000-000000000001";
const documentId = "82000000-0000-4000-8000-000000000001";

function returnWithW2(box1: string) {
  const value = structuredClone(template) as Record<string, any>;
  value.forms.w2 = [{
    id: recordId,
    external_source_id: "vendor-w2-1",
    source_document_id: documentId,
    form_year: 2025,
    recipient_role: "taxpayer",
    corrected: false,
    void: false,
    raw_fields: [],
    unmapped_source_fields: [],
    version: 1,
    box1,
  }];
  return value;
}

function bytes(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value));
}

describe("safe canonical import", () => {
  it("diffs and applies child rows by stable ID rather than array position", () => {
    const current = returnWithW2("86000.00");
    const imported = returnWithW2("87000.00");
    const preview = previewImport(bytes(imported), current, 4);
    const wageChange = preview.changes.find(({ path }) => path.endsWith(".box1"));
    expect(wageChange?.path).toBe(`forms.w2[id=${recordId}].box1`);
    expect(wageChange?.segments).toEqual([{ key: "forms" }, { key: "w2" }, { id: recordId }, { key: "box1" }]);
    if (!wageChange) throw new Error("Expected wage change.");
    wageChange.decision = "use_imported";
    const result = commitImport(preview, current, 4, new Map());
    expect((result.result.forms as any).w2[0].box1).toBe("87000.00");
    expect(result.committedRevision).toBe(5);
  });

  it("does not treat empty imported arrays as deletion instructions", () => {
    const current = returnWithW2("86000.00");
    const preview = previewImport(bytes(template), current, 1);
    expect(preview.changes.some(({ path }) => path.startsWith("forms.w2"))).toBe(false);
  });

  it("keeps the effective value unchanged for keep-existing and review-later decisions", () => {
    const current = returnWithW2("86000.00");
    const preview = previewImport(bytes(returnWithW2("87000.00")), current, 4);
    const wageChange = preview.changes.find(({ path }) => path.endsWith(".box1"));
    if (!wageChange) throw new Error("Expected wage change.");

    wageChange.decision = "keep_existing";
    expect((commitImport(preview, current, 4, new Map()).result.forms as any).w2[0].box1).toBe("86000.00");

    const reviewPreview = previewImport(bytes(returnWithW2("87000.00")), current, 4);
    const reviewChange = reviewPreview.changes.find(({ path }) => path.endsWith(".box1"));
    if (!reviewChange) throw new Error("Expected wage change.");
    reviewChange.decision = "review_later";
    expect((commitImport(reviewPreview, current, 4, new Map()).result.forms as any).w2[0].box1).toBe("86000.00");
  });

  it("keeps imported review claims out of authoritative changes", () => {
    const imported = structuredClone(template) as Record<string, any>;
    imported.review_points = [{ id: "external", status: "approved" }];
    const preview = previewImport(bytes(imported), structuredClone(template), 1);
    expect(preview.warnings[0]).toContain("cannot create authoritative");
    expect(preview.changes.some(({ path }) => path.startsWith("review_points"))).toBe(false);
  });

  it("returns the original exact-replay result and rejects a stale changed preview", () => {
    const current = returnWithW2("86000.00");
    const preview = previewImport(bytes(returnWithW2("87000.00")), current, 2);
    preview.changes.forEach((change) => { change.decision = "use_imported"; });
    const commits = new Map<string, ImportCommitResult>();
    const first = commitImport(preview, current, 2, commits);
    expect(commitImport(preview, { different: true }, 99, commits)).toBe(first);
    const changedPreview = previewImport(bytes(returnWithW2("88000.00")), current, 2);
    expect(() => commitImport(changedPreview, current, 3, commits)).toThrowError(expect.objectContaining<Partial<ImportError>>({ code: "IMPORT_PREVIEW_STALE" }));
  });

  it("rejects prohibited object keys before schema validation", () => {
    const raw = JSON.stringify(template).replace('"metadata":{}', '"metadata":{"__proto__":{"polluted":true}}');
    expect(() => previewImport(new TextEncoder().encode(raw), structuredClone(template), 1)).toThrowError(expect.objectContaining<Partial<ImportError>>({ code: "IMPORT_UNSAFE_KEY" }));
  });
});
