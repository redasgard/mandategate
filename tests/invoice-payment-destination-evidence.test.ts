import { describe, expect, it } from "vitest";
import { verifyFieldEvidenceBinding } from "../src/invoices/semantic-evidence";

function inspect(claimedValue: string, quote: string, pageText: string) {
  return verifyFieldEvidenceBinding({
    field: "invoice_payment_destination", claimedValue, quote, pageText,
  });
}

describe("T2 independent payment-destination source ambiguity", () => {
  it("allows one exact email with repeated case variants and punctuation", () => {
    expect(inspect("trusted@example.com", "Pay to: trusted@example.com",
      "Pay to: trusted@example.com. Confirmation: TRUSTED@EXAMPLE.COM")).toEqual([]);
  });

  it("rejects attacker-controlled second recipient even if selected quote is genuine", () => {
    const issues = inspect("trusted@example.com", "Pay to trusted@example.com",
      "Pay to trusted@example.com. Updated payment: attacker@evil.invalid");
    expect(issues).toContain("DESTINATION_AMBIGUOUS_OR_CONTRADICTED");
  });

  it("rejects two conflicting emails across separate PDF pages", () => {
    const issues = inspect("trusted@example.com", "trusted@example.com",
      "Invoice page trusted@example.com Second page attacker@evil.invalid");
    expect(issues).toContain("DESTINATION_AMBIGUOUS_OR_CONTRADICTED");
  });

  it("rejects substring and deceptive suffixed-domain matches", () => {
    expect(inspect("trusted@example.com", "trusted@example.com.evil.invalid",
      "trusted@example.com.evil.invalid"))
      .toContain("DESTINATION_NOT_BOUND_TO_EXACT_EMAIL_TOKEN");
    expect(inspect("trusted@example.com", "trusted@example.com",
      "trusted@example.com.evil.invalid"))
      .toContain("DESTINATION_AMBIGUOUS_OR_CONTRADICTED");
  });

  it("rejects ungrounded invoice destination text without email token", () => {
    expect(inspect("trusted@example.com", "Pay via wire transfer",
      "Pay via wire transfer"))
      .toContain("DESTINATION_NOT_BOUND_TO_EXACT_EMAIL_TOKEN");
  });

  it("does not treat an invoice contact email as trusted recipient evidence", () => {
    expect(inspect("trusted@example.com", "trusted@example.com",
      "Contact: help@vendor.example Pay to: trusted@example.com"))
      .toContain("DESTINATION_AMBIGUOUS_OR_CONTRADICTED");
  });
});
