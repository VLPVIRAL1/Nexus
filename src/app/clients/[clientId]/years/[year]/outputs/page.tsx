import { notFound } from "next/navigation";
import { PersistedOutputs } from "@/components/persisted-outputs";
import { getTaxYearWorkspace } from "@/server/client-repository";
import { getArtifactState } from "@/server/output-persistence-service";
import { requestAuthorizationContext } from "@/server/request-auth";

export const dynamic = "force-dynamic";

export default async function OutputsPage({ params }: { params: Promise<{ clientId: string; year: string }> }) {
  const { clientId, year: rawYear } = await params;
  const year = Number(rawYear);
  if (!Number.isInteger(year)) notFound();
  const context = await requestAuthorizationContext();
  const [workspace, state] = await Promise.all([
    getTaxYearWorkspace(context, clientId, year),
    getArtifactState(context, clientId, year),
  ]);
  if (!workspace) notFound();
  return <PersistedOutputs clientId={clientId} year={year} clientName={workspace.displayName} initial={JSON.parse(JSON.stringify(state))} />;
}
