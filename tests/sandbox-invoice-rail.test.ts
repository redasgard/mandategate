import {describe,expect,it} from "vitest";
import {classifySandboxPaymentRail,type SandboxRailEnvelope}
  from "../src/demo/sandbox-invoice-rail";

const bindingId="2f9a4a41-281c-4c35-b75e-a11c1234abcd";
const receiver="synthetic-sandbox-recipient@example.test";
const env:Record<string,string>={
  MANDATEGATE_RUNTIME_MODE:"neon-sandbox",
  MANDATEGATE_DISABLE_PAYMENTS:"0",
  MANDATEGATE_SANDBOX_VERIFIED_INVOICE_DEMO:"1",
  PAYPAL_BASE_URL:"https://api-m.sandbox.paypal.com",
  DEMO_PAYPAL_RECEIVER_EMAIL:receiver,
};
const fixture:SandboxRailEnvelope={
  organizationId:"org_paypal_sandbox_demo",
  vendorId:"vendor_paypal_sandbox_demo",
  source:"sandbox_fixture",
  invoiceNumber:"MG-SANDBOX-101-2026",
  amountCents:101,currency:"USD",requestedDestination:receiver,
  currentTrustedDestination:receiver,authorityBindingId:null,
  idempotencyKey:"mandategate-sandbox-101-20261018-v1",
  status:"ALLOWED",outcome:"ALLOW",effectiveOutcome:"ALLOW",
};
const invoice:SandboxRailEnvelope={
  ...fixture,organizationId:"org_demo",vendorId:"vendor_northstar",
  source:"verified_invoice",authorityBindingId:bindingId,
  idempotencyKey:"invoice-verified-binding:"+bindingId,
};
describe("strict Sandbox-only invoice payout rail",()=>{
  it("preserves the historical independent 101-cent manual fixture",()=>{
    expect(classifySandboxPaymentRail(fixture,env)).toBeNull();
    expect(classifySandboxPaymentRail(fixture,{...env,MANDATEGATE_SANDBOX_VERIFIED_INVOICE_DEMO:"0"}))
      .toBe("FIXED_MANUAL_FIXTURE");
  });
  it("admits only the exact T4-bound fictional invoice envelope with opt-in",()=>{
    expect(classifySandboxPaymentRail(invoice,env)).toBe("EXACT_REVIEWED_INVOICE");
    expect(classifySandboxPaymentRail(invoice,{...env,MANDATEGATE_SANDBOX_VERIFIED_INVOICE_DEMO:"0"}))
      .toBeNull();
    expect(classifySandboxPaymentRail(invoice,{...env,MANDATEGATE_SANDBOX_VERIFIED_INVOICE_DEMO:undefined}))
      .toBeNull();
  });
  it("rejects prod host, payment disabled, or non-sandbox runtime",()=>{
    for(const patch of [
      {PAYPAL_BASE_URL:"https://api-m.paypal.com"},
      {PAYPAL_BASE_URL:"https://api-m.sandbox.paypal.com.evil.test"},
      {MANDATEGATE_DISABLE_PAYMENTS:"1"},
      {MANDATEGATE_RUNTIME_MODE:"legacy"},
      {MANDATEGATE_RUNTIME_MODE:"neon-preview"},
      {DEMO_PAYPAL_RECEIVER_EMAIL:"attacker@example.test"},
    ]) {
      expect(classifySandboxPaymentRail(invoice,{...env,...patch})).toBeNull();
      expect(classifySandboxPaymentRail(fixture,{...env,...patch})).toBeNull();
    }
  });
  it("rejects changed amount, recipient, invoice, vendor, decision, status, or authority",()=>{
    const patches:Partial<SandboxRailEnvelope>[]=[
      {amountCents:102},{amountCents:0},{currency:"EUR"},
      {requestedDestination:"attacker@example.test"},
      {currentTrustedDestination:"attacker@example.test"},
      {invoiceNumber:"DEMO-NORMAL-2026"},
      {organizationId:"org_paypal_sandbox_demo"},
      {vendorId:"vendor_other"},
      {source:"agent_api"},
      {status:"APPROVED"},
      {status:"DENIED"},
      {outcome:"ESCALATE"},
      {outcome:"DENY"},
      {effectiveOutcome:"APPROVED"},
      {authorityBindingId:null},
      {authorityBindingId:"not-a-uuid"},
      {idempotencyKey:"other"},
      {idempotencyKey:"invoice-verified-binding:"+ "a".repeat(36)},
    ];
    for(const patch of patches) {
      expect(classifySandboxPaymentRail({...invoice,...patch},env)).toBeNull();
    }
  });
  it("never promotes model or raw agent invoices or ambiguous standalone fixture",()=>{
    for(const source of ["demo_fixture","agent_api","glm_invoice","synthetic_erp_receipt"])
      expect(classifySandboxPaymentRail({...invoice,source},env)).toBeNull();
    expect(classifySandboxPaymentRail({...fixture,idempotencyKey:"different"},env))
      .toBeNull();
    expect(classifySandboxPaymentRail({...fixture,authorityBindingId:bindingId},env))
      .toBeNull();
  });
});
