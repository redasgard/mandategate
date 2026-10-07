import { mapPayPalItemStatus, isTerminalExecutionStatus } from "../paypal/status";
import { PaymentGatewayError } from "./types";
import type {
  AuthoritativePayment,
  ExecutionRecord,
  ExecutionStore,
  PaymentGateway,
} from "./types";

const PAYPAL_DUPLICATE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const CLAIM_LEASE_MS = 60_000;

export class ExecutionRejectedError extends Error {}

function assertAuthorized(payment: AuthoritativePayment) {
  if (payment.decisionOutcome !== "ALLOW" && payment.decisionOutcome !== "APPROVED") {
    throw new ExecutionRejectedError("PAYMENT_NOT_AUTHORIZED");
  }
  if (payment.requestedDestination !== payment.currentTrustedDestination) {
    throw new ExecutionRejectedError("TRUSTED_DESTINATION_CHANGED");
  }
  if (payment.amountCents <= 0) throw new ExecutionRejectedError("INVALID_AMOUNT");
  if (!/^[A-Z]{3}$/.test(payment.currency)) throw new ExecutionRejectedError("INVALID_CURRENCY");
  if (payment.currency !== "USD") throw new ExecutionRejectedError("UNSUPPORTED_PAYOUT_CURRENCY");
}

async function reconcile(
  store: ExecutionStore,
  gateway: PaymentGateway,
  execution: ExecutionRecord,
  now: Date,
): Promise<ExecutionRecord> {
  let snapshot;
  if (execution.paypalPayoutItemId) {
    snapshot = await gateway.getPayoutItem(execution.paypalPayoutItemId);
  } else if (execution.paypalPayoutBatchId) {
    snapshot = await gateway.getBatchItem(execution.paypalPayoutBatchId);
  } else {
    return execution;
  }

  const mapped = mapPayPalItemStatus(snapshot.transactionStatus);
  const updated = await store.applyRemoteStatus(execution.logicalPaymentId, snapshot, mapped, now);
  await store.appendEvent(execution.logicalPaymentId, "PAYPAL_RECONCILED", {
    rawStatus: snapshot.transactionStatus,
    mappedStatus: mapped,
    payoutBatchId: snapshot.payoutBatchId,
    payoutItemId: snapshot.payoutItemId,
  });
  return updated;
}

async function submitClaimed(
  payment: AuthoritativePayment,
  execution: ExecutionRecord,
  store: ExecutionStore,
  gateway: PaymentGateway,
  now: Date,
): Promise<ExecutionRecord> {
  await store.appendEvent(execution.logicalPaymentId, "PAYPAL_SUBMITTING", {
    paypalRequestId: execution.paypalRequestId,
    senderBatchId: execution.senderBatchId,
    senderItemId: execution.senderItemId,
  });

  try {
    const result = await gateway.createSinglePayout({
      paypalRequestId: execution.paypalRequestId,
      senderBatchId: execution.senderBatchId,
      senderItemId: execution.senderItemId,
      receiver: payment.requestedDestination,
      amountCents: payment.amountCents,
      currency: payment.currency,
      note: `MandateGate invoice ${payment.invoiceNumber}`,
    });
    const submitted = await store.markSubmitted(execution.logicalPaymentId, result.payoutBatchId, now);
    await store.appendEvent(execution.logicalPaymentId, "PAYPAL_SUBMITTED", {
      payoutBatchId: result.payoutBatchId,
    });
    return await reconcile(store, gateway, submitted, now);
  } catch (error) {
    if (error instanceof PaymentGatewayError && error.outcome === "DEFINITE_FAILURE") {
      const failed = await store.markFailed(execution.logicalPaymentId, error.message, now);
      await store.appendEvent(execution.logicalPaymentId, "PAYPAL_SUBMISSION_REJECTED", {
        status: error.status,
        debugId: error.debugId,
        message: error.message,
      });
      return failed;
    }
    const unknown = await store.markUnknown(execution.logicalPaymentId, now);
    await store.appendEvent(execution.logicalPaymentId, "PAYPAL_OUTCOME_UNKNOWN", {
      errorClass: error instanceof Error ? error.name : "UnknownError",
      debugId: error instanceof PaymentGatewayError ? error.debugId : undefined,
    });
    return unknown;
  }
}

