import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {pool} from "../src/db/pool";
import {
  AuthorityBindingRejected,inspectCurrentAuthorityBinding,
} from "../src/authority/binding-guard";
import {PostgresExecutionStore} from "../src/payments/executor/postgres-store";

vi.mock("../src/db/pool",()=>({pool:{
  query:vi.fn(),connect:vi.fn(),
}}));
vi.mock("../src/authority/binding-guard",()=>({
  AuthorityBindingRejected:class AuthorityBindingRejected extends Error {
    constructor(public code:string){super(code);}
  },
  inspectCurrentAuthorityBinding:vi.fn(),
}));

const receiver="sandbox-ci-owner@example.test";
const paymentId="4ecbf83b-517c-4f12-9adc-5b3946495871";
const logicalId="2c0e137c-95e0-4e70-aa2c-6f28a5bb10d8";
const bindingId="4f5684b6-6165-498c-9bd3-329598223b59";
const base={
  request_id:paymentId,logical_payment_id:logicalId,
  organization_id:"org_demo",vendor_id:"vendor_northstar",
  source:"verified_invoice",status:"ALLOWED",outcome:"ALLOW",
  effective_outcome:"ALLOW",invoice_number:"MG-SANDBOX-101-2026",
  amount_cents:101,currency:"USD",
  requested_destination:receiver,current_trusted_destination:receiver,
  authority_binding_id:bindingId,
  idempotency_key:"invoice-verified-binding:"+bindingId,
};
const receipt={
  bindingId,organizationId:"org_demo",vendorId:"vendor_northstar",
  linkedRequestId:paymentId,amountCents:101,currency:"USD",
  invoiceNumber:"MG-SANDBOX-101-2026",recipient:receiver,
};
let state:{[key:string]:unknown}={...base};
const query=vi.mocked(pool.query),connect=vi.mocked(pool.connect);
const checked=vi.mocked(inspectCurrentAuthorityBinding);
beforeEach(()=>{
  state={...base};
  vi.stubEnv("MANDATEGATE_RUNTIME_MODE","neon-sandbox");
  vi.stubEnv("MANDATEGATE_DISABLE_PAYMENTS","0");
  vi.stubEnv("MANDATEGATE_SANDBOX_VERIFIED_INVOICE_DEMO","1");
  vi.stubEnv("PAYPAL_BASE_URL","https://api-m.sandbox.paypal.com");
  vi.stubEnv("DEMO_PAYPAL_RECEIVER_EMAIL",receiver);
  query.mockImplementation(async()=>({rows:[state],rowCount:1} as never));
  connect.mockResolvedValue({
    query:vi.fn().mockResolvedValue({rows:[],rowCount:0}),
    release:vi.fn(),
  } as never);
  checked.mockResolvedValue({...receipt} as never);
});
afterEach(()=>{
  vi.clearAllMocks();vi.unstubAllEnvs();
});
describe("Sandbox-only invoice executor last-read authority",()=>{
  it("permits exactly the bound reviewed invoice, not an agent suggestion",async()=>{
    const result=await new PostgresExecutionStore().getAuthoritativePayment(paymentId);
    expect(result).toMatchObject({
      requestId:paymentId,logicalPaymentId:logicalId,amountCents:101,
      requestedDestination:receiver,currentTrustedDestination:receiver,
      decisionOutcome:"ALLOW",invoiceNumber:"MG-SANDBOX-101-2026",
    });
    expect(checked).toHaveBeenCalledOnce();
    expect(checked.mock.calls[0][2]).toBe("CONSUMED");
  });
  it("blocks changes before source-binding trust checks",async()=>{
    for(const patch of [
      {invoice_number:"DEMO-NORMAL-2026"},
      {organization_id:"org_attacker"},
      {vendor_id:"other_vendor"},
      {amount_cents:102},{currency:"EUR"},
      {requested_destination:"evil@example.test"},
      {current_trusted_destination:"evil@example.test"},
      {status:"DENIED"},{source:"agent_api"},
      {idempotency_key:"wrong"},{authority_binding_id:null},
    ]){
      state={...base,...patch};
      expect(await new PostgresExecutionStore().getAuthoritativePayment(paymentId)).toBeNull();
    }
    expect(checked).not.toHaveBeenCalled();
  });
  it("rejects payment if Sandbox mode disabled or PayPal host changed",async()=>{
    for(const [key,value] of [
      ["MANDATEGATE_SANDBOX_VERIFIED_INVOICE_DEMO","0"],
      ["PAYPAL_BASE_URL","https://api-m.paypal.com"],
      ["MANDATEGATE_DISABLE_PAYMENTS","1"],
    ]){
      vi.stubEnv(key,value);
      expect(await new PostgresExecutionStore().getAuthoritativePayment(paymentId)).toBeNull();
      vi.stubEnv(key,key==="PAYPAL_BASE_URL"?"https://api-m.sandbox.paypal.com":
        key==="MANDATEGATE_DISABLE_PAYMENTS"?"0":"1");
    }
    expect(checked).not.toHaveBeenCalled();
  });
  it("rejects a consumed source binding that no longer matches original request",async()=>{
    checked.mockResolvedValueOnce({...receipt,amountCents:999} as never);
    expect(await new PostgresExecutionStore().getAuthoritativePayment(paymentId)).toBeNull();
    checked.mockRejectedValueOnce(new AuthorityBindingRejected("ISSUER_ORIGIN_NOT_TRUSTED"));
    expect(await new PostgresExecutionStore().getAuthoritativePayment(paymentId)).toBeNull();
  });
});
