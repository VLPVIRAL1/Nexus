import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import type { FileScanner, ObjectStore } from "@/services/source-file-service";
import { SourceFileError } from "@/services/source-file-service";
import { databasePool } from "./database";

export class DatabaseEncryptedObjectStore implements ObjectStore {
  async putQuarantined(key: string, bytes: Uint8Array): Promise<{ storageId: string; version: string }> {
    const storageId=randomUUID();const iv=randomBytes(12);const cipher=createCipheriv("aes-256-gcm",sourceEncryptionKey(),iv);cipher.setAAD(Buffer.from(key));const encrypted=Buffer.concat([cipher.update(bytes),cipher.final()]);const authTag=cipher.getAuthTag();
    await databasePool().query("INSERT INTO source_object_blobs(id,object_key,object_state,cipher_iv,cipher_auth_tag,cipher_bytes) VALUES($1,$2,'quarantined',$3,$4,$5)",[storageId,key,iv,authTag,encrypted]);
    return {storageId,version:"1"};
  }
  async promote(storageId:string,version:string):Promise<void>{const result=await databasePool().query("UPDATE source_object_blobs SET object_state='promoted',promoted_at=now() WHERE id=$1 AND storage_version=$2 AND object_state='quarantined'",[storageId,Number(version)]);if(result.rowCount!==1)throw new SourceFileError("FILE_STORAGE_CONFLICT","The quarantined object could not be promoted.");}
  async createAuthorizedReadUrl():Promise<string>{throw new SourceFileError("FILE_PROXY_REQUIRED","Database-backed source objects must be read through the authenticated proxy.");}
  async readPromoted(storageId:string):Promise<Buffer>{const result=await databasePool().query<{object_key:string;object_state:string;cipher_iv:Buffer;cipher_auth_tag:Buffer;cipher_bytes:Buffer}>("SELECT object_key,object_state,cipher_iv,cipher_auth_tag,cipher_bytes FROM source_object_blobs WHERE id=$1",[storageId]);const row=result.rows[0];if(!row||row.object_state!=="promoted")throw new SourceFileError("FILE_NOT_AVAILABLE","The source object is not available.");try{const decipher=createDecipheriv("aes-256-gcm",sourceEncryptionKey(),row.cipher_iv);decipher.setAAD(Buffer.from(row.object_key));decipher.setAuthTag(row.cipher_auth_tag);return Buffer.concat([decipher.update(row.cipher_bytes),decipher.final()]);}catch{throw new SourceFileError("FILE_INTEGRITY_FAILED","The encrypted source object failed integrity verification.");}}
}

export class ConfiguredFileScanner implements FileScanner {
  async scan(bytes: Uint8Array): Promise<{ clean: boolean; scannerVersion: string; reason?: string }> {
    if (process.env.APP_ENV === "production") return scanWithProductionService(bytes);

    const buffer = Buffer.from(bytes);
    const findings = [
      Buffer.from("EICAR-STANDARD-ANTIVIRUS-TEST-FILE"),
      Buffer.from("/JavaScript"),
      Buffer.from("/Launch"),
      Buffer.from("/OpenAction"),
    ];
    const found = findings.find((pattern) => buffer.indexOf(pattern) !== -1);
    return found
      ? { clean: false, scannerVersion: "development-static-v1", reason: `Blocked active/test signature ${found.toString()}` }
      : { clean: true, scannerVersion: "development-static-v1" };
  }
}

async function scanWithProductionService(bytes: Uint8Array): Promise<{ clean: boolean; scannerVersion: string; reason?: string }> {
  const endpoint = productionScannerEndpoint();
  const token = process.env.NEXUS_MALWARE_SCANNER_TOKEN?.trim();
  if (!token || token.length < 32) {
    throw new SourceFileError("SCANNER_NOT_CONFIGURED", "The production malware scanner credential is not configured.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
        "Content-Length": String(bytes.byteLength),
      },
      body: Buffer.from(bytes),
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });
  } catch {
    throw new SourceFileError("SCANNER_UNAVAILABLE", "The malware scanner could not verify the source file.");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new SourceFileError("SCANNER_UNAVAILABLE", "The malware scanner could not verify the source file.");
  }
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > 8_192) {
    throw new SourceFileError("SCANNER_RESPONSE_INVALID", "The malware scanner returned an invalid response.");
  }

  let result: unknown;
  try {
    const body = await response.text();
    if (Buffer.byteLength(body) > 8_192) throw new Error("response too large");
    result = JSON.parse(body);
  } catch {
    throw new SourceFileError("SCANNER_RESPONSE_INVALID", "The malware scanner returned an invalid response.");
  }
  if (!isScannerResult(result)) {
    throw new SourceFileError("SCANNER_RESPONSE_INVALID", "The malware scanner returned an invalid response.");
  }
  return result.reason === undefined
    ? { clean: result.clean, scannerVersion: result.scannerVersion }
    : { clean: result.clean, scannerVersion: result.scannerVersion, reason: result.reason };
}

function productionScannerEndpoint(): URL {
  const configured = process.env.NEXUS_MALWARE_SCANNER_URL?.trim();
  if (!configured) throw new SourceFileError("SCANNER_NOT_CONFIGURED", "The production malware scanner endpoint is not configured.");
  let endpoint: URL;
  try {
    endpoint = new URL(configured);
  } catch {
    throw new SourceFileError("SCANNER_NOT_CONFIGURED", "The production malware scanner endpoint is invalid.");
  }
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new SourceFileError("SCANNER_NOT_CONFIGURED", "The production malware scanner endpoint must be a credential-free HTTPS URL without query or fragment data.");
  }
  return endpoint;
}

function isScannerResult(value: unknown): value is { clean: boolean; scannerVersion: string; reason?: string } {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.clean !== "boolean") return false;
  if (typeof candidate.scannerVersion !== "string" || candidate.scannerVersion.trim().length === 0 || candidate.scannerVersion.length > 100) return false;
  if (candidate.reason !== undefined && (typeof candidate.reason !== "string" || candidate.reason.length > 500)) return false;
  if (!candidate.clean && (typeof candidate.reason !== "string" || candidate.reason.trim().length === 0)) return false;
  return Object.keys(candidate).every((key) => ["clean", "scannerVersion", "reason"].includes(key));
}

function sourceEncryptionKey():Buffer{const configured=process.env.NEXUS_SOURCE_ENCRYPTION_KEY;if(configured){const key=Buffer.from(configured,"base64");if(key.byteLength!==32)throw new Error("NEXUS_SOURCE_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");return key;}if(process.env.APP_ENV==="production")throw new Error("NEXUS_SOURCE_ENCRYPTION_KEY is required in production.");return createHash("sha256").update("nexus-development-source-key-not-for-production").digest();}
