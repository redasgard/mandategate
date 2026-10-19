import {randomUUID} from "node:crypto";
import {describe,expect,it} from "vitest";
import {signSyntheticErpEnvelopeForFixture,syntheticErpEventSchema,verifySyntheticErpEnvelope}
  from "../src/authority/synthetic-erp-envelope";

// This pure contract suite runs on every normal GitHub CI job; the PostgreSQL
// receipt suite runs only in the separately gated disposable 55432 profile.
const make=()=>({
  eventId:"evt_"+randomUUID().replaceAll("-",""),
  organizationId:"queue_ci_"+randomUUID(),vendorId:"vendor_fixture",
  channelId:"channel_fixture",keyId:"fixture_testissuer",
  artifactId:randomUUID(),artifactSha256:"a".repeat(64),
  invoiceNumber:"ERP-TEST-01",amountCents:1000,currency:"USD",
  signedAt:new Date().toISOString(),
});
describe("synthetic ERP strict envelope contract",()=>{
  it("rejects unknown fields and unsafe numeric values before verification",()=>{
    const item=make();
    expect(syntheticErpEventSchema.safeParse({...item,extra:"authorize"}).success).toBe(false);
    expect(syntheticErpEventSchema.safeParse({...item,amountCents:-1}).success).toBe(false);
    expect(syntheticErpEventSchema.safeParse({...item,amountCents:1.5}).success).toBe(false);
    expect(syntheticErpEventSchema.safeParse({...item,currency:"EUR"}).success).toBe(false);
    expect(syntheticErpEventSchema.safeParse({...item,artifactSha256:"0"}).success).toBe(false);
  });
  it("enforces opaque event identities and exact ISO timestamps",()=>{
    const item=make();
    expect(syntheticErpEventSchema.safeParse(item).success).toBe(true);
    expect(syntheticErpEventSchema.safeParse({...item,eventId:"oops"}).success).toBe(false);
    expect(syntheticErpEventSchema.safeParse({...item,signedAt:"yesterday"}).success).toBe(false);
  });

  it("authenticates all tuple fields without creating any payment authority",()=>{
    const item=make(),secret="ci-only-synthetic-issuer-hmac-secret-2026";
    const signature=signSyntheticErpEnvelopeForFixture(item,secret);
    const verified=verifySyntheticErpEnvelope({event:item,signature,secret,now:new Date()});
    expect(verified.event).toEqual(item);
    expect(verified.bodySha256).toMatch(/^[0-9a-f]{64}$/);
    for(const changed of [
      {...item,organizationId:"queue_ci_"+randomUUID()},
      {...item,vendorId:"vendor_changed"},
      {...item,channelId:"channel_changed"},
      {...item,artifactSha256:"b".repeat(64)},
      {...item,invoiceNumber:"MUTATED"},
      {...item,amountCents:2000},
    ]){
      expect(()=>verifySyntheticErpEnvelope({event:changed,signature,secret,now:new Date()}))
        .toThrow("SYNTHETIC_ERP_SIGNATURE_INVALID");
    }
    expect(()=>verifySyntheticErpEnvelope({
      event:item,signature,secret:"other-issuer-secret-at-least-32-characters",now:new Date(),
    })).toThrow("SYNTHETIC_ERP_SIGNATURE_INVALID");
  });
  it("rejects stale or excessively future-dated signed events",()=>{
    const item=make(),secret="ci-only-synthetic-issuer-hmac-secret-2026";
    const signature=signSyntheticErpEnvelopeForFixture(item,secret);
    for(const now of [new Date(Date.now()+360_000),new Date(Date.now()-45_000)]){
      expect(()=>verifySyntheticErpEnvelope({event:item,signature,secret,now}))
        .toThrow("SYNTHETIC_ERP_TIMESTAMP_INVALID");
    }
  });

});
