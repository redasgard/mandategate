import { describe,expect,it } from "vitest";
import { GET } from "../app/api/admin/experiential-privacy/route";

describe("metadata-only GLM privacy route",()=>{
  it("rejects unauthenticated callers before any external metadata request",async()=>{
    const r=await GET(new Request("http://127.0.0.1:3000/api/admin/experiential-privacy"));
    expect(r.status).toBe(401);
    expect((await r.json()).error).toBe("UNAUTHORIZED");
  });
});
