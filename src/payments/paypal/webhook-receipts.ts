import { pool } from "../../db/pool";

export type PayPalWebhookRefs = {
  payoutItemId?: string;
  payoutBatchId?: string;
};

export type PayPalWebhookReceiptStatus =
  | "RECEIVED"
  | "PROCESSING"
  | "RETRY"
  | "PROCESSED";

export type PayPalWebhookReceipt = {
  eventId: string;
  eventType: string;
  payoutItemId: string | null;
  payoutBatchId: string | null;
  logicalPaymentId: string | null;
  status: PayPalWebhookReceiptStatus;
  attempts: number;
  lastError: string | null;
  receivedAt: Date;
  processingStartedAt: Date | null;
  processedAt: Date | null;
  updatedAt: Date;
};

const PROCESSING_LEASE_MS = 60_000;

function rowToReceipt(row: any): PayPalWebhookReceipt {
  return {
    eventId: row.event_id,
    eventType: row.event_type,
    payoutItemId: row.paypal_payout_item_id ?? null,
    payoutBatchId: row.paypal_payout_batch_id ?? null,
    logicalPaymentId: row.logical_payment_id ?? null,
    status: row.status,
    attempts: Number(row.attempts),
    lastError: row.last_error ?? null,
    receivedAt: row.received_at,
    processingStartedAt: row.processing_started_at ?? null,
    processedAt: row.processed_at ?? null,
    updatedAt: row.updated_at,
  };
}

export async function getWebhookReceipt(eventId: string) {
  const result = await pool.query(
    "select * from paypal_webhook_receipts where event_id = $1 limit 1",
    [eventId],
  );
  return result.rows[0] ? rowToReceipt(result.rows[0]) : null;
}

export async function persistVerifiedWebhookReceipt(
  eventId: string,
  eventType: string,
  refs: PayPalWebhookRefs,
  now = new Date(),
) {
  const inserted = await pool.query(
    `insert into paypal_webhook_receipts
      (event_id, event_type, paypal_payout_batch_id, paypal_payout_item_id, received_at, updated_at)
     values ($1, $2, $3, $4, $5, $5)
     on conflict (event_id) do nothing
     returning event_id`,
    [
      eventId,
      eventType,
      refs.payoutBatchId ?? null,
      refs.payoutItemId ?? null,
      now,
    ],
  );
  const receipt = await getWebhookReceipt(eventId);
  if (!receipt) throw new Error("PAYPAL_WEBHOOK_RECEIPT_NOT_FOUND");
  return { receipt, inserted: inserted.rowCount === 1 };
}

export async function claimWebhookReceipt(eventId: string, now = new Date()) {
  const leaseCutoff = new Date(now.getTime() - PROCESSING_LEASE_MS);
  const result = await pool.query(
    `update paypal_webhook_receipts
        set status = 'PROCESSING',
            attempts = attempts + 1,
            processing_started_at = $2,
            last_error = null,
            updated_at = $2
      where event_id = $1
        and (
          status in ('RECEIVED', 'RETRY')
          or (status = 'PROCESSING' and processing_started_at <= $3)
        )
      returning *`,
    [eventId, now, leaseCutoff],
  );
  return result.rows[0] ? rowToReceipt(result.rows[0]) : null;
}

export async function markWebhookReceiptRetry(
  eventId: string,
  error: string,
  now = new Date(),
) {
  const result = await pool.query(
    `update paypal_webhook_receipts
        set status = 'RETRY',
            last_error = $2,
            updated_at = $3
      where event_id = $1
      returning *`,
    [eventId, error.slice(0, 300), now],
  );
  if (!result.rows[0]) throw new Error("PAYPAL_WEBHOOK_RECEIPT_NOT_FOUND");
  return rowToReceipt(result.rows[0]);
}

export async function markWebhookReceiptProcessed(
  eventId: string,
  logicalPaymentId: string,
  now = new Date(),
) {
  const result = await pool.query(
    `update paypal_webhook_receipts
        set status = 'PROCESSED',
            logical_payment_id = $2,
            processed_at = $3,
            last_error = null,
            updated_at = $3
      where event_id = $1
      returning *`,
    [eventId, logicalPaymentId, now],
  );
  if (!result.rows[0]) throw new Error("PAYPAL_WEBHOOK_RECEIPT_NOT_FOUND");
  return rowToReceipt(result.rows[0]);
}

export async function listRecoverableWebhookReceiptIds(
  limit = 100,
  now = new Date(),
) {
  const leaseCutoff = new Date(now.getTime() - PROCESSING_LEASE_MS);
  const result = await pool.query(
    `select event_id
       from paypal_webhook_receipts
      where status in ('RECEIVED', 'RETRY')
         or (status = 'PROCESSING' and processing_started_at <= $2)
      order by received_at asc, event_id asc
      limit $1`,
    [limit, leaseCutoff],
  );
  return result.rows.map((row) => String(row.event_id));
}
