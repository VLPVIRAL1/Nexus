import pg from "pg";
import { describe, expect, it } from "vitest";

const connectionString = process.env.DATABASE_URL;
const suite = connectionString ? describe : describe.skip;

suite("PostgreSQL foundation", () => {
  it("has the foundation migration and synthetic tax year", async () => {
    const client = new pg.Client({ connectionString });
    await client.connect();
    try {
      expect((await client.query("SELECT name FROM _migrations WHERE name='0001_foundation.sql'")).rowCount).toBe(1);
      const result = await client.query("SELECT tax_year, preparation_status FROM tax_years WHERE id='40000000-0000-4000-8000-000000000001'");
      expect(result.rows[0]).toEqual({ tax_year: 2025, preparation_status: "in_preparation" });
    } finally { await client.end(); }
  });

  it("enforces append-only audit history", async () => {
    const client = new pg.Client({ connectionString });
    await client.connect();
    await client.query("BEGIN");
    try {
      const inserted = await client.query<{ id: string }>("INSERT INTO audit_events(firm_id,tax_year_id,actor_id,event_type,record_type,record_id,event_hash) VALUES('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','test','tax_year','synthetic','hash') RETURNING id");
      await expect(client.query("UPDATE audit_events SET event_type='changed' WHERE id=$1", [inserted.rows[0].id])).rejects.toThrow("append-only");
    } finally { await client.query("ROLLBACK"); await client.end(); }
  });
});
