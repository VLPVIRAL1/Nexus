import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireSafeMutationRequest } from "@/server/api-guards";
import { reviewOverride, revertOverride } from "@/server/override-service";
import { requestAuthorizationContext } from "@/server/request-auth";

const routeParams=z.object({clientId:z.string().uuid(),year:z.coerce.number().int().min(2025).max(2200),overrideId:z.string().uuid()});
const bodySchema=z.discriminatedUnion("action",[
  z.object({action:z.literal("review"),expectedRevision:z.number().int().positive(),expectedVersion:z.number().int().positive(),decision:z.enum(["approved","rejected"]),reviewNote:z.string().trim().min(1).max(4000)}).strict(),
  z.object({action:z.literal("revert"),expectedRevision:z.number().int().positive(),expectedVersion:z.number().int().positive(),reason:z.string().trim().min(1).max(4000)}).strict(),
]);
export async function PATCH(request:Request,{params}:{params:Promise<{clientId:string;year:string;overrideId:string}>}){try{requireSafeMutationRequest(request);const values=routeParams.parse(await params);const body=bodySchema.parse(await request.json());const context=await requestAuthorizationContext();return NextResponse.json(body.action==="review"?await reviewOverride(context,values.clientId,values.year,values.overrideId,body.expectedRevision,body.expectedVersion,body.decision,body.reviewNote):await revertOverride(context,values.clientId,values.year,values.overrideId,body.expectedRevision,body.expectedVersion,body.reason));}catch(error){return apiError(error);}}
