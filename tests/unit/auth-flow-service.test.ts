import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { openAuthenticationFlow, sealAuthenticationFlow, type PendingAuthenticationFlow } from "../../src/server/auth-flow-service";

const now = new Date("2026-10-09T08:00:00.000Z");
const key = randomBytes(32);
const flow: PendingAuthenticationFlow = {
  version: 1,
  provider: "supabase",
  subject: "provider-user",
  email: "provider@example.invalid",
  accessToken: "access-token",
  refreshToken: "refresh-token",
  firmId: null,
  allowedFactorIds: ["factor-1"],
  enrollmentFactorId: null,
  expiresAt: new Date(now.getTime() + 300_000).toISOString(),
};

describe("temporary authentication flow", () => {
  it("round-trips provider tokens only through authenticated encryption", () => {
    const sealed = sealAuthenticationFlow(flow, key);
    expect(sealed).not.toContain(flow.accessToken);
    expect(openAuthenticationFlow(sealed, now, key)).toEqual(flow);
  });

  it("rejects tampering, expiry, and the wrong encryption key", () => {
    const sealed = sealAuthenticationFlow(flow, key);
    const tampered = `${sealed.slice(0, -1)}${sealed.endsWith("A") ? "B" : "A"}`;
    expect(() => openAuthenticationFlow(tampered, now, key)).toThrow("expired or invalid");
    expect(() => openAuthenticationFlow(sealed, new Date(now.getTime() + 301_000), key)).toThrow("expired or invalid");
    expect(() => openAuthenticationFlow(sealed, now, randomBytes(32))).toThrow("expired or invalid");
  });
});
