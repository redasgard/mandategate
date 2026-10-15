import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/src/auth/auth";
import { getDecisionDetail } from "@/src/db/views";
import { ExecutePaymentButton } from "./execute-button";
import { EscalationReview } from "./escalation-review";
import { getEscalationSnapshot } from "@/src/history/escalation-review";
import { DecisionEvidencePanel } from "./decision-evidence";
import { pool } from "@/src/db/pool";

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

  return (
    <main className="shell narrow">
      <Link href="/dashboard" className="back">← Dashboard</Link>
      <section className="panel detail">
        <p className="eyebrow">Payment request</p>
        <div className="detail-title"><h1>{row.invoiceNumber}</h1><span className={`decision ${row.outcome.toLowerCase()}`}>{row.outcome}</span></div>
        <dl>
          <div><dt>Vendor</dt><dd>{row.vendorName}</dd></div>
          <div><dt>Amount</dt><dd>{new Intl.NumberFormat("en-US", { style: "currency", currency: row.currency }).format(row.amountCents / 100)}</dd></div>
          <div><dt>Requested destination</dt><dd>{row.requestedDestination}</dd></div>
          <div><dt>Logical payment ID</dt><dd className="mono">{row.logicalPaymentId}</dd></div>
          <div><dt>Execution state</dt><dd>{row.executionStatus ?? "Not executed"}</dd></div>
          <div><dt>PayPal batch ID</dt><dd className="mono">{row.paypalPayoutBatchId ?? "—"}</dd></div>
          <div><dt>PayPal item ID</dt><dd className="mono">{row.paypalPayoutItemId ?? "—"}</dd></div>
          <div><dt>PayPal status</dt><dd>{row.rawPaypalStatus ?? "—"}</dd></div>
        </dl>
        {row.outcome==="ESCALATE" && row.status==="ESCALATED" && snapshot
          ? <EscalationReview requestId={row.requestId}
              snapshotSha256={snapshot.snapshotSha256}
              trustedDestinationCurrent={snapshot.trustedDestinationCurrent}
              payoutsDisabled={payoutsDisabled}/>
          : null}
        {row.outcome==="ESCALATE" && recordedReview?.rows[0]
          ? <section className="review-stage">
              <p className="eyebrow">Recorded human decision</p>
              <h2>{recordedReview.rows[0].action}</h2>
              <p>{recordedReview.rows[0].explanation}</p>
              <p className="muted">Recorded: {(recordedReview.rows[0].created_at as Date).toISOString()}
                 / evidence digest: {recordedReview.rows[0].evidence_sha256??"none"}</p>
            </section>:null}
        {row.outcome === "ALLOW" || (row.outcome==="ESCALATE" && row.status==="APPROVED")
          ? (payoutsDisabled
              ? <p role="status" className="muted">Synthetic preview: PayPal payout execution is disabled. This request remains a recorded decision only.</p>
              : <ExecutePaymentButton requestId={row.requestId} disabled={terminal} />)
          : null}
        <DecisionEvidencePanel evidence={row.evidence} reasonCodes={row.reasonCodes} currency={row.currency}/>
      </section>
    </main>
  );
}
