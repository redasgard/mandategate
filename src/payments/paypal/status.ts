import type { ExecutionStatus } from "../executor/types";

export function mapPayPalItemStatus(raw: string): ExecutionStatus {
  switch (raw.toUpperCase()) {
    case "PENDING": return "EXECUTING";
    case "SUCCESS": return "PAID";
    case "FAILED": return "PAYMENT_FAILED";
    case "BLOCKED": return "PAYMENT_BLOCKED";
    case "ONHOLD": return "PAYMENT_HELD";
    case "UNCLAIMED": return "PAYMENT_UNCLAIMED";
    case "RETURNED": return "PAYMENT_RETURNED";
    case "REFUNDED": return "PAYMENT_REFUNDED";
    case "REVERSED": return "PAYMENT_REVERSED";
    default: return "PAYMENT_STATUS_UNKNOWN";
  }
}

export function isTerminalExecutionStatus(status: ExecutionStatus) {
  return new Set<ExecutionStatus>([
    "PAID",
    "PAYMENT_FAILED",
    "PAYMENT_BLOCKED",
    "PAYMENT_RETURNED",
    "PAYMENT_REFUNDED",
    "PAYMENT_REVERSED",
    "PAYMENT_UNKNOWN_MANUAL_RECONCILIATION",
  ]).has(status);
}

export function canApplyRemoteStatusTransition(
  current: ExecutionStatus,
  next: ExecutionStatus,
) {
  if (current === next) return true;

  if (current === "PAID") {
    return new Set<ExecutionStatus>([
      "PAYMENT_RETURNED",
      "PAYMENT_REFUNDED",
      "PAYMENT_REVERSED",
    ]).has(next);
  }

  // Manual reconciliation blocks automatic retries, not truthful settlement
  // evidence. A later authenticated PayPal lookup or verified webhook may
  // resolve an unknown payout into a definitive terminal result. Never move
  // it back to an executable or still-pending state.
  if (current === "PAYMENT_UNKNOWN_MANUAL_RECONCILIATION") {
    return new Set<ExecutionStatus>([
      "PAID", "PAYMENT_FAILED", "PAYMENT_BLOCKED",
      "PAYMENT_RETURNED", "PAYMENT_REFUNDED", "PAYMENT_REVERSED",
    ]).has(next);
  }

  if (isTerminalExecutionStatus(current)) return false;

  return !new Set<ExecutionStatus>([
    "READY",
    "SUBMITTING",
    "PAYMENT_UNKNOWN",
    "PAYMENT_UNKNOWN_MANUAL_RECONCILIATION",
  ]).has(next);
}
