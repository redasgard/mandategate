import { describe, expect, it } from "vitest";
import { evaluatePayment } from "../src/policy/decision";

const base = {
  amountCents: 120_000,
  currency: "USD",
  requestedDestination: "ap@northstar.example",
  trustedDestination: "ap@northstar.example",
  vendorNormalMaxAmountCents: 250_000,
  policyAutoPayMaxAmountCents: 300_000,
};

describe("deterministic authority kernel", () => {
  it("allows a request inside trusted vendor and policy bounds", () => {
    expect(evaluatePayment(base).outcome).toBe("ALLOW");
  });

  it("escalates an amount outside the vendor baseline", () => {
    const decision = evaluatePayment({ ...base, amountCents: 280_000 });
    expect(decision.outcome).toBe("ESCALATE");
    expect(decision.reasonCodes).toContain("AMOUNT_OUTSIDE_VENDOR_BASELINE");
  });

  it("denies a destination mismatch before considering amount", () => {
    const decision = evaluatePayment({
      ...base,
      requestedDestination: "changed-destination@example.net",
    });
    expect(decision.outcome).toBe("DENY");
    expect(decision.reasonCodes).toEqual(["DESTINATION_MISMATCH"]);
  });
});
