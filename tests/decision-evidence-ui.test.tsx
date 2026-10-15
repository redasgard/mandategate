import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DecisionEvidencePanel } from "../app/payments/[id]/decision-evidence";

const sourceSha = "e".repeat(64);

describe("payment evidence investigation UI", () => {
  it("shows imported AP detection source and independently traceable pointers", () => {
    const html = renderToStaticMarkup(createElement(DecisionEvidencePanel, {
      currency: "USD",
      reasonCodes: ["AP_NEAR_DUPLICATE_INVOICE"],
      evidence: [{
        code: "AP_NEAR_DUPLICATE_INVOICE", source: "ap_history.confusable_paid_invoice",
        observed: "INV-I001", expected: "INV-1001",
        provenance: { importId: "source-import-001", sourceSha256: sourceSha, rowSha256: sourceSha },
      }],
    }));
    expect(html).toContain("Visually confusable invoice number");
    expect(html).toContain("ap_history.confusable_paid_invoice");
    expect(html).toContain("source-import-001");
    expect(html).toContain(sourceSha);
    expect(html).toContain("cannot establish vendor identity");
    expect(html).toContain("Machine-readable decision evidence");
  });

  it("explains a hard destination mismatch without implying approval", () => {
    const html = renderToStaticMarkup(createElement(DecisionEvidencePanel, {
      currency: "USD",
      reasonCodes: ["DESTINATION_MISMATCH"],
      evidence: [{ code: "DESTINATION_MISMATCH", source: "vendor.trusted_destination",
        observed: "different@example.net", expected: "trusted@example.net" }],
    }));
    expect(html).toContain("Payment destination mismatch");
    expect(html).toContain("different@example.net");
    expect(html).toContain("trusted@example.net");
    expect(html).toContain("Invoice content cannot change");
  });

  it("renders untrusted strings as escaped text and exposes no fabricated evidence", () => {
    const html = renderToStaticMarkup(createElement(DecisionEvidencePanel, {
      currency: "USD",
      reasonCodes: ["UNKNOWN"],
      evidence: [{code: "UNKNOWN", source: "<script>alert(1)</script>",
        observed: "<img src=x onerror=alert(1)>"}],
    }));
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("No payment authority can be inferred");
  });
});
