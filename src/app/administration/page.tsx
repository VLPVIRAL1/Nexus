import { AppShell } from "@/components/app-shell";
import { RetentionAdministration } from "@/components/retention-administration";
import { requestAuthorizationContext } from "@/server/request-auth";
import { getRetentionState } from "@/server/retention-service";

export const dynamic = "force-dynamic";
export default async function AdministrationPage() {
  const state = await getRetentionState(await requestAuthorizationContext());
  return <AppShell><RetentionAdministration initial={JSON.parse(JSON.stringify(state))}/></AppShell>;
}
