import { createHash } from "node:crypto";
import { createBlankCanonicalTemplate2025 } from "@/services/outputs/json-export-service";

export const dynamic = "force-static";

export async function GET() {
  const body = `${JSON.stringify(createBlankCanonicalTemplate2025(), null, 2)}\n`;
  const digest = createHash("sha256").update(body).digest("hex");
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="taxpayer-import-template-2025-v1.3.0-review.json"',
      "Cache-Control": "public, max-age=3600, immutable",
      ETag: `"sha256-${digest}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
