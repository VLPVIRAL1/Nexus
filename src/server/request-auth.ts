import "server-only";
import { cookies, headers } from "next/headers";
import type { AuthorizationContext } from "@/services/authorization";
import { databasePool } from "./database";
import { AuthenticationError, loadAuthorizationContext, resolveSession } from "./session-service";

const syntheticUserId = "20000000-0000-4000-8000-000000000001";
const syntheticFirmId = "10000000-0000-4000-8000-000000000001";
const syntheticClientId = "30000000-0000-4000-8000-000000000001";

export async function requestAuthorizationContext(): Promise<AuthorizationContext> {
  const cookieStore = await cookies();
  const requestHeaders = await headers();
  const token = cookieStore.get("nexus_session")?.value;
  if (token) return resolveSession(token, requestHeaders.get("user-agent"));

  if (process.env.APP_ENV === "production") throw new AuthenticationError();
  if (!process.env.DATABASE_URL) {
    return { userId: syntheticUserId, firmId: syntheticFirmId, role: "preparer", assignedClientIds: new Set([syntheticClientId]) };
  }
  return loadAuthorizationContext(
    databasePool(),
    process.env.NEXUS_DEV_USER_ID ?? syntheticUserId,
    process.env.NEXUS_DEV_FIRM_ID ?? syntheticFirmId,
  );
}
