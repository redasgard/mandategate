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
