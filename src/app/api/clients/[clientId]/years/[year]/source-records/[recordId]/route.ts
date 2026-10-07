import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError,requireSafeMutationRequest } from "@/server/api-guards";
import { reviseSourceRecord } from "@/server/source-record-service";
import { requestAuthorizationContext } from "@/server/request-auth";
const paramsSchema=z.object({clientId:z.string().uuid(),year:z.coerce.number().int().min(2025).max(2200),recordId:z.string().uuid()});const bodySchema=z.object({expectedRevision:z.number().int().positive(),expectedVersion:z.number().int().positive(),action:z.enum(["correct","void","exclude_duplicate"]),reason:z.string().trim().min(1).max(2000),normalizedData:z.record(z.string(),z.unknown()).nullable(),ownerRole:z.enum(["taxpayer","spouse","joint","dependent","unknown"]).optional()}).strict();
export async function POST(request:Request,{params}:{params:Promise<{clientId:string;year:string;recordId:string}>}){try{requireSafeMutationRequest(request);const values=paramsSchema.parse(await params);const body=bodySchema.parse(await request.json());return NextResponse.json(await reviseSourceRecord(await requestAuthorizationContext(),values.clientId,values.year,values.recordId,body.expectedRevision,body.expectedVersion,body.action,body.reason,body.normalizedData,body.ownerRole),{status:201});}catch(error){return apiError(error);}}
