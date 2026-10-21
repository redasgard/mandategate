import { describe, expect, it } from "vitest";
import {
  paymentDetailStatus, showManualSandboxControl, type PaymentDetailState,
} from "../src/ui/payment-detail-state";

const allowed: PaymentDetailState = {
  outcome:"ALLOW",requestStatus:"ALLOWED",
  executionStatus:null,payoutBatchId:null,payoutItemId:null,
};

describe("Payment detail is an operations view, not a blind send button", () => {
  it("does not equate ALLOW with a payment", () => {
    expect(paymentDetailStatus(allowed)).toBe("Allowed by policy · not yet paid");
    expect(showManualSandboxControl(allowed,true)).toBe(false);
  });
  it("blocks new manual presentation on uncertain or submitted executions", () => {
    for (const state of ["PAYMENT_UNKNOWN","PAYMENT_UNKNOWN_MANUAL_RECONCILIATION",
      "PAYMENT_STATUS_UNKNOWN","SUBMITTING","EXECUTING","PAID","PAYMENT_FAILED"]) {
      const snapshot={...allowed,executionStatus:state};
      expect(showManualSandboxControl(snapshot,false),state).toBe(false);
    }
    expect(paymentDetailStatus({...allowed,executionStatus:"PAYMENT_UNKNOWN"}))
      .toBe("Outcome unknown · reconciliation required");
    expect(showManualSandboxControl({...allowed,payoutBatchId:"BATCH-1"},false)).toBe(false);
  });
  it("preserves existing READY and approved-escalation manual test path", () => {
    expect(showManualSandboxControl({...allowed,executionStatus:"READY"},false)).toBe(true);
    expect(showManualSandboxControl(allowed,false)).toBe(true);
    const escalation={...allowed,outcome:"ESCALATE",requestStatus:"ESCALATED"};
    expect(showManualSandboxControl(escalation,false)).toBe(false);
    expect(showManualSandboxControl({...escalation,requestStatus:"APPROVED"},false)).toBe(true);
    expect(showManualSandboxControl({...allowed,outcome:"DENY"},false)).toBe(false);
  });
  it("labels recorded PAID conservatively", () => {
    expect(paymentDetailStatus({...allowed,executionStatus:"PAID"}))
      .toBe("Recorded as paid · verify provider evidence");
  });
});
