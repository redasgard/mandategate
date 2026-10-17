import { HISTORICAL_SANDBOX_PROOF as proof } from "@/src/demo/historical-sandbox-proof";

/**
 * Deliberately static: this panel does not contact PayPal and cannot
 * participate in invoice binding, replay, payout, or settlement logic.
 */
export function HistoricalSandboxProof() {
  return <section id="demo-historical-paypal" className="review-stage"
    aria-label="Historical separate PayPal Sandbox payout evidence">
    <p className="eyebrow">PayPal Sandbox / historical evidence</p>
    <h2>Recorded earlier PayPal Sandbox payout</h2>
    <p>
      An earlier <strong>direct trusted-agent payment request</strong> reached
      PayPal Sandbox and was reconciled. The saved records show one logical
      payment, one submission, a verified webhook and final successful status.
    </p>
    <div className="risk-evidence-list">
      <article className="risk-evidence-card">
        <p className="eyebrow">Earlier Render environment / archived proof</p>
        <h3>PayPal Sandbox <span className="decision allow">SUCCESS (historical)</span></h3>
        <p><strong>Logical payment:</strong> <code>{proof.logicalPaymentId}</code></p>
        <p><strong>Payout batch:</strong> <code>{proof.paypalPayoutBatchId}</code></p>
        <p><strong>Payout item:</strong> <code>{proof.paypalPayoutItemId}</code></p>
        <p><strong>Recorded final status:</strong> PayPal {proof.remoteStatusObserved} /
          local {proof.localStatusObserved}</p>
        <p><strong>Recorded events:</strong> {proof.submittedEventsObserved} submission;
          {" "}{proof.webhookVerifiedEventsObserved} verified webhook;
          {" "}{proof.reconciledEventsObserved} reconciliations;
          {" "}{proof.webhookReconcileFailuresObserved} reconciliation failures</p>
        <p>
          <a href={proof.buildLedgerUrl} target="_blank" rel="noopener noreferrer">
            View historical build ledger and receipt details ↗
          </a>
          {" · "}
          <a href={proof.reviewUrl} target="_blank" rel="noopener noreferrer">
            Read Slice 2 critical review ↗
          </a>
        </p>
      </article>
    </div>
    <p role="note" className="muted">
      <strong>Separate evidence paths:</strong> This archived Sandbox transfer
      was <strong>not caused by the GLM-reviewed PDF invoices</strong>. Its IDs
      are not records from the current Neon demo database, and this page has
      not contacted PayPal or reverified settlement. It is not permission to
      execute or repeat any payout. The fictional invoice observations remain
      advisory-only and blocked from financial authority.
    </p>
  </section>;
}
