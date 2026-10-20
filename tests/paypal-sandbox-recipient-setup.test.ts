import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {NextRequest} from "next/server";
import {auth} from "../src/auth/auth";
import {pool} from "../src/db/pool";
import {POST} from "../app/api/admin/paypal-sandbox-recipient/route";

vi.mock("../src/auth/auth",()=>({auth:{api:{getSession:vi.fn()}}}));
vi.mock("../src/db/pool",()=>({pool:{connect:vi.fn()}}));
const receiver="sandbox-payee@example.test";
const query=vi.fn(),release=vi.fn();
let member=true,recipient="ap@northstar.example",priorPayment=false;
function request(origin="http://127.0.0.1:3000",body?:string){
  return new NextRequest("http://127.0.0.1:3000/api/admin/paypal-sandbox-recipient",{
    method:"POST",headers:{origin},...(body?{body}:{})
  });
}
beforeEach(()=>{
  for(const [k,v] of Object.entries({
    RENDER_SERVICE_ID:"srv-db39vmm7bikc73c55nh0",
    MANDATEGATE_RUNTIME_MODE:"neon-sandbox",
    MANDATEGATE_SANDBOX_VERIFIED_INVOICE_DEMO:"1",
    MANDATEGATE_DISABLE_PAYMENTS:"0",
    PAYPAL_BASE_URL:"https://api-m.sandbox.paypal.com",
    DEMO_PAYPAL_RECEIVER_EMAIL:receiver,
    BETTER_AUTH_URL:"http://127.0.0.1:3000",
  }))vi.stubEnv(k,v);
  member=true;recipient="ap@northstar.example";priorPayment=false;
  vi.mocked(auth.api.getSession).mockResolvedValue({user:{id:"admin"}} as never);
  vi.mocked(pool.connect).mockResolvedValue({query,release} as never);
  query.mockImplementation(async sql=>{
    const text=String(sql);
    if(text.startsWith("select 1 from organization_admin_memberships"))
      return {rows:member?[{ok:1}]:[],rowCount:member?1:0};
    if(text.startsWith("select id from vendors"))
      return {rows:[{id:"vendor_northstar"}],rowCount:1};
    if(text.startsWith("select 1 from payment_requests"))
      return {rows:priorPayment?[{ok:1}]:[],rowCount:priorPayment?1:0};
    if(text.startsWith("select id,destination from vendor_destinations"))
      return {rows:[{id:"v_dest_existing",destination:recipient}],rowCount:1};
    return {rows:[],rowCount:1};
  });
});
afterEach(()=>{
  vi.unstubAllEnvs();vi.clearAllMocks();query.mockReset();release.mockReset();
});
describe("one-time PayPal Sandbox test recipient setup",()=>{
  it("updates placeholder only after authenticated admin action, without paying",async()=>{
    const res=await POST(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      status:"CONFIGURED",changed:true,recipient:receiver,paymentSubmitted:false,
    });
    const sql=query.mock.calls.map(c=>String(c[0]));
    expect(sql.some(q=>q.startsWith("update vendor_destinations"))).toBe(true);
    const insertion=query.mock.calls.find(c=>String(c[0]).startsWith("insert into vendor_destinations"));
    expect(insertion?.[1]?.[2]).toBe(receiver);
    expect(sql.at(-1)).toBe("commit");
  });
  it("repeated admin clicks are read-only when recipient already bound",async()=>{
    recipient=receiver;
    const res=await POST(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({changed:false,paymentSubmitted:false});
    expect(query.mock.calls.some(c=>String(c[0]).startsWith("update vendor_destinations"))).toBe(false);
  });
  it("never overwrites an unexpected trusted address",async()=>{
    recipient="different-trusted@example.test";
    const res=await POST(request());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("NON_PLACEHOLDER_TRUST_RECORD_PRESENT");
    expect(query.mock.calls.some(c=>String(c[0]).startsWith("update vendor_destinations"))).toBe(false);
  });
  it("never changes a recipient after the test invoice becomes a payment request",async()=>{
    priorPayment=true;
    const res=await POST(request());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("SANDBOX_INVOICE_ALREADY_PROCESSED");
    expect(query.mock.calls.some(c=>String(c[0]).includes("vendor_destinations"))).toBe(false);
  });
  it("rejects foreign origins, unauthorized members and disabled Sandbox host",async()=>{
    const origin=await POST(request("https://attacker.example"));
    expect(origin.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
    member=false;
    const forbidden=await POST(request());
    expect(forbidden.status).toBe(404);
    query.mockClear();
    vi.stubEnv("PAYPAL_BASE_URL","https://api-m.paypal.com");
    const host=await POST(request());
    expect(host.status).toBe(404);
    expect(query).not.toHaveBeenCalled();
  });
});
