import { AppShell } from "@/components/app-shell";
import { Dashboard } from "@/components/dashboard";
import { listDashboardClients } from "@/server/client-repository";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const clients = await listDashboardClients("10000000-0000-4000-8000-000000000001");
  return <AppShell><Dashboard clients={clients} /></AppShell>;
}
