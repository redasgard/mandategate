import {beforeEach,describe,expect,it,vi} from "vitest";

const mocks=vi.hoisted(()=>({
 session:vi.fn(),query:vi.fn(),inventory:vi.fn(),
}));
vi.mock("../src/auth/auth",()=>({auth:{api:{getSession:mocks.session}}}));
vi.mock("../src/db/pool",()=>({pool:{query:mocks.query}}));
vi.mock("../src/gate-h/readiness-inventory",()=>({
 readGateHInventory:mocks.inventory,
}));

import {GET} from "../app/api/admin/gate-h/readiness/route";

const endpoint="http://127.0.0.1:3000/api/admin/gate-h/readiness";
const request=(suffix="?organizationId=org_demo")=>new Request(endpoint+suffix);

beforeEach(()=>{
 vi.clearAllMocks();
 mocks.session.mockResolvedValue({user:{id:"admin_org_demo"}});
 mocks.query.mockResolvedValue({rows:[{one:1}]});
 mocks.inventory.mockResolvedValue({
  contract:"mandategate/gate-h-readonly-inventory/v1",
  organizationId:"org_demo",status:"BLOCKED",payoutAuthorized:false,
  modelOrPaymentRequestsMade:false,counts:{invoiceArtifacts:1},
  blockers:["T2_NO_VERIFIED_PDF_FACTS"],
 });
});

describe("GET /api/admin/gate-h/readiness (read-only unit boundary)",()=>{
 it("requires authentication before any database lookup",async()=>{
  mocks.session.mockResolvedValue(null);
  const response=await GET(request());
  expect(response.status).toBe(401);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(mocks.query).not.toHaveBeenCalled();
  expect(mocks.inventory).not.toHaveBeenCalled();
 });

 it.each([
  ["",400],
  ["?organizationId=org_demo&organizationId=org_other",400],
  ["?organizationId=../../org_demo",400],
  ["?organizationId=org_demo&unused=1",400],
 ])("rejects malformed or ambiguous organization selection: %s",async(suffix,status)=>{
  const response=await GET(request(suffix));
  expect(response.status).toBe(status);
  expect(mocks.query).not.toHaveBeenCalled();
  expect(mocks.inventory).not.toHaveBeenCalled();
 });

 it("does not reveal cross-tenant inventory to nonmembers",async()=>{
  mocks.query.mockResolvedValue({rows:[]});
  const response=await GET(request("?organizationId=org_other"));
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({error:"NOT_FOUND"});
  expect(mocks.query).toHaveBeenCalledWith(
   expect.stringContaining("role='ADMIN' and active=true"),
   ["admin_org_demo","org_other"],
  );
  expect(mocks.inventory).not.toHaveBeenCalled();
 });

 it("reads only the selected authorized organization",async()=>{
  const response=await GET(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(mocks.inventory).toHaveBeenCalledExactlyOnceWith("org_demo");
  const body=await response.json();
  expect(body.readiness).toMatchObject({
   organizationId:"org_demo",status:"BLOCKED",payoutAuthorized:false,
   modelOrPaymentRequestsMade:false,
  });
 });

 it("fails closed without leaking query errors",async()=>{
  mocks.query.mockRejectedValue(new Error("internal database detail"));
  const response=await GET(request());
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({error:"READINESS_UNAVAILABLE"});
  expect(mocks.inventory).not.toHaveBeenCalled();
 });
});
