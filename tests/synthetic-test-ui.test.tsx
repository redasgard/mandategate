import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import {InvoiceVisionObservation} from "../app/invoice-artifacts/[id]/observation-actions";

const base={
  artifactId:"11111111-1111-4111-8111-111111111111",
  artifactSha256:"a".repeat(64),mimeType:"application/pdf" as const,
};

describe("PayPal hackathon invoice AI interface",()=>{
  it("uses one AI observation path without any ZDR or demo controls",()=>{
    const html=renderToStaticMarkup(createElement(InvoiceVisionObservation,base));
    expect(html).toContain("Analyze invoice with AI");
    expect(html).toContain("GLM-5.3 Flash");
    expect(html).toContain("sent to Experiential Labs");
    expect(html).toContain("AI output cannot");
    expect(html).not.toMatch(/ZDR|zero.data.retention|demo|synthetic|privacy preflight/i);
    expect(html).not.toContain("type=\"checkbox\"");
    expect(html).not.toContain("disabled");
  });
});
