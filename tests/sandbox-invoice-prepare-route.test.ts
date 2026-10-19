import {describe,expect,it} from "vitest";
import {NextRequest} from "next/server";
import {POST} from "../app/api/admin/invoice-bindings/[id]/prepare-sandbox/route";

const id="11111111-1111-4111-8111-111111111111";
const uri="http://127.0.0.1:3000/api/admin/invoice-bindings/"+id+"/prepare-sandbox";
const params={params:Promise.resolve({id})};

describe("fictional Sandbox invoice preparation route",()=>{
  it("rejects forged external origin before attempting session or DB access",async()=>{
    const res=await POST(new NextRequest(uri,{
      method:"POST",headers:{origin:"https://attacker.example"},
    }),params);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("INVALID_ORIGIN");
  });
  it("rejects anonymous callers without preparing requests or reaching PayPal",async()=>{
    const res=await POST(new NextRequest(uri,{
      method:"POST",headers:{
        origin:process.env.BETTER_AUTH_URL??"http://127.0.0.1:3000",
      },
    }),params);
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("UNAUTHORIZED");
  });
});
