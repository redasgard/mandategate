import { describe,expect,it } from "vitest";
import {NextRequest} from "next/server";
import {POST} from "../app/api/admin/payments/[id]/execute/route";
const uri="http://127.0.0.1:3000/api/admin/payments/11111111-1111-4111-8111-111111111111";
const params={params:Promise.resolve({id:"11111111-1111-4111-8111-111111111111"})};
describe("payroll execution admin access",()=>{
  it("rejects cross-site POST before any payment logic",async()=>{
    const res=await POST(new NextRequest(uri,{method:"POST",headers:{origin:"https://attacker.test"}}),params);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("INVALID_ORIGIN");
  });
  it("rejects anonymous POST",async()=>{
    const res=await POST(new NextRequest(uri,{
      method:"POST",headers:{origin:process.env.BETTER_AUTH_URL??"http://127.0.0.1:3000"},
    }),params);
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("UNAUTHORIZED");
  });
});
