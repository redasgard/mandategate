import { desc, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { paymentDecisions, paymentExecutions, paymentRequests, vendors } from "./schema";

/**
 * Organization-scoped rows for the AG Studio analytics dashboard (/analytics).
 * Same authorization model as src/db/views.ts: an active ADMIN membership is
 * enforced inside the SQL query, never by authentication alone.
 */
const activeAdmin = (userId: string) => sql`exists (
  select 1 from organization_admin_memberships membership
  where membership.organization_id = ${paymentRequests.organizationId}
    and membership.user_id = ${userId}
    and membership.role = 'ADMIN' and membership.active = true
)`;

export type AnalyticsRequestRow = {
  id: string;
  invoiceNumber: string;
  vendorId: string;
  vendorName: string;
  amountCents: number;
  currency: string;
  status: string;
  source: string;
  requestedDestination: string;
  createdAt: string;
  outcome: string | null;
  reasonCodes: string[];
  executionStatus: string | null;
  settled: boolean;
  paypalPayoutBatchId: string | null;
  paypalPayoutItemId: string | null;
  submittedAt: string | null;
  lastReconciledAt: string | null;
};

export async function readPaymentAnalyticsRows(userId: string): Promise<AnalyticsRequestRow[]> {
  const rows = await db.select({
    id: paymentRequests.id,
    invoiceNumber: paymentRequests.invoiceNumber,
    vendorId: paymentRequests.vendorId,
    vendorName: vendors.name,
    amountCents: paymentRequests.amountCents,
    currency: paymentRequests.currency,
    status: paymentRequests.status,
    source: paymentRequests.source,
    requestedDestination: paymentRequests.requestedDestination,
    createdAt: paymentRequests.createdAt,
    outcome: paymentDecisions.outcome,
    reasonCodes: paymentDecisions.reasonCodes,
    executionStatus: paymentExecutions.status,
    paypalPayoutBatchId: paymentExecutions.paypalPayoutBatchId,
    paypalPayoutItemId: paymentExecutions.paypalPayoutItemId,
    submittedAt: paymentExecutions.submittedAt,
    lastReconciledAt: paymentExecutions.lastReconciledAt,
  })
    .from(paymentRequests)
    .innerJoin(vendors, eq(paymentRequests.vendorId, vendors.id))
    .innerJoin(paymentDecisions, eq(paymentRequests.id, paymentDecisions.paymentRequestId))
    .leftJoin(paymentExecutions, eq(paymentRequests.id, paymentExecutions.paymentRequestId))
    .where(activeAdmin(userId))
    .orderBy(desc(paymentRequests.createdAt))
    .limit(500);

  return rows.map((row) => ({
    ...row,
    reasonCodes: Array.isArray(row.reasonCodes) ? row.reasonCodes : [],
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    submittedAt: row.submittedAt instanceof Date ? row.submittedAt.toISOString() : (row.submittedAt ?? null),
    lastReconciledAt: row.lastReconciledAt instanceof Date ? row.lastReconciledAt.toISOString() : (row.lastReconciledAt ?? null),
    settled: row.executionStatus === "PAID",
  }));
}
