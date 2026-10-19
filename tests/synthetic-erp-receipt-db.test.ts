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
  await registerSyntheticErpKey({actorUserId:actor,organizationId:org,vendorId:vendor,channelId,keyId,secret});
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
     originAttestationCreated:false,evidenceStatus:"SYNTHETIC_SIGNED_FIXTURE"});
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
});
