import {afterEach,describe,expect,it} from "vitest";
import {POST} from "../app/api/admin/invoice-artifacts/[id]/adversarial-glm/route";

const id="11111111-1111-4111-8111-111111111111";
const url="http://127.0.0.1:3000/api/admin/invoice-artifacts/"+id+"/adversarial-glm";
const params={params:Promise.resolve({id})};
const envBefore={
  PAYPAL_BASE_URL:process.env.PAYPAL_BASE_URL,
  GATE_H_LIVE_GLM_PROOF_ENABLED:process.env.GATE_H_LIVE_GLM_PROOF_ENABLED,
};
afterEach(()=>{
  for(const [key,value] of Object.entries(envBefore)){
    if(value===undefined)delete process.env[key];
    else process.env[key]=value;
  }
});

describe("explicit Sandbox-only live GLM adversarial observation endpoint",()=>{
  it("is absent by default even on the single development service",async()=>{
    delete process.env.GATE_H_LIVE_GLM_PROOF_ENABLED;
    process.env.PAYPAL_BASE_URL="https://api-m.sandbox.paypal.com";
    const r=await POST(new Request(url,{method:"POST",headers:{origin:"http://127.0.0.1:3000",
      "content-type":"application/json"},body:"{}"}),params);
    expect(r.status).toBe(404);
    expect((await r.json()).error).toBe("GATE_H_SYNTHETIC_PROOF_DISABLED");
  });
  it("rejects real PayPal host even with explicit GLM opt-in",async()=>{
    process.env.PAYPAL_BASE_URL="https://api-m.paypal.com";
    process.env.GATE_H_LIVE_GLM_PROOF_ENABLED="1";
    const r=await POST(new Request(url,{method:"POST",headers:{
      origin:"http://127.0.0.1:3000","content-type":"application/json",
    },body:"{}"}),params);
    expect(r.status).toBe(404);
    expect((await r.json()).error).toBe("GATE_H_SYNTHETIC_PROOF_DISABLED");
  });
  it("rejects forged origins before checking account/image permissions",async()=>{
    process.env.PAYPAL_BASE_URL="https://api-m.sandbox.paypal.com";
    process.env.GATE_H_LIVE_GLM_PROOF_ENABLED="1";
    const r=await POST(new Request(url,{method:"POST",headers:{origin:"https://not-this-app.example",
      "content-type":"application/json"},body:"{}"}),params);
    expect(r.status).toBe(403);
    expect((await r.json()).error).toBe("INVALID_ORIGIN");
  });
  it("rejects anonymous user before reading or transmitting any artifact",async()=>{
    process.env.PAYPAL_BASE_URL="https://api-m.sandbox.paypal.com";
    process.env.GATE_H_LIVE_GLM_PROOF_ENABLED="1";
    const r=await POST(new Request(url,{method:"POST",headers:{
      origin:process.env.BETTER_AUTH_URL??"http://127.0.0.1:3000",
      "content-type":"application/json",
    },body:"{}"}),params);
    expect(r.status).toBe(401);
    expect((await r.json()).error).toBe("UNAUTHORIZED");
  });
});
