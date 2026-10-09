import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { proxy } from "../../src/proxy";

const priorEnvironment = process.env.APP_ENV;
afterEach(() => { if (priorEnvironment === undefined) delete process.env.APP_ENV; else process.env.APP_ENV = priorEnvironment; });

describe("production authentication boundary", () => {
  it("redirects unauthenticated application pages but keeps auth pages public", () => {
    process.env.APP_ENV = "production";
    const protectedResponse = proxy(new NextRequest("https://tax.example.test/dashboard"));
    expect(protectedResponse.status).toBe(307);
    expect(protectedResponse.headers.get("location")).toBe("https://tax.example.test/login");
    expect(proxy(new NextRequest("https://tax.example.test/login")).status).toBe(200);
    expect(proxy(new NextRequest("https://tax.example.test/auth/recovery")).status).toBe(200);
  });

  it("allows the development identity fallback and redirects signed-in users away from login", () => {
    process.env.APP_ENV = "development";
    expect(proxy(new NextRequest("http://localhost:3000/dashboard")).status).toBe(200);
    process.env.APP_ENV = "production";
    const request = new NextRequest("https://tax.example.test/login", { headers: { cookie: "nexus_session=valid-shape-placeholder" } });
    const response = proxy(request);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://tax.example.test/dashboard");
  });
});
