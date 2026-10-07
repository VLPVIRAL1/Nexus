import { notFound } from "next/navigation";
import { PersistedImports } from "@/components/persisted-imports";
import { getTaxYearWorkspace } from "@/server/client-repository";
import { getImportState } from "@/server/import-persistence-service";
import { requestAuthorizationContext } from "@/server/request-auth";
export const dynamic="force-dynamic";export default async function ImportsPage({params}:{params:Promise<{clientId:string;year:string}>}){const{clientId,year:rawYear}=await params;const year=Number(rawYear);if(!Number.isInteger(year))notFound();const context=await requestAuthorizationContext();const[workspace,state]=await Promise.all([getTaxYearWorkspace(context,clientId,year),getImportState(context,clientId,year)]);if(!workspace)notFound();return <PersistedImports key={state.revision} clientId={clientId} year={year} clientName={workspace.displayName} initial={JSON.parse(JSON.stringify(state))}/>;}
