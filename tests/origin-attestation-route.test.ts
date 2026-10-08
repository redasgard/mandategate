import { describe, expect, it } from "vitest";
import { GET, POST } from "../app/api/admin/invoice-artifacts/[id]/origin-attestations/route";
const artifact="11111111-1111-4111-8111-111111111111";

describe("authenticated origin HTTP route rejects unauthenticated or forged requests",()=>{
  const params={params:Promise.resolve({id:artifact})};
  it("refuses forged mutation origins before attempting any DB access",async()=>{
    const response=await POST(new Request("http://127.0.0.1:3000/api/admin/invoice-artifacts/"+artifact+"/origin-attestations",{
      method:"POST",headers:{"origin":"https://untrusted.test","content-type":"application/json"},
      body:"{}",
    }),params);
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("INVALID_ORIGIN");
  });
  it("requires a Better Auth session for read/write",async()=>{
    const get=await GET(new Request("http://127.0.0.1:3000/api/admin/invoice-artifacts/"+artifact+"/origin-attestations"),params);
    expect(get.status).toBe(401);
    const post=await POST(new Request("http://127.0.0.1:3000/api/admin/invoice-artifacts/"+artifact+"/origin-attestations",{
      method:"POST",headers:{
        origin:process.env.BETTER_AUTH_URL??"http://127.0.0.1:3000",
        "content-type":"application/json",
      },body:"{}",
    }),params);
    expect(post.status).toBe(401);
  });
});
