import {describe,expect,it} from "vitest";
import {POST} from "../app/api/admin/payments/[id]/review/route";
const base=process.env.BETTER_AUTH_URL??"http://127.0.0.1:3000";
const params={params:Promise.resolve({id:"11111111-1111-4111-8111-111111111111"})};
describe("escalation review HTTP boundary",()=>{
  it("refuses cross-site mutation before parsing payload",async()=>{
    const response=await POST(new Request(base+"/api/admin/payments/123/review",{
      method:"POST",headers:{origin:"https://evil.test","content-type":"application/json"},
      body:"{}",
    }),params);
    expect(response.status).toBe(403);
  });
  it("refuses unsigned action",async()=>{
    const response=await POST(new Request(base+"/api/admin/payments/123/review",{
      method:"POST",headers:{origin:base,"content-type":"application/json"},
      body:"{}",
    }),params);
    expect(response.status).toBe(401);
  });
});
