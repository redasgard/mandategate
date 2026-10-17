import { describe, expect, it } from "vitest";
import { verifyFieldEvidenceBinding } from "../src/invoices/semantic-evidence";

function currencyIssues(pageText: string) {
  return verifyFieldEvidenceBinding({
    field: "currency",
    claimedValue: "USD",
    quote: "USD",
    pageText,
  });
}

describe("full-document currency contradictions", () => {
  it("accepts one consistent USD indication", () => {
    expect(currencyIssues("Northstar USD Total 1.01")).toEqual([]);
  });

  it("rejects a second supported common currency on another page", () => {
    expect(currencyIssues("Northstar USD Total 1.01. Settlement EUR"))
      .toContain("CURRENCY_AMBIGUOUS_OR_CONTRADICTED");
  });

  it("rejects explicitly labeled less-common ISO settlement currencies", () => {
    for (const code of ["TRY", "XOF", "AED", "BDT"]) {
      expect(currencyIssues("Northstar USD Total 1.01. Settlement currency: " + code))
        .toContain("CURRENCY_AMBIGUOUS_OR_CONTRADICTED");
    }
  });

  it("rejects contradictory currency symbols", () => {
    expect(currencyIssues("Northstar USD Total 1.01. Additional fee €5.00"))
      .toContain("CURRENCY_AMBIGUOUS_OR_CONTRADICTED");
  });

  it("does not misread ordinary English as ISO currency labels", () => {
    expect(currencyIssues("Northstar USD Total 1.01. We TRY to process ALL invoices at TOP speed."))
      .toEqual([]);
  });

  it("requires USD itself to be grounded in the selected quote", () => {
    const issues = verifyFieldEvidenceBinding({
      field: "currency", claimedValue: "USD",
      quote: "Northstar", pageText: "Northstar Total 1.01 EUR",
    });
    expect(issues).toContain("CURRENCY_NOT_SOURCE_GROUNDED");
  });
});
