import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfiguredFileScanner } from "../../src/server/encrypted-source-store";

const originalEnvironment = {
  APP_ENV: process.env.APP_ENV,
  NEXUS_MALWARE_SCANNER_URL: process.env.NEXUS_MALWARE_SCANNER_URL,
  NEXUS_MALWARE_SCANNER_TOKEN: process.env.NEXUS_MALWARE_SCANNER_TOKEN,
};

afterEach(() => {
  vi.unstubAllGlobals();
  restore("APP_ENV", originalEnvironment.APP_ENV);
  restore("NEXUS_MALWARE_SCANNER_URL", originalEnvironment.NEXUS_MALWARE_SCANNER_URL);
  restore("NEXUS_MALWARE_SCANNER_TOKEN", originalEnvironment.NEXUS_MALWARE_SCANNER_TOKEN);
});

describe("production source scanning", () => {
  it("fails closed when the production scanner is not configured", async () => {
    process.env.APP_ENV = "production";
    delete process.env.NEXUS_MALWARE_SCANNER_URL;
    delete process.env.NEXUS_MALWARE_SCANNER_TOKEN;

    await expect(new ConfiguredFileScanner().scan(new Uint8Array([1, 2, 3]))).rejects.toMatchObject({ code: "SCANNER_NOT_CONFIGURED" });
  });

  it("sends only bytes to the configured HTTPS scanner and accepts a strict clean result", async () => {
    process.env.APP_ENV = "production";
    process.env.NEXUS_MALWARE_SCANNER_URL = "https://scanner.example.invalid/v1/scan";
    process.env.NEXUS_MALWARE_SCANNER_TOKEN = "scanner-test-token-with-at-least-32-characters";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ clean: true, scannerVersion: "scanner-2026.10" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(new ConfiguredFileScanner().scan(new Uint8Array([1, 2, 3]))).resolves.toEqual({ clean: true, scannerVersion: "scanner-2026.10" });
    const [endpoint, request] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(endpoint.toString()).toBe("https://scanner.example.invalid/v1/scan");
    expect(request).toMatchObject({ method: "POST", cache: "no-store", redirect: "error" });
    expect(request.headers).toMatchObject({ Authorization: expect.stringMatching(/^Bearer /), "Content-Type": "application/octet-stream", "Content-Length": "3" });
  });

  it("rejects insecure endpoints and malformed scanner responses", async () => {
    process.env.APP_ENV = "production";
    process.env.NEXUS_MALWARE_SCANNER_TOKEN = "scanner-test-token-with-at-least-32-characters";
    process.env.NEXUS_MALWARE_SCANNER_URL = "http://scanner.example.invalid/v1/scan";
    await expect(new ConfiguredFileScanner().scan(new Uint8Array([1]))).rejects.toMatchObject({ code: "SCANNER_NOT_CONFIGURED" });

    process.env.NEXUS_MALWARE_SCANNER_URL = "https://scanner.example.invalid/v1/scan";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ clean: false, scannerVersion: "scanner-1" }), { status: 200 })));
    await expect(new ConfiguredFileScanner().scan(new Uint8Array([1]))).rejects.toMatchObject({ code: "SCANNER_RESPONSE_INVALID" });
  });
});

function restore(name: keyof typeof originalEnvironment, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
