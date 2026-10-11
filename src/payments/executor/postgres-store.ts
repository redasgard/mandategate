import { randomUUID } from "node:crypto";
import { pool } from "../../db/pool";
import { canApplyRemoteStatusTransition } from "../paypal/status";
import { derivePayPalIds } from "./ids";
import { inspectCurrentAuthorityBinding, AuthorityBindingRejected } from "../../authority/binding-guard";
import type {
  AuthoritativePayment,
  ExecutionRecord,
  ExecutionStatus,
  ExecutionStore,
  PayoutItemSnapshot,
} from "./types";

function rowToExecution(row: any): ExecutionRecord {
  return {
    id: row.id,
    paymentRequestId: row.payment_request_id,
    logicalPaymentId: row.logical_payment_id,
    status: row.status,
    paypalRequestId: row.paypal_request_id,
    senderBatchId: row.sender_batch_id,
    senderItemId: row.sender_item_id,
    paypalPayoutBatchId: row.paypal_payout_batch_id ?? null,
    paypalPayoutItemId: row.paypal_payout_item_id ?? null,
    rawPaypalStatus: row.raw_paypal_status ?? null,
    claimedAt: row.claimed_at ?? null,
    createdAt: row.created_at,
    submittedAt: row.submitted_at ?? null,
    lastReconciledAt: row.last_reconciled_at ?? null,
    outcomeUnknownSince: row.outcome_unknown_since ?? null,
  };
}

export class PostgresExecutionStore implements ExecutionStore {
  async getAuthoritativePayment(requestId: string): Promise<AuthoritativePayment | null> {
    const result = await pool.query(
      `select pr.id as request_id,
              pr.logical_payment_id,
              pr.amount_cents,
              pr.currency,
              pr.requested_destination,
              pr.invoice_number,
              pr.source,
              pr.authority_binding_id,
              pr.vendor_id,
              pr.organization_id,
              pd.outcome,
              case when pr.status='APPROVED' and pd.outcome='ESCALATE'
                and exists (
                  select 1 from payment_escalation_reviews rev
                  where rev.payment_request_id=pr.id and rev.action='ACCEPT'
                )
                then 'APPROVED' else pd.outcome end as effective_outcome,
              vd.destination as current_trusted_destination
         from payment_requests pr
         join payment_decisions pd on pd.payment_request_id = pr.id
         join lateral (
           select destination
             from vendor_destinations
            where vendor_id = pr.vendor_id and trusted = true
            order by created_at desc, id desc
            limit 1
         ) vd on true
        where pr.id = $1
        limit 1`,
      [requestId],
    );
    const row = result.rows[0];
    if (!row) return null;
    if (row.source === "verified_invoice") {
      if (!row.authority_binding_id) return null;
      const client = await pool.connect();
      try {
        await client.query("begin");
        const bound = await inspectCurrentAuthorityBinding(
          client, row.authority_binding_id, "CONSUMED",
        );
        if (
          bound.linkedRequestId !== requestId ||
          bound.organizationId !== row.organization_id ||
          bound.vendorId !== row.vendor_id ||
          bound.amountCents !== row.amount_cents ||
          bound.currency !== row.currency ||
          bound.invoiceNumber !== row.invoice_number ||
          bound.recipient !== row.requested_destination
        ) {
          await client.query("rollback");
          return null;
        }
        await client.query("commit");
      } catch (error) {
        await client.query("rollback").catch(() => undefined);
        if (error instanceof AuthorityBindingRejected) return null;
        throw error;
      } finally {
        client.release();
      }
    }
    return {
      requestId: row.request_id,
      logicalPaymentId: row.logical_payment_id,
      amountCents: row.amount_cents,
      currency: row.currency,
      requestedDestination: row.requested_destination,
      currentTrustedDestination: row.current_trusted_destination,
      decisionOutcome: row.effective_outcome,
      invoiceNumber: row.invoice_number,
    };
  }

  async getOrCreateExecution(payment: AuthoritativePayment): Promise<ExecutionRecord> {
    const ids = derivePayPalIds(payment.logicalPaymentId);
    await pool.query(
      `insert into payment_executions
       (id, payment_request_id, logical_payment_id, status, paypal_request_id, sender_batch_id, sender_item_id)
       values ($1, $2, $3, 'READY', $4, $5, $6)
       on conflict (logical_payment_id) do nothing`,
      [randomUUID(), payment.requestId, payment.logicalPaymentId, ids.paypalRequestId, ids.senderBatchId, ids.senderItemId],
    );
    return this.getExecution(payment.logicalPaymentId);
  }

  async getExecution(logicalPaymentId: string): Promise<ExecutionRecord> {
    const result = await pool.query(`select * from payment_executions where logical_payment_id = $1 limit 1`, [logicalPaymentId]);
    if (!result.rows[0]) throw new Error("PAYMENT_EXECUTION_NOT_FOUND");
    return rowToExecution(result.rows[0]);
  }

