import { afterEach, describe, expect, it } from "vitest";
import { trustedAuthenticationNetwork } from "../../src/server/supabase-auth-service";

const priorEnvironment = process.env.APP_ENV;
const priorHeader = process.env.NEXUS_TRUSTED_NETWORK_HEADER;
afterEach(() => {
  if (priorEnvironment === undefined) delete process.env.APP_ENV; else process.env.APP_ENV = priorEnvironment;
  if (priorHeader === undefined) delete process.env.NEXUS_TRUSTED_NETWORK_HEADER; else process.env.NEXUS_TRUSTED_NETWORK_HEADER = priorHeader;
});

describe("Supabase authentication network boundary", () => {
  it("fails closed without an explicitly trusted production header", () => {
    process.env.APP_ENV = "production";
    delete process.env.NEXUS_TRUSTED_NETWORK_HEADER;
    expect(() => trustedAuthenticationNetwork(new Request("https://tax.example.test/api/auth/login"))).toThrow("NEXUS_TRUSTED_NETWORK_HEADER");
  });

  it("accepts only an IP address from the configured proxy-overwritten header", () => {
    process.env.APP_ENV = "production";
    process.env.NEXUS_TRUSTED_NETWORK_HEADER = "cf-connecting-ip";
    expect(trustedAuthenticationNetwork(new Request("https://tax.example.test/api/auth/login", { headers: { "cf-connecting-ip": "203.0.113.12" } }))).toBe("203.0.113.12");
    expect(() => trustedAuthenticationNetwork(new Request("https://tax.example.test/api/auth/login", { headers: { "cf-connecting-ip": "attacker-controlled" } }))).toThrow("Authentication required");
  });
});
