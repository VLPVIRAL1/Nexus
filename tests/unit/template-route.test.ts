import { describe, expect, it } from "vitest";
import { GET } from "../../src/app/api/templates/2025/1040/canonical.json/route";
import { canonicalTaxReturnSchema } from "../../src/lib/canonical-schema";

describe("blank canonical template route", () => {
  it("downloads an identifier-free schema-valid template without a database or calculation run", async () => {
    const response = await GET();
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("taxpayer-import-template-2025-v1.2.0-review.json");
    expect(response.headers.get("etag")).toMatch(/^"sha256-[0-9a-f]{64}"$/);
    expect(canonicalTaxReturnSchema.safeParse(payload).success).toBe(true);
    expect(JSON.stringify(payload)).not.toMatch(/ssn|tin_value|clientId|taxYearId/i);
  });
});
