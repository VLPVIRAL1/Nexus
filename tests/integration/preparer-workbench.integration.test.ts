import pg from "pg";
import { describe, expect, it } from "vitest";
import { getTaxYearWorkspace } from "@/server/client-repository";
import type { AuthorizationContext } from "@/services/authorization";

const connectionString = process.env.DATABASE_URL;
const describeDatabase = connectionString ? describe : describe.skip;
const clientId = "30000000-0000-4000-8000-000000000001";
const context: AuthorizationContext = {
  userId: "20000000-0000-4000-8000-000000000001",
  firmId: "10000000-0000-4000-8000-000000000001",
  role: "admin",
  assignedClientIds: new Set([clientId]),
};

describeDatabase("persisted preparer workbench boundary", () => {
  it("loads counts and return context without changing revision or calculation identity", async () => {
    const database = new pg.Client({ connectionString });
    await database.connect();
    try {
      const before = await snapshot(database);
      const workspace = await getTaxYearWorkspace(context, clientId, 2025);
      const after = await snapshot(database);
      expect(workspace).toMatchObject({ clientId, year: 2025, revision: before.revision });
      expect(workspace?.blockerCount).toBeGreaterThanOrEqual(0);
      expect(workspace?.warningCount).toBeGreaterThanOrEqual(0);
      expect(workspace?.openReviewPointCount).toBeGreaterThanOrEqual(0);
      expect(workspace?.sourceDocumentCount).toBeGreaterThanOrEqual(0);
      expect(after).toEqual(before);
    } finally {
      await database.end();
    }
  });
});

async function snapshot(database: pg.Client) {
  const result = await database.query<{ revision: number; calculation_status: string; result_hash: string | null }>(
    `SELECT ty.revision, ty.calculation_status,
       (SELECT result_hash FROM calculation_runs cr WHERE cr.tax_year_id = ty.id ORDER BY cr.created_at DESC, cr.id DESC LIMIT 1) AS result_hash
     FROM tax_years ty
     WHERE ty.client_id = $1 AND ty.tax_year = 2025`,
    [clientId],
  );
  if (!result.rows[0]) throw new Error("Synthetic 2025 tax year is missing.");
  return result.rows[0];
}
