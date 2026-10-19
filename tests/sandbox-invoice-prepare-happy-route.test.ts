import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {NextRequest} from "next/server";
import {auth} from "../src/auth/auth";
import {pool} from "../src/db/pool";
import {sandboxPayoutEnabled} from "../src/demo/sandbox-payout";
import {consumeApprovedInvoiceBinding} from "../src/authority/consume-invoice-binding";
import {POST} from "../app/api/admin/invoice-bindings/[id]/prepare-sandbox/route";

vi.mock("../src/auth/auth",()=>({auth:{api:{getSession:vi.fn()}}}));
vi.mock("../src/db/pool",()=>({pool:{query:vi.fn()}}));
vi.mock("../src/demo/sandbox-payout",()=>({sandboxPayoutEnabled:vi.fn()}));
vi.mock("../src/authority/consume-invoice-binding",()=>({
  consumeApprovedInvoiceBinding:vi.fn(),
}));
const id="4f5684b6-6165-498c-9bd3-329598223b59";
const url="http://127.0.0.1:3000/api/admin/invoice-bindings/"+id+"/prepare-sandbox";
const receiver="approved-sandbox@example.test";
const binding={
  id,organization_id:"org_demo",vendor_id:"vendor_northstar",
  invoice_number:"MG-SANDBOX-101-2026",amount_cents:101,
  currency:"USD",authorization_status:"AUTHORIZED",
  linked_payment_request_id:null,artifact_sha256:"a".repeat(64),
  tuple_sha256:"b".repeat(64),approval_actor:"user-demo",
  receiver,source_kind:"PDF_TEXT",verification_status:"VERIFIED",
  origin_method:"ADMIN_OUT_OF_BAND",origin_channel_kind:"KNOWN_CALLBACK",
  channel_predates_artifact:true,
};
const session=vi.mocked(auth.api.getSession);
const queries=vi.mocked(pool.query);
const enabled=vi.mocked(sandboxPayoutEnabled);
const consume=vi.mocked(consumeApprovedInvoiceBinding);
const request=()=>new NextRequest(url,{
  method:"POST",headers:{origin:process.env.BETTER_AUTH_URL??"http://127.0.0.1:3000"},
});
beforeEach(()=>{
  vi.stubEnv("MANDATEGATE_SANDBOX_VERIFIED_INVOICE_DEMO","1");
  vi.stubEnv("DEMO_PAYPAL_RECEIVER_EMAIL",receiver);
  session.mockResolvedValue({user:{id:"user-demo"}} as never);
  enabled.mockReturnValue(true);
  queries.mockImplementation(async (sql)=>{
    const text=String(sql);
    return ({rows:text.includes("select 1 from organization_admin_memberships")
      ? [{present:1}]:[{...binding}],rowCount:1}) as never;
  });
  consume.mockResolvedValue({
    requestId:"4ecbf83b-517c-4f12-9adc-5b3946495871",
    decision:{outcome:"ALLOW"},replayed:false,paymentExecuted:false,
  } as never);
});
afterEach(()=>{vi.clearAllMocks();vi.unstubAllEnvs();});
describe("sandbox invoice authenticated one-click prepare",()=>{
  it("prepares a canonical reviewed source without any PayPal call",async()=>{
    const response=await POST(request(),{params:Promise.resolve({id})});
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      state:"PREPARED_NOT_SUBMITTED",
      fictionalIssuerSimulation:true,paymentSubmittedByThisAction:false,
    });
    expect(consume).toHaveBeenCalledExactlyOnceWith(id);
  });
  it("fails closed if already consumed or no longer approved",async()=>{
    consume.mockResolvedValueOnce({
      requestId:"4ecbf83b-517c-4f12-9adc-5b3946495871",
      decision:{outcome:"ALLOW"},replayed:true,paymentExecuted:false,
    } as never);
    const replay=await POST(request(),{params:Promise.resolve({id})});
    expect(replay.status).toBe(409);
    expect((await replay.json()).error).toBe("SANDBOX_INVOICE_ALREADY_CONSUMED");
    expect(consume).toHaveBeenCalledOnce();
  });
  it("rejects disabled feature before any DB mutation",async()=>{
    vi.stubEnv("MANDATEGATE_SANDBOX_VERIFIED_INVOICE_DEMO","0");
    const response=await POST(request(),{params:Promise.resolve({id})});
    expect(response.status).toBe(503);
    expect(consume).not.toHaveBeenCalled();
  });
  it("rejects foreign or revoked reviewer membership",async()=>{
    queries.mockResolvedValueOnce({rows:[],rowCount:0} as never);
    const response=await POST(request(),{params:Promise.resolve({id})});
    expect(response.status).toBe(404);
    expect(consume).not.toHaveBeenCalled();
  });
});
