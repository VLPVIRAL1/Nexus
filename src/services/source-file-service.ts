import { createHash, randomUUID } from "node:crypto";
import { basename } from "node:path";

const limits = { sourceBytes: 25 * 1024 * 1024, jsonBytes: 10 * 1024 * 1024, pages: 250, records: 1000 } as const;
const safeTypes = new Map([
  ["application/pdf", [[0x25, 0x50, 0x44, 0x46, 0x2d]]],
  ["image/png", [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]]],
  ["image/jpeg", [[0xff, 0xd8, 0xff]]],
]);

export interface FileScanner { scan(bytes: Uint8Array): Promise<{ clean: boolean; scannerVersion: string; reason?: string }>; }
export interface ObjectStore {
  putQuarantined(key: string, bytes: Uint8Array, metadata: Record<string, string>): Promise<{ storageId: string; version: string }>;
  promote(storageId: string, version: string): Promise<void>;
  createAuthorizedReadUrl(storageId: string, expiresInSeconds: number): Promise<string>;
}
export interface AcceptedSourceFile { id: string; sanitizedName: string; mimeType: string; byteLength: number; checksum: string; storageId: string; storageVersion: string; scanState: "clean"; }

export class SourceFileError extends Error { constructor(public readonly code: string, message: string) { super(message); } }

export async function acceptSourceFile(input: { fileName: string; declaredMimeType: string; bytes: Uint8Array }, scanner: FileScanner, store: ObjectStore): Promise<AcceptedSourceFile> {
  if (input.bytes.byteLength === 0) throw new SourceFileError("FILE_EMPTY", "The source file is empty.");
  if (input.bytes.byteLength > limits.sourceBytes) throw new SourceFileError("FILE_TOO_LARGE", "Source files may not exceed 25 MiB.");
  const signatures = safeTypes.get(input.declaredMimeType);
  if (!signatures || !signatures.some((signature) => signature.every((byte, index) => input.bytes[index] === byte))) throw new SourceFileError("FILE_SIGNATURE_MISMATCH", "The declared file type does not match an allowed PDF, PNG, or JPEG signature.");
  const sanitizedName = sanitizeFileName(input.fileName);
  const checksum = createHash("sha256").update(input.bytes).digest("hex");
  const key = `quarantine/${randomUUID()}`;
  const stored = await store.putQuarantined(key, input.bytes, { checksum, mimeType: input.declaredMimeType, originalName: sanitizedName });
  const scan = await scanner.scan(input.bytes);
  if (!scan.clean) throw new SourceFileError("FILE_QUARANTINED", `The source file failed security scanning: ${scan.reason ?? "unspecified scanner finding"}.`);
  await store.promote(stored.storageId, stored.version);
  return { id: randomUUID(), sanitizedName, mimeType: input.declaredMimeType, byteLength: input.bytes.byteLength, checksum, storageId: stored.storageId, storageVersion: stored.version, scanState: "clean" };
}

export function sanitizeFileName(value: string): string {
  const normalized = basename(value.normalize("NFKC")).replace(/[\u0000-\u001f\u007f]/g, "").replace(/[^a-zA-Z0-9._ -]/g, "_").trim();
  if (!normalized || normalized === "." || normalized === "..") throw new SourceFileError("FILE_NAME_INVALID", "The file name is invalid.");
  return normalized.slice(0, 180);
}

export { limits as pilotFileLimits };
