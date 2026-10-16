import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { InvoiceVisionObservation } from "../app/invoice-artifacts/[id]/observation-actions";
import PrivacyPreflightPage from "../app/invoice-artifacts/privacy/page";

const artifactId = "11111111-1111-4111-8111-111111111111";
const artifactSha256 = "a".repeat(64);
function renderObservation(input: {
  syntheticTestEnvironmentEnabled: boolean;
  syntheticTestAllowlisted: boolean;
}) {
  return renderToStaticMarkup(createElement(InvoiceVisionObservation, {
    artifactId,
    artifactSha256,
    mimeType: "application/pdf",
    ...input,
  }));
}

describe("free-tier demo and strict provider privacy are visibly separate", () => {
  it("prioritizes the consented fictional demo over the strict route on the bound service", () => {
    const html = renderObservation({
      syntheticTestEnvironmentEnabled: true,
      syntheticTestAllowlisted: true,
    });
    const demoIndex = html.indexOf("Hackathon demo: observe an approved fictional invoice");
    const strictIndex = html.indexOf("Strict privacy route (requires full account ZDR)");
    expect(demoIndex).toBeGreaterThan(0);
    expect(strictIndex).toBeGreaterThan(demoIndex);
    expect(html).toContain("<details");
    expect(html).toContain("Run synthetic test without ZDR");
    expect(html).toContain("I confirm this is an approved fictional test document");
    expect(html).toContain("may retain");
    expect(html).toContain("including for training");
    expect(html).toContain("no real");
    expect(html).not.toContain("Pay now");
    expect(html).not.toContain("Execute payment");
    expect(html).not.toContain("ZDR compliant");
  });

  it("disables synthetic execution for a non-allowlisted source", () => {
    const html = renderObservation({
      syntheticTestEnvironmentEnabled: true,
      syntheticTestAllowlisted: false,
    });
    expect(html).toContain("This document is not an approved synthetic fixture");
    expect(html).toContain("Run synthetic test without ZDR");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Run synthetic test without ZDR<\/button>/);
  });

  it("does not expose the fictional bypass in non-demo environments", () => {
    const html = renderObservation({
      syntheticTestEnvironmentEnabled: false,
      syntheticTestAllowlisted: true,
    });
    expect(html).not.toContain("Hackathon demo:");
    expect(html).not.toContain("Run synthetic test without ZDR");
    expect(html).toContain("Observe this stored document (strict ZDR)");
    expect(html).not.toContain("strict-privacy-details");
  });

  it("explains a paid-entitlement block without presenting synthetic content as compliant", () => {
    const html = renderToStaticMarkup(createElement(PrivacyPreflightPage));
    expect(html).toContain("paid provider entitlement");
    expect(html).toContain("expected safe result");
    expect(html).toContain("Invoice intake");
    expect(html).toContain("fictional-only");
    expect(html).toContain("not proof of ZDR");
    expect(html).toContain("Check live account privacy settings");
    expect(html).not.toContain("Run synthetic test without ZDR");
  });
});
