import { desc, eq } from "drizzle-orm";
import { db } from "./db";
import { paymentDecisions, paymentExecutions, paymentRequests, vendors } from "./schema";

export async function listRecentDecisions(limit = 25) {
  return db.select({
    requestId: paymentRequests.id, invoiceNumber: paymentRequests.invoiceNumber, vendorName: vendors.name,
    amountCents: paymentRequests.amountCents, currency: paymentRequests.currency, requestedDestination: paymentRequests.requestedDestination,
    status: paymentRequests.status, outcome: paymentDecisions.outcome, reasonCodes: paymentDecisions.reasonCodes, createdAt: paymentRequests.createdAt,
  }).from(paymentRequests).innerJoin(vendors, eq(paymentRequests.vendorId, vendors.id)).innerJoin(paymentDecisions, eq(paymentRequests.id, paymentDecisions.paymentRequestId)).orderBy(desc(paymentRequests.createdAt)).limit(limit);
}

export async function getDecisionDetail(requestId: string) {
  const [row] = await db.select({
    requestId: paymentRequests.id,
    logicalPaymentId: paymentRequests.logicalPaymentId,
    invoiceNumber: paymentRequests.invoiceNumber,
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
    .where(eq(paymentRequests.id, requestId)).limit(1);
  return row ?? null;
}
