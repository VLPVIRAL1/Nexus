import { notFound } from "next/navigation";
import { PersistedActivities } from "@/components/persisted-activities";
import { getActivityFormState } from "@/server/activity-form-service";
import { getTaxYearWorkspace } from "@/server/client-repository";
import { requestAuthorizationContext } from "@/server/request-auth";

export const dynamic="force-dynamic";
export default async function ActivitiesPage({params}:{params:Promise<{clientId:string;year:string}>}){const{clientId,year:rawYear}=await params;const year=Number(rawYear);if(!Number.isInteger(year))notFound();const context=await requestAuthorizationContext();const[workspace,state]=await Promise.all([getTaxYearWorkspace(context,clientId,year),getActivityFormState(context,clientId,year)]);if(!workspace)notFound();return <main><PersistedActivities key={`${state.revision}:${state.activities.map((item)=>item.version).join("-")}`} clientId={clientId} year={year} clientName={workspace.displayName} initial={JSON.parse(JSON.stringify(state))}/></main>;}
