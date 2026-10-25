import {beforeEach,describe,expect,it,vi} from "vitest";

const mocks=vi.hoisted(()=>({session:vi.fn(),query:vi.fn()}));
vi.mock("../src/auth/auth",()=>({auth:{api:{getSession:mocks.session}}}));
vi.mock("../src/db/pool",()=>({pool:{query:mocks.query}}));

import {GET} from "../app/api/admin/gate-h/readiness/route";

const endpoint="http://127.0.0.1:3000/api/admin/gate-h/readiness";
const request=(suffix="?organizationId=org_demo")=>new Request(endpoint+suffix);
const sourceInventoryRow={
 invoice_artifacts:2,independent_pdf_pages:1,pdf_artifacts_with_pages:1,
 verified_pdf_claims:0,active_enrolled_channels:0,
 eligible_preexisting_channel_invoice_pairs:0,
 current_human_origin_attestations:0,authorized_bindings:0,
 consented_synthetic_glm_observations:1,invoice_payment_requests:0,
 all_payment_executions:0,
};

beforeEach(()=>{
 vi.clearAllMocks();
 mocks.session.mockResolvedValue({user:{id:"admin_org_demo"}});
 mocks.query.mockResolvedValue({rows:[sourceInventoryRow]});
});

describe("GET /api/admin/gate-h/readiness read-only boundary",()=>{
 it("requires authentication before reading any tenant inventory",async()=>{
  mocks.session.mockResolvedValue(null);
  const response=await GET(request());
  expect(response.status).toBe(401);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(mocks.query).not.toHaveBeenCalled();
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
 });

 it("does not expose inventory to unaffiliated or inactive admins",async()=>{
  mocks.query.mockResolvedValue({rows:[]});
  const response=await GET(request("?organizationId=org_other"));
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({error:"NOT_FOUND"});
  expect(mocks.query).toHaveBeenCalledWith(
   expect.stringContaining("m.role='ADMIN' and m.active=true"),
   ["org_other","admin_org_demo"],
  );
 });

 it("uses one SQL statement to bind admin membership and inventory",async()=>{
  const response=await GET(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(mocks.query).toHaveBeenCalledTimes(1);
  const [sql,args]=mocks.query.mock.calls[0];
  expect(sql).toContain("from (");
  expect(sql).toContain("where m.organization_id=$1 and m.user_id=$2");
  expect(args).toEqual(["org_demo","admin_org_demo"]);
  const body=await response.json();
  expect(body.readiness).toMatchObject({
   contract:"mandategate/gate-h-readonly-inventory/v1",
   organizationId:"org_demo",status:"BLOCKED",payoutAuthorized:false,
   modelOrPaymentRequestsMade:false,
   counts:{invoiceArtifacts:2,independentPdfPages:1,verifiedPdfClaims:0},
  });
  expect(body.readiness.blockers).toContain("T2_NO_VERIFIED_PDF_FACTS");
 });

 it("fails closed without revealing database details",async()=>{
  mocks.query.mockRejectedValue(new Error("sensitive database detail"));
  const response=await GET(request());
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({error:"READINESS_UNAVAILABLE"});
 });
});
