import { describe, expect, it } from "vitest";
import { mapPayPalItemStatus } from "../src/payments/paypal/status";

describe("PayPal payout status mapping",()=>{
  it.each([
    ["SUCCESS","PAID"],["PENDING","EXECUTING"],["FAILED","PAYMENT_FAILED"],["BLOCKED","PAYMENT_BLOCKED"],
    ["ONHOLD","PAYMENT_HELD"],["UNCLAIMED","PAYMENT_UNCLAIMED"],["RETURNED","PAYMENT_RETURNED"],
    ["REFUNDED","PAYMENT_REFUNDED"],["REVERSED","PAYMENT_REVERSED"],["NEW_FUTURE_STATUS","PAYMENT_STATUS_UNKNOWN"],
  ])("maps %s",(raw,expected)=>expect(mapPayPalItemStatus(raw)).toBe(expected));
});
