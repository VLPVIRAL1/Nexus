import { NextResponse } from "next/server";
import { databaseHealth } from "@/server/database";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!process.env.DATABASE_URL) return NextResponse.json({ status: "degraded", database: "not_configured" }, { status: 503 });
  try { return NextResponse.json({ status: "ok", database: await databaseHealth() }); }
  catch { return NextResponse.json({ status: "unavailable", database: "connection_failed" }, { status: 503 }); }
}
