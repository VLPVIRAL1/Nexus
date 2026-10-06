import { AppShell } from "@/components/app-shell";
import { Dashboard } from "@/components/dashboard";
import { listDashboardClients } from "@/server/client-repository";
import { requestAuthorizationContext } from "@/server/request-auth";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const clients = await listDashboardClients(await requestAuthorizationContext());
  return <AppShell><Dashboard clients={clients} /></AppShell>;
}
