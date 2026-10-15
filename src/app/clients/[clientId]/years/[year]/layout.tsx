import { createHash } from "node:crypto";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PreparerWorkbench } from "@/components/preparer-workbench";
import { getTaxYearWorkspace } from "@/server/client-repository";
import { requestAuthorizationContext } from "@/server/request-auth";

export const dynamic = "force-dynamic";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function TaxYearLayout({ children, params }: { children: React.ReactNode; params: Promise<{ clientId: string; year: string }> }) {
  const { clientId, year: rawYear } = await params;
  const year = Number(rawYear);
  if (!uuidPattern.test(clientId) || !Number.isInteger(year)) notFound();
  const authorization = await requestAuthorizationContext();
  const context = await getTaxYearWorkspace(authorization, clientId, year);
  if (!context) notFound();
  if (process.env.PREPARER_WORKBENCH_ENABLED === "false") return <AppShell>{children}</AppShell>;
  const preferenceScope = createHash("sha256").update(`${authorization.firmId}:${authorization.userId}`).digest("hex").slice(0, 24);
  return <PreparerWorkbench context={context} preferenceScope={preferenceScope}>{children}</PreparerWorkbench>;
}