async function recoverUnknown(
  payment: AuthoritativePayment,
  execution: ExecutionRecord,
  store: ExecutionStore,
  gateway: PaymentGateway,
  now: Date,
): Promise<ExecutionRecord> {
  if (execution.paypalPayoutBatchId || execution.paypalPayoutItemId) {
    try {
      const reconciled = await reconcile(store, gateway, execution, now);
      if (reconciled.status !== "PAYMENT_UNKNOWN") return reconciled;
    } catch {
      return execution;
    }
  }

  if (now.getTime() - execution.createdAt.getTime() >= PAYPAL_DUPLICATE_WINDOW_MS) {
    const manual = await store.markManualReconciliation(execution.logicalPaymentId, now);
    await store.appendEvent(execution.logicalPaymentId, "PAYPAL_RETRY_WINDOW_EXPIRED");
    return manual;
  }

  const claimed = await store.tryClaim(execution.logicalPaymentId, ["PAYMENT_UNKNOWN"]);
  if (!claimed) return store.getExecution(execution.logicalPaymentId);
  return submitClaimed(payment, claimed, store, gateway, now);
}

export async function executeAuthorizedPayment(
  requestId: string,
  deps: { store: ExecutionStore; gateway: PaymentGateway; now?: () => Date },
): Promise<ExecutionRecord> {
  const now = deps.now?.() ?? new Date();
  const payment = await deps.store.getAuthoritativePayment(requestId);
  if (!payment) throw new ExecutionRejectedError("PAYMENT_REQUEST_NOT_FOUND");
  assertAuthorized(payment);

  let execution = await deps.store.getOrCreateExecution(payment);
  if (isTerminalExecutionStatus(execution.status)) return execution;
  if (execution.status === "PAYMENT_UNKNOWN") {
    return recoverUnknown(payment, execution, deps.store, deps.gateway, now);
  }
  if (execution.status === "SUBMITTING" && !execution.paypalPayoutBatchId && !execution.paypalPayoutItemId) {
    const claimAge = execution.claimedAt ? now.getTime() - execution.claimedAt.getTime() : Number.POSITIVE_INFINITY;
    if (claimAge >= CLAIM_LEASE_MS) {
      execution = await deps.store.markUnknown(execution.logicalPaymentId, now);
      await deps.store.appendEvent(execution.logicalPaymentId, "PAYPAL_STALE_CLAIM_RECOVERED");
      return recoverUnknown(payment, execution, deps.store, deps.gateway, now);
    }
    return execution;
  }
  if (["EXECUTING", "PAYMENT_HELD", "PAYMENT_UNCLAIMED", "PAYMENT_STATUS_UNKNOWN"].includes(execution.status)) {
    if (execution.paypalPayoutBatchId || execution.paypalPayoutItemId) {
      try { return await reconcile(deps.store, deps.gateway, execution, now); }
      catch { return execution; }
    }
    return execution;
  }

  const claimed = await deps.store.tryClaim(execution.logicalPaymentId, ["READY"]);
  if (!claimed) return deps.store.getExecution(execution.logicalPaymentId);
  execution = claimed;
  return submitClaimed(payment, execution, deps.store, deps.gateway, now);
}

export async function reconcileExecution(
  logicalPaymentId: string,
  deps: { store: ExecutionStore; gateway: PaymentGateway; now?: () => Date },
) {
  const execution = await deps.store.getExecution(logicalPaymentId);
  const now = deps.now?.() ?? new Date();
  return reconcile(deps.store, deps.gateway, execution, now);
}
