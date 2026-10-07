import { notFound } from "next/navigation";
import { PersistedCalculation } from "@/components/persisted-calculation";
import { getTaxYearWorkspace } from "@/server/client-repository";
import { getCalculationState } from "@/server/calculation-service";
import { requestAuthorizationContext } from "@/server/request-auth";

export const dynamic="force-dynamic";
export default async function CalculationPage({params}:{params:Promise<{clientId:string;year:string}>}){const {clientId,year:rawYear}=await params;const year=Number(rawYear);if(!Number.isInteger(year))notFound();const context=await requestAuthorizationContext();const [workspace,state]=await Promise.all([getTaxYearWorkspace(context,clientId,year),getCalculationState(context,clientId,year)]);if(!workspace)notFound();return <PersistedCalculation key={`${state.revision}:${state.latestRun?.id??"none"}`} clientId={clientId} year={year} clientName={workspace.displayName} initial={JSON.parse(JSON.stringify(state))}/>;}
