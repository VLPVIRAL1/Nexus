import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireSafeMutationRequest } from "@/server/api-guards";
import { createOverrideRequest, getOverrideState } from "@/server/override-service";
import { requestAuthorizationContext } from "@/server/request-auth";

const routeParams = z.object({ clientId: z.string().uuid(), year: z.coerce.number().int().min(2025).max(2200) });
const bodySchema = z.object({ expectedRevision: z.number().int().positive(), overridePoint: z.string().min(1).max(100), overrideValue: z.string().regex(/^\d{1,16}(?:\.\d{1,2})?$/), reason: z.string().trim().min(1).max(2000), evidence: z.string().trim().min(1).max(4000) }).strict();
export async function GET(_request: Request, { params }: { params: Promise<{ clientId: string; year: string }> }) { try { const values=routeParams.parse(await params); return NextResponse.json(await getOverrideState(await requestAuthorizationContext(),values.clientId,values.year)); } catch(error){ return apiError(error); } }
export async function POST(request: Request, { params }: { params: Promise<{ clientId: string; year: string }> }) { try { requireSafeMutationRequest(request); const values=routeParams.parse(await params); const body=bodySchema.parse(await request.json()); return NextResponse.json(await createOverrideRequest(await requestAuthorizationContext(),values.clientId,values.year,body.expectedRevision,body.overridePoint,body.overrideValue,body.reason,body.evidence),{status:201}); } catch(error){ return apiError(error); } }
