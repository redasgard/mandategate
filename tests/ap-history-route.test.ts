import {describe,expect,it} from "vitest";
import {POST} from "../app/api/admin/ap-history/route";
const root=process.env.BETTER_AUTH_URL??"http://127.0.0.1:3000";
const url=root+"/api/admin/ap-history";
describe("historical upload auth and origin preflight",()=>{
  it("blocks cross-site request before parsing any CSV",async()=>{
    const r=await POST(new Request(url,{method:"POST",
      headers:{origin:"https://attacker.test","content-type":"text/csv"},
      body:"noncsv"}));
    expect(r.status).toBe(403);
  });
  it("blocks unauthenticated upload",async()=>{
    const r=await POST(new Request(url,{method:"POST",
      headers:{origin:root,"content-type":"text/csv",
        "x-mandategate-organization-id":"org_demo"},
      body:"noncsv"}));
    expect(r.status).toBe(401);
  });
});
