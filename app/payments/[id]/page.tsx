import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/src/auth/auth";
import { getDecisionDetail } from "@/src/db/views";
import { ExecutePaymentButton } from "./execute-button";
import { InvoiceJourney } from "@/app/components/invoice-journey";
import { EscalationReview } from "./escalation-review";
import { getEscalationSnapshot } from "@/src/history/escalation-review";
import { DecisionEvidencePanel } from "./decision-evidence";
import { pool } from "@/src/db/pool";
import {SANDBOX_INVOICE} from "@/src/demo/sandbox-payout-constants";

export default async function PaymentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  const { id } = await params;
  const row = await getDecisionDetail(id, session.user.id);
  if (!row) notFound();
  const snapshot = row.outcome==="ESCALATE"
    ? await getEscalationSnapshot(id,session.user.id):null;
  const recordedReview = row.outcome==="ESCALATE" ? await pool.query([
    "select action,explanation,created_at,evidence_sha256",
    "from payment_escalation_reviews where payment_request_id=$1 limit 1",
  ].join(" "),[id]):null;
  const payoutsDisabled = process.env.MANDATEGATE_DISABLE_PAYMENTS === "1";
  const terminal = ["PAID", "PAYMENT_FAILED", "PAYMENT_BLOCKED", "PAYMENT_RETURNED", "PAYMENT_REFUNDED", "PAYMENT_REVERSED", "PAYMENT_UNKNOWN_MANUAL_RECONCILIATION"].includes(row.executionStatus ?? "");

  const amountLabel=new Intl.NumberFormat("en-US",{
    style:"currency",currency:row.currency,
  }).format(row.amountCents/100);
  const paymentCanExecute=row.outcome==="ALLOW"||
    (row.outcome==="ESCALATE"&&row.status==="APPROVED");
  const paymentSubmitted=Boolean(row.paypalPayoutBatchId||row.paypalPayoutItemId);
  const paymentStatusLabel=terminal
    ? row.executionStatus==="PAID"?"PayPal payment completed"
      :row.executionStatus==="PAYMENT_UNKNOWN_MANUAL_RECONCILIATION"
        ?"Payment status unknown · reconciliation required"
        :"Execution ended · "+row.executionStatus
    :paymentSubmitted?"Sent to PayPal · awaiting final confirmation"
      :paymentCanExecute?"Ready to submit":"Awaiting approval";
  return <main className="shell invoice-product">
    <Link href="/dashboard" className="back">← Dashboard</Link>
    {row.source==="verified_invoice"?<InvoiceJourney stage="pay"/>:null}
    <section className="panel invoice-main">
      <header className="invoice-overview">
        <div><p className="eyebrow">PayPal Sandbox</p>
          <h1>{terminal?"Payment status":"Send this payment"}</h1>
          <p className="muted">Invoice {row.invoiceNumber} · {row.vendorName}</p>
        </div>
        <div className="invoice-overview-aside">
          <span>Payment amount</span>
          <strong>{amountLabel}</strong>
          <span className={"invoice-status "+(
            row.executionStatus==="PAID"?"approved":
              paymentSubmitted?"pending":"needs-review")}>
            {paymentStatusLabel}
          </span>
        </div>
      </header>
      <div className="invoice-workspace-body">
        <div className="invoice-payment-preview">
          <div><span>Supplier</span><strong>{row.vendorName}</strong></div>
          <div><span>Invoice</span><strong>{row.invoiceNumber}</strong></div>
          <div><span>Amount</span><strong>{amountLabel}</strong></div>
          <div><span>PayPal recipient</span><strong>{row.requestedDestination}</strong></div>
        </div>
        <div className="invoice-task-card">
          <div className="invoice-task-card-head">
            <span className="invoice-step-number">04</span>
            <div><h3>Execute with PayPal</h3>
              <p className="muted">This button submits a real request to the
                PayPal Sandbox Payouts API. Sandbox money is test-only.
                MandateGate records provider IDs and reconciles status.</p></div>
          </div>
          {paymentSubmitted?<div className="invoice-review-notes" role="status">
            <strong>PayPal submission recorded</strong>
            <p>Batch {row.paypalPayoutBatchId??"pending"} · Item {row.paypalPayoutItemId??"pending"}.
              A submitted batch is not proof of completed payment.</p>
          </div>:null}
          {row.outcome==="ESCALATE"&&row.status==="ESCALATED"&&snapshot
            ? <EscalationReview requestId={row.requestId}
                snapshotSha256={snapshot.snapshotSha256}
                trustedDestinationCurrent={snapshot.trustedDestinationCurrent}
                payoutsDisabled={payoutsDisabled}/>:null}
          {row.outcome==="ESCALATE"&&recordedReview?.rows[0]
            ? <p className="invoice-small-note">
                Reviewer decision: {recordedReview.rows[0].action} · {recordedReview.rows[0].explanation}
              </p>:null}
          {paymentCanExecute && !payoutsDisabled && !terminal
            ? <ExecutePaymentButton requestId={row.requestId} amountLabel={amountLabel} disabled={terminal}/>
            :null}
          {payoutsDisabled?<p role="alert" className="muted">
            PayPal execution is disabled on this service. No payout was submitted by this action.
          </p>:null}
          {!paymentCanExecute&&!payoutsDisabled?<p role="status">
            Payment needs authorization before PayPal submission.
          </p>:null}
          {terminal?<p role="status">
            Current execution status: <strong>{row.executionStatus}</strong>.
            Further submission is disabled. Check the reconciled status below.
          </p>:null}
        </div>
        <details className="invoice-technical">
          <summary>PayPal status and security audit</summary>
          <dl>
            <div><dt>Decision</dt><dd>{row.outcome}</dd></div>
            <div><dt>Execution status</dt><dd>{row.executionStatus??"Not submitted"}</dd></div>
            <div><dt>PayPal status</dt><dd>{row.rawPaypalStatus??"Not available"}</dd></div>
            <div><dt>PayPal batch ID</dt><dd className="mono">{row.paypalPayoutBatchId??"Not available"}</dd></div>
            <div><dt>PayPal item ID</dt><dd className="mono">{row.paypalPayoutItemId??"Not available"}</dd></div>
            <div><dt>Logical payment ID</dt><dd className="mono">{row.logicalPaymentId}</dd></div>
          </dl>
          <DecisionEvidencePanel evidence={row.evidence}
            reasonCodes={row.reasonCodes} currency={row.currency}/>
        </details>
      </div>
    </section>
  </main>;
}
