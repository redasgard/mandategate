/**
 * UI projection only. The executor and its authority checks remain the sole
 * source of truth for payment eligibility and idempotency.
 */
export type PaymentDetailState = {
  outcome: string;
  requestStatus: string;
  executionStatus: string | null;
  payoutBatchId: string | null;
  payoutItemId: string | null;
};

const terminal = new Set([
  "PAID", "PAYMENT_FAILED", "PAYMENT_BLOCKED", "PAYMENT_RETURNED",
  "PAYMENT_REFUNDED", "PAYMENT_REVERSED",
]);
const uncertain = new Set([
  "PAYMENT_UNKNOWN", "PAYMENT_UNKNOWN_MANUAL_RECONCILIATION",
  "PAYMENT_STATUS_UNKNOWN",
]);

export function paymentDetailStatus(state: PaymentDetailState): string {
  const execution = state.executionStatus;
  if (execution && uncertain.has(execution)) return "Outcome unknown · reconciliation required";
  if (execution === "PAID") return "Recorded as paid · verify provider evidence";
  if (execution && terminal.has(execution)) return "Payment execution ended · " + execution;
  if (execution === "READY") return "Ready for authorized execution";
  if (state.payoutBatchId || state.payoutItemId) return "PayPal submission recorded · awaiting settlement";
  if (execution) return "Execution in progress · " + execution;
  if (state.outcome === "DENY") return "Blocked by policy or trust";
  if (state.requestStatus === "DECLINED") return "Declined · no payment authorized";
  if (state.requestStatus === "ESCALATED") return "Human review required";
  if (state.outcome === "ALLOW") return "Allowed by policy · not yet paid";
  return "Authorization pending";
}

export function showManualSandboxControl(
  state: PaymentDetailState,
  paymentsDisabled: boolean,
): boolean {
  if (paymentsDisabled || Boolean(state.payoutBatchId || state.payoutItemId)) return false;
  if (state.executionStatus !== null && state.executionStatus !== "READY") return false;
  return state.outcome === "ALLOW" ||
    (state.outcome === "ESCALATE" && state.requestStatus === "APPROVED");
}
