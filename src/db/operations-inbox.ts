import { pool } from "@/src/db/pool";

export type IncomingInvoice = {
  id: string;
  organization: string;
  analysisStatus: string;
  mimeType: string;
  createdAt: Date;
};

/** Operational inbox only. Current ADMIN membership is required inside SQL. */
export async function readIncomingInvoices(actorId: string, limit = 12): Promise<IncomingInvoice[]> {
  const capped = Number.isFinite(limit) ? Math.max(1, Math.min(25, Math.trunc(limit))) : 12;
  const result = await pool.query([
    "select a.id,a.analysis_status,a.mime_type,a.created_at,o.name as organization",
    "from invoice_artifacts a",
    "join organizations o on o.id=a.organization_id",
    "where exists (select 1 from organization_admin_memberships m",
    "where m.organization_id=a.organization_id and m.user_id=$1",
    "and m.role='ADMIN' and m.active=true)",
    "order by a.created_at desc,a.id desc limit $2",
  ].join(" "), [actorId, capped]);
  return result.rows.map(row => ({
    id: String(row.id),
    organization: String(row.organization),
    analysisStatus: String(row.analysis_status),
    mimeType: String(row.mime_type),
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(String(row.created_at)),
  }));
}
