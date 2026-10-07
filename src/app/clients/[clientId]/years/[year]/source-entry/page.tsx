import { notFound } from "next/navigation";
import { RegistrySourceEntry } from "@/components/registry-source-entry";
import { getTaxYearWorkspace } from "@/server/client-repository";
import { requestAuthorizationContext } from "@/server/request-auth";
import { getSourceRecordState } from "@/server/source-record-service";
export const dynamic="force-dynamic";export default async function SourceEntryPage({params}:{params:Promise<{clientId:string;year:string}>}){const{clientId,year:rawYear}=await params;const year=Number(rawYear);if(!Number.isInteger(year))notFound();const context=await requestAuthorizationContext();const[workspace,state]=await Promise.all([getTaxYearWorkspace(context,clientId,year),getSourceRecordState(context,clientId,year)]);if(!workspace)notFound();return <RegistrySourceEntry key={state.revision} clientId={clientId} year={year} clientName={workspace.displayName} initial={JSON.parse(JSON.stringify(state))}/>;}
