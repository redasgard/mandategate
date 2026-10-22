import {describe,expect,it} from "vitest";
import {POST} from "../app/api/admin/payments/[id]/vendor-trust-case/route";
const base=process.env.BETTER_AUTH_URL??"http://127.0.0.1:3000";
const params={params:Promise.resolve({id:"11111111-1111-4111-8111-111111111111"})};

describe("vendor case creation cannot bypass authenticated payment review",()=>{
  it("rejects forged origin before touching the database",async()=>{
    const response=await POST(new Request(base+"/api/admin/payments/id/vendor-trust-case",{
      method:"POST",headers:{origin:"https://attacker.test"},
    }),params);
    expect(response.status).toBe(403);
  });
  it("rejects anonymous attempts even without a body",async()=>{
    const response=await POST(new Request(base+"/api/admin/payments/id/vendor-trust-case",{
      method:"POST",headers:{origin:base},
    }),params);
    expect(response.status).toBe(401);
  });
});