  async tryClaim(logicalPaymentId: string, allowed: ExecutionStatus[]): Promise<ExecutionRecord | null> {
    const result = await pool.query(
      `update payment_executions
          set status = 'SUBMITTING', claimed_at = now(), updated_at = now()
        where logical_payment_id = $1 and status = any($2::text[])
        returning *`,
      [logicalPaymentId, allowed],
    );
    return result.rows[0] ? rowToExecution(result.rows[0]) : null;
  }

  async markSubmitted(logicalPaymentId: string, payoutBatchId: string, now: Date) {
    return this.updateOne(
      `update payment_executions
          set status = 'EXECUTING', paypal_payout_batch_id = $2,
              submitted_at = coalesce(submitted_at, $3), outcome_unknown_since = null, updated_at = $3
        where logical_payment_id = $1 returning *`,
      [logicalPaymentId, payoutBatchId, now],
    );
  }

  async markFailed(logicalPaymentId: string, rawStatus: string, now: Date) {
    return this.updateOne(
      `update payment_executions
          set status = 'PAYMENT_FAILED', raw_paypal_status = $2, updated_at = $3
        where logical_payment_id = $1 returning *`,
      [logicalPaymentId, rawStatus.slice(0, 200), now],
    );
  }

  async markBlocked(logicalPaymentId: string, reason: string, now: Date) {
    return this.updateOne(
      `update payment_executions
          set status = 'PAYMENT_BLOCKED', raw_paypal_status = $2, updated_at = $3
        where logical_payment_id = $1 returning *`,
      [logicalPaymentId, reason.slice(0, 200), now],
    );
  }

  async markUnknown(logicalPaymentId: string, now: Date) {
    return this.updateOne(
      `update payment_executions
          set status = 'PAYMENT_UNKNOWN', outcome_unknown_since = coalesce(outcome_unknown_since, $2), updated_at = $2
        where logical_payment_id = $1 returning *`,
      [logicalPaymentId, now],
    );
  }

  async markManualReconciliation(logicalPaymentId: string, now: Date) {
    return this.updateOne(
      `update payment_executions
          set status = 'PAYMENT_UNKNOWN_MANUAL_RECONCILIATION', updated_at = $2
        where logical_payment_id = $1 returning *`,
      [logicalPaymentId, now],
    );
  }

  async applyRemoteStatus(
    logicalPaymentId: string,
    snapshot: PayoutItemSnapshot,
    mappedStatus: ExecutionStatus,
    now: Date,
  ) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const currentResult = await client.query(
        "select * from payment_executions where logical_payment_id = $1 for update",
        [logicalPaymentId],
      );
      if (!currentResult.rows[0]) throw new Error("PAYMENT_EXECUTION_NOT_FOUND");

      const current = rowToExecution(currentResult.rows[0]);
      if (!canApplyRemoteStatusTransition(current.status, mappedStatus)) {
        await client.query("commit");
        return { execution: current, applied: false };
      }

      const updated = await client.query(
        `update payment_executions
            set status = $2,
                paypal_payout_batch_id = $3,
                paypal_payout_item_id = $4,
                raw_paypal_status = $5,
                last_reconciled_at = $6,
                outcome_unknown_since = null,
                updated_at = $6
          where logical_payment_id = $1
          returning *`,
        [
          logicalPaymentId,
          mappedStatus,
          snapshot.payoutBatchId,
          snapshot.payoutItemId,
          snapshot.transactionStatus,
          now,
        ],
      );
      await client.query("commit");
      return { execution: rowToExecution(updated.rows[0]), applied: true };
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async appendEvent(
    logicalPaymentId: string,
    eventType: string,
    payload: Record<string, unknown> = {},
    eventId?: string,
  ) {
    await pool.query(
      `insert into payment_execution_events (id, logical_payment_id, event_type, payload)
       values ($1, $2, $3, $4::jsonb)
       on conflict (id) do nothing`,
      [eventId ?? randomUUID(), logicalPaymentId, eventType, JSON.stringify(payload)],
    );
  }

  async findLogicalPaymentIdByPayPalRef(refs: { payoutItemId?: string; payoutBatchId?: string }) {
    if (!refs.payoutItemId && !refs.payoutBatchId) return null;
    const result = await pool.query(
      `select logical_payment_id
         from payment_executions
        where ($1::text is not null and paypal_payout_item_id = $1)
           or ($2::text is not null and paypal_payout_batch_id = $2)
        order by created_at desc
        limit 1`,
      [refs.payoutItemId ?? null, refs.payoutBatchId ?? null],
    );
    return result.rows[0]?.logical_payment_id ?? null;
  }

  private async updateOne(sql: string, params: unknown[]) {
    const result = await pool.query(sql, params);
    if (!result.rows[0]) throw new Error("PAYMENT_EXECUTION_NOT_FOUND");
    return rowToExecution(result.rows[0]);
  }
}

export const postgresExecutionStore = new PostgresExecutionStore();
