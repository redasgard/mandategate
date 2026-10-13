import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InvoiceVisionObservation } from "../app/invoice-artifacts/[id]/observation-actions";

const artifactId = "11111111-1111-4111-8111-111111111111";
const artifactSha256 = "892d7889152b6d6e6d20310f3b7a59cf25e7c3b73ea5882d9c30de781c3ce181";
const base = { artifactId, artifactSha256, mimeType: "application/pdf" as const };

describe("synthetic invoice test control visibility", () => {
  it("does not display the non-ZDR option in strict or production mode", () => {
    const html = renderToStaticMarkup(createElement(InvoiceVisionObservation, base));
    expect(html).not.toContain("Test a synthetic invoice without ZDR");
    expect(html).toContain("Observe this stored document (strict ZDR)");
  });
  it("disables the option when the source is not allowlisted", () => {
    const html = renderToStaticMarkup(createElement(InvoiceVisionObservation, {
      ...base, syntheticTestEnvironmentEnabled: true, syntheticTestAllowlisted: false,
    }));
    expect(html).toContain("not an approved synthetic fixture");
    expect(html).toContain("Run synthetic test without ZDR");
    expect(html).toContain("disabled");
  });
  it("requires an unchecked explicit risk acknowledgement even for an allowlisted file", () => {
    const html = renderToStaticMarkup(createElement(InvoiceVisionObservation, {
      ...base, syntheticTestEnvironmentEnabled: true, syntheticTestAllowlisted: true,
    }));
    expect(html).toContain("provider may retain");
    expect(html).toContain("including for training");
    expect(html).toContain("approved fictional test document");
    expect(html).toContain("type=\"checkbox\"");
    expect(html).toContain("Run synthetic test without ZDR");
    expect(html).toContain("disabled");
    expect(html).toContain("Model observations never");
  });
});
