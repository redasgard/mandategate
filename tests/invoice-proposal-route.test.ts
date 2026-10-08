import { describe, expect, it } from "vitest";
import { POST } from "../app/api/admin/invoice-artifacts/[id]/proposals/route";
const artifact="11111111-1111-4111-8111-111111111111";
const url="http://127.0.0.1:3000/api/admin/invoice-artifacts/"+artifact+"/proposals";
const params={params:Promise.resolve({id:artifact})};

describe("provenance-bound proposal route refuses bypass",()=>{
  it("rejects forged Origin before any authority lookup",async()=>{
    const r=await POST(new Request(url,{
      method:"POST",headers:{origin:"https://foreign.test","content-type":"application/json"},
      body:"{}",
    }),params);
    expect(r.status).toBe(403);
    expect((await r.json()).error).toBe("INVALID_ORIGIN");
  });
  it("rejects unauthenticated reviewer proposals",async()=>{
    const r=await POST(new Request(url,{
      method:"POST",headers:{
        origin:process.env.BETTER_AUTH_URL??"http://127.0.0.1:3000",
        "content-type":"application/json",
      },body:"{}",
    }),params);
    expect(r.status).toBe(401);
    expect((await r.json()).error).toBe("UNAUTHORIZED");
  });
});
