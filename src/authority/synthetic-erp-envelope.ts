import {createHash,createHmac,timingSafeEqual} from "node:crypto";
import {z} from "zod";

// A synthetic CI fixture envelope, NOT an authenticated external ERP identity
// or invoice field verification. Never use this signature as payment authority.
const sha256Hex=z.string().regex(/^[0-9a-f]{64}$/);
export const syntheticErpEventSchema=z.object({
  eventId:z.string().regex(/^evt_[A-Za-z0-9_-]{12,100}$/),
  organizationId:z.string().min(1).max(120),
  vendorId:z.string().min(1).max(120),
  channelId:z.string().min(1).max(120),
  keyId:z.string().regex(/^fixture_[a-z0-9_-]{4,64}$/),
  artifactId:z.string().uuid(),
  artifactSha256:sha256Hex,
  invoiceNumber:z.string().min(1).max(120),
  amountCents:z.number().int().positive().max(2_000_000_000),
  currency:z.literal("USD"),
  signedAt:z.string().datetime({offset:true}),
}).strict();
export type SyntheticErpEvent=z.infer<typeof syntheticErpEventSchema>;

function canonical(event:SyntheticErpEvent){
  return JSON.stringify([
    "mandategate/synthetic-erp-event/v1",
    event.eventId,event.organizationId,event.vendorId,event.channelId,event.keyId,
    event.artifactId,event.artifactSha256,event.invoiceNumber,event.amountCents,
    event.currency,event.signedAt,
  ]);
}
export function signSyntheticErpEnvelopeForFixture(input:unknown,secret:string){
  const event=syntheticErpEventSchema.parse(input);
  if(Buffer.byteLength(secret,"utf8")<32)throw Error("SYNTHETIC_ERP_KEY_TOO_SHORT");
  return createHmac("sha256",secret).update(canonical(event)).digest("hex");
}
export function verifySyntheticErpEnvelope(input:{
  event:unknown;signature:string;secret:string;now:Date;
}){
  const event=syntheticErpEventSchema.parse(input.event);
  const ageMillis=input.now.valueOf()-Date.parse(event.signedAt);
  if(!Number.isFinite(ageMillis)||ageMillis < -30_000||ageMillis > 300_000)
    throw Error("SYNTHETIC_ERP_TIMESTAMP_INVALID");
  const expected=signSyntheticErpEnvelopeForFixture(event,input.secret);
  if(!sha256Hex.safeParse(input.signature).success ||
     !timingSafeEqual(Buffer.from(expected,"hex"),Buffer.from(input.signature,"hex")))
    throw Error("SYNTHETIC_ERP_SIGNATURE_INVALID");
  const bodySha256=createHash("sha256").update(canonical(event)).digest("hex");
  return {event,bodySha256,signatureSha256:createHash("sha256").update(input.signature).digest("hex")};
}
