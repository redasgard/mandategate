import { describe,expect,it } from "vitest";
import { POST } from "../app/api/admin/vendor-origin-channels/route";
import {
  originEnrollmentDigest,validateEnrollmentReference,
} from "../src/authority/origin-channel-enrollment";

const url="http://127.0.0.1:3000/api/admin/vendor-origin-channels";
const body=JSON.stringify({
  organizationId:"org_demo",vendorId:"vendor_northstar",
  kind:"TRUSTED_PORTAL",independentEvidenceReference:"portal-event:test-fixture-0123456789",
  confirmedOutsideInvoice:true,
});
describe("issuer enrollment requires a genuine signed-in admin action",()=>{
  it("rejects cross-site mutations",async()=>{
    const response=await POST(new Request(url,{
      method:"POST",headers:{origin:"https://malicious.test","content-type":"application/json"},
      body,
    }));
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("INVALID_ORIGIN");
  });
  it("rejects anonymous enrollment",async()=>{
    const response=await POST(new Request(url,{
      method:"POST",headers:{origin:process.env.BETTER_AUTH_URL??"http://127.0.0.1:3000",
        "content-type":"application/json"},
      body,
    }));
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("UNAUTHORIZED");
  });
  it("distinguishes fictional markers from genuine issuer claims",()=>{
    expect(()=>validateEnrollmentReference("SYNTHETIC_FIXTURE","synthetic-fixture:mandategate-demo-only"))
      .not.toThrow();
    expect(()=>validateEnrollmentReference("TRUSTED_PORTAL","synthetic-fixture:mandategate-demo-only"))
      .toThrow("INDEPENDENT_CHANNEL_EVIDENCE_REFERENCE_REQUIRED");
    expect(()=>validateEnrollmentReference("TRUSTED_PORTAL","callback-record:not-a-portal"))
      .toThrow("INDEPENDENT_CHANNEL_EVIDENCE_REFERENCE_REQUIRED");
  });
  it("binds the evidence digest to the human actor, vendor and organization",()=>{
    const props={
      organizationId:"org_demo",vendorId:"vendor_northstar",
      kind:"TRUSTED_PORTAL" as const,actorUserId:"test-admin",
      independentEvidenceReference:"portal-event:independent-test-12345678",
    };
    const expected=originEnrollmentDigest(props);
    expect(expected).toMatch(/^[a-f0-9]{64}$/);
    expect(originEnrollmentDigest(props)).toBe(expected);
    expect(originEnrollmentDigest({...props,vendorId:"other-vendor"})).not.toBe(expected);
    expect(originEnrollmentDigest({...props,actorUserId:"other-admin"})).not.toBe(expected);
    expect(originEnrollmentDigest({
      ...props,independentEvidenceReference:"portal-event:other-test-12345678",
    })).not.toBe(expected);
  });
});
