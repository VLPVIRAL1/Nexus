import { describe, expect, it } from "vitest";
import { authorize } from "../../src/services/authorization";
import { maskTin, neutralizeSpreadsheetText, redactForLog } from "../../src/services/redaction";
import { apiError, requireSameOrigin } from "../../src/server/api-guards";
import { RateLimitError } from "../../src/server/rate-limit-service";

describe("security boundaries", () => {
  const context = { userId: "u1", firmId: "firm-a", role: "preparer" as const, assignedClientIds: new Set(["client-a"]) };
  it("denies another firm's resource", () => expect(authorize(context, "client.view", { firmId: "firm-b", clientId: "client-a" })).toBe(false));
  it("denies an unassigned client", () => expect(authorize(context, "client.view", { firmId: "firm-a", clientId: "client-b" })).toBe(false));
  it("does not grant preparers approval", () => expect(authorize(context, "return.approve", { firmId: "firm-a", clientId: "client-a" })).toBe(false));
  it("masks identifiers", () => expect(maskTin("123-45-6789")).toBe("***-**-6789"));
  it("redacts sensitive structured logs", () => expect(redactForLog({ event: "saved", ssn: "123", nested: { wageAmount: "12.00" } })).toEqual({ event: "saved", ssn: "[REDACTED]", nested: { wageAmount: "[REDACTED]" } }));
  it("neutralizes spreadsheet formulas", () => expect(neutralizeSpreadsheetText("=HYPERLINK(\"x\")")).toBe("'=HYPERLINK(\"x\")"));
  it("accepts the public host when the application binds to another local interface", () => {
    const request = new Request("http://0.0.0.0:3100/api/example", { headers: { host: "127.0.0.1:3100", origin: "http://127.0.0.1:3100" } });
    expect(() => requireSameOrigin(request)).not.toThrow();
  });
  it("rejects a cross-origin mutation even when the application uses a bind address", () => {
    const request = new Request("http://0.0.0.0:3100/api/example", { headers: { host: "127.0.0.1:3100", origin: "https://attacker.example" } });
    expect(() => requireSameOrigin(request)).toThrow("Cross-origin mutation denied.");
  });
  it("returns a retry interval for throttled requests", async () => {
    const response = apiError(new RateLimitError(17));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("17");
    expect(await response.json()).toMatchObject({ error: "rate_limited" });
  });
});
