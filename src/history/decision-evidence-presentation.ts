/** Presentation only. Never infer authorization or authenticity from evidence. */
type EvidenceText = {
  title: string;
  explanation: string;
  valuesAreCents?: boolean;
};
const KNOWN: Record<string, EvidenceText> = {
  DESTINATION_MISMATCH: {
    title: "Payment destination mismatch",
    explanation: "The requested destination differs from the vendor's stored trusted destination. Invoice content cannot change that trusted record.",
  },
  AMOUNT_OUTSIDE_VENDOR_BASELINE: {
    title: "Above vendor's configured amount",
    explanation: "The amount exceeds the normal payment limit configured for this vendor.",
    valuesAreCents: true,
  },
  POLICY_AUTO_PAY_LIMIT_EXCEEDED: {
    title: "Above automatic payment limit",
    explanation: "The amount is above the active policy's automatic payment threshold.",
    valuesAreCents: true,
  },
  WITHIN_TRUSTED_BASELINE: {
    title: "Within configured policy limits",
    explanation: "The deterministic amount and destination checks passed. This is not independent issuer authentication or permission to execute a payout.",
    valuesAreCents: true,
  },
  AP_INVOICE_NUMBER_REPLAY: {
    title: "Previously paid invoice number",
    explanation: "Imported paid AP history contains a matching normalized invoice number. This history is evidence for escalation, not payment authority.",
  },
  AP_NEAR_DUPLICATE_INVOICE: {
    title: "Visually confusable invoice number",
    explanation: "Imported paid AP history contains a similar-looking invoice number at a similar amount. This warrants human review.",
  },
  AP_AMOUNT_OUTLIER: {
    title: "Unusual payment amount",
    explanation: "The amount exceeds the deterministic paid-history comparison threshold. Historical observations cannot authorize payments.",
    valuesAreCents: true,
  },
  AP_HISTORY_WINDOW_INCOMPLETE: {
    title: "Historical coverage incomplete",
    explanation: "The available bounded history search could not evaluate all paid records. Automatic clearance is unsafe.",
  },
};
export type PresentedDecisionEvidence = {
  code: string;
  title: string;
  explanation: string;
  source: string | null;
  observed: string | null;
  expected: string | null;
  importId: string | null;
  rowSha256: string | null;
  sourceSha256: string | null;
  sampleCount: number | null;
};
const shortString = (v: unknown, max = 300): string | null =>
  typeof v === "string" && v.trim().length > 0 ? v.trim().slice(0, max) : null;
const sha = (v: unknown): string | null =>
  typeof v === "string" && /^[a-f0-9]{64}$/.test(v) ? v : null;
function observedValue(value: unknown, cents: boolean, currency: string): string | null {
  if (typeof value === "string") return shortString(value, 500);
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (cents && Number.isSafeInteger(value)) {
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value / 100);
    } catch { return String(value) + " cents"; }
  }
  return String(value);
}
export function presentDecisionEvidence(input: unknown, currency: string): PresentedDecisionEvidence[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((item: unknown) => {
    if (item === null || typeof item !== "object" || Array.isArray(item)) return [];
    const raw = item as Record<string, unknown>;
    const code = shortString(raw.code, 120);
    if (!code) return [];
    const view = KNOWN[code];
    const provenance = raw.provenance && typeof raw.provenance === "object" &&
      !Array.isArray(raw.provenance) ? raw.provenance as Record<string, unknown> : {};
    return [{
      code,
      title: view?.title ?? "Additional recorded decision evidence",
      explanation: view?.explanation ??
        "Review this recorded evidence and its source. No payment authority can be inferred from this record alone.",
      source: shortString(raw.source, 160),
      observed: observedValue(raw.observed, Boolean(view?.valuesAreCents), currency),
      expected: observedValue(raw.expected, Boolean(view?.valuesAreCents), currency),
      importId: shortString(provenance.importId, 120),
      rowSha256: sha(provenance.rowSha256),
      sourceSha256: sha(provenance.sourceSha256),
      sampleCount: Number.isSafeInteger(provenance.sampleCount) &&
        Number(provenance.sampleCount) > 0 ? Number(provenance.sampleCount) : null,
    }];
  });
}
