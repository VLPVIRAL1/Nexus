import { notFound } from "next/navigation";
import { PersistedReturnProfile } from "@/components/persisted-return-profile";
import { getTaxYearWorkspace } from "@/server/client-repository";
import { getReturnProfileState } from "@/server/return-profile-service";
import { requestAuthorizationContext } from "@/server/request-auth";

export const dynamic = "force-dynamic";

export default async function ReturnProfilePage({ params }: { params: Promise<{ clientId: string; year: string }> }) {
  const { clientId, year: rawYear } = await params;
  const year = Number(rawYear);
  if (!Number.isInteger(year)) notFound();
  const context = await requestAuthorizationContext();
  const [workspace, state] = await Promise.all([getTaxYearWorkspace(context, clientId, year), getReturnProfileState(context, clientId, year)]);
  if (!workspace) notFound();
  return <PersistedReturnProfile clientId={clientId} year={year} clientName={workspace.displayName} initial={JSON.parse(JSON.stringify(state))} />;
}
