import { describe, expect, it } from "vitest";
import { POST } from "../app/api/admin/invoice-artifacts/route";

const url="http://127.0.0.1:3000/api/admin/invoice-artifacts";
const pdf=Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
const validOrigin=process.env.BETTER_AUTH_URL??"http://127.0.0.1:3000";

describe("admin invoice upload HTTP authority preflight",()=>{
  it("rejects cross-site upload before session, parsing or database writes",async()=>{
    const response=await POST(new Request(url,{
      method:"POST",
      headers:{origin:"https://forged-origin.example", "content-type":"application/pdf",
        "x-mandategate-organization-id":"org_demo"},
      body:pdf,
    }));
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("INVALID_ORIGIN");
  });
  it("rejects unsigned callers even when they include an existing org ID",async()=>{
    const response=await POST(new Request(url,{
      method:"POST",
      headers:{origin:validOrigin,"content-type":"application/pdf",
        "x-mandategate-organization-id":"org_demo"},
      body:pdf,
    }));
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("UNAUTHORIZED");
  });
});
