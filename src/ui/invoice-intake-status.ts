/** Presentation-only interpretation; never a source of financial authority. */
export function invoiceIntakeLabel(state: string): string {
  switch (state) {
    case "STORED_UNTRUSTED": return "Received · untrusted";
    case "PENDING": return "Analysis pending";
    case "EXTRACTED": return "Extracted · review required";
    case "ESCALATED": return "Review required";
    case "FAILED": return "Analysis failed";
    default: return "Review state";
  }
}
