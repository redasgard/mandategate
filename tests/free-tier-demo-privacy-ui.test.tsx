import {describe,expect,it,vi} from "vitest";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {InvoiceVisionObservation} from "../app/invoice-artifacts/[id]/observation-actions";

vi.mock("next/navigation",()=>({
  redirect:(path:string)=>{throw new Error("REDIRECT:"+path);}
}));
import PrivacyPreflightPage from "../app/invoice-artifacts/privacy/page";

describe("hackathon invoice analysis without ZDR UI",()=>{
  it("always presents one AI action and no privacy entitlement blocker",()=>{
    const html=renderToStaticMarkup(createElement(InvoiceVisionObservation,{
      artifactId:"11111111-1111-4111-8111-111111111111",
      artifactSha256:"a".repeat(64),
      mimeType:"application/pdf",
    }));
    expect(html).toContain("Analyze invoice with AI");
    expect(html).toContain("Experiential Labs");
    expect(html).not.toMatch(/ZDR|zero.data.retention|demo|privacy preflight/i);
    expect(html).not.toContain("type=\"checkbox\"");
    expect(html).not.toContain("Pay now");
  });
  it("redirects obsolete provider privacy pages to invoice intake",()=>{
    expect(()=>PrivacyPreflightPage()).toThrow("REDIRECT:/invoice-artifacts");
  });
});
