import { describe, expect, it, vi } from "vitest";
import { acceptSourceFile, sanitizeFileName, SourceFileError } from "../../src/services/source-file-service";

const scanner = { scan: vi.fn(async () => ({ clean: true, scannerVersion: "synthetic-1" })) };
const store = { putQuarantined: vi.fn(async () => ({ storageId: "object-1", version: "v1" })), promote: vi.fn(async () => undefined), createAuthorizedReadUrl: vi.fn(async () => "https://example.invalid/short-lived") };

describe("secure source intake", () => {
  it("accepts a scanned PDF by content signature and records its hash", async () => {
    const bytes = new TextEncoder().encode("%PDF-1.7 synthetic");
    const result = await acceptSourceFile({ fileName: "../2025 W-2.pdf", declaredMimeType: "application/pdf", bytes }, scanner, store);
    expect(result.sanitizedName).toBe("2025 W-2.pdf");
    expect(result.checksum).toHaveLength(64);
    expect(store.promote).toHaveBeenCalledWith("object-1", "v1");
  });

  it("rejects an extension/MIME spoof", async () => {
    await expect(acceptSourceFile({ fileName: "fake.pdf", declaredMimeType: "application/pdf", bytes: new TextEncoder().encode("<script>") }, scanner, store)).rejects.toMatchObject<Partial<SourceFileError>>({ code: "FILE_SIGNATURE_MISMATCH" });
  });

  it("sanitizes traversal and control characters", () => expect(sanitizeFileName("../../bad\u0000name.pdf")).toBe("badname.pdf"));
});
