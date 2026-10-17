/**
 * Historical Slice 2 proof, transcribed from the dated project build ledger.
 *
 * This is a frozen previous Render / PayPal SANDBOX test. It is NOT a fresh
 * PayPal API response, an invoice-derived transfer, or a current Neon record.
 * Never feed these IDs into a payout executor, "resume" command or webhook.
 */
export const HISTORICAL_SANDBOX_PROOF = {
  provenance: "RECORDED_HISTORICAL_SANDBOX_PROOF",
  originalWorkflow: "DIRECT_CANONICAL_PAYMENT_REQUEST",
  environment: "EARLIER_RENDER_PAYPAL_SANDBOX",
  logicalPaymentId: "ff515077-bf90-4800-80d7-3ef8f33d6ee2",
  paypalPayoutBatchId: "BA7V96FCY8Z64",
  paypalPayoutItemId: "A3R9LWD8XTX72",
  remoteStatusObserved: "SUCCESS",
  localStatusObserved: "PAID",
  submittedEventsObserved: 1,
  webhookVerifiedEventsObserved: 1,
  reconciledEventsObserved: 2,
  webhookReconcileFailuresObserved: 0,
  expectedUniqueExecutionRows: 1,
  sourceRevision: "be8ba53e410ad74160fdc9d8931f2aa16d299e0c",
  buildLedgerUrl:
    "https://github.com/redasgard/mandategate/blob/be8ba53e410ad74160fdc9d8931f2aa16d299e0c/devpost/build-state.md#L255-L265",
  reviewUrl:
    "https://github.com/redasgard/mandategate/blob/be8ba53e410ad74160fdc9d8931f2aa16d299e0c/devpost/reviews/slice-2-critical-review.md",
  actualPayPalVerificationInThisPage: false,
  currentInvoiceDerived: false,
  currentNeonExecutionEvidence: false,
  authorizesNewPayout: false,
} as const;
