import { describe, expect, it } from "vitest";
import { presentDecisionEvidence } from "../src/history/decision-evidence-presentation";

const sha = "a".repeat(64);
describe("read-only payment decision explanation", () => {
  it("makes imported AP replay understandable and preserves source pointers", () => {
    const [item] = presentDecisionEvidence([{
      code: "AP_INVOICE_NUMBER_REPLAY",
      source: "ap_history.imported_paid_invoice",
      observed: "NS-I001",
      expected: "NS-1001",
      provenance: { importId: "import-fixture", rowSha256: sha, sourceSha256: sha },
    }], "USD");
    expect(item.title).toContain("Previously paid");
    expect(item.observed).toBe("NS-I001");
    expect(item.expected).toBe("NS-1001");
    expect(item.source).toBe("ap_history.imported_paid_invoice");
    expect(item.importId).toBe("import-fixture");
    expect(item.rowSha256).toBe(sha);
    expect(item.explanation).toContain("not payment authority");
  });

  it("explains a destination mismatch without treating the document as a trust source", () => {
    const [item] = presentDecisionEvidence([{
      code: "DESTINATION_MISMATCH", source: "vendor.trusted_destination",
      observed: "changed@example.net", expected: "known@example.net",
    }], "USD");
    expect(item.title).toContain("mismatch");
    expect(item.explanation).toContain("Invoice content cannot change");
    expect(item.observed).toBe("changed@example.net");
  });

  it("formats integer cent amounts without mislabeling invoice-number evidence", () => {
    const [item] = presentDecisionEvidence([{
      code: "AP_AMOUNT_OUTLIER", source: "ap_history.vendor_paid_median",
      observed: 280_000, expected: 120_000,
      provenance: { sampleCount: 7, sourceSha256: sha },
    }], "USD");
    expect(item.observed).toBe("$2,800.00");
    expect(item.expected).toBe("$1,200.00");
    expect(item.sampleCount).toBe(7);
    const [invoice] = presentDecisionEvidence([{
      code: "AP_INVOICE_NUMBER_REPLAY", observed: 1234,
    }], "USD");
    expect(invoice.observed).toBe("1234");
  });

  it("preserves an unknown reason without inventing verified evidence", () => {
    const [item] = presentDecisionEvidence([{
      code: "FUTURE_POLICY_CODE", source: "internal.unknown",
      observed: "case", provenance: { rowSha256: "not-a-digest" },
    }], "USD");
    expect(item.title).toBe("Additional recorded decision evidence");
    expect(item.explanation).toContain("No payment authority");
    expect(item.rowSha256).toBeNull();
  });

  it("handles malformed and injected JSON data as inert strings", () => {
    expect(presentDecisionEvidence(null, "USD")).toEqual([]);
    expect(presentDecisionEvidence([null, {}, 5, [], { code: "" }], "USD")).toEqual([]);
    const [item] = presentDecisionEvidence([{
      code: "<script>alert(1)</script>",
      observed: '<img src=x onerror="alert(1)">',
      provenance: { sourceSha256: "b".repeat(64), sampleCount: -1 },
    }], "USD");
    expect(item.code).toBe("<script>alert(1)</script>");
    expect(item.observed).toContain("<img");
    expect(item.sampleCount).toBeNull();
    expect(item.sourceSha256).toBe("b".repeat(64));
  });
});
