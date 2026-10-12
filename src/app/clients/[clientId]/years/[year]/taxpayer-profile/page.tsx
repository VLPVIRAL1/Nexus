import { notFound } from "next/navigation";
import { PersistedPeople } from "@/components/persisted-people";
import { getPeopleState } from "@/server/client-workflow-service";
import { getTaxYearWorkspace } from "@/server/client-repository";
import { requestAuthorizationContext } from "@/server/request-auth";

export const dynamic = "force-dynamic";

export default async function TaxpayerProfilePage({ params }: { params: Promise<{ clientId: string; year: string }> }) {
  const { clientId, year: rawYear } = await params;
  const year = Number(rawYear);
  if (!Number.isInteger(year)) notFound();
  const context = await requestAuthorizationContext();
  const [workspace, state] = await Promise.all([getTaxYearWorkspace(context, clientId, year), getPeopleState(context, clientId, year)]);
  if (!workspace) notFound();
  return <main><PersistedPeople key={state.revision} clientId={clientId} year={year} clientName={workspace.displayName} initial={JSON.parse(JSON.stringify(state))}/></main>;
}
