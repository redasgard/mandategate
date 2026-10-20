import {describe,it,expect} from "vitest";
import {
  sandboxFictionalIssuerChannelAllowed,isExactSandboxFictionalInvoice,
  sandboxOriginIsSynthetic,
} from "../src/demo/sandbox-fictional-origin";
const valid={
  RENDER_SERVICE_ID:"srv-db39vmm7bikc73c55nh0",
  MANDATEGATE_RUNTIME_MODE:"neon-sandbox",
  MANDATEGATE_SANDBOX_VERIFIED_INVOICE_DEMO:"1",
  MANDATEGATE_DISABLE_PAYMENTS:"0",
  PAYPAL_BASE_URL:"https://api-m.sandbox.paypal.com",
  DEMO_PAYPAL_RECEIVER_EMAIL:"sandbox-ci-recipient@example.test",
};
const exact={
  organizationId:"org_demo",vendorId:"vendor_northstar",
  invoiceNumber:"MG-SANDBOX-101-2026",amountCents:101,
  currency:"USD",recipient:valid.DEMO_PAYPAL_RECEIVER_EMAIL,
};
describe("fictional issuer is never general payment authority",()=>{
  it("permits only pinned exact Sandbox scenario",()=>{
    expect(sandboxFictionalIssuerChannelAllowed(exact.organizationId,exact.vendorId,valid)).toBe(true);
    expect(isExactSandboxFictionalInvoice(exact,valid)).toBe(true);
    expect(sandboxOriginIsSynthetic("SYNTHETIC_FIXTURE","SYNTHETIC_FIXTURE")).toBe(true);
  });
  it("rejects foreign organization, vendor, receiver, invoice, amount and currency",()=>{
    for(const patch of [
      {organizationId:"org_other"},{vendorId:"vendor_attacker"},
      {invoiceNumber:"DEMO-NORMAL-2026"},{amountCents:102},
      {currency:"EUR"},{recipient:"attacker@example.test"},
    ])expect(isExactSandboxFictionalInvoice({...exact,...patch},valid)).toBe(false);
  });
  it("does not activate on normal environments or production PayPal",()=>{
    for(const patch of [
      {RENDER_SERVICE_ID:"srv-other"},
      {RENDER_SERVICE_ID:undefined},
      {MANDATEGATE_RUNTIME_MODE:"legacy"},
      {MANDATEGATE_SANDBOX_VERIFIED_INVOICE_DEMO:"0"},
      {MANDATEGATE_DISABLE_PAYMENTS:"1"},
      {PAYPAL_BASE_URL:"https://api-m.paypal.com"},
      {DEMO_PAYPAL_RECEIVER_EMAIL:"ap@northstar.example"},
    ])expect(sandboxFictionalIssuerChannelAllowed("org_demo","vendor_northstar",
      {...valid,...patch})).toBe(false);
  });
});
