import {describe,expect,it} from "vitest";
import {POST as prepare} from "../app/api/admin/policy-proposals/route";
import {POST as decide} from "../app/api/admin/policy-proposals/[id]/route";
import {readSmallJson} from "../src/auth/json-small-body";
import {POST as disablePolicy} from "../app/api/admin/policies/[id]/disable/route";

const base=process.env.BETTER_AUTH_URL??"http://127.0.0.1:3000";
const request=(path:string,origin:string,body:string)=>new Request(base+path,{
  method:"POST",headers:{origin,"content-type":"application/json"},body,
});
const params={params:Promise.resolve({id:"11111111-1111-4111-8111-111111111111"})};

describe("policy proposal HTTP authority boundary",()=>{
  it("blocks forged cross-site origin before inspecting credentials or payment inputs",async()=>{
    const body=JSON.stringify({organizationId:"org_demo",origin:"ADMIN_MANUAL",proposedLimitCents:1});
    expect((await prepare(request("/api/admin/policy-proposals","https://attacker.invalid",body))).status).toBe(403);
    expect((await decide(request("/api/admin/policy-proposals/111","https://attacker.invalid",body),params)).status).toBe(403);
  });
  it("blocks anonymous policy proposal creation and confirmation",async()=>{
    const body=JSON.stringify({organizationId:"org_demo",origin:"ADMIN_MANUAL",proposedLimitCents:1});
    expect((await prepare(request("/api/admin/policy-proposals",base,body))).status).toBe(401);
    expect((await decide(request("/api/admin/policy-proposals/111",base,"{}"),params)).status).toBe(401);
  });
  it("bounds JSON payload before accepting consequential action data",async()=>{
    const bad=await readSmallJson(request("/ignored",base,"X".repeat(4100)));
    expect(bad).toMatchObject({ok:false,error:"POLICY_BODY_TOO_LARGE",status:413});
    const missing=await readSmallJson(new Request(base+"/ignored",{
      method:"POST",headers:{origin:base,"content-type":"text/plain"},body:"{}",
    }));
    expect(missing).toMatchObject({ok:false,error:"JSON_REQUIRED",status:415});
    const good=await readSmallJson(request("/ignored",base,JSON.stringify({ok:true})));
    expect(good).toMatchObject({ok:true,value:{ok:true}});
  });
  it("requires trusted origin and authentication before policy shutdown",async()=>{
    const body=JSON.stringify({
      expectedDigest:"b".repeat(64),
      explanation:"Synthetic emergency shutdown test, no real policy mutation.",
      confirmation:"DISABLE",
    });
    expect((await disablePolicy(request("/api/admin/policies/policy_demo_default/disable",
      "https://hostile.invalid",body),
      {params:Promise.resolve({id:"policy_demo_default"})})).status).toBe(403);
    expect((await disablePolicy(request("/api/admin/policies/policy_demo_default/disable",
      base,body),
      {params:Promise.resolve({id:"policy_demo_default"})})).status).toBe(401);
  });

});
