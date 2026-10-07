import { notFound } from "next/navigation";
import { PersistedSources } from "@/components/persisted-sources";
import { getTaxYearWorkspace } from "@/server/client-repository";
import { requestAuthorizationContext } from "@/server/request-auth";
import { getSourceDocumentState } from "@/server/source-document-service";

export const dynamic="force-dynamic";
export default async function SourcesPage({params}:{params:Promise<{clientId:string;year:string}>}){const{clientId,year:rawYear}=await params;const year=Number(rawYear);if(!Number.isInteger(year))notFound();const context=await requestAuthorizationContext();const[workspace,state]=await Promise.all([getTaxYearWorkspace(context,clientId,year),getSourceDocumentState(context,clientId,year)]);if(!workspace)notFound();return <PersistedSources clientId={clientId} year={year} clientName={workspace.displayName} initial={JSON.parse(JSON.stringify(state))}/>;}
