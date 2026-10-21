import { pool } from "./pool";

export const INCIDENT_FILTERS = ["ALL", "REVIEW", "BLOCKED", "PAYOUT"] as const;
export type IncidentFilter = (typeof INCIDENT_FILTERS)[number];

export function parseIncidentFilter(raw: unknown): IncidentFilter {
  return typeof raw === "string" && INCIDENT_FILTERS.some(item => item === raw)
    ? raw as IncidentFilter : "ALL";
}

export type Incident = {
  requestId: string;
  organization: string;
  invoice: string;
  vendor: string;
  currency: string;
  amountCents: number;
  kind: "REVIEW" | "BLOCKED" | "PAYOUT";
  title: string;
  explanation: string;
  discoveredBy: string;
  reasons: string[];
  state: string;
  createdAt: Date;
};

/**
 * This is an investigation projection, not a source of payment authority.
 * Every row is authorized by CURRENT active ADMIN membership in the SQL.
 * No model suggestions, historical demo receipts, or tenant-wide "admin" flags.
 */
export async function readDashboardIncidents(
  actorId: string, filter: IncidentFilter = "ALL", limit = 24,
): Promise<Incident[]> {
  const mode = parseIncidentFilter(filter);
  const capped = Math.min(40, Math.max(1, Math.trunc(limit) || 24));
  const result = await pool.query([
    "select pr.id, o.name as organization, pr.invoice_number,",
    "v.name as vendor, pr.amount_cents, pr.currency, pr.status,pr.source,",
    "d.reason_codes, e.status as execution_status, pr.created_at,",
    "coalesce(r.action, '') as review_action",
    "from payment_requests pr",
    "join organizations o on o.id=pr.organization_id",
    "join vendors v on v.id=pr.vendor_id and v.organization_id=pr.organization_id",
    "join payment_decisions d on d.payment_request_id=pr.id",
    "left join payment_executions e on e.payment_request_id=pr.id",
    "left join payment_escalation_reviews r on r.payment_request_id=pr.id",
    "where exists (select 1 from organization_admin_memberships m",
    "where m.organization_id=pr.organization_id and m.user_id=$1",
    "and m.role='ADMIN' and m.active=true)",
    "and ((pr.status='ESCALATED' and r.id is null)",
    "or pr.status='DENIED'",
    "or e.status in ('PAYMENT_UNKNOWN','PAYMENT_UNKNOWN_MANUAL_RECONCILIATION',",
    "'PAYMENT_FAILED','PAYMENT_BLOCKED','PAYMENT_RETURNED','PAYMENT_REFUNDED','PAYMENT_REVERSED'))",
    "and ($2::text='ALL'",
    "or ($2::text='REVIEW' and pr.status='ESCALATED' and r.id is null)",
    "or ($2::text='BLOCKED' and pr.status='DENIED')",
    "or ($2::text='PAYOUT' and e.status in",
    "('PAYMENT_UNKNOWN','PAYMENT_UNKNOWN_MANUAL_RECONCILIATION',",
    "'PAYMENT_FAILED','PAYMENT_BLOCKED','PAYMENT_RETURNED','PAYMENT_REFUNDED','PAYMENT_REVERSED')))",
    "order by case",
    "when e.status like 'PAYMENT_UNKNOWN%' then 0",
    "when pr.status='ESCALATED' and r.id is null then 1",
    "when pr.status='DENIED' then 2",
    "else 3 end, pr.created_at desc, pr.id desc",
    "limit $3",
  ].join(" "), [actorId, mode, capped]);

  return result.rows.map(row => {
    const reasons: string[] = Array.isArray(row.reason_codes)
      ? row.reason_codes.filter((x: unknown): x is string =>
          typeof x === "string" && /^[A-Z][A-Z0-9_]{0,119}$/.test(x)).slice(0, 12)
      : [];
    const execution = String(row.execution_status ?? "");
    const blocked = row.status === "DENIED";
    const payout = [
      "PAYMENT_UNKNOWN", "PAYMENT_UNKNOWN_MANUAL_RECONCILIATION",
      "PAYMENT_FAILED", "PAYMENT_BLOCKED", "PAYMENT_RETURNED",
      "PAYMENT_REFUNDED", "PAYMENT_REVERSED",
    ].includes(execution);
    const kind: Incident["kind"] = payout ? "PAYOUT" : blocked ? "BLOCKED" : "REVIEW";
    const title = kind === "PAYOUT"
      ? execution.includes("UNKNOWN") ? "Uncertain PayPal payout" : "Payout requires investigation"
      : blocked
        ? reasons.includes("DESTINATION_MISMATCH") ? "Destination substitution blocked" : "Request denied by policy"
        : reasons.includes("AP_INVOICE_NUMBER_REPLAY") ? "Possible invoice replay"
        : reasons.includes("AMOUNT_OUTSIDE_VENDOR_BASELINE") ? "Unusual invoice amount"
        : "Invoice requires human review";
    const explanation = kind === "PAYOUT"
      ? "The recorded provider/executor state requires reconciliation. Do not submit another payment."
      : kind === "BLOCKED"
        ? "The deterministic authority boundary denied this request. Changing an invoice cannot change trusted payment details."
        : "The original request is awaiting a separately authenticated review; model output cannot approve it.";
    return {
      requestId: String(row.id),
      organization: String(row.organization),
      invoice: String(row.invoice_number),
      vendor: String(row.vendor),
      currency: String(row.currency),
      amountCents: Number(row.amount_cents),
      kind, title, explanation,
      discoveredBy: kind === "PAYOUT" ? "PayPal execution / reconciliation state" : "MandateGate deterministic policy",
      reasons, state: kind === "PAYOUT" ? execution : String(row.status),
      createdAt: row.created_at instanceof Date ? row.created_at : new Date(String(row.created_at)),
    };
  });
}
