import type { ExecutionStore, PaymentGateway } from "../executor/types";
import { postgresExecutionStore } from "../executor/postgres-store";
import { reconcileExecution } from "../executor/service";
import { getPayPalClient } from "./runtime";
import {
  claimWebhookReceipt,
  listRecoverableWebhookReceiptIds,
  markWebhookReceiptProcessed,
  markWebhookReceiptRetry,
  type PayPalWebhookRefs,
} from "./webhook-receipts";

type PayoutWebhookExecutionStore = ExecutionStore & {
  findLogicalPaymentIdByPayPalRef(refs: PayPalWebhookRefs): Promise<string | null>;
};

type ProcessorDeps = {
  executionStore?: PayoutWebhookExecutionStore;
  gateway?: PaymentGateway;
  now?: () => Date;
};

export async function processVerifiedPayoutWebhook(
  eventId: string,
  deps: ProcessorDeps = {},
) {
  const now = deps.now?.() ?? new Date();
  const receipt = await claimWebhookReceipt(eventId, now);
  if (!receipt) return { status: "NOOP" as const };

  const executionStore = deps.executionStore ?? postgresExecutionStore;
  const logicalPaymentId =
    receipt.logicalPaymentId ??
    await executionStore.findLogicalPaymentIdByPayPalRef({
      payoutItemId: receipt.payoutItemId ?? undefined,
      payoutBatchId: receipt.payoutBatchId ?? undefined,
    });

  if (!logicalPaymentId) {
    await markWebhookReceiptRetry(eventId, "PAYMENT_EXECUTION_NOT_FOUND", now);
    return { status: "RETRY" as const };
  }

  await executionStore.appendEvent(
    logicalPaymentId,
    "PAYPAL_WEBHOOK_VERIFIED",
    { eventId: receipt.eventId, eventType: receipt.eventType },
    `paypal-webhook:${eventId}:verified`,
  );

  try {
    const gateway = deps.gateway ?? getPayPalClient();
    await reconcileExecution(
      logicalPaymentId,
      { store: executionStore, gateway, now: deps.now },
      { auditEventId: `paypal-webhook:${eventId}:reconciled` },
    );
    await markWebhookReceiptProcessed(eventId, logicalPaymentId, deps.now?.() ?? new Date());
    return { status: "PROCESSED" as const, logicalPaymentId };
  } catch (error) {
    const errorClass = error instanceof Error ? error.name : "UnknownError";
    await executionStore.appendEvent(
      logicalPaymentId,
      "PAYPAL_WEBHOOK_RECONCILE_FAILED",
      { eventId, errorClass, attempt: receipt.attempts },
      `paypal-webhook:${eventId}:reconcile-failed:${receipt.attempts}`,
    );
    await markWebhookReceiptRetry(
      eventId,
      error instanceof Error ? error.message : "UnknownError",
      deps.now?.() ?? new Date(),
    );
    return { status: "RETRY" as const, logicalPaymentId };
  }
}

export async function recoverPendingPayoutWebhooks(
  limit = 100,
  deps: ProcessorDeps = {},
) {
  const ids = await listRecoverableWebhookReceiptIds(limit, deps.now?.() ?? new Date());
  const results = [];
  for (const eventId of ids) {
    results.push(await processVerifiedPayoutWebhook(eventId, deps));
  }
  return results;
}
