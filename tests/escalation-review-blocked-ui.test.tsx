import {describe,expect,it,vi} from "vitest";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";

vi.mock("next/navigation",()=>({useRouter:()=>({refresh:()=>{}})}));
import {EscalationReview} from "../app/payments/[id]/escalation-review";

const props={
  requestId:"11111111-1111-4111-8111-111111111111",
  snapshotSha256:"a".repeat(64),
};

describe("trust-bound escalation review explains unavailable acceptance",()=>{
  it("shows a security blocker and a real vendor investigation link without offering acceptance",()=>{
    const html=renderToStaticMarkup(createElement(EscalationReview,{
      ...props,trustedDestinationCurrent:false,payoutsDisabled:false,
    }));
    expect(html).toContain("Acceptance blocked by vendor trust");
    expect(html).toContain("Recipient no longer matches the trusted vendor destination");
    expect(html).toContain('role="alert"');
    expect(html).toContain('href="/vendors#vendor-trust-investigations"');
    expect(html).toContain("This is a security block, not a missing form field");
    expect(html).toContain("Vendor re-verification does not");
    expect(html).toContain("Decline without payout");
    expect(html).not.toContain("Accept and execute PayPal Sandbox");
    expect(html).not.toContain('onClick="');
  });
  it("offers the existing confirmation-gated Sandbox action when trust is current",()=>{
    const html=renderToStaticMarkup(createElement(EscalationReview,{
      ...props,trustedDestinationCurrent:true,payoutsDisabled:false,
    }));
    expect(html).toContain("Review the flagged payment");
    expect(html).toContain("Accept and execute PayPal Sandbox");
    expect(html).not.toContain("Acceptance blocked by vendor trust");
    expect(html).not.toContain('href="/vendors#vendor-trust-investigations"');
  });
  it("never presents an executable accept button on payment-disabled services",()=>{
    const html=renderToStaticMarkup(createElement(EscalationReview,{
      ...props,trustedDestinationCurrent:true,payoutsDisabled:true,
    }));
    expect(html).toContain("Sandbox execution is disabled");
    expect(html).toContain("Decline without payout");
    expect(html).not.toContain("Accept and execute PayPal Sandbox");
  });
});
