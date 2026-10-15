import { randomUUID } from "node:crypto";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { getTaxYearWorkspace } from "@/server/client-repository";
import type { AuthorizationContext } from "@/services/authorization";

const connectionString = process.env.DATABASE_URL;
const describeDatabase = connectionString ? describe : describe.skip;
const firmId = "10000000-0000-4000-8000-000000000001";

describeDatabase("persisted preparer workbench boundary", () => {
  it("loads counts and return context without changing revision or calculation identity", async () => {
    const database = new pg.Client({ connectionString });
    const clientId = randomUUID();
    const taxYearId = randomUUID();
    const context: AuthorizationContext = {
      userId: "20000000-0000-4000-8000-000000000001",
      firmId,
      role: "admin",
      assignedClientIds: new Set([clientId]),
    };
    await database.connect();
    try {
      await database.query(
        "INSERT INTO clients(id, firm_id, client_code, display_name) VALUES($1, $2, $3, 'Synthetic Workbench Boundary')",
        [clientId, firmId, `WB${clientId.slice(0, 8)}`],
      );
      await database.query("INSERT INTO tax_years(id, client_id, tax_year) VALUES($1, $2, 2025)", [taxYearId, clientId]);
      const before = await snapshot(database, clientId);
      const workspace = await getTaxYearWorkspace(context, clientId, 2025);
      const after = await snapshot(database, clientId);
      expect(workspace).toMatchObject({ clientId, year: 2025, revision: before.revision });
      expect(workspace?.blockerCount).toBeGreaterThanOrEqual(0);
      expect(workspace?.warningCount).toBeGreaterThanOrEqual(0);
      expect(workspace?.openReviewPointCount).toBeGreaterThanOrEqual(0);
      expect(workspace?.sourceDocumentCount).toBeGreaterThanOrEqual(0);
      expect(after).toEqual(before);
    } finally {
      await database.query("DELETE FROM tax_years WHERE id = $1", [taxYearId]);
      await database.query("DELETE FROM clients WHERE id = $1", [clientId]);
      await database.end();
    }
  });
});

async function snapshot(database: pg.Client, clientId: string) {
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
