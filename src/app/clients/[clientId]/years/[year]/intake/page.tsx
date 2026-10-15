import { notFound } from "next/navigation";
import { PersistedIntake } from "@/components/persisted-intake";
import { getTaxYearWorkspace } from "@/server/client-repository";
import { getIntakeState } from "@/server/intake-service";
import { requestAuthorizationContext } from "@/server/request-auth";

export const dynamic = "force-dynamic";

export default async function PersistedIntakePage({ params }: { params: Promise<{ clientId: string; year: string }> }) {
  const { clientId, year: rawYear } = await params;
  const year = Number(rawYear);
  if (!Number.isInteger(year)) notFound();
  const context = await requestAuthorizationContext();
  const [workspace, state] = await Promise.all([getTaxYearWorkspace(context, clientId, year), getIntakeState(context, clientId, year)]);
  if (!workspace) notFound();
  return <PersistedIntake clientId={clientId} year={year} clientName={workspace.displayName} initial={JSON.parse(JSON.stringify(state))} />;
}
