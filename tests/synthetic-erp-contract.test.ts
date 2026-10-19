import {randomUUID} from "node:crypto";
import {describe,expect,it} from "vitest";
import {signSyntheticErpEvent,syntheticErpEventSchema} from "../src/authority/synthetic-erp-receipt";

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
});
