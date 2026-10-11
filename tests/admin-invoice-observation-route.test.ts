import { describe,expect,it } from "vitest";
import { POST } from "../app/api/admin/invoice-artifacts/[id]/observe/route";

const params={params:Promise.resolve({id:"11111111-1111-4111-8111-111111111111"})};
const base="http://127.0.0.1:3000";
describe("signed-in advisory invoice observation endpoint",()=>{
  it("refuses a forged origin before authentication, file access or inference",async()=>{
    const result=await POST(new Request(base+"/api/admin/invoice-artifacts/x/observe",{
      method:"POST",headers:{origin:"https://evil.test"},
    }),params);
    expect(result.status).toBe(403);
    expect((await result.json()).error).toBe("INVALID_ORIGIN");
  });
  it("refuses unauthenticated inference even on an existing organization artifact",async()=>{
    const result=await POST(new Request(base+"/api/admin/invoice-artifacts/x/observe",{
      method:"POST",headers:{origin:process.env.BETTER_AUTH_URL??base},
    }),params);
    expect(result.status).toBe(401);
    expect((await result.json()).error).toBe("UNAUTHORIZED");
  });
});
