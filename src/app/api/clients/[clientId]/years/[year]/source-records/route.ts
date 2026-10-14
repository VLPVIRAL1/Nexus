import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireSafeMutationRequest } from "@/server/api-guards";
import { createManualSourceRecord, getSourceRecordState } from "@/server/source-record-service";
import { requestAuthorizationContext } from "@/server/request-auth";
const paramsSchema=z.object({clientId:z.string().uuid(),year:z.coerce.number().int().min(2025).max(2200)});
export async function GET(_request:Request,{params}:{params:Promise<{clientId:string;year:string}>}){try{const values=paramsSchema.parse(await params);return NextResponse.json(await getSourceRecordState(await requestAuthorizationContext(),values.clientId,values.year));}catch(error){return apiError(error);}}
const createSchema=z.object({expectedRevision:z.number().int().positive(),formType:z.string().min(1).max(30),ownerRole:z.enum(["taxpayer","spouse","joint","dependent","unknown"]),sourceDocumentId:z.string().uuid().nullable(),evidenceNote:z.string().max(2000),normalizedData:z.record(z.string(),z.unknown())}).strict();
export async function POST(request:Request,{params}:{params:Promise<{clientId:string;year:string}>}){try{requireSafeMutationRequest(request);const values=paramsSchema.parse(await params);return NextResponse.json(await createManualSourceRecord(await requestAuthorizationContext(),values.clientId,values.year,createSchema.parse(await request.json())),{status:201});}catch(error){return apiError(error);}}
