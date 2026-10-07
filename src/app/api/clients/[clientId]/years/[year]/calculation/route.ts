import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireSafeMutationRequest } from "@/server/api-guards";
import { getCalculationState, runPersistedCalculation } from "@/server/calculation-service";
import { requestAuthorizationContext } from "@/server/request-auth";

const routeParams=z.object({clientId:z.string().uuid(),year:z.coerce.number().int().min(2025).max(2200)});
const bodySchema=z.object({expectedRevision:z.number().int().positive()}).strict();
export async function GET(_request:Request,{params}:{params:Promise<{clientId:string;year:string}>}){try{const values=routeParams.parse(await params);return NextResponse.json(await getCalculationState(await requestAuthorizationContext(),values.clientId,values.year));}catch(error){return apiError(error);}}
export async function POST(request:Request,{params}:{params:Promise<{clientId:string;year:string}>}){try{requireSafeMutationRequest(request);const values=routeParams.parse(await params);const body=bodySchema.parse(await request.json());return NextResponse.json(await runPersistedCalculation(await requestAuthorizationContext(),values.clientId,values.year,body.expectedRevision),{status:201});}catch(error){return apiError(error);}}
