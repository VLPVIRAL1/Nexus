import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ClientProfile } from "@/components/client-profile";
import { getClientProfile } from "@/server/client-repository";
import { requestAuthorizationContext } from "@/server/request-auth";

export const dynamic = "force-dynamic";

export default async function ClientProfilePage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const client = await getClientProfile(await requestAuthorizationContext(), clientId);
  if (!client) notFound();
  return <AppShell><ClientProfile client={client} /></AppShell>;
}
