export type PaymentView = "ALL" | "REVIEW" | "DENIED" | "ALLOWED" | "PAID";
export type PaymentListRow = {status: string; outcome: string; executionStatus: string | null};

export const PAYMENT_VIEW_OPTIONS: readonly { value: PaymentView; label: string }[] = [
  { value: "ALL", label: "Recent requests" },
  { value: "REVIEW", label: "Needs review" },
  { value: "DENIED", label: "Denied" },
  { value: "ALLOWED", label: "Allowed" },
  { value: "PAID", label: "Paid" },
];

export function parsePaymentView(value: unknown): PaymentView {
  if (value === "REVIEW" || value === "DENIED" || value === "ALLOWED" || value === "PAID") return value;
  return "ALL";
}

export function matchesPaymentView(row: PaymentListRow, view: PaymentView): boolean {
  switch (view) {
    case "REVIEW": return row.status === "ESCALATED";
    case "DENIED": return row.outcome === "DENY";
    case "ALLOWED": return row.outcome === "ALLOW";
    case "PAID": return row.executionStatus === "PAID";
    case "ALL": return true;
  }
}

export function paymentExecutionLabel(status: string | null): string {
  if (!status) return "No payout recorded";
  if (status === "PAID") return "Paid · reconciled";
  if (status.startsWith("PAYMENT_UNKNOWN")) return "Unknown · investigate";
  return status.replaceAll("_", " ");
}
