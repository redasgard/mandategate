import { describe, expect, it } from "vitest";
import {
  PAYMENT_VIEW_OPTIONS, matchesPaymentView, parsePaymentView,
  paymentExecutionLabel, type PaymentListRow,
} from "../src/ui/payments-view";

const allowed: PaymentListRow = {status:"ALLOWED",outcome:"ALLOW",executionStatus:null};
const review: PaymentListRow = {status:"ESCALATED",outcome:"ESCALATE",executionStatus:null};
const reviewed: PaymentListRow = {status:"APPROVED",outcome:"ESCALATE",executionStatus:null};
const denied: PaymentListRow = {status:"DENIED",outcome:"DENY",executionStatus:null};
const paid: PaymentListRow = {status:"APPROVED",outcome:"ESCALATE",executionStatus:"PAID"};
const unknown: PaymentListRow = {status:"ALLOWED",outcome:"ALLOW",executionStatus:"PAYMENT_UNKNOWN_MANUAL_RECONCILIATION"};

describe("PRD payment operations filters", () => {
  it("exposes exact payment sections without manual invoice intake", () => {
    expect(PAYMENT_VIEW_OPTIONS.map(v => v.value)).toEqual(["ALL","REVIEW","DENIED","ALLOWED","PAID"]);
    expect(parsePaymentView("INVALID")).toBe("ALL");
    expect(parsePaymentView(["PAID"])).toBe("ALL");
    expect(parsePaymentView("PAID")).toBe("PAID");
  });

  it("keeps reviewed escalations out of the pending human-review queue", () => {
    expect(matchesPaymentView(review,"REVIEW")).toBe(true);
    expect(matchesPaymentView(reviewed,"REVIEW")).toBe(false);
    expect(matchesPaymentView(denied,"REVIEW")).toBe(false);
  });

  it("does not confuse an ALLOW decision with actual PayPal settlement", () => {
    expect(matchesPaymentView(allowed,"ALLOWED")).toBe(true);
    expect(matchesPaymentView(allowed,"PAID")).toBe(false);
    expect(paymentExecutionLabel(allowed.executionStatus)).toBe("No payout recorded");
    expect(matchesPaymentView(paid,"PAID")).toBe(true);
    expect(paymentExecutionLabel(paid.executionStatus)).toBe("Paid · recorded");
  });

  it("shows unknown payout outcome without falsely marking it PAID", () => {
    expect(matchesPaymentView(unknown,"PAID")).toBe(false);
    expect(paymentExecutionLabel(unknown.executionStatus)).toBe("Unknown · investigate");
    expect(paymentExecutionLabel("PAYMENT_FAILED")).toBe("PAYMENT FAILED");
  });

  it("shows denied decisions only in the denied filter", () => {
    expect(matchesPaymentView(denied,"DENIED")).toBe(true);
    expect(matchesPaymentView(review,"DENIED")).toBe(false);
    expect(matchesPaymentView(reviewed,"ALL")).toBe(true);
  });
});
