import { describe, it, expect, vi, afterEach } from "vitest";
import {
  sandboxPayoutEnabled, prepareSandboxPayout, SANDBOX_ORG_ID,
  SANDBOX_AMOUNT_CENTS, SANDBOX_INVOICE,
} from "../src/demo/sandbox-payout";

vi.mock("../src/db/pool", () => ({pool:{query:vi.fn(),connect:vi.fn()}}));
vi.mock("../src/payments/submit", () => ({submitCanonicalPaymentRequest:vi.fn()}));

const base = {
  MANDATEGATE_RUNTIME_MODE: "neon-sandbox",
  MANDATEGATE_DISABLE_PAYMENTS: "0",
  PAYPAL_BASE_URL: "https://api-m.sandbox.paypal.com",
  PAYPAL_CLIENT_ID: "sandbox-client-ID",
  PAYPAL_CLIENT_SECRET: "sandbox-client-secret",
  DEMO_PAYPAL_RECEIVER_EMAIL: "approved-test-recipient@example.test",
};
afterEach(() => vi.unstubAllEnvs());

describe("fixed-amount, separate PayPal Sandbox preparation", () => {
  it("has fixed, distinct synthetic identity and exact small amount", () => {
    expect(SANDBOX_ORG_ID).not.toBe("org_demo");
    expect(SANDBOX_AMOUNT_CENTS).toBe(101);
    expect(SANDBOX_INVOICE).toBe("MG-SANDBOX-101-2026");
    expect(sandboxPayoutEnabled(base)).toBe(true);
  });
  it("does not bootstrap a separate payment while invoice mode is active",async()=>{
    vi.stubEnv("MANDATEGATE_SANDBOX_VERIFIED_INVOICE_DEMO","1");
    await expect(prepareSandboxPayout("admin")).rejects
      .toThrow("STANDALONE_SANDBOX_FIXTURE_DISABLED_IN_INVOICE_MODE");
  });
  it("refuses production PayPal, a missing receiver or disabled payments", () => {
    for (const patch of [
      {PAYPAL_BASE_URL:"https://api-m.paypal.com"},
      {DEMO_PAYPAL_RECEIVER_EMAIL:""},
      {PAYPAL_CLIENT_SECRET:""},
      {MANDATEGATE_DISABLE_PAYMENTS:"1"},
      {MANDATEGATE_RUNTIME_MODE:"neon-preview"},
    ]) {
      expect(sandboxPayoutEnabled({...base,...patch})).toBe(false);
    }
  });
});