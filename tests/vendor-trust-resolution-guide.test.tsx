import {describe,expect,it} from "vitest";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {VendorTrustResolutionGuide} from "../app/vendors/trust-resolution-guide";
import type {VendorTrustRequestContext} from "../src/vendor-trust/review-context";

const ctx:VendorTrustRequestContext={
  requestId:"11111111-1111-4111-8111-111111111111",
  organizationName:"Demo organization",vendorId:"v_synthetic",
  vendorName:"Sample supplier",invoiceNumber:"EXAMPLE-41",
  outcome:"ESCALATE",requestStatus:"ESCALATED",
  requestedDestination:"invoice-requested@example.invalid",
  trustedDestination:"original-known@example.test",
  trustedDestinationCount:1,caseId:null,caseResolution:null,
};
const render=(context:VendorTrustRequestContext|null,paymentId?:string)=>
  renderToStaticMarkup(createElement(VendorTrustResolutionGuide,{context,paymentId}));

describe("vendor trust remediation walkthrough",()=>{
  it("shows why an escalated payment has no actionable case, never fakes recipient verification",()=>{
    const html=render(ctx,ctx.requestId);
    expect(html).toContain("Resolve recipient trust for Sample supplier");
    expect(html).toContain("invoice-requested@example.invalid");
    expect(html).toContain("original-known@example.test");
    expect(html).toContain("No re-verification case exists");
    expect(html).toContain("To open an investigation");
    expect(html).toContain("first use Decline without payout");
    expect(html).toContain("Open vendor trust investigation");
    expect(html).toContain("fresh payment request");
    expect(html).toContain('href="/payments/'+ctx.requestId+'"');
    expect(html).not.toContain("Open this exact recorded trust case");
  });
  it("links the exact existing denied mismatch case to a bounded action form",()=>{
    const denied:{[K in keyof VendorTrustRequestContext]:VendorTrustRequestContext[K]}={
      ...ctx,outcome:"DENY",requestStatus:"DENIED",
      caseId:"22222222-2222-4222-8222-222222222222",
    };
    const html=render(denied,ctx.requestId);
    expect(html).toContain('href="#vendor-case-22222222-2222-4222-8222-222222222222"');
    expect(html).toContain("reject the attempted recipient");
    expect(html).toContain("approve the independently verified recipient");
    expect(html).toContain("original denied or declined payment remains stopped");
  });
  it("does not offer an action for already resolved or ineligible cases",()=>{
    const resolved={...ctx,caseId:"22222222-2222-4222-8222-222222222222",
      caseResolution:"VERIFIED",outcome:"DENY",requestStatus:"DENIED"};
    const html=render(resolved,ctx.requestId);
    expect(html).toContain("Resolution already recorded: VERIFIED");
    expect(html).not.toContain("Open this exact recorded trust case");
    const escalated={...ctx,caseId:"22222222-2222-4222-8222-222222222222"};
    expect(render(escalated,ctx.requestId)).toContain("No eligible case action");
    const declined={...escalated,requestStatus:"DECLINED"};
    expect(render(declined,ctx.requestId)).toContain("Open this exact recorded trust case");
  });
  it("does not disclose any recipient for an unknown or unauthorized payment",()=>{
    const html=render(null,ctx.requestId);
    expect(html).toContain("Payment not found in your authorized organizations");
    expect(html).not.toContain("Sample supplier");
    expect(html).not.toContain("original-known@example.test");
    expect(html).not.toContain("invoice-requested@example.invalid");
  });
  it("does not select a trusted recipient when active registry records conflict",()=>{
    const html=render({...ctx,trustedDestinationCount:2},ctx.requestId);
    expect(html).toContain("Multiple conflicting trusted records");
    expect(html).not.toContain("Recipient currently matches");
  });
  it("escapes potentially hostile vendor names",()=>{
    const html=render({...ctx,vendorName:"<img src=x onerror=alert(1)>"},
      ctx.requestId);
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img src=x");
  });
});
