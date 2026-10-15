import { AppShell } from "@/components/app-shell";
import { RetentionAdministration } from "@/components/retention-administration";
import { requestAuthorizationContext } from "@/server/request-auth";
import { getRetentionState } from "@/server/retention-service";
import Link from "next/link";

export const dynamic = "force-dynamic";
export default async function AdministrationPage() {
  const state = await getRetentionState(await requestAuthorizationContext());
  return <AppShell><div className="administration-links"><Link className="panel" href="/administration/diagnostics"><b>Federal diagnostic registry</b><span>Definitions, evidence gaps, external gates, and manifest status</span></Link><Link className="panel" href="/administration/release-closure"><b>Release closure</b><span>Approvals, evidence, and production readiness gates</span></Link></div><RetentionAdministration initial={JSON.parse(JSON.stringify(state))}/></AppShell>;
}
