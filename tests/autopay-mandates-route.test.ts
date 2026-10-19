import {describe,expect,it} from "vitest";
import {POST as prepare} from "../app/api/admin/autopay-mandates/route";
import {POST as decide} from "../app/api/admin/autopay-mandates/[id]/route";

const root=process.env.BETTER_AUTH_URL??"http://127.0.0.1:3000";
const request=(p:string,origin:string,body:string)=>new Request(root+p,{
  method:"POST",headers:{origin,"content-type":"application/json"},body,
});
const grantId="11111111-1111-4111-8111-111111111111";
const params={params:Promise.resolve({id:grantId})};
const body=JSON.stringify({organizationId:"org_demo",vendorId:"vendor_northstar",
  maxAmountCents:100,validityDays:7});
const decision=JSON.stringify({action:"ACTIVATE",expectedDigest:"a".repeat(64),
  confirmation:"ENABLE AUTOPAY",explanation:"Confirming a synthetic test, not granting any mandate."});

describe("Mandate API origin/session authority boundary",()=>{
  it("rejects hostile site before session resolution",async()=>{
    expect((await prepare(request("/api/admin/autopay-mandates",
      "https://attacker.invalid",body))).status).toBe(403);
    expect((await decide(request("/api/admin/autopay-mandates/"+grantId,
      "https://attacker.invalid",decision),params)).status).toBe(403);
  });
  it("rejects anonymous grant preparation and confirmation",async()=>{
    expect((await prepare(request("/api/admin/autopay-mandates",root,body))).status).toBe(401);
    expect((await decide(request("/api/admin/autopay-mandates/"+grantId,root,decision),
      params)).status).toBe(401);
  });
});
