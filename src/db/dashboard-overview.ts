import { pool } from "./pool";

export type DashboardSummary = {
  pendingReview: number;
  denied: number;
  payoutUnknown: number;
  paidThisMonth: Array<{ currency: string; cents: string; count: number }>;
  pendingInvoices: Array<{ id: string; invoice: string; vendor: string; cents: number; currency: string; reasons: string[] }>;
};

const scope = [
  "exists (select 1 from organization_admin_memberships m",
  "where m.organization_id=pr.organization_id and m.user_id=$1",
  "and m.role='ADMIN' and m.active=true)",
].join(" ");

export async function readDashboardSummary(userId: string): Promise<DashboardSummary> {
  const [counts, paid, pending] = await Promise.all([
    pool.query([
      "select count(*) filter (where pr.status='ESCALATED')::int as pending_review,",
      "count(*) filter (where pr.status='DENIED')::int as denied,",
      "count(*) filter (where e.status in ('PAYMENT_UNKNOWN','PAYMENT_UNKNOWN_MANUAL_RECONCILIATION'))::int as payout_unknown",
      "from payment_requests pr left join payment_executions e on e.payment_request_id=pr.id",
      "where", scope,
    ].join(" "), [userId]),
    pool.query([
      "select pr.currency, sum(pr.amount_cents)::text as cents, count(*)::int as n",
      "from payment_requests pr join payment_executions e on e.payment_request_id=pr.id",
      "where", scope, "and e.status='PAID'",
      "and e.submitted_at >= (date_trunc('month', now() at time zone 'UTC') at time zone 'UTC')",
      "group by pr.currency order by pr.currency",
    ].join(" "), [userId]),
    pool.query([
      "select pr.id,pr.invoice_number,v.name as vendor,pr.amount_cents,pr.currency,d.reason_codes",
      "from payment_requests pr join vendors v on v.id=pr.vendor_id and v.organization_id=pr.organization_id",
      "join payment_decisions d on d.payment_request_id=pr.id",
      "where", scope, "and pr.status='ESCALATED'",
      "order by pr.created_at desc,pr.id desc limit 6",
    ].join(" "), [userId]),
  ]);
  const row = counts.rows[0];
  return {
    pendingReview: Number(row.pending_review),
    denied: Number(row.denied),
    payoutUnknown: Number(row.payout_unknown),
    paidThisMonth: paid.rows.map(r => ({ currency: String(r.currency), cents: String(r.cents), count: Number(r.n) })),
    pendingInvoices: pending.rows.map(r => ({
      id: String(r.id), invoice: String(r.invoice_number), vendor: String(r.vendor),
      cents: Number(r.amount_cents), currency: String(r.currency),
      reasons: r.reason_codes as string[],
    })),
  };
}
