import "server-only";
import type { ClientSummary } from "@/domain/types";
import { clients as syntheticClients } from "@/domain/demo-data";
import { databasePool } from "./database";
import type { AuthorizationContext } from "@/services/authorization";

interface ClientRow {
  id: string; client_code: string; display_name: string; tax_year: number; preparation_status: string;
  preparer: string | null; reviewer: string | null; open_points: string; blockers: string; updated_at: Date;
}

export interface ClientProfileRecord {
  id: string;
  code: string;
  displayName: string;
  version: number;
  years: Array<{
    id: string;
    year: number;
    revision: number;
    status: ClientSummary["status"];
    taxpayer: string | null;
    spouse: string | null;
    preparer: string | null;
    reviewer: string | null;
    calculationStatus: string;
    updatedAt: string;
  }>;
}

export interface TaxYearWorkspaceRecord {
  clientId: string;
  code: string;
  displayName: string;
  year: number;
  status: ClientSummary["status"];
  revision: number;
  taxpayer: string | null;
  spouse: string | null;
  reviewer: string | null;
  calculationStatus: string;
}

export async function listDashboardClients(context: AuthorizationContext, options: { query?: string; limit?: number } = {}): Promise<ClientSummary[]> {
  if (!process.env.DATABASE_URL) {
    if (process.env.APP_ENV === "production") throw new Error("Production cannot use synthetic client fallback data.");
    return syntheticClients;
  }
  const query = options.query?.trim().slice(0, 100) || null;
  const limit = Math.max(1, Math.min(options.limit ?? 100, 200));
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
      AND ($4::text IS NULL OR lower(c.client_code) LIKE lower($4)||'%' OR lower(c.display_name) LIKE lower($4)||'%')
    GROUP BY c.id,ty.id ORDER BY ty.updated_at DESC LIMIT $5`, [context.firmId, context.role === "admin", context.userId, query, limit]);
  return result.rows.map((row) => ({
    id: row.id, code: row.client_code, taxpayer: row.display_name, maskedTin: "***-**-••••", returnType: "1040", taxYear: 2025,
    status: displayStatus(row.preparation_status), preparer: row.preparer ?? "Unassigned", reviewer: row.reviewer ?? "Unassigned",
    openPoints: Number(row.open_points), blockers: Number(row.blockers), updatedAt: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(row.updated_at),
  }));
}

export async function getClientProfile(context: AuthorizationContext, clientId: string): Promise<ClientProfileRecord | null> {
  if (!process.env.DATABASE_URL) return null;
  const result = await databasePool().query<{
    id: string; client_code: string; display_name: string; version: number; tax_year_id: string | null; tax_year: number | null;
    revision: number | null; preparation_status: string | null; calculation_status: string | null; updated_at: Date | null;
    taxpayer: string | null; spouse: string | null; preparer: string | null; reviewer: string | null;
  }>(`
    SELECT c.id,c.client_code,c.display_name,c.version,ty.id AS tax_year_id,ty.tax_year,ty.revision,ty.preparation_status,
      ty.calculation_status,ty.updated_at,
      MAX(p.legal_name) FILTER (WHERE p.role='taxpayer') AS taxpayer,
      MAX(p.legal_name) FILTER (WHERE p.role='spouse') AS spouse,
      MAX(u.display_name) FILTER (WHERE ca.kind='preparer') AS preparer,
      MAX(u.display_name) FILTER (WHERE ca.kind='reviewer') AS reviewer
    FROM clients c
    LEFT JOIN tax_years ty ON ty.client_id=c.id
    LEFT JOIN people p ON p.tax_year_id=ty.id
    LEFT JOIN client_assignments ca ON ca.client_id=c.id
    LEFT JOIN users u ON u.id=ca.user_id
    WHERE c.id=$1 AND c.firm_id=$2 AND c.archived_at IS NULL
      AND ($3::boolean OR EXISTS (SELECT 1 FROM client_assignments scope_ca WHERE scope_ca.client_id=c.id AND scope_ca.user_id=$4))
    GROUP BY c.id,ty.id
    ORDER BY ty.tax_year DESC NULLS LAST`, [clientId, context.firmId, context.role === "admin", context.userId]);
  const first = result.rows[0];
  if (!first) return null;
  return {
    id: first.id,
    code: first.client_code,
    displayName: first.display_name,
    version: first.version,
    years: result.rows.flatMap((row) => row.tax_year_id && row.tax_year != null && row.revision != null && row.preparation_status && row.updated_at ? [{
      id: row.tax_year_id,
      year: row.tax_year,
      revision: row.revision,
      status: displayStatus(row.preparation_status),
      taxpayer: row.taxpayer,
      spouse: row.spouse,
      preparer: row.preparer,
      reviewer: row.reviewer,
      calculationStatus: row.calculation_status ?? "not_run",
      updatedAt: row.updated_at.toISOString(),
    }] : []),
  };
}

export async function getTaxYearWorkspace(context: AuthorizationContext, clientId: string, year: number): Promise<TaxYearWorkspaceRecord | null> {
  const profile = await getClientProfile(context, clientId);
  const taxYear = profile?.years.find((item) => item.year === year);
  if (!profile || !taxYear) return null;
  return {
    clientId: profile.id,
    code: profile.code,
    displayName: profile.displayName,
    year: taxYear.year,
    status: taxYear.status,
    revision: taxYear.revision,
    taxpayer: taxYear.taxpayer,
    spouse: taxYear.spouse,
    reviewer: taxYear.reviewer,
    calculationStatus: taxYear.calculationStatus,
  };
}

function displayStatus(value: string): ClientSummary["status"] {
  const statuses: Record<string, ClientSummary["status"]> = { documents_pending: "Documents Pending", in_preparation: "In Preparation", ready_for_review: "Ready for Review", changes_requested: "Changes Requested", reviewed_draft: "Reviewed Draft" };
  return statuses[value] ?? "In Preparation";
}
