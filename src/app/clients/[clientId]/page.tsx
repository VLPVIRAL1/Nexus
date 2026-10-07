import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ClientProfile } from "@/components/client-profile";
import { getAssignmentState } from "@/server/assignment-service";
import { getClientProfile } from "@/server/client-repository";
import { requestAuthorizationContext } from "@/server/request-auth";

export const dynamic = "force-dynamic";

export default async function ClientProfilePage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const context = await requestAuthorizationContext();
  const client = await getClientProfile(context, clientId);
  if (!client) notFound();
  const assignmentState = await getAssignmentState(context, clientId);
  return <AppShell><ClientProfile client={client} initialAssignmentState={assignmentState} /></AppShell>;
}
