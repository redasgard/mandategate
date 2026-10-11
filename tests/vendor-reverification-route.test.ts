import {describe,expect,it} from "vitest";
import {POST} from "../app/api/admin/vendor-reverification/[id]/route";
const base=process.env.BETTER_AUTH_URL??"http://127.0.0.1:3000";
const params={params:Promise.resolve({id:"11111111-1111-4111-8111-111111111111"})};
describe("vendor trust resolution is never an open payment API",()=>{
  it("rejects forged origin before session or database",async()=>{
    const r=await POST(new Request(base+"/api/admin/vendor-reverification/id",{
      method:"POST",headers:{origin:"https://attacker.test","content-type":"application/json"},
      body:"{}",
    }),params);
    expect(r.status).toBe(403);
  });
  it("rejects anonymous vendor trust changes",async()=>{
    const r=await POST(new Request(base+"/api/admin/vendor-reverification/id",{
      method:"POST",headers:{origin:base,"content-type":"application/json"},
      body:"{}",
    }),params);
    expect(r.status).toBe(401);
  });
});
