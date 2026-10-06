import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");
const client = new pg.Client({ connectionString });
await client.connect();
try {
  await client.query("CREATE TABLE IF NOT EXISTS _migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  const applied = new Set((await client.query<{ name: string }>("SELECT name FROM _migrations")).rows.map((row) => row.name));
  for (const name of (await readdir(resolve("migrations"))).filter((file) => file.endsWith(".sql")).sort()) {
    if (applied.has(name)) continue;
    const sql = await readFile(resolve("migrations", name), "utf8");
    await client.query("BEGIN");
    try { await client.query(sql); await client.query("INSERT INTO _migrations(name) VALUES($1)", [name]); await client.query("COMMIT"); }
    catch (error) { await client.query("ROLLBACK"); throw error; }
    process.stdout.write(`Applied ${name}\n`);
  }
} finally { await client.end(); }
