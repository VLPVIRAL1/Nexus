import { notFound } from "next/navigation";
import { PersistedAdvancedFederal } from "@/components/persisted-advanced-federal";
import { getAdvancedFederalState } from "@/server/advanced-federal-service";
import { getTaxYearWorkspace } from "@/server/client-repository";
import { requestAuthorizationContext } from "@/server/request-auth";

export const dynamic = "force-dynamic";

export default async function AdvancedFederalPage({ params }: { params: Promise<{ clientId: string; year: string }> }) {
  const { clientId, year: rawYear } = await params;
  const year = Number(rawYear);
  if (!Number.isInteger(year)) notFound();
  const context = await requestAuthorizationContext();
  const [workspace, state] = await Promise.all([getTaxYearWorkspace(context, clientId, year), getAdvancedFederalState(context, clientId, year)]);
  if (!workspace) notFound();
  return <PersistedAdvancedFederal clientId={clientId} year={year} clientName={workspace.displayName} initial={JSON.parse(JSON.stringify(state))}/>;
}
