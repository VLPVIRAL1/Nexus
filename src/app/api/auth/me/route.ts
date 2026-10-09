import { NextResponse } from "next/server";
import { apiError } from "@/server/api-guards";
import { databasePool } from "@/server/database";
import { requestAuthorizationContext } from "@/server/request-auth";

export async function GET() {
  try {
    const context = await requestAuthorizationContext();
    const result = await databasePool().query<{ display_name: string; firm_name: string }>(
      "SELECT u.display_name,f.name AS firm_name FROM users u JOIN firms f ON f.id=$2 WHERE u.id=$1",
      [context.userId, context.firmId],
    );
    const row = result.rows[0];
    return NextResponse.json({ displayName: row?.display_name ?? "Authenticated user", firmName: row?.firm_name ?? "Firm workspace", role: context.role }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
