import { notFound } from "next/navigation";
import { PersistedOverrides } from "@/components/persisted-overrides";
import { getTaxYearWorkspace } from "@/server/client-repository";
import { getOverrideState } from "@/server/override-service";
import { requestAuthorizationContext } from "@/server/request-auth";

export const dynamic="force-dynamic";
export default async function OverridesPage({params}:{params:Promise<{clientId:string;year:string}>}){const {clientId,year:rawYear}=await params;const year=Number(rawYear);if(!Number.isInteger(year))notFound();const context=await requestAuthorizationContext();const [workspace,state]=await Promise.all([getTaxYearWorkspace(context,clientId,year),getOverrideState(context,clientId,year)]);if(!workspace)notFound();return <PersistedOverrides key={`${state.revision}:${state.overrides.map(({version})=>version).join("-")}`} clientId={clientId} year={year} clientName={workspace.displayName} initial={JSON.parse(JSON.stringify(state))}/>;}
