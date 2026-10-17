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
  // These three forever-fictional showcase requests never become payable,
  // even if preview mode or the global payment kill switch is later disabled.
  if (/^DEMO-(?:NORMAL|ANOMALY|SUBSTITUTION)-2026$/.test(payment.invoiceNumber)) {
    throw new ExecutionRejectedError("SYNTHETIC_DEMO_NOT_PAYABLE");
  }
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

type ReconcileOptions = { auditEventId?: string };

async function reconcile(
  store: ExecutionStore,
  gateway: PaymentGateway,
  execution: ExecutionRecord,
  now: Date,
  options: ReconcileOptions = {},
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
  const result = await store.applyRemoteStatus(execution.logicalPaymentId, snapshot, mapped, now);
  await store.appendEvent(
    execution.logicalPaymentId,
    result.applied ? "PAYPAL_RECONCILED" : "PAYPAL_STALE_STATUS_IGNORED",
    {
      rawStatus: snapshot.transactionStatus,
      mappedStatus: mapped,
      currentStatus: result.execution.status,
      payoutBatchId: snapshot.payoutBatchId,
      payoutItemId: snapshot.payoutItemId,
    },
    options.auditEventId,
  );
  return result.execution;
}

async function submitClaimed(
  payment: AuthoritativePayment,
  execution: ExecutionRecord,
  store: ExecutionStore,
  gateway: PaymentGateway,
  now: Date,
  beforeSubmit?: () => Promise<void>,
): Promise<ExecutionRecord> {
  let fresh: AuthoritativePayment;
  try {
    // The optional actor/pre-submit check can race with policy or recipient
    // revocation. Run it BEFORE the final authority lookup, so changes made
    // during that async step are caught before any PayPal POST.
    await beforeSubmit?.();
    const latest = await store.getAuthoritativePayment(payment.requestId);
    if (!latest || latest.logicalPaymentId !== payment.logicalPaymentId) {
      throw new ExecutionRejectedError("PAYMENT_AUTHORITY_CHANGED");
    }
    assertAuthorized(latest);
    if (latest.amountCents !== payment.amountCents || latest.currency !== payment.currency || latest.requestedDestination !== payment.requestedDestination) {
      throw new ExecutionRejectedError("PAYMENT_AUTHORITY_CHANGED");
    }
    fresh = latest;
  } catch (error) {
    const code = error instanceof Error ? error.message : "PAYMENT_AUTHORITY_CHANGED";
    const blocked = await store.markBlocked(execution.logicalPaymentId, code, now);
    await store.appendEvent(execution.logicalPaymentId, "PAYPAL_SUBMISSION_BLOCKED_BY_REVALIDATION", { reason: code });
    return blocked;
  }

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
      receiver: fresh.requestedDestination,
      amountCents: fresh.amountCents,
      currency: fresh.currency,
      note: `MandateGate invoice ${fresh.invoiceNumber}`,
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
  beforeSubmit?: () => Promise<void>,
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
  return submitClaimed(payment, claimed, store, gateway, now, beforeSubmit);
}

export async function executeAuthorizedPayment(
  requestId: string,
  deps: { store: ExecutionStore; gateway: PaymentGateway; now?: () => Date; beforeSubmit?: () => Promise<void> },
): Promise<ExecutionRecord> {
  const now = deps.now?.() ?? new Date();
  const payment = await deps.store.getAuthoritativePayment(requestId);
  if (!payment) throw new ExecutionRejectedError("PAYMENT_REQUEST_NOT_FOUND");
  assertAuthorized(payment);

  let execution = await deps.store.getOrCreateExecution(payment);
  if (isTerminalExecutionStatus(execution.status)) return execution;
  if (execution.status === "PAYMENT_UNKNOWN") {
    return recoverUnknown(payment, execution, deps.store, deps.gateway, now, deps.beforeSubmit);
  }
  if (execution.status === "SUBMITTING" && !execution.paypalPayoutBatchId && !execution.paypalPayoutItemId) {
    const claimAge = execution.claimedAt ? now.getTime() - execution.claimedAt.getTime() : Number.POSITIVE_INFINITY;
    if (claimAge >= CLAIM_LEASE_MS) {
      execution = await deps.store.markUnknown(execution.logicalPaymentId, now);
      await deps.store.appendEvent(execution.logicalPaymentId, "PAYPAL_STALE_CLAIM_RECOVERED");
      return recoverUnknown(payment, execution, deps.store, deps.gateway, now, deps.beforeSubmit);
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
  return submitClaimed(payment, execution, deps.store, deps.gateway, now, deps.beforeSubmit);
}

export async function reconcileExecution(
  logicalPaymentId: string,
  deps: { store: ExecutionStore; gateway: PaymentGateway; now?: () => Date },
  options: ReconcileOptions = {},
) {
  const execution = await deps.store.getExecution(logicalPaymentId);
  const now = deps.now?.() ?? new Date();
  return reconcile(deps.store, deps.gateway, execution, now, options);
}
