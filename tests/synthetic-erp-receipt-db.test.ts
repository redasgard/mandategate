import {createHash,randomUUID} from "node:crypto";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {pool} from "../src/db/pool";
import {registerSyntheticErpKey,receiveSyntheticErpEvent,signSyntheticErpEvent}
  from "../src/authority/synthetic-erp-receipt";
const org="queue_ci_"+randomUUID();
const vendor="vendor_"+randomUUID(),channel="channel_"+randomUUID();
const artifact=randomUUID(),keyId="fixture_testissuer";
const secret="ci-fixture-key-only-not-a-provider-credential-2026";
let actor="";
const bytes=Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
const hash=createHash("sha256").update(bytes).digest("hex");
const dbUrl=new URL(process.env.DATABASE_URL??"postgresql://invalid@invalid/db");
const disposable=process.env.CI==="true" && process.env.MANDATEGATE_DISABLE_PAYMENTS==="1" && process.env.MANDATEGATE_RUNTIME_MODE==="legacy" && dbUrl.hostname==="127.0.0.1" && dbUrl.port==="55432" && dbUrl.pathname==="/mandategate";
const event=()=>({
  eventId:"evt_"+randomUUID().replaceAll("-",""),
  organizationId:org,vendorId:vendor,channelId:channel,keyId,artifactId:artifact,
  artifactSha256:hash,invoiceNumber:"ERP-SYNTH-001",amountCents:1000,
  currency:"USD",signedAt:new Date().toISOString(),
});
describe.skipIf(!disposable)("synthetic ERP signed source receipts: no payments",()=>{
beforeAll(async()=>{
  const u=await pool.query('select id from "user" where email=$1',[process.env.DEMO_ADMIN_EMAIL]);
  actor=String(u.rows[0].id);
  await pool.query("insert into organizations(id,name) values($1,'Synthetic ERP')",[org]);
  await pool.query("insert into vendors(id,organization_id,name,normal_max_amount_cents) values($1,$2,'Synthetic Issuer',10000)",[vendor,org]);
  await pool.query("insert into organization_admin_memberships(user_id,organization_id,role,active) values($1,$2,'ADMIN',true)",[actor,org]);
  await pool.query([
    "insert into vendor_origin_channels(id,organization_id,vendor_id,kind,enrolled_evidence_sha256,enrolled_by_user_id,created_at)",
    "values($1,$2,$3,'ERP_INTEGRATION',$4,$5,now()-interval '2 days')",
  ].join(" "),[channel,org,vendor,createHash("sha256").update("fixture-channel").digest("hex"),actor]);
  await registerSyntheticErpKey({actorUserId:actor,organizationId:org,vendorId:vendor,channelId:channel,keyId,secret});
  await pool.query([
    "insert into invoice_artifacts(id,organization_id,mime_type,byte_size,sha256,content,created_at)",
    "values($1,$2,'application/pdf',$3,$4,$5,now()+interval '1 second')",
  ].join(" "),[artifact,org,bytes.length,hash,bytes]);
});
afterAll(async()=>{await pool.end();});
it("records one exact signed event but rejects replay and immutable tampering",async()=>{
   // The artifact must postdate the registered key.
   const x=event(),signature=signSyntheticErpEvent(x,secret);
   const first=await receiveSyntheticErpEvent({event:x,signature,secret});
   expect(first).toMatchObject({paymentAuthorized:false,paymentExecuted:false,
     originAttestationCreated:false,artifactContentCorroborated:false,
     evidenceStatus:"SYNTHETIC_SIGNED_FIXTURE"});
   await expect(receiveSyntheticErpEvent({event:x,signature,secret})).rejects.toThrow("SYNTHETIC_ERP_REPLAY_OR_DUPLICATE");
   await expect(pool.query("delete from erp_synthetic_signed_invoice_receipts where id=$1",[first.receiptId]))
     .rejects.toThrow("AUTHORITY_PROVENANCE_IMMUTABLE");
 });
 it("rejects signature, stale timestamp and cross-tenant modification",async()=>{
   const x=event(),signature=signSyntheticErpEvent(x,secret);
   await expect(receiveSyntheticErpEvent({event:{...x,amountCents:2000},signature,secret}))
     .rejects.toThrow("SYNTHETIC_ERP_SIGNATURE_INVALID");
   await expect(receiveSyntheticErpEvent({event:x,signature,secret,now:new Date(Date.now()+600_000)}))
     .rejects.toThrow("SYNTHETIC_ERP_TIMESTAMP_INVALID");
   const future={...x,signedAt:new Date(Date.now()+60_000).toISOString()};
   await expect(receiveSyntheticErpEvent({
     event:future,signature:signSyntheticErpEvent(future,secret),secret,
   })).rejects.toThrow("SYNTHETIC_ERP_TIMESTAMP_INVALID");
   await expect(receiveSyntheticErpEvent({event:{...x,organizationId:"org_demo"},signature,secret}))
     .rejects.toThrow("SYNTHETIC_ERP_ORGANIZATION_REQUIRED");
 });
 it("does not convert a receipt to an attestation or payment",async()=>{
   const counts=await pool.query([
     "select",
     "(select count(*)::int from invoice_origin_attestations where organization_id=$1) as attestations,",
     "(select count(*)::int from payment_requests where organization_id=$1) as payments",
   ].join(" "),[org]);
   expect(counts.rows[0]).toMatchObject({attestations:0,payments:0});
 });

it("blocks vendor invoice replay through a different artifact payload",async()=>{
  // The underlying artifact store deduplicates identical bytes within an org.
  // Use distinct bytes to verify the vendor + invoice-number constraint.
  const copyArtifact=randomUUID();
  const copyBytes=Buffer.concat([bytes,Buffer.from("% alternate source bytes\\n")]);
  const copyHash=createHash("sha256").update(copyBytes).digest("hex");
  await pool.query([
    "insert into invoice_artifacts(id,organization_id,mime_type,byte_size,sha256,content)",
    "values($1,$2,'application/pdf',$3,$4,$5)",
  ].join(" "),[copyArtifact,org,copyBytes.length,copyHash,copyBytes]);
  const x={...event(),artifactId:copyArtifact,artifactSha256:copyHash,invoiceNumber:"ERP-SYNTH-001"};
  await expect(receiveSyntheticErpEvent({
    event:x,signature:signSyntheticErpEvent(x,secret),secret,
  })).rejects.toThrow("SYNTHETIC_ERP_REPLAY_OR_DUPLICATE");
});
it("serializes concurrent exact-event attempts into one immutable receipt",async()=>{
  const x={...event(),invoiceNumber:"ERP-CONCURRENT-001"};
  const signature=signSyntheticErpEvent(x,secret);
  const runs=await Promise.allSettled(Array.from({length:5},()=>
    receiveSyntheticErpEvent({event:x,signature,secret})));
  const accepted=runs.filter(x=>x.status==="fulfilled");
  const rejected=runs.filter(x=>x.status==="rejected");
  expect(accepted).toHaveLength(1);
  expect(rejected).toHaveLength(4);
  for(const item of rejected){
    if(item.status==="rejected")
      expect(String(item.reason)).toContain("SYNTHETIC_ERP_REPLAY_OR_DUPLICATE");
  }
  const stored=await pool.query(
    "select count(*)::int as n from erp_synthetic_signed_invoice_receipts where organization_id=$1 and event_id=$2",
    [org,x.eventId]);
  expect(stored.rows[0].n).toBe(1);
});
it("rejects a different signed body that reuses an event identity",async()=>{
  const x={...event(),invoiceNumber:"ERP-ORIGINAL-002"};
  const signature=signSyntheticErpEvent(x,secret);
  await receiveSyntheticErpEvent({event:x,signature,secret});
  const altered={...x,invoiceNumber:"ERP-REBOUND-003"};
  await expect(receiveSyntheticErpEvent({
    event:altered,signature:signSyntheticErpEvent(altered,secret),secret,
  })).rejects.toThrow("SYNTHETIC_ERP_REPLAY_OR_DUPLICATE");
});
it("rejects a signature valid under an unregistered key",async()=>{
  const wrong="different-unenrolled-fixture-secret-for-ci-only";
  const x={...event(),invoiceNumber:"ERP-WRONG-KEY-005"};
  await expect(receiveSyntheticErpEvent({
    event:x,signature:signSyntheticErpEvent(x,wrong),secret:wrong,
  })).rejects.toThrow("SYNTHETIC_ERP_TRUST_BOUNDARY_FAILED");
});
it("enforces irreversible key and channel revocation before admission",async()=>{
  await pool.query([
    "update erp_synthetic_source_keys set active=false",
    "where organization_id=$1 and origin_channel_id=$2 and key_id=$3",
  ].join(" "),[org,channel,keyId]);
  const x={...event(),invoiceNumber:"ERP-REVOKED-006"};
  await expect(receiveSyntheticErpEvent({
    event:x,signature:signSyntheticErpEvent(x,secret),secret,
  })).rejects.toThrow("SYNTHETIC_ERP_TRUST_BOUNDARY_FAILED");
  await expect(pool.query([
    "update erp_synthetic_source_keys set active=true",
    "where organization_id=$1 and origin_channel_id=$2 and key_id=$3",
  ].join(" "),[org,channel,keyId])).rejects.toThrow("ERP_SOURCE_KEY_IMMUTABLE");
  await expect(pool.query([
    "delete from erp_synthetic_source_keys",
    "where organization_id=$1 and origin_channel_id=$2 and key_id=$3",
  ].join(" "),[org,channel,keyId])).rejects.toThrow("ERP_SOURCE_KEY_IMMUTABLE");
  await pool.query("update vendor_origin_channels set active=false where id=$1",[channel]);
  await expect(pool.query(
    "update vendor_origin_channels set active=true where id=$1",[channel]))
    .rejects.toThrow("ORIGIN_CHANNEL_IDENTITY_IMMUTABLE");
});

});
