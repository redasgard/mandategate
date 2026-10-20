import { pool } from "@/src/db/pool";

export type IncomingInvoice = {
  id: string;
  organization: string;
  analysisStatus: string;
  mimeType: string;
  createdAt: Date;
  suggestedVendor: string | null;
  suggestedInvoice: string | null;
  suggestedAmount: string | null;
  suggestedCurrency: string | null;
};

/**
 * Read-only tenant-scoped inbox. AI suggestions are untrusted display hints
 * and must not authorize or modify a payment. A lateral latest-record join
 * ensures repeated inference never duplicates an incoming document row.
 */
export async function readIncomingInvoices(actorId: string, limit = 12): Promise<IncomingInvoice[]> {
  const capped = Number.isFinite(limit) ? Math.max(1, Math.min(25, Math.trunc(limit))) : 12;
  const result = await pool.query([
    "select a.id,a.analysis_status,a.mime_type,a.created_at,o.name as organization,",
    "case when jsonb_typeof(obs.extraction #> '{vendor_name,value}')='string'",
    "then nullif(btrim(left(obs.extraction #>> '{vendor_name,value}',80)),'')",
    "else null end as ai_vendor,",
    "case when jsonb_typeof(obs.extraction #> '{invoice_number,value}')='string'",
    "then nullif(btrim(left(obs.extraction #>> '{invoice_number,value}',80)),'')",
    "else null end as ai_invoice,",
    "case when jsonb_typeof(obs.extraction #> '{total_amount_decimal,value}')='string'",
    "and (obs.extraction #>> '{total_amount_decimal,value}') ~ '^[0-9]{1,12}[.][0-9]{2}$'",
    "then obs.extraction #>> '{total_amount_decimal,value}' else null end as ai_amount,",
    "case when jsonb_typeof(obs.extraction #> '{currency,value}')='string'",
    "and obs.extraction #>> '{currency,value}' in ('USD','EUR','GBP')",
    "then obs.extraction #>> '{currency,value}' else null end as ai_currency",
    "from invoice_artifacts a",
    "join organizations o on o.id=a.organization_id",
    "left join lateral (select i.extraction from invoice_image_observations i",
    "where i.artifact_id=a.id and i.organization_id=a.organization_id",
    "and i.input_sha256=a.sha256 and i.state in ('ESCALATE','EXTRACTED_UNTRUSTED')",
    "and i.error_code is null",
    "order by i.finished_at desc nulls last, i.started_at desc nulls last limit 1) obs on true",
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
    suggestedVendor: row.ai_vendor === null ? null : String(row.ai_vendor),
    suggestedInvoice: row.ai_invoice === null ? null : String(row.ai_invoice),
    suggestedAmount: row.ai_amount === null ? null : String(row.ai_amount),
    suggestedCurrency: row.ai_currency === null ? null : String(row.ai_currency),
  }));
}
