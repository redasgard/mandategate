import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { paymentDecisions, paymentExecutions, paymentRequests, vendors } from "./schema";

// Both reads enforce an active organization admin role inside the SQL query.
// Authentication alone must never expose another company's payment data.
const activeAdmin = (userId: string) => sql`exists (
  select 1 from organization_admin_memberships membership
  where membership.organization_id = ${paymentRequests.organizationId}
    and membership.user_id = ${userId}
    and membership.role = 'ADMIN' and membership.active = true
)`;

export async function listRecentDecisions(userId: string, limit = 25) {
  return db.select({
    requestId: paymentRequests.id, invoiceNumber: paymentRequests.invoiceNumber, vendorName: vendors.name,
    amountCents: paymentRequests.amountCents, currency: paymentRequests.currency, requestedDestination: paymentRequests.requestedDestination,
    status: paymentRequests.status, outcome: paymentDecisions.outcome, reasonCodes: paymentDecisions.reasonCodes, createdAt: paymentRequests.createdAt,
  }).from(paymentRequests).innerJoin(vendors, eq(paymentRequests.vendorId, vendors.id)).innerJoin(paymentDecisions, eq(paymentRequests.id, paymentDecisions.paymentRequestId)).where(activeAdmin(userId)).orderBy(desc(paymentRequests.createdAt)).limit(limit);
}

export async function getDecisionDetail(requestId: string, userId: string) {
  const [row] = await db.select({
    requestId: paymentRequests.id,
    logicalPaymentId: paymentRequests.logicalPaymentId,
    invoiceNumber: paymentRequests.invoiceNumber,
    source: paymentRequests.source,
    vendorName: vendors.name,
    amountCents: paymentRequests.amountCents,
    currency: paymentRequests.currency,
    requestedDestination: paymentRequests.requestedDestination,
    status: paymentRequests.status,
    outcome: paymentDecisions.outcome,
    reasonCodes: paymentDecisions.reasonCodes,
    evidence: paymentDecisions.evidence,
    decidedAt: paymentDecisions.decidedAt,
    executionStatus: paymentExecutions.status,
    paypalPayoutBatchId: paymentExecutions.paypalPayoutBatchId,
    paypalPayoutItemId: paymentExecutions.paypalPayoutItemId,
    rawPaypalStatus: paymentExecutions.rawPaypalStatus,
    submittedAt: paymentExecutions.submittedAt,
    lastReconciledAt: paymentExecutions.lastReconciledAt,
  }).from(paymentRequests)
    .innerJoin(vendors, eq(paymentRequests.vendorId, vendors.id))
    .innerJoin(paymentDecisions, eq(paymentRequests.id, paymentDecisions.paymentRequestId))
    .leftJoin(paymentExecutions, eq(paymentRequests.id, paymentExecutions.paymentRequestId))
    .where(and(eq(paymentRequests.id, requestId), activeAdmin(userId))).limit(1);
  return row ?? null;
}
