import {createHash,createHmac,timingSafeEqual} from "node:crypto";
import {z} from "zod";
import {pool} from "../db/pool";
import {assertDisposableSimulationEnvironment} from "../autonomy/simulated-runner";

const hex=z.string().regex(/^[a-f0-9]{64}$/);
export const syntheticErpEventSchema=z.object({
  eventId:z.string().regex(/^evt_[A-Za-z0-9_-]{12,100}$/),
  organizationId:z.string().min(1).max(120),
  vendorId:z.string().min(1).max(120),
  channelId:z.string().min(1).max(120),
  keyId:z.string().regex(/^fixture_[a-z0-9_-]{4,64}$/),
  artifactId:z.string().uuid(),
  artifactSha256:hex,
  invoiceNumber:z.string().min(1).max(120),
  amountCents:z.number().int().positive().max(2_000_000_000),
  currency:z.literal("USD"),
  signedAt:z.string().datetime({offset:true}),
}).strict();
type Event=z.infer<typeof syntheticErpEventSchema>;
function sha(data:string){return createHash("sha256").update(data).digest("hex");}
function canonical(input:Event){return JSON.stringify([
  "mandategate/synthetic-erp-event/v1",
  input.eventId,input.organizationId,input.vendorId,input.channelId,input.keyId,
  input.artifactId,input.artifactSha256,input.invoiceNumber,input.amountCents,
  input.currency,input.signedAt,
]);}
export function signSyntheticErpEvent(input:unknown,secret:string){
  assertDisposableSimulationEnvironment();
  const event=syntheticErpEventSchema.parse(input);
  if(secret.length<32)throw Error("SYNTHETIC_ERP_KEY_TOO_SHORT");
  return createHmac("sha256",secret).update(canonical(event)).digest("hex");
}
export async function registerSyntheticErpKey(input:{
  actorUserId:string;organizationId:string;vendorId:string;
  channelId:string;keyId:string;secret:string;
}){
  assertDisposableSimulationEnvironment();
  if(!input.keyId.match(/^fixture_[a-z0-9_-]{4,64}$/)||input.secret.length<32)
    throw Error("SYNTHETIC_ERP_REGISTRATION_INVALID");
  if(!/^queue_ci_[0-9a-f-]{36}$/i.test(input.organizationId))
    throw Error("SYNTHETIC_ERP_ORGANIZATION_REQUIRED");
  const result=await pool.query([
    "insert into erp_synthetic_source_keys",
    "(organization_id,vendor_id,origin_channel_id,key_id,key_fingerprint_sha256,registered_by_user_id)",
    "select $1,$2,$3,$4,$5,$6",
    "where exists(select 1 from organization_admin_memberships m",
    "where m.organization_id=$1 and m.user_id=$6 and m.role='ADMIN' and m.active=true)",
    "and exists(select 1 from vendor_origin_channels ch",
    "where ch.organization_id=$1 and ch.vendor_id=$2 and ch.id=$3",
    "and ch.active=true and ch.kind='ERP_INTEGRATION')",
    "on conflict do nothing returning key_id",
  ].join(" "),[input.organizationId,input.vendorId,input.channelId,input.keyId,
    sha(input.secret),input.actorUserId]);
  if(result.rowCount!==1)throw Error("SYNTHETIC_ERP_ENROLLMENT_DENIED_OR_DUPLICATE");
  return {keyId:input.keyId,issuerAuthenticated:false as const,paymentAuthorized:false as const};
}
export async function receiveSyntheticErpEvent(input:{
  event:unknown;signature:string;secret:string;now?:Date;
}){
  assertDisposableSimulationEnvironment();
  const event=syntheticErpEventSchema.parse(input.event);
  if(!/^queue_ci_[0-9a-f-]{36}$/i.test(event.organizationId))
    throw Error("SYNTHETIC_ERP_ORGANIZATION_REQUIRED");
  const now=input.now??new Date();
  if(!Number.isFinite(now.valueOf())||
    Math.abs(now.valueOf()-Date.parse(event.signedAt))>300_000)
    throw Error("SYNTHETIC_ERP_TIMESTAMP_INVALID");
  const expected=signSyntheticErpEvent(event,input.secret);
  if(!hex.safeParse(input.signature).success ||
    !timingSafeEqual(Buffer.from(expected,"hex"),Buffer.from(input.signature,"hex")))
    throw Error("SYNTHETIC_ERP_SIGNATURE_INVALID");
  const bodyHash=sha(canonical(event));
  const client=await pool.connect();
  try{
    await client.query("begin");
    const admitted=await client.query([
      "select k.key_id from erp_synthetic_source_keys k",
      "join vendor_origin_channels c on c.id=k.origin_channel_id",
      "and c.organization_id=k.organization_id and c.vendor_id=k.vendor_id",
      "join invoice_artifacts a on a.id=$5 and a.organization_id=k.organization_id",
      "where k.organization_id=$1 and k.vendor_id=$2 and k.origin_channel_id=$3",
      "and k.key_id=$4 and k.active=true and c.active=true",
      "and c.kind='ERP_INTEGRATION' and c.created_at<a.created_at",
      "and k.created_at<a.created_at",
      "and k.key_fingerprint_sha256=$7 and a.sha256=$6",
      "for share of k,c,a",
    ].join(" "),[event.organizationId,event.vendorId,event.channelId,
      event.keyId,event.artifactId,event.artifactSha256,sha(input.secret)]);
    if(admitted.rowCount!==1)throw Error("SYNTHETIC_ERP_TRUST_BOUNDARY_FAILED");
    const inserted=await client.query([
      "insert into erp_synthetic_signed_invoice_receipts",
      "(organization_id,vendor_id,origin_channel_id,key_id,artifact_id,artifact_sha256,",
      "event_id,signed_at,body_sha256,signature_sha256,invoice_number,amount_cents,currency)",
      "values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
      "on conflict do nothing returning id",
    ].join(" "),[event.organizationId,event.vendorId,event.channelId,event.keyId,
      event.artifactId,event.artifactSha256,event.eventId,event.signedAt,bodyHash,
      sha(input.signature),event.invoiceNumber,event.amountCents,event.currency]);
    if(inserted.rowCount!==1)throw Error("SYNTHETIC_ERP_REPLAY_OR_DUPLICATE");
    await client.query("commit");
    return {receiptId:String(inserted.rows[0].id),bodySha256:bodyHash,
      evidenceStatus:"SYNTHETIC_SIGNED_FIXTURE" as const,
      independentlyAuthenticatedIssuer:false as const,
      originAttestationCreated:false as const,
      paymentAuthorized:false as const,paymentExecuted:false as const};
  }catch(e){await client.query("rollback").catch(()=>undefined);throw e;}
  finally{client.release();}
}
