import { z } from "zod";
import { apiError } from "@/server/api-guards";
import { downloadPersistedArtifact } from "@/server/output-persistence-service";
import { requestAuthorizationContext } from "@/server/request-auth";

const routeParams = z.object({
  clientId: z.string().uuid(),
  year: z.coerce.number().int().min(2025).max(2200),
  artifactId: z.string().uuid(),
});

export async function GET(_request: Request, { params }: { params: Promise<{ clientId: string; year: string; artifactId: string }> }) {
  try {
    const values = routeParams.parse(await params);
    const artifact = await downloadPersistedArtifact(await requestAuthorizationContext(), values.clientId, values.year, values.artifactId);
    return new Response(new Uint8Array(artifact.bytes), {
      headers: {
        "Content-Type": artifact.mimeType,
        "Content-Disposition": `attachment; filename="${artifact.fileName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-SHA256": artifact.contentHash ?? "",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
