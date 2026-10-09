import { randomUUID } from "node:crypto";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { pool } from "../src/db/pool";
import {
  OriginChannelEnrollmentError,enrollTrustedVendorOriginChannel,
} from "../src/authority/origin-channel-enrollment";

const proofRef="portal-event:simulated-ci-only-"+randomUUID();
let actor="";
beforeAll(async()=>{
  const result=await pool.query('select id from "user" where email=$1 limit 1',[
    process.env.DEMO_ADMIN_EMAIL,
  ]);
  if(result.rows.length!==1)throw new Error("DEMO_ADMIN_REQUIRED");
  actor=result.rows[0].id;
});
afterAll(async()=>{await pool.end();});

describe("preexisting origin registry is admin-only and immutable",()=>{
  it("requires a real admin role and known vendor, not just a typed ID",async()=>{
    const fixture={
      actorUserId:actor,organizationId:"org_demo",
      vendorId:"vendor_northstar",kind:"TRUSTED_PORTAL" as const,
      independentEvidenceReference:proofRef,confirmedOutsideInvoice:true,
    };
    for(const bad of [
      {...fixture,actorUserId:randomUUID()},
      {...fixture,organizationId:"another_tenant"},
    ]){
      await expect(enrollTrustedVendorOriginChannel(bad))
        .rejects.toBeInstanceOf(OriginChannelEnrollmentError);
    }
    await expect(enrollTrustedVendorOriginChannel({
      ...fixture,vendorId:"not-a-known-vendor",
    })).rejects.toMatchObject({code:"ORIGIN_VENDOR_NOT_FOUND"});
    await expect(enrollTrustedVendorOriginChannel({
      ...fixture,confirmedOutsideInvoice:false,
    })).rejects.toMatchObject({code:"INDEPENDENT_CHANNEL_CHECK_NOT_CONFIRMED"});
  });
  it("creates pre-invoice assertion with DB-generated timestamp and idempotent evidence",async()=>{
    const fixture={
      actorUserId:actor,organizationId:"org_demo",
      vendorId:"vendor_northstar",kind:"TRUSTED_PORTAL" as const,
      independentEvidenceReference:proofRef,confirmedOutsideInvoice:true,
    };
    const first=await enrollTrustedVendorOriginChannel(fixture);
    expect(first.replayed).toBe(false);
    expect(first.active).toBe(true);
    expect(first.evidenceStatus).toBe("ADMIN_ASSERTED_NOT_INDEPENDENTLY_VERIFIED");
    expect(first.paymentAuthorized).toBe(false);
    const stored=await pool.query([
      "select kind,enrolled_by_user_id,created_at,enrolled_evidence_sha256",
      "from vendor_origin_channels where id=$1",
    ].join(" "),[first.id]);
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0].kind).toBe("TRUSTED_PORTAL");
    expect(stored.rows[0].enrolled_by_user_id).toBe(actor);
    expect(stored.rows[0].enrolled_evidence_sha256).toBe(first.evidenceSha256);
    expect(stored.rows[0].created_at.toISOString()).toBe(first.createdAt);
    const again=await enrollTrustedVendorOriginChannel(fixture);
    expect(again.replayed).toBe(true);
    expect(again.id).toBe(first.id);
    await expect(pool.query(
      "update vendor_origin_channels set enrolled_evidence_sha256=$1 where id=$2",
      ["0".repeat(64),first.id],
    )).rejects.toThrow(/ORIGIN_CHANNEL_IDENTITY_IMMUTABLE/);
    const payments=await pool.query(
      "select count(*)::int as n from payment_requests where organization_id=$1 and source='verified_invoice'",
      ["org_demo"],
    );
    expect(payments.rows[0].n).toBe(0);
  });
});
