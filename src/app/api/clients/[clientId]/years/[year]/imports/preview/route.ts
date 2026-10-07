import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireSameOrigin } from "@/server/api-guards";
import { getImportState, stageCanonicalImport } from "@/server/import-persistence-service";
import { enforceRateLimit } from "@/server/rate-limit-service";
import { requestAuthorizationContext } from "@/server/request-auth";

const maximumImportBytes = 10 * 1024 * 1024;
const routeParams = z.object({ clientId: z.string().uuid(), year: z.coerce.number().int().min(2025).max(2200) });
const fileNameSchema = z.string().trim().min(1).max(255).regex(/^[^/\\]+\.json$/i, "Use a .json filename without path separators");

export async function GET(_request:Request,{params}:{params:Promise<{clientId:string;year:string}>}){try{const{clientId,year}=routeParams.parse(await params);return NextResponse.json(await getImportState(await requestAuthorizationContext(),clientId,year));}catch(error){return apiError(error);}}

export async function POST(request: Request, { params }: { params: Promise<{ clientId: string; year: string }> }) {
  try {
    requireSameOrigin(request);
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > maximumImportBytes) return NextResponse.json({ error: "IMPORT_TOO_LARGE" }, { status: 413 });
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return NextResponse.json({ error: "unsupported_media_type" }, { status: 415 });
    const context = await requestAuthorizationContext();
    await enforceRateLimit(context, "import.preview");
    const { clientId, year } = routeParams.parse(await params);
    const fileName = fileNameSchema.parse(request.headers.get("x-file-name") ?? "canonical-import.json");
    const rawBytes = new Uint8Array(await request.arrayBuffer());
    return NextResponse.json(await stageCanonicalImport(context, clientId, year, fileName, rawBytes), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
