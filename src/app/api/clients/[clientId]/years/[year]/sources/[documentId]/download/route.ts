import { z } from "zod";
import { apiError } from "@/server/api-guards";
import { downloadSourceDocument } from "@/server/source-document-service";
import { requestAuthorizationContext } from "@/server/request-auth";

const routeParams=z.object({clientId:z.string().uuid(),year:z.coerce.number().int().min(2025).max(2200),documentId:z.string().uuid()});
export async function GET(_request:Request,{params}:{params:Promise<{clientId:string;year:string;documentId:string}>}){try{const values=routeParams.parse(await params);const source=await downloadSourceDocument(await requestAuthorizationContext(),values.clientId,values.year,values.documentId);return new Response(new Uint8Array(source.bytes),{headers:{"Content-Type":source.mimeType,"Content-Disposition":`inline; filename="${source.fileName}"`,"Cache-Control":"private, no-store","X-Content-SHA256":source.checksum,"Content-Security-Policy":"sandbox; default-src 'none'","X-Content-Type-Options":"nosniff"}});}catch(error){return apiError(error);}}
