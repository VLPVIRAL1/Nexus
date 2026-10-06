import { notFound } from "next/navigation";
import { TaxWorkspace } from "@/components/workspace";
import { getTaxYearWorkspace } from "@/server/client-repository";
import { requestAuthorizationContext } from "@/server/request-auth";

export const dynamic = "force-dynamic";

export default async function PersistedTaxYearWorkspacePage({ params }: { params: Promise<{ clientId: string; year: string }> }) {
  const { clientId, year: rawYear } = await params;
  const year = Number(rawYear);
  if (!Number.isInteger(year)) notFound();
  const workspace = await getTaxYearWorkspace(await requestAuthorizationContext(), clientId, year);
  if (!workspace) notFound();
  return <TaxWorkspace context={workspace} />;
}
