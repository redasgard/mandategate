import {describe,expect,it,vi} from "vitest";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";

vi.mock("next/navigation",()=>({useRouter:()=>({push:()=>{},refresh:()=>{}})}));
import {StartVendorTrustInvestigation} from "../app/payments/[id]/vendor-trust-case-action";

describe("terminal trust case invitation",()=>{
  it("requires explicit action, describes nonpaying immutable decline, and never offers execution",()=>{
    const html=renderToStaticMarkup(createElement(StartVendorTrustInvestigation,{
      requestId:"11111111-1111-4111-8111-111111111111",
    }));
    expect(html).toContain("Open a separate vendor trust case");
    expect(html).toContain("The original payment stays");
    expect(html).toContain("declined");
    expect(html).toContain("Open vendor trust investigation");
    expect(html).toContain("not a payment approval");
    expect(html).not.toContain("Accept and execute");
    expect(html).not.toContain("Pay now");
  });
});
