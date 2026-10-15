import { AppShell } from "@/components/app-shell";
import { DiagnosticAdministration } from "@/components/diagnostic-administration";
import { getDiagnosticAdministrationState } from "@/server/diagnostic-administration-service";
import { requestAuthorizationContext } from "@/server/request-auth";

export const dynamic = "force-dynamic";

export default async function DiagnosticAdministrationPage() {
  const state = await getDiagnosticAdministrationState(await requestAuthorizationContext());
  return <AppShell><DiagnosticAdministration initial={JSON.parse(JSON.stringify(state))}/></AppShell>;
}
