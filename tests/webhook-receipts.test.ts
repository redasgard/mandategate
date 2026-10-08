import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../src/db/pool";
import { postgresExecutionStore } from "../src/payments/executor/postgres-store";
import {
  claimWebhookReceipt,
  getWebhookReceipt,
  markWebhookReceiptProcessed,
  markWebhookReceiptRetry,
  persistVerifiedWebhookReceipt,
} from "../src/payments/paypal/webhook-receipts";

const requestId = randomUUID();
const logicalPaymentId = randomUUID();
const receiptIds: string[] = [];

beforeAll(async () => {
  await pool.query(
    `insert into payment_requests
      (id, logical_payment_id, organization_id, vendor_id, invoice_number, amount_cents, currency, requested_destination, status, source)
     values ($1, $2, 'org_demo', 'vendor_northstar', 'WEBHOOK-TEST', 101, 'USD', 'fixture@example.com', 'ALLOWED', 'demo_fixture')`,
    [requestId, logicalPaymentId],
  );
});

afterAll(async () => {
  await pool.query("delete from payment_execution_events where logical_payment_id = $1", [logicalPaymentId]);
  if (receiptIds.length) {
    await pool.query("delete from paypal_webhook_receipts where event_id = any($1::text[])", [receiptIds]);
  }
  await pool.query("delete from payment_requests where id = $1", [requestId]);
});

describe("durable PayPal webhook receipts", () => {
  it("deduplicates the same verified event and its audit event", async () => {
    const eventId = `WH-${randomUUID()}`;
    receiptIds.push(eventId);
    const now = new Date("2026-10-07T20:00:00Z");

    const first = await persistVerifiedWebhookReceipt(
      eventId,
      "PAYMENT.PAYOUTS-ITEM.SUCCEEDED",
      { payoutItemId: "ITEM-WH-1", payoutBatchId: "BATCH-WH-1" },
      now,
    );
    const second = await persistVerifiedWebhookReceipt(
      eventId,
      "PAYMENT.PAYOUTS-ITEM.SUCCEEDED",
      { payoutItemId: "ITEM-WH-1", payoutBatchId: "BATCH-WH-1" },
      now,
    );

    expect(first.inserted).toBe(true);
    expect(second.inserted).toBe(false);

    const receiptCount = await pool.query(
      "select count(*)::int as n from paypal_webhook_receipts where event_id = $1",
      [eventId],
    );
    expect(receiptCount.rows[0].n).toBe(1);

    const auditId = `paypal-webhook:${eventId}:verified`;
    await postgresExecutionStore.appendEvent(
      logicalPaymentId,
      "PAYPAL_WEBHOOK_VERIFIED",
      { eventId },
      auditId,
    );
    await postgresExecutionStore.appendEvent(
      logicalPaymentId,
      "PAYPAL_WEBHOOK_VERIFIED",
      { eventId },
      auditId,
    );

    const auditCount = await pool.query(
      "select count(*)::int as n from payment_execution_events where id = $1",
      [auditId],
    );
    expect(auditCount.rows[0].n).toBe(1);
  });

  it("reclaims an interrupted processing lease and completes later", async () => {
    const eventId = `WH-${randomUUID()}`;
    receiptIds.push(eventId);
    const t0 = new Date("2026-10-07T20:00:00Z");

    await persistVerifiedWebhookReceipt(
      eventId,
      "PAYMENT.PAYOUTS-ITEM.SUCCEEDED",
      { payoutItemId: "ITEM-WH-2", payoutBatchId: "BATCH-WH-2" },
      t0,
    );

    const firstClaim = await claimWebhookReceipt(eventId, t0);
    expect(firstClaim?.attempts).toBe(1);

    const prematureClaim = await claimWebhookReceipt(
      eventId,
      new Date(t0.getTime() + 30_000),
    );
    expect(prematureClaim).toBeNull();

    const recoveredClaim = await claimWebhookReceipt(
      eventId,
      new Date(t0.getTime() + 61_000),
    );
    expect(recoveredClaim?.attempts).toBe(2);

    await markWebhookReceiptRetry(
      eventId,
      "simulated interruption",
      new Date(t0.getTime() + 62_000),
    );
    const retryClaim = await claimWebhookReceipt(
      eventId,
      new Date(t0.getTime() + 63_000),
    );
    expect(retryClaim?.attempts).toBe(3);

    await markWebhookReceiptProcessed(
      eventId,
      logicalPaymentId,
      new Date(t0.getTime() + 64_000),
    );

    const completed = await getWebhookReceipt(eventId);
    expect(completed?.status).toBe("PROCESSED");
    expect(completed?.logicalPaymentId).toBe(logicalPaymentId);
  });
});
