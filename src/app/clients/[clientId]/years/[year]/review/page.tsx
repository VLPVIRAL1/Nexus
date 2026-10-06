import { notFound } from "next/navigation";
import { PersistedReview } from "@/components/persisted-review";
import { getTaxYearWorkspace } from "@/server/client-repository";
import { getReviewState } from "@/server/review-service";
import { requestAuthorizationContext } from "@/server/request-auth";

export const dynamic = "force-dynamic";
export default async function PersistedReviewPage({ params }: { params: Promise<{ clientId: string; year: string }> }) {
  const { clientId, year: rawYear } = await params; const year = Number(rawYear); if (!Number.isInteger(year)) notFound();
  const context = await requestAuthorizationContext();
  const [workspace, state] = await Promise.all([getTaxYearWorkspace(context, clientId, year), getReviewState(context, clientId, year)]);
  if (!workspace) notFound();
  return <PersistedReview key={`${state.revision}:${state.points.map(({ version }) => version).join("-")}`} clientId={clientId} year={year} clientName={workspace.displayName} initial={JSON.parse(JSON.stringify(state))} />;
}
