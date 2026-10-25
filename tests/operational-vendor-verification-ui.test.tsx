import {describe,expect,it,vi} from "vitest";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";

vi.mock("next/navigation",()=>({useRouter:()=>({refresh:()=>{}})}));
import {VendorReverificationActions} from "../app/vendors/reverification-actions";

const item={
  id:"11111111-1111-4111-8111-111111111111",
  vendorName:"Example Supplier",
  status:"REVERIFICATION_REQUIRED",
  requestedDestination:"requested@example.invalid",
  trustedDestination:"known@example.test",
  originalOutcome:"DENY",
  originalPaymentStatus:"DENIED",
};

describe("vendor verification is an operational approval, not a demonstration",()=>{
  it("provides a genuine reviewed recipient-change action with evidence",()=>{
    const html=renderToStaticMarkup(createElement(VendorReverificationActions,{
      item,recipientApprovalAvailable:true,
    }));
    expect(html).toContain("Approve verified recipient");
    expect(html).toContain("Reject recipient change");
    expect(html).toContain("Evidence reference (ticket, contract, or verification record)");
    expect(html).toContain("Independently confirm destination changes");
    expect(html).toContain("Original payment: ");
    expect(html).not.toMatch(/\bsimulat(?:e|ion|ed|ing)\b/i);
    expect(html).not.toMatch(/\bsynthetic\b/i);
  });
  it("explains evidence requirements and exposes accessible validation hints",()=>{
    const html=renderToStaticMarkup(createElement(VendorReverificationActions,{
      item,recipientApprovalAvailable:true,
    }));
    expect(html).toContain("Add a decision rationale of at least 16 characters.");
    expect(html).toContain("8 to 128 characters");
    expect(html).toContain("aria-describedby=");
    expect(html).toContain("aria-invalid=");
    expect(html).toContain('role="status"');
    expect(html).toContain('disabled=""');
  });
  it("does not offer approval when the service cannot enforce its payment environment",()=>{
    const html=renderToStaticMarkup(createElement(VendorReverificationActions,{
      item,recipientApprovalAvailable:false,
    }));
    expect(html).toContain("Reject recipient change");
    expect(html).not.toContain("Approve verified recipient");
  });
  it("shows legacy updates without falsely labeling them approved evidence",()=>{
    const html=renderToStaticMarkup(createElement(VendorReverificationActions,{
      item:{...item,status:"SIMULATED_REVERIFIED"},
      recipientApprovalAvailable:true,
    }));
    expect(html).toContain("Previous recipient update");
    expect(html).not.toContain("Recipient approved");
  });
  it("renders the approved recipient and audit metadata while keeping old payment stopped",()=>{
    const html=renderToStaticMarkup(createElement(VendorReverificationActions,{
      item:{
        ...item,status:"VERIFIED",
        verificationMethod:"KNOWN_CONTACT_CALLBACK",
        resolutionActorId:"admin-id",evidenceDigest:"a".repeat(64),
      },
      recipientApprovalAvailable:true,
    }));
    expect(html).toContain("Recipient approved");
    expect(html).toContain("Callback to the vendor");
    expect(html).toContain("admin-id");
    expect(html).toContain("a".repeat(64));
    expect(html).toContain("payment remains DENIED");
  });
});
