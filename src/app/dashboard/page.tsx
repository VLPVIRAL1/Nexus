import { AppShell } from "@/components/app-shell";
import { Dashboard } from "@/components/dashboard";
import { listDashboardClients } from "@/server/client-repository";
import { requestAuthorizationContext } from "@/server/request-auth";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ fixture?: string }> }) {
  if ((await searchParams).fixture === "visual" && process.env.APP_ENV !== "production") return <AppShell><Dashboard /></AppShell>;
  const clients = await listDashboardClients(await requestAuthorizationContext());
  return <AppShell><Dashboard clients={clients} /></AppShell>;
}
