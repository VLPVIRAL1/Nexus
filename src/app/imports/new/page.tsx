import { AppShell } from "@/components/app-shell";
import { ImportStart } from "@/components/import-start";
import { listDashboardClients } from "@/server/client-repository";
import { requestAuthorizationContext } from "@/server/request-auth";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const clients = await listDashboardClients(await requestAuthorizationContext(), { limit: 200 });
  return <AppShell><ImportStart clients={clients}/></AppShell>;
}
