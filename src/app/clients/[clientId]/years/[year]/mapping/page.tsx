import { notFound } from "next/navigation";
import { PersistedMapping } from "@/components/persisted-mapping";
import { getTaxYearWorkspace } from "@/server/client-repository";
import { getMappingState } from "@/server/mapping-persistence-service";
import { requestAuthorizationContext } from "@/server/request-auth";

export const dynamic = "force-dynamic";

export default async function PersistedMappingPage({ params }: { params: Promise<{ clientId: string; year: string }> }) {
  const { clientId, year: rawYear } = await params;
  const year = Number(rawYear);
  if (!Number.isInteger(year)) notFound();
  const context = await requestAuthorizationContext();
  const [workspace, state] = await Promise.all([getTaxYearWorkspace(context, clientId, year), getMappingState(context, clientId, year)]);
  if (!workspace) notFound();
  return <PersistedMapping key={state.revision} clientId={clientId} year={year} clientName={workspace.displayName} initial={JSON.parse(JSON.stringify(state))} />;
}
