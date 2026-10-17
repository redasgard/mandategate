import { describe, expect, it } from "vitest";
import { verifyFieldEvidenceBinding } from "../src/invoices/semantic-evidence";

const inspect = (quote: string, pageText: string, claimedValue = "USD") =>
  verifyFieldEvidenceBinding({field: "currency", claimedValue, quote, pageText});

describe("T2 currency cannot be laundered through a selected PDF quote", () => {
  it("accepts the exact documented USD in a single-currency PDF", () => {
    expect(inspect("USD", "Invoice INV-100. USD Total 125.00")).toEqual([]);
    expect(inspect("USD", "USD Total 125.00. Footer: USD")).toEqual([]);
  });
  it("refuses a different explicit ISO currency on another PDF page", () => {
    expect(inspect("USD", "USD Total 125.00. Second page: EUR Total 125.00"))
      .toContain("CURRENCY_AMBIGUOUS_OR_CONTRADICTED");
    expect(inspect("USD", "USD Total 125.00. Updated currency: CAD"))
      .toContain("CURRENCY_AMBIGUOUS_OR_CONTRADICTED");
    expect(inspect("USD", "USD Total 125.00. Supplemental: UAH"))
      .toContain("CURRENCY_AMBIGUOUS_OR_CONTRADICTED");
  });
  it("refuses conflicting foreign currency signs even without an ISO code", () => {
    expect(inspect("USD", "USD Total 125.00. Pay €125.00"))
      .toContain("CURRENCY_AMBIGUOUS_OR_CONTRADICTED");
    expect(inspect("USD", "USD Total 125.00. Pay £125.00"))
      .toContain("CURRENCY_AMBIGUOUS_OR_CONTRADICTED");
  });
  it("rejects a source-missing or fabricated selected currency quote", () => {
    expect(inspect("USD", "EUR Total 125.00")).toContain("EVIDENCE_QUOTE_MISMATCH");
    expect(inspect("EUR", "USD Total 125.00")).toContain("EVIDENCE_QUOTE_MISMATCH");
  });
  it("cannot accept an unrecognized currency via a self-selected quote", () => {
    expect(inspect("XYZ", "XYZ Total 125.00", "XYZ"))
      .toContain("CURRENCY_AMBIGUOUS_OR_CONTRADICTED");
  });
});
