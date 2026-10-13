import { notFound } from "next/navigation";
import { PersistedFederalCredits } from "@/components/persisted-federal-credits";
import { getTaxYearWorkspace } from "@/server/client-repository";
import { getFederalCreditState } from "@/server/federal-credit-service";
import { requestAuthorizationContext } from "@/server/request-auth";

export const dynamic = "force-dynamic";

export default async function CreditsPage({ params }: { params: Promise<{ clientId: string; year: string }> }) {
  const { clientId, year: rawYear } = await params;
  const year = Number(rawYear);
  if (!Number.isInteger(year)) notFound();
  const context = await requestAuthorizationContext();
  const [workspace, state] = await Promise.all([getTaxYearWorkspace(context, clientId, year), getFederalCreditState(context, clientId, year)]);
  if (!workspace) notFound();
  return <main><PersistedFederalCredits clientId={clientId} year={year} clientName={workspace.displayName} initial={JSON.parse(JSON.stringify(state))}/></main>;
}
