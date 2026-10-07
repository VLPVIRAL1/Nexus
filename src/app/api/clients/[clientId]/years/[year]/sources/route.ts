import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireSameOrigin } from "@/server/api-guards";
import { getSourceDocumentState, sourceDocumentTypes, uploadSourceDocument } from "@/server/source-document-service";
import { requestAuthorizationContext } from "@/server/request-auth";
import { WorkflowError } from "@/server/client-workflow-service";
import { enforceRateLimit } from "@/server/rate-limit-service";

const routeParams=z.object({clientId:z.string().uuid(),year:z.coerce.number().int().min(2025).max(2200)});
const metadata=z.object({expectedRevision:z.coerce.number().int().positive(),documentType:z.enum(sourceDocumentTypes)});

export async function GET(_request:Request,{params}:{params:Promise<{clientId:string;year:string}>}){try{const values=routeParams.parse(await params);return NextResponse.json(await getSourceDocumentState(await requestAuthorizationContext(),values.clientId,values.year));}catch(error){return apiError(error);}}
export async function POST(request:Request,{params}:{params:Promise<{clientId:string;year:string}>}){try{requireSameOrigin(request);const length=Number(request.headers.get("content-length")??0);if(Number.isFinite(length)&&length>26*1024*1024)throw new WorkflowError("invalid","Upload request exceeds the 25 MiB source-file limit.");const context=await requestAuthorizationContext();await enforceRateLimit(context,"source.upload");const values=routeParams.parse(await params);const form=await request.formData();const parsed=metadata.parse({expectedRevision:form.get("expectedRevision"),documentType:form.get("documentType")});const file=form.get("file");if(!(file instanceof File))throw new WorkflowError("invalid","A source file is required.");const result=await uploadSourceDocument(context,values.clientId,values.year,parsed.expectedRevision,{fileName:file.name,mimeType:file.type,bytes:new Uint8Array(await file.arrayBuffer()),documentType:parsed.documentType});return NextResponse.json(result,{status:201});}catch(error){return apiError(error);}}
