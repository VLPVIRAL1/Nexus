import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/server/api-guards";
import { getSourceRecordState } from "@/server/source-record-service";
import { requestAuthorizationContext } from "@/server/request-auth";
const paramsSchema=z.object({clientId:z.string().uuid(),year:z.coerce.number().int().min(2025).max(2200)});
export async function GET(_request:Request,{params}:{params:Promise<{clientId:string;year:string}>}){try{const values=paramsSchema.parse(await params);return NextResponse.json(await getSourceRecordState(await requestAuthorizationContext(),values.clientId,values.year));}catch(error){return apiError(error);}}
