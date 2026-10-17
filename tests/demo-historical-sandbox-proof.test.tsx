import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HISTORICAL_SANDBOX_PROOF as proof } from "../src/demo/historical-sandbox-proof";
import { HistoricalSandboxProof } from "../app/demo/historical-sandbox-proof";

describe("separate historical Sandbox proof in the judge walkthrough", () => {
  it("pins exact archived Sandbox identifiers to recorded Slice 2 evidence", () => {
    const ledger = readFileSync("devpost/build-state.md", "utf8");
    const review = readFileSync("devpost/reviews/slice-2-critical-review.md", "utf8");
    expect(proof.provenance).toBe("RECORDED_HISTORICAL_SANDBOX_PROOF");
    expect(proof.originalWorkflow).toBe("DIRECT_CANONICAL_PAYMENT_REQUEST");
    expect(proof.environment).toBe("EARLIER_RENDER_PAYPAL_SANDBOX");
    expect(proof.logicalPaymentId).toBe("ff515077-bf90-4800-80d7-3ef8f33d6ee2");
    expect(proof.paypalPayoutBatchId).toBe("BA7V96FCY8Z64");
    expect(proof.paypalPayoutItemId).toBe("A3R9LWD8XTX72");
    for (const value of [proof.logicalPaymentId, proof.paypalPayoutBatchId, proof.paypalPayoutItemId]) {
      expect(ledger).toContain(value);
      expect(review).toContain(value);
    }
    expect(ledger).toContain("webhookVerifiedEvents=1");
    expect(ledger).toContain("reconciledEvents=2");
    expect(proof.remoteStatusObserved).toBe("SUCCESS");
    expect(proof.localStatusObserved).toBe("PAID");
    expect(proof.submittedEventsObserved).toBe(1);
    expect(proof.webhookVerifiedEventsObserved).toBe(1);
    expect(proof.reconciledEventsObserved).toBe(2);
    expect(proof.webhookReconcileFailuresObserved).toBe(0);
    expect(proof.buildLedgerUrl).toContain(proof.sourceRevision);
    expect(proof.buildLedgerUrl).toContain("#L255-L265");
    expect(proof.reviewUrl).toContain(proof.sourceRevision);
  });

  it("makes no new payment/issuer/GLM or current-database assertion", () => {
    const html = renderToStaticMarkup(createElement(HistoricalSandboxProof));
    expect(html).toContain("Historical separate PayPal Sandbox payout evidence");
    expect(html).toContain("SUCCESS (historical)");
    expect(html).toContain(proof.paypalPayoutBatchId);
    expect(html).toContain(proof.paypalPayoutItemId);
    expect(html).toContain("not caused by the GLM-reviewed PDF invoices");
    expect(html).toContain("not records from the current Neon demo database");
    expect(html).toContain("not contacted PayPal or reverified settlement");
    expect(html).toContain("not permission to");
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain('form action=');
    expect(html).not.toContain("Execute payout");
    expect(html).not.toContain("Invoice payout complete");
    expect(proof.currentInvoiceDerived).toBe(false);
    expect(proof.currentNeonExecutionEvidence).toBe(false);
    expect(proof.actualPayPalVerificationInThisPage).toBe(false);
    expect(proof.authorizesNewPayout).toBe(false);
  });

  it("is wired from the walkthrough without reusing old PayPal identifiers for execution", () => {
    const page = readFileSync("app/demo/page.tsx", "utf8");
    expect(page).toContain("import {HistoricalSandboxProof}");
    expect(page).toContain('<HistoricalSandboxProof/>');
    expect(page).toContain('href="#demo-historical-paypal"');
    expect(page.indexOf("<DemoVisionEvidence")).toBeLessThan(page.indexOf("<HistoricalSandboxProof/>"));
    expect(page).not.toContain(proof.paypalPayoutBatchId);
    expect(page).not.toContain(proof.logicalPaymentId);
  });
});
