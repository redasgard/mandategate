import {describe,expect,it} from "vitest";
import {
  assertSandboxInvoiceReviewedBinding,
  SandboxInvoiceDemoError,validateSandboxInvoiceDemoEnvironment,
  type SandboxInvoiceReviewedBinding,
} from "../src/demo/sandbox-invoice-proof";

const id="2f9a4a41-281c-4c35-b75e-a11c1234abcd";
const a="a".repeat(64),t="b".repeat(64);
const receiver="demo-paypal-recipient@example.test";
const base:NodeJS.ProcessEnv={
  NODE_ENV:"test",
  MANDATEGATE_RUNTIME_MODE:"neon-sandbox",
  MANDATEGATE_DISABLE_PAYMENTS:"0",
  MANDATEGATE_SANDBOX_VERIFIED_INVOICE_DEMO:"1",
  PAYPAL_BASE_URL:"https://api-m.sandbox.paypal.com",
  DEMO_PAYPAL_RECEIVER_EMAIL:receiver,
  SANDBOX_INVOICE_BINDING_ID:id,
  SANDBOX_INVOICE_ARTIFACT_SHA256:a,
  SANDBOX_INVOICE_TUPLE_SHA256:t,
};
const b:SandboxInvoiceReviewedBinding={
  organizationId:"org_demo",vendorId:"vendor_northstar",
  invoiceNumber:"MG-SANDBOX-101-2026",
  amountCents:101,currency:"USD",receiver,
  artifactSha256:a,tupleSha256:t,
  authorizationStatus:"AUTHORIZED",sourceKind:"PDF_TEXT",verificationStatus:"VERIFIED",
  originMethod:"ADMIN_OUT_OF_BAND",originChannelKind:"KNOWN_CALLBACK",
  channelPredatesArtifact:true,approvalActor:"demo-admin",
  linkedPaymentRequestId:null,
};
describe("bounded fictional invoice to PayPal Sandbox validation",()=>{
  it("preflight and read-only verification never require outbound payment consent",()=>{
    expect(validateSandboxInvoiceDemoEnvironment(base,"preflight")).toMatchObject({
      SANDBOX_INVOICE_BINDING_ID:id,
    });
    expect(validateSandboxInvoiceDemoEnvironment(base,"verify")).toBeTruthy();
    expect(()=>validateSandboxInvoiceDemoEnvironment(base,"submit"))
      .toThrow("SANDBOX_INVOICE_EXPLICIT_GRANT_REQUIRED");
  });
  it("submission requires a separate explicit grant and Sandbox credentials",()=>{
    const grant={...base,SANDBOX_INVOICE_SUBMIT_GRANT:"SUBMIT_ONE_101_CENT_SANDBOX_INVOICE"};
    expect(()=>validateSandboxInvoiceDemoEnvironment(grant,"submit"))
      .toThrow("SANDBOX_INVOICE_PAYPAL_CREDENTIALS_REQUIRED");
    expect(validateSandboxInvoiceDemoEnvironment({
      ...grant,PAYPAL_CLIENT_ID:"sandbox-client",PAYPAL_CLIENT_SECRET:"sandbox-secret",
      PAYPAL_WEBHOOK_ID:"sandbox-webhook-id",
    },"submit")).toBeTruthy();
  });
  it("rejects non-Sandbox modes, hosts, bad hashes and absent opt-in",()=>{
    for(const change of [
      {PAYPAL_BASE_URL:"https://api-m.paypal.com"},
      {MANDATEGATE_RUNTIME_MODE:"legacy"},
      {MANDATEGATE_DISABLE_PAYMENTS:"1"},
      {MANDATEGATE_SANDBOX_VERIFIED_INVOICE_DEMO:"0"},
      {SANDBOX_INVOICE_BINDING_ID:"not-uuid"},
      {SANDBOX_INVOICE_ARTIFACT_SHA256:"not-sha"},
    ])expect(()=>validateSandboxInvoiceDemoEnvironment({...base,...change},"preflight"))
      .toThrow(SandboxInvoiceDemoError);
  });
  it("accepts only the exact immutable one-dollar-and-one-cent approved PDF",()=>{
    expect(assertSandboxInvoiceReviewedBinding(b,{
      receiver,artifactSha256:a,tupleSha256:t,
    })).toEqual({fixtureIssuerSimulated:true,paymentAuthorized:false});
    const mutations:Partial<SandboxInvoiceReviewedBinding>[]=[
      {organizationId:"org_other"},{vendorId:"other"},
      {invoiceNumber:"DEMO-NORMAL-2026"},{amountCents:102},{currency:"EUR"},
      {receiver:"attacker@example.test"},{artifactSha256:"0".repeat(64)},
      {tupleSha256:"0".repeat(64)},{authorizationStatus:"PROPOSED"},
      {authorizationStatus:"CONSUMED"},
      {sourceKind:"GLM_IMAGE"},{verificationStatus:"UNVERIFIED"},
      {originMethod:"SYNTHETIC_FIXTURE"},
      {originChannelKind:"SYNTHETIC_FIXTURE"},
      {channelPredatesArtifact:false},{approvalActor:null},
      {linkedPaymentRequestId:"existing"},
    ];
    for(const changed of mutations){
      expect(()=>assertSandboxInvoiceReviewedBinding({...b,...changed},{
        receiver,artifactSha256:a,tupleSha256:t,
      })).toThrow(SandboxInvoiceDemoError);
    }
  });
});
