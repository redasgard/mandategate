import { createHash, randomUUID } from "node:crypto";
import { pool } from "../db/pool";

/**
 * An administrator's off-invoice channel ENROLLMENT assertion.
 * This cannot itself prove an external event happened and does not authorize
 * an invoice or any payment. Channel timestamps are DB-generated.
 */
const allowedKinds={
  KNOWN_CALLBACK:"callback-record:",
  TRUSTED_PORTAL:"portal-event:",
  ERP_INTEGRATION:"erp-entry:",
} as const;
export type OriginChannelKind=keyof typeof allowedKinds;
export class OriginChannelEnrollmentError extends Error {
  constructor(public readonly code:string,public readonly httpStatus:number) {
    super(code);this.name="OriginChannelEnrollmentError";
  }
}
function deny(code:string,httpStatus=403):never {
  throw new OriginChannelEnrollmentError(code,httpStatus);
}
export function validateEnrollmentReference(kind:string,reference:string) {
  if(!Object.prototype.hasOwnProperty.call(allowedKinds,kind))
    deny("ORIGIN_CHANNEL_KIND_UNSUPPORTED",422);
  if(reference.length<16||reference.length>128 ||
     !/^[A-Za-z0-9._:/-]+$/.test(reference) ||
     !reference.startsWith(allowedKinds[kind as OriginChannelKind])) {
    deny("INDEPENDENT_CHANNEL_EVIDENCE_REFERENCE_REQUIRED",422);
  }
}
export function originEnrollmentDigest(input:{
  organizationId:string;vendorId:string;kind:OriginChannelKind;
  actorUserId:string;independentEvidenceReference:string;
}) {
  validateEnrollmentReference(input.kind,input.independentEvidenceReference);
  const components=[
    input.organizationId,input.vendorId,input.kind,input.actorUserId,
    input.independentEvidenceReference,
  ];
  // Length-prefix each value to prevent concatenation ambiguities.
  const canonical=components.map(x=>String(Buffer.byteLength(x))+":"+x).join("|");
  return createHash("sha256")
    .update("mandategate/vendor-origin-enrollment/v1\0")
    .update(canonical,"utf8").digest("hex");
}

export async function enrollTrustedVendorOriginChannel(input:{
  actorUserId:string;organizationId:string;vendorId:string;kind:OriginChannelKind;
  independentEvidenceReference:string;confirmedOutsideInvoice:boolean;
}) {
  if(!input.actorUserId || !input.organizationId || !input.vendorId)
    deny("ENROLLMENT_IDENTIFIERS_REQUIRED",400);
  if(input.confirmedOutsideInvoice!==true)
    deny("INDEPENDENT_CHANNEL_CHECK_NOT_CONFIRMED",422);
  const digest=originEnrollmentDigest(input);
  const client=await pool.connect();
  try {
    await client.query("begin");
    const membership=await client.query([
      "select 1 from organization_admin_memberships",
      "where organization_id=$1 and user_id=$2 and role='ADMIN' and active=true",
      "for share",
    ].join(" "),[input.organizationId,input.actorUserId]);
    if(membership.rows.length!==1)deny("ADMIN_ORGANIZATION_ROLE_REQUIRED",403);
    const vendor=await client.query(
      "select id from vendors where id=$1 and organization_id=$2 for share",
      [input.vendorId,input.organizationId],
    );
    if(vendor.rows.length!==1)deny("ORIGIN_VENDOR_NOT_FOUND",404);
    const created=await client.query([
      "insert into vendor_origin_channels",
      "(id,organization_id,vendor_id,kind,enrolled_evidence_sha256,enrolled_by_user_id)",
      "values ($1,$2,$3,$4,$5,$6)",
      "on conflict (organization_id,vendor_id,kind,enrolled_evidence_sha256)",
      "do nothing returning id,created_at,active",
    ].join(" "),[
      "channel_"+randomUUID(),input.organizationId,input.vendorId,input.kind,
      digest,input.actorUserId,
    ]);
    let row=created.rows[0];
    if(!row){
      const previous=await client.query([
        "select id,created_at,active from vendor_origin_channels",
        "where organization_id=$1 and vendor_id=$2 and kind=$3",
        "and enrolled_evidence_sha256=$4",
      ].join(" "),[input.organizationId,input.vendorId,input.kind,digest]);
      row=previous.rows[0];
    }
    if(!row)throw new Error("CHANNEL_ENROLLMENT_PERSISTENCE_FAILURE");
    await client.query("commit");
    return {
      id:row.id as string,
      vendorId:input.vendorId,organizationId:input.organizationId,
      kind:input.kind,evidenceSha256:digest,
      createdAt:(row.created_at as Date).toISOString(),
      active:row.active as boolean,
      replayed:created.rows.length===0,
      evidenceStatus:"ADMIN_ASSERTED_NOT_INDEPENDENTLY_VERIFIED" as const,
      issuerAuthenticated:false as const,
      paymentAuthorized:false as const,paymentExecuted:false as const,
    };
  }catch(error){
    await client.query("rollback").catch(()=>undefined);
    throw error;
  }finally{client.release();}
}
