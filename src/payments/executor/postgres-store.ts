import { randomUUID } from "node:crypto";
import { pool } from "../../db/pool";
import { canApplyRemoteStatusTransition } from "../paypal/status";
import { derivePayPalIds } from "./ids";
import { inspectCurrentAuthorityBinding, AuthorityBindingRejected } from "../../authority/binding-guard";
import { escalationSnapshotDigest } from "../../history/escalation-review";
import { evaluatePayment } from "../../policy/decision";
import { assessHistoricalPaymentRisk } from "../../history/anomaly";
import {classifySandboxPaymentRail} from "../../demo/sandbox-invoice-rail";
import { SANDBOX_ORG_ID, SANDBOX_VENDOR_ID, SANDBOX_DEST_ID,
  SANDBOX_POLICY_ID, SANDBOX_INVOICE, SANDBOX_AMOUNT_CENTS } from "../../demo/sandbox-payout-constants";
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
              pr.status,
              pr.source,
              pr.idempotency_key,
              pr.authority_binding_id,
              pr.vendor_id,
              pr.organization_id,
              pd.outcome,
              case when pr.status='APPROVED' and pd.outcome='ESCALATE'
                and exists (
                  select 1 from payment_escalation_reviews rev
                  where rev.payment_request_id=pr.id and rev.action='ACCEPT'
                  and exists (
                    select 1 from organization_admin_memberships m
                    where m.organization_id=pr.organization_id
                      and m.user_id=rev.reviewer_user_id
                      and m.role='ADMIN' and m.active=true
                  )
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

    if (process.env.MANDATEGATE_RUNTIME_MODE === "neon-sandbox") {
      // The only two permissible demo identities use fixed fictional USD 1.01
      // and the configured PayPal Sandbox receiver. An invoice-derived payout
      // requires a consumed, current T4 human-approved PDF source binding;
      // its independent validation below is not replaced by this envelope.
      const rail=classifySandboxPaymentRail({
        source:row.source,
        organizationId:row.organization_id,
        vendorId:row.vendor_id,
        invoiceNumber:row.invoice_number,
        amountCents:Number(row.amount_cents),
        currency:row.currency,
        requestedDestination:row.requested_destination,
        currentTrustedDestination:row.current_trusted_destination,
        authorityBindingId:row.authority_binding_id??null,
        idempotencyKey:row.idempotency_key??null,
        status:row.status,
        outcome:row.outcome,
        effectiveOutcome:row.effective_outcome,
      });
      if(!rail) return null;
      if(rail==="FIXED_MANUAL_FIXTURE"){
        const state = await pool.query([
        "select v.name,v.normal_max_amount_cents,",
        "(select count(*)::int from vendor_destinations d",
        "where d.vendor_id=v.id and d.trusted=true) as trusted_count,",
        "(select count(*)::int from vendor_destinations d",
        "where d.vendor_id=v.id and d.id=$2 and d.trusted=true",
        "and d.destination=$3) as exact_receiver,",
        "(select count(*)::int from policies p",
        "where p.id=$4 and p.organization_id=v.organization_id",
        "and p.active=true and p.auto_pay_max_amount_cents=101) as exact_policy",
        "from vendors v where v.id=$1 and v.organization_id=$5",
      ].join(" "), [
        SANDBOX_VENDOR_ID, SANDBOX_DEST_ID,
        process.env.DEMO_PAYPAL_RECEIVER_EMAIL, SANDBOX_POLICY_ID,
        SANDBOX_ORG_ID,
      ]);
      const current = state.rows.length === 1 ? state.rows[0] : null;
      if (!current || current.name !== "Sandbox Test Recipient" ||
          Number(current.normal_max_amount_cents) !== 101 ||
          Number(current.trusted_count) !== 1 ||
          Number(current.exact_receiver) !== 1 ||
          Number(current.exact_policy) !== 1) return null;
      }
    } else if (row.source === "sandbox_fixture") {
      // A future runtime misconfiguration cannot make the test fixture payable.
      return null;
    }
    if (row.outcome === "ALLOW" && row.source !== "verified_invoice") {
      // An old ALLOW decision does not survive a policy shutdown or tighter
      // vendor/organization limits. Recheck at initial claim and once more
      // immediately before the protected PayPal POST.
      if (row.status !== "ALLOWED") return null;
      const current = await pool.query([
        "select v.normal_max_amount_cents,p.auto_pay_max_amount_cents",
        "from vendors v join lateral (",
        "select auto_pay_max_amount_cents from policies",
        "where organization_id=v.organization_id and active=true",
        "order by created_at desc,id desc limit 1",
        ") p on true where v.id=$1 and v.organization_id=$2",
      ].join(" "), [row.vendor_id,row.organization_id]);
      if (current.rows.length !== 1) return null;
      const vendorLimit = Number(current.rows[0].normal_max_amount_cents);
      const policyLimit = Number(current.rows[0].auto_pay_max_amount_cents);
      if (!Number.isSafeInteger(vendorLimit) || vendorLimit < 0 ||
          !Number.isSafeInteger(policyLimit) || policyLimit < 0) return null;
      const decision = evaluatePayment({
        amountCents: row.amount_cents,
        currency: row.currency,
        requestedDestination: row.requested_destination,
        trustedDestination: row.current_trusted_destination,
        vendorNormalMaxAmountCents: vendorLimit,
        policyAutoPayMaxAmountCents: policyLimit,
      });
      if (decision.outcome !== "ALLOW") return null;
      // A paid-history import added after the original ALLOW decision may
      // reveal a duplicate or abnormal invoice before money leaves.
      try {
        const history = await assessHistoricalPaymentRisk({
          organizationId:row.organization_id,
          vendorId:row.vendor_id,
          invoiceNumber:row.invoice_number,
          amountCents:row.amount_cents,
          currency:row.currency,
        });
        if (history.reasonCodes.length > 0) return null;
      } catch {
        // The risk evidence being unavailable never becomes permission to pay.
        return null;
      }
    }
    if (row.outcome==="ESCALATE" && row.effective_outcome==="APPROVED") {
      // Original human approval was bound to a frozen request/policy/vendor
      // state before the request entered APPROVED. Reconstruct that exact
      // pre-review snapshot against the CURRENT policy and receiver at
      // execution time. Replacing/revoking a policy or editing any payment
      // field cannot inherit an old approval.
      const [policy,review]=await Promise.all([
        pool.query([
          "select id,auto_pay_max_amount_cents from policies",
          "where organization_id=$1 and active=true",
          "order by created_at desc,id desc limit 1",
        ].join(" "),[row.organization_id]),
        pool.query([
          "select request_snapshot_sha256 from payment_escalation_reviews",
          "where payment_request_id=$1 and action='ACCEPT' limit 1",
        ].join(" "),[row.request_id]),
      ]);
      if(!policy.rows[0] || !review.rows[0]) return null;
      const latest=policy.rows[0];
      const snapshot=escalationSnapshotDigest({
        organizationId:row.organization_id,requestId:row.request_id,
        vendorId:row.vendor_id,invoiceNumber:row.invoice_number,
        amountCents:row.amount_cents,currency:row.currency,
        requestedDestination:row.requested_destination,
        policyId:latest.id,policyLimitCents:Number(latest.auto_pay_max_amount_cents),
        trustedDestination:row.current_trusted_destination,
        outcome:"ESCALATE",status:"ESCALATED",
      });
      if(snapshot!==review.rows[0].request_snapshot_sha256)return null;
      // Approval predates any later AP-history import. An accepted escalation
      // must not pay a newly discovered duplicate or risk outlier on the
      // strength of an older otherwise-valid reviewer snapshot.
      try {
        const history=await assessHistoricalPaymentRisk({
          organizationId:row.organization_id,
          vendorId:row.vendor_id,
          invoiceNumber:row.invoice_number,
          amountCents:row.amount_cents,
          currency:row.currency,
        });
        if(history.reasonCodes.length>0)return null;
      } catch {
        return null;
      }
    }
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
        where logical_payment_id = $1 and status = 'SUBMITTING' returning *`,
      [logicalPaymentId, payoutBatchId, now],
    );
  }

  async markFailed(logicalPaymentId: string, rawStatus: string, now: Date) {
    return this.updateOne(
      `update payment_executions
          set status = 'PAYMENT_FAILED', raw_paypal_status = $2, updated_at = $3
        where logical_payment_id = $1 and status = 'SUBMITTING' returning *`,
      [logicalPaymentId, rawStatus.slice(0, 200), now],
    );
  }

  async markBlocked(logicalPaymentId: string, reason: string, now: Date) {
    return this.updateOne(
      `update payment_executions
          set status = 'PAYMENT_BLOCKED', raw_paypal_status = $2, updated_at = $3
        where logical_payment_id = $1 and status = 'SUBMITTING' returning *`,
      [logicalPaymentId, reason.slice(0, 200), now],
    );
  }

  async markUnknown(logicalPaymentId: string, now: Date) {
    return this.updateOne(
      `update payment_executions
          set status = 'PAYMENT_UNKNOWN', outcome_unknown_since = coalesce(outcome_unknown_since, $2), updated_at = $2
        where logical_payment_id = $1 and status in ('SUBMITTING','EXECUTING') returning *`,
      [logicalPaymentId, now],
    );
  }

  async markManualReconciliation(logicalPaymentId: string, now: Date) {
    return this.updateOne(
      `update payment_executions
          set status = 'PAYMENT_UNKNOWN_MANUAL_RECONCILIATION', updated_at = $2
        where logical_payment_id = $1 and status = 'PAYMENT_UNKNOWN' returning *`,
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
    if (result.rows[0]) return rowToExecution(result.rows[0]);
    // Another worker or verified PayPal webhook may have advanced the row.
    // Do not overwrite terminal settlement evidence with a late callback.
    // Return its authoritative current value; a nonexistent ID still throws.
    return this.getExecution(String(params[0]));
  }
}

export const postgresExecutionStore = new PostgresExecutionStore();
