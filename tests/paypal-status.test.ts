import { describe, expect, it } from "vitest";
import { canApplyRemoteStatusTransition, mapPayPalItemStatus } from "../src/payments/paypal/status";

describe("PayPal payout status mapping",()=>{
  it.each([
    ["SUCCESS","PAID"],["PENDING","EXECUTING"],["FAILED","PAYMENT_FAILED"],["BLOCKED","PAYMENT_BLOCKED"],
    ["ONHOLD","PAYMENT_HELD"],["UNCLAIMED","PAYMENT_UNCLAIMED"],["RETURNED","PAYMENT_RETURNED"],
    ["REFUNDED","PAYMENT_REFUNDED"],["REVERSED","PAYMENT_REVERSED"],["NEW_FUTURE_STATUS","PAYMENT_STATUS_UNKNOWN"],
  ])("maps %s",(raw,expected)=>expect(mapPayPalItemStatus(raw)).toBe(expected));

  it("does not regress terminal success to pending or unknown",()=>{
    expect(canApplyRemoteStatusTransition("PAID","EXECUTING")).toBe(false);
    expect(canApplyRemoteStatusTransition("PAID","PAYMENT_STATUS_UNKNOWN")).toBe(false);
  });

  it("allows explicit post-success reversal outcomes",()=>{
    expect(canApplyRemoteStatusTransition("PAID","PAYMENT_RETURNED")).toBe(true);
    expect(canApplyRemoteStatusTransition("PAID","PAYMENT_REFUNDED")).toBe(true);
    expect(canApplyRemoteStatusTransition("PAID","PAYMENT_REVERSED")).toBe(true);
  });

  it("keeps terminal failures terminal",()=>{
    expect(canApplyRemoteStatusTransition("PAYMENT_FAILED","PAID")).toBe(false);
    expect(canApplyRemoteStatusTransition("PAYMENT_BLOCKED","EXECUTING")).toBe(false);
  });
});
