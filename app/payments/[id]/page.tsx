import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/src/auth/auth";
import { getDecisionDetail } from "@/src/db/views";
import { ExecutePaymentButton } from "./execute-button";
import { EscalationReview } from "./escalation-review";
import { getEscalationSnapshot } from "@/src/history/escalation-review";
import { DecisionEvidencePanel } from "./decision-evidence";
import { pool } from "@/src/db/pool";
import { OperationsHeader } from "@/app/components/operations-header";
import { paymentSourceLabel, paymentExecutionLabel } from "@/src/ui/payments-view";
import { paymentDetailStatus, showManualSandboxControl } from "@/src/ui/payment-detail-state";
import { compareTrustedRecipient } from "@/src/ui/trusted-recipient";
import Link from "next/link";

export default async function PaymentDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const { id } = await params;
  const row = await getDecisionDetail(id, session.user.id);
  if (!row) notFound();

  const snapshot = row.outcome === "ESCALATE"
    ? await getEscalationSnapshot(id, session.user.id) : null;
  // Preserve current tenant membership at this read, even if it is revoked
  // after getDecisionDetail. Reviewing the payment never upgrades authority.
  const recordedReview = row.outcome === "ESCALATE" ? await pool.query([
    "select r.action,r.explanation,r.created_at,r.evidence_sha256",
    "from payment_escalation_reviews r",
    "join payment_requests pr on pr.id=r.payment_request_id",
    "where r.payment_request_id=$1",
    "and exists (select 1 from organization_admin_memberships m",
    "where m.organization_id=pr.organization_id and m.user_id=$2",
    "and m.role='ADMIN' and m.active=true)",
    "limit 1",
  ].join(" "), [id, session.user.id]) : null;

  const currentTrust = await pool.query([
    "select vd.destination from vendor_destinations vd",
    "join vendors v on v.id=vd.vendor_id and v.organization_id=$2",
    "where vd.vendor_id=$1 and vd.trusted=true",
    "and exists (select 1 from organization_admin_memberships m",
    "where m.organization_id=v.organization_id and m.user_id=$3",
    "and m.role='ADMIN' and m.active=true)",
    "limit 2",
  ].join(" "), [row.vendorId, row.organizationId, session.user.id]);
  const trustDisplay = compareTrustedRecipient(
    currentTrust.rows.map(value => String(value.destination)), row.requestedDestination,
  );
  const payoutsDisabled = process.env.MANDATEGATE_DISABLE_PAYMENTS === "1";
  const amountLabel = new Intl.NumberFormat("en-US", {
    style: "currency", currency: row.currency,
  }).format(row.amountCents / 100);
  const displayState = {
    outcome: row.outcome,
    requestStatus: row.status,
    executionStatus: row.executionStatus,
    payoutBatchId: row.paypalPayoutBatchId,
    payoutItemId: row.paypalPayoutItemId,
  };
  const manualTestControl = showManualSandboxControl(displayState, payoutsDisabled);
  const paypalStatus = paymentDetailStatus(displayState);

  return <main className="shell">
    <OperationsHeader active="payments" title="Payment investigation"
      description="Review the original request, the policy decision, and actual provider evidence before taking action."
      email={session.user.email} context="PAYMENTS / DETAIL"/>

    <section className="panel ops-payment-detail" aria-label="Payment request overview">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Payment record / {paymentSourceLabel(row.source)}</p>
          <h2>{row.vendorName} · {row.invoiceNumber}</h2>
        </div>
        <span className={"decision "+row.outcome.toLowerCase()}>{row.outcome}</span>
      </div>
      <div className="panel-body">
        <div className="ops-payment-hero">
          <div><span>Amount requested</span><strong>{amountLabel}</strong></div>
          <div><span>Recorded payment state</span><strong>{paypalStatus}</strong></div>
        </div>
        <dl className="ops-payment-facts">
          <div><dt>Request source</dt><dd>{paymentSourceLabel(row.source)}</dd></div>
          <div><dt>Request state</dt><dd>{row.status}</dd></div>
          <div><dt>Invoice / agent requested recipient</dt><dd className="mono">{row.requestedDestination}</dd></div>
          <div><dt>Current vendor trust record</dt><dd className="mono">{trustDisplay.destination}</dd></div>
          <div><dt>Recipient comparison</dt><dd>{trustDisplay.label}{trustDisplay.isMismatch ? <> · <Link href="/vendors">Investigate vendor trust</Link></> : null}</dd></div>
          <div><dt>PayPal execution</dt><dd>{paymentExecutionLabel(row.executionStatus)}</dd></div>
        </dl>
        <p className="ops-context-note">An ALLOW decision does not mean payment was sent. The invoice and agent-provided recipient cannot update a vendor's trusted destination.</p>
      </div>
    </section>

    <section className="panel ops-payment-detail" aria-label="Decision explanation">
      <div className="panel-head">
        <div><p className="eyebrow">Deterministic controls / evidence</p><h2>Decision evidence</h2></div>
      </div>
      <div className="panel-body">
        <p><strong>Reason codes:</strong> {row.reasonCodes.join(", ") || "None recorded"}</p>
        <DecisionEvidencePanel evidence={row.evidence}
          reasonCodes={row.reasonCodes} currency={row.currency}/>
      </div>
    </section>

    {row.outcome === "ESCALATE" && row.status === "ESCALATED" && snapshot
      ? <section className="panel detail" aria-label="Human escalation review">
          <EscalationReview requestId={row.requestId}
            snapshotSha256={snapshot.snapshotSha256}
            trustedDestinationCurrent={snapshot.trustedDestinationCurrent}
            payoutsDisabled={payoutsDisabled}/>
        </section> : null}
    {recordedReview?.rows[0] ? <section className="panel detail" aria-label="Recorded human decision">
      <p className="eyebrow">Prior human decision</p>
      <p><strong>{recordedReview.rows[0].action}</strong> · {recordedReview.rows[0].explanation}</p>
    </section> : null}

    <section className="panel ops-payment-detail" aria-label="PayPal provider outcome">
      <div className="panel-head"><div>
        <p className="eyebrow">Payment executor / read-only status</p><h2>PayPal outcome and reconciliation</h2>
      </div></div>
      <div className="panel-body">
        <dl className="ops-payment-facts">
          <div><dt>MandateGate execution</dt><dd>{row.executionStatus??"No execution recorded"}</dd></div>
          <div><dt>Provider state</dt><dd>{row.rawPaypalStatus??"Not available"}</dd></div>
          <div><dt>PayPal batch</dt><dd className="mono">{row.paypalPayoutBatchId??"Not recorded"}</dd></div>
          <div><dt>PayPal item</dt><dd className="mono">{row.paypalPayoutItemId??"Not recorded"}</dd></div>
          <div><dt>Logical payment</dt><dd className="mono">{row.logicalPaymentId}</dd></div>
        </dl>
        {payoutsDisabled ? <p className="ops-context-note">PayPal execution is disabled on this service.</p> : null}
        {row.executionStatus?.includes("UNKNOWN") ? <p role="alert" className="ops-unknown-warning">
          Payment outcome is uncertain. Investigate the existing logical payment and provider state. Do not create or submit a replacement payout.
        </p> : null}
        {manualTestControl ? <details className="ops-manual-test">
          <summary>Manual Sandbox execution · integration test / exceptional fallback</summary>
          <p className="muted">The normal product is agent-driven, with automatic execution only under valid standing mandates. This legacy manual control submits a real PayPal Sandbox payout and remains available for bounded testing. It does not demonstrate unattended autonomy.</p>
          <ExecutePaymentButton requestId={row.requestId} amountLabel={amountLabel} disabled={false}/>
        </details> : null}
      </div>
    </section>
  </main>;
}
