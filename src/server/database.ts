import "server-only";
import pg from "pg";

let pool: pg.Pool | undefined;

export function databasePool(): pg.Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not configured.");
  pool ??= new pg.Pool({ connectionString, max: 10, idleTimeoutMillis: 20_000, connectionTimeoutMillis: 3_000 });
  return pool;
}

export async function databaseHealth() {
  const started = performance.now();
  const result = await databasePool().query<{ database: string; server_time: string }>("SELECT current_database() AS database, now()::text AS server_time");
  return { connected: true, database: result.rows[0].database, latencyMs: Math.round(performance.now() - started) };
}
