import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { AuthenticationError } from "./session-service";

export interface PendingAuthenticationFlow {
  version: 1;
  provider: "supabase";
  subject: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  firmId: string | null;
  allowedFactorIds: string[];
  enrollmentFactorId: string | null;
  expiresAt: string;
}

const developmentKey = createHash("sha256").update("nexus-development-auth-flow-key-do-not-use-in-production").digest();

export function sealAuthenticationFlow(flow: PendingAuthenticationFlow, key = authenticationFlowKey()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(flow), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function openAuthenticationFlow(value: string, now = new Date(), key = authenticationFlowKey()): PendingAuthenticationFlow {
  const parts = value.split(".");
  if (parts.length !== 3) throw new AuthenticationError();
  try {
    const [iv, tag, ciphertext] = parts.map((part) => Buffer.from(part, "base64url"));
    if (iv.byteLength !== 12 || tag.byteLength !== 16 || ciphertext.byteLength < 1) throw new Error("Invalid authentication flow envelope.");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const parsed = JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")) as PendingAuthenticationFlow;
    if (parsed.version !== 1 || parsed.provider !== "supabase" || !parsed.subject || !parsed.accessToken || !parsed.refreshToken) throw new Error("Invalid authentication flow payload.");
    if (!Array.isArray(parsed.allowedFactorIds) || parsed.allowedFactorIds.some((id) => typeof id !== "string")) throw new Error("Invalid authentication factors.");
    if (new Date(parsed.expiresAt).getTime() <= now.getTime()) throw new Error("Authentication flow expired.");
    return parsed;
  } catch {
    throw new AuthenticationError("Authentication flow expired or invalid.");
  }
}

function authenticationFlowKey(): Buffer {
  const configured = process.env.NEXUS_AUTH_FLOW_KEY?.trim();
  if (configured) {
    const decoded = Buffer.from(configured, "base64");
    if (decoded.byteLength === 32) return decoded;
  }
  if (process.env.APP_ENV === "production") throw new Error("NEXUS_AUTH_FLOW_KEY must be base64 for exactly 32 random bytes in production.");
  return developmentKey;
}
