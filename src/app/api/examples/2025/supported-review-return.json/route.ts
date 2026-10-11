import { createSupportedReviewExample2025 } from "@/services/outputs/json-export-service";

export function GET() {
  const body = `${JSON.stringify(createSupportedReviewExample2025(), null, 2)}\n`;
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="nexus-2025-supported-review-example.json"',
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
