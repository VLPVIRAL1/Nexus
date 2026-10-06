import "server-only";
import type { ClientSummary } from "@/domain/types";
import { clients as syntheticClients } from "@/domain/demo-data";
import { databasePool } from "./database";
import type { AuthorizationContext } from "@/services/authorization";

interface ClientRow {
  id: string; client_code: string; display_name: string; tax_year: number; preparation_status: string;
  preparer: string | null; reviewer: string | null; open_points: string; blockers: string; updated_at: Date;
}

export async function listDashboardClients(context: AuthorizationContext): Promise<ClientSummary[]> {
  if (!process.env.DATABASE_URL) {
    if (process.env.APP_ENV === "production") throw new Error("Production cannot use synthetic client fallback data.");
    return syntheticClients;
  }
  const result = await databasePool().query<ClientRow>(`
    SELECT c.id, c.client_code, c.display_name, ty.tax_year, ty.preparation_status,
      MAX(u.display_name) FILTER (WHERE ca.kind='preparer') AS preparer,
      MAX(u.display_name) FILTER (WHERE ca.kind='reviewer') AS reviewer,
      COUNT(DISTINCT rp.id) FILTER (WHERE rp.review_status IN ('open','waiting'))::text AS open_points,
      COUNT(DISTINCT vi.id) FILTER (WHERE vi.resolved_at IS NULL AND vi.severity='blocking')::text AS blockers,
      ty.updated_at
    FROM clients c
    JOIN tax_years ty ON ty.client_id=c.id
    LEFT JOIN client_assignments ca ON ca.client_id=c.id
    LEFT JOIN users u ON u.id=ca.user_id
    LEFT JOIN review_points rp ON rp.tax_year_id=ty.id
    LEFT JOIN validation_issues vi ON vi.tax_year_id=ty.id
    WHERE c.firm_id=$1 AND c.archived_at IS NULL
      AND ($2::boolean OR EXISTS (SELECT 1 FROM client_assignments scope_ca WHERE scope_ca.client_id=c.id AND scope_ca.user_id=$3))
    GROUP BY c.id,ty.id ORDER BY ty.updated_at DESC`, [context.firmId, context.role === "admin", context.userId]);
  return result.rows.map((row) => ({
    id: row.id, code: row.client_code, taxpayer: row.display_name, maskedTin: "***-**-••••", returnType: "1040", taxYear: 2025,
    status: displayStatus(row.preparation_status), preparer: row.preparer ?? "Unassigned", reviewer: row.reviewer ?? "Unassigned",
    openPoints: Number(row.open_points), blockers: Number(row.blockers), updatedAt: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(row.updated_at),
  }));
}

function displayStatus(value: string): ClientSummary["status"] {
  const statuses: Record<string, ClientSummary["status"]> = { documents_pending: "Documents Pending", in_preparation: "In Preparation", ready_for_review: "Ready for Review", changes_requested: "Changes Requested", reviewed_draft: "Reviewed Draft" };
  return statuses[value] ?? "In Preparation";
}
