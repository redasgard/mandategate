export type PaymentView = "ALL" | "REVIEW" | "DENIED" | "DECLINED" | "ALLOWED" | "PAID" | "UNKNOWN";
export type PaymentListRow = {status: string; outcome: string; executionStatus: string | null};

export const PAYMENT_VIEW_OPTIONS: readonly { value: PaymentView; label: string }[] = [
  { value: "ALL", label: "Recent requests" },
  { value: "REVIEW", label: "Needs review" },
  { value: "DENIED", label: "Denied" },
  { value: "DECLINED", label: "Declined" },
  { value: "ALLOWED", label: "Allowed" },
  { value: "PAID", label: "Paid" },
  { value: "UNKNOWN", label: "Unknown payout" },
];

export function parsePaymentView(value: unknown): PaymentView {
  if (value === "REVIEW" || value === "DENIED" || value === "DECLINED" || value === "ALLOWED" || value === "PAID" || value === "UNKNOWN") return value;
  return "ALL";
}

export function matchesPaymentView(row: PaymentListRow, view: PaymentView): boolean {
  switch (view) {
    case "REVIEW": return row.status === "ESCALATED";
    case "DENIED": return row.outcome === "DENY";
    case "DECLINED": return row.status === "DECLINED";
    case "ALLOWED": return row.outcome === "ALLOW";
    case "PAID": return row.executionStatus === "PAID";
    case "UNKNOWN": return row.executionStatus?.startsWith("PAYMENT_UNKNOWN") === true ||
      row.executionStatus === "PAYMENT_STATUS_UNKNOWN";
    case "ALL": return true;
  }
}

export function paymentExecutionLabel(status: string | null): string {
  if (!status) return "No payout recorded";
  if (status === "PAID") return "Paid · recorded";
  if (status.startsWith("PAYMENT_UNKNOWN") || status === "PAYMENT_STATUS_UNKNOWN") return "Unknown · investigate";
  return status.replaceAll("_", " ");
}

export function paymentSourceLabel(source: string): string {
  switch (source) {
    case "agent_api": return "Agent API";
    case "verified_invoice": return "Reviewed invoice";
    case "sandbox_fixture": return "Sandbox fixture";
    case "demo_fixture": return "Synthetic fixture";
    default: return "Other source";
  }
}
