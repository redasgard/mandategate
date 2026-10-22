import { describe, expect, it } from "vitest";
import {
  PAYMENT_VIEW_OPTIONS, matchesPaymentView, parsePaymentView,
  paymentExecutionLabel, paymentSourceLabel, type PaymentListRow,
} from "../src/ui/payments-view";

const allowed: PaymentListRow = {status:"ALLOWED",outcome:"ALLOW",executionStatus:null};
const review: PaymentListRow = {status:"ESCALATED",outcome:"ESCALATE",executionStatus:null};
const reviewed: PaymentListRow = {status:"APPROVED",outcome:"ESCALATE",executionStatus:null};
const denied: PaymentListRow = {status:"DENIED",outcome:"DENY",executionStatus:null};
const paid: PaymentListRow = {status:"APPROVED",outcome:"ESCALATE",executionStatus:"PAID"};
const unknown: PaymentListRow = {status:"ALLOWED",outcome:"ALLOW",executionStatus:"PAYMENT_UNKNOWN_MANUAL_RECONCILIATION"};

describe("PRD payment operations filters", () => {
  it("exposes exact payment sections without manual invoice intake", () => {
    expect(PAYMENT_VIEW_OPTIONS.map(v => v.value)).toEqual(["ALL","REVIEW","DENIED","DECLINED","ALLOWED","PAID","UNKNOWN"]);
    expect(parsePaymentView("INVALID")).toBe("ALL");
    expect(parsePaymentView(["PAID"])).toBe("ALL");
    expect(parsePaymentView("PAID")).toBe("PAID");
    expect(parsePaymentView("DECLINED")).toBe("DECLINED");
    expect(parsePaymentView("UNKNOWN")).toBe("UNKNOWN");
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
    expect(matchesPaymentView(unknown,"UNKNOWN")).toBe(true);
    expect(matchesPaymentView({...unknown,executionStatus:"PAYMENT_STATUS_UNKNOWN"},"UNKNOWN")).toBe(true);
    expect(matchesPaymentView(paid,"UNKNOWN")).toBe(false);
    expect(paymentExecutionLabel(unknown.executionStatus)).toBe("Unknown · investigate");
    expect(paymentExecutionLabel("PAYMENT_FAILED")).toBe("PAYMENT FAILED");
    expect(paymentExecutionLabel("PAYMENT_STATUS_UNKNOWN")).toBe("Unknown · investigate");
  });

  it("distinguishes agent requests, reviewed invoices and test fixtures", () => {
    expect(paymentSourceLabel("agent_api")).toBe("Agent API");
    expect(paymentSourceLabel("verified_invoice")).toBe("Reviewed invoice");
    expect(paymentSourceLabel("sandbox_fixture")).toBe("PayPal test request");
    expect(paymentSourceLabel("demo_fixture")).toBe("Sample request");
    expect(paymentSourceLabel("future_source")).toBe("Other source");
  });

  it("shows denied decisions only in the denied filter", () => {
    expect(matchesPaymentView(denied,"DENIED")).toBe(true);
    expect(matchesPaymentView(review,"DENIED")).toBe(false);
    expect(matchesPaymentView(reviewed,"ALL")).toBe(true);
    expect(matchesPaymentView({...reviewed,status:"DECLINED"},"DECLINED")).toBe(true);
    expect(matchesPaymentView(review,"DECLINED")).toBe(false);
  });
});
