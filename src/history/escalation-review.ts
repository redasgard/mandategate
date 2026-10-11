import {createHash} from "node:crypto";
import {pool} from "../db/pool";
import {inspectInvoiceArtifact,ArtifactAdmissionError} from "../artifacts/admission";

export class EscalationReviewError extends Error {
  constructor(public readonly code:string, public readonly httpStatus=409) {
    super(code);this.name="EscalationReviewError";
  }
}
type Snapshot={
  organizationId:string;requestId:string;vendorId:string;invoiceNumber:string;
  amountCents:number;currency:string;requestedDestination:string;
  policyId:string;policyLimitCents:number;trustedDestination:string;
  outcome:string;status:string;
};
const h=(bytes:Buffer|string)=>createHash("sha256").update(bytes).digest("hex");
export function escalationSnapshotDigest(s:Snapshot):string {
  return h("mandategate/escalation-exact-review/v1\0"+JSON.stringify([
    s.organizationId,s.requestId,s.vendorId,s.invoiceNumber,
    s.amountCents,s.currency,s.requestedDestination,
    s.policyId,s.policyLimitCents,s.trustedDestination,s.outcome,s.status,
  ]));
}
const query=[
  "select pr.id as request_id,pr.organization_id,pr.vendor_id,",
  "pr.invoice_number,pr.amount_cents,pr.currency,pr.requested_destination,pr.status,",
  "pd.outcome,p.id as policy_id,p.auto_pay_max_amount_cents as policy_limit,",
  "vd.destination as trusted_destination",
  "from payment_requests pr",
  "join payment_decisions pd on pd.payment_request_id=pr.id",
  "left join lateral (select id,auto_pay_max_amount_cents from policies",
  "where organization_id=pr.organization_id and active=true",
  "order by created_at desc,id desc limit 1) p on true",
  "left join lateral (select destination from vendor_destinations",
  "where vendor_id=pr.vendor_id and trusted=true",
  "order by created_at desc,id desc limit 1) vd on true",
  "where pr.id=$1",
].join(" ");
const rowToSnapshot=(r:Record<string,unknown>):Snapshot=>({
  organizationId:String(r.organization_id),requestId:String(r.request_id),
  vendorId:String(r.vendor_id),invoiceNumber:String(r.invoice_number),
  amountCents:Number(r.amount_cents),currency:String(r.currency),
  requestedDestination:String(r.requested_destination),
  policyId:String(r.policy_id??"NONE"),policyLimitCents:Number(r.policy_limit??0),
  trustedDestination:String(r.trusted_destination??"NONE"),
  outcome:String(r.outcome),status:String(r.status),
});

/** Read only: original ESCALATE decision remains immutable to reviewers. */
export async function getEscalationSnapshot(requestId:string,actorId:string){
  const membership=await pool.query([
    "select 1 from payment_requests pr",
    "join organization_admin_memberships m on m.organization_id=pr.organization_id",
    "where pr.id=$1 and m.user_id=$2 and m.role='ADMIN' and m.active=true",
  ].join(" "),[requestId,actorId]);
  if(membership.rows.length!==1)return null;
  const row=await pool.query(query,[requestId]);
  if(!row.rows[0])return null;
  const snapshot=rowToSnapshot(row.rows[0]);
  return {
    snapshotSha256:escalationSnapshotDigest(snapshot),
    outcome:snapshot.outcome,status:snapshot.status,
    trustedDestinationCurrent:snapshot.trustedDestination===snapshot.requestedDestination,
  };
}

const reject=(code:string,status=409):never=>{throw new EscalationReviewError(code,status);};
export async function recordPaymentEscalationReview(input:{
  requestId:string;reviewerId:string;action:"ACCEPT"|"DECLINE";
  expectedSnapshotSha256:string;explanation:string;
  evidence?:{mimeType:string;bytes:Buffer}|null;
}) {
  if(!/^[a-f0-9]{64}$/.test(input.expectedSnapshotSha256)||
     input.explanation.trim().length<16||input.explanation.length>2000)
    reject("ESCALATION_REVIEW_INVALID",422);
  let attachment:Buffer|null=null,attachmentMime:string|null=null;
  if(input.evidence){
    if(input.evidence.bytes.byteLength>1024*1024)
      reject("REVIEW_EVIDENCE_TOO_LARGE",413);
    try{
      const checked=inspectInvoiceArtifact(input.evidence.bytes,input.evidence.mimeType);
      attachmentMime=checked.mimeType;attachment=input.evidence.bytes;
    }catch(error){
      if(error instanceof ArtifactAdmissionError)reject("REVIEW_EVIDENCE_INVALID",422);
      throw error;
    }
  }
  const client=await pool.connect();
  try{
    await client.query("begin");
    const request=await client.query(query+" for update of pr",[input.requestId]);
    if(!request.rows[0])reject("PAYMENT_REQUEST_NOT_FOUND",404);
    const row=rowToSnapshot(request.rows[0]);
    const membership=await client.query([
      "select 1 from organization_admin_memberships",
      "where user_id=$1 and organization_id=$2 and role='ADMIN' and active=true",
      "for share",
    ].join(" "),[input.reviewerId,row.organizationId]);
    if(membership.rows.length!==1)reject("REVIEWER_ORGANIZATION_NOT_FOUND",404);
    if(row.outcome!=="ESCALATE"||row.status!=="ESCALATED")
      reject("ESCALATION_NOT_PENDING");
    // Decline must still work after a vendor is revoked or a policy is
    // disabled; only ACCEPT requires current valid payment authority.
    if(input.action==="ACCEPT" &&
       (row.trustedDestination!==row.requestedDestination || row.policyId==="NONE"))
      reject("TRUSTED_PAYMENT_DESTINATION_CHANGED");
    const currentSha=escalationSnapshotDigest(row);
    if(currentSha!==input.expectedSnapshotSha256)
      reject("ESCALATION_SNAPSHOT_CHANGED");
    const inserted=await client.query([
      "insert into payment_escalation_reviews",
      "(organization_id,payment_request_id,reviewer_user_id,action,explanation,",
      "request_snapshot_sha256,evidence_mime_type,evidence_sha256,evidence_bytes)",
      "values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id,created_at",
    ].join(" "),[
      row.organizationId,input.requestId,input.reviewerId,input.action,
      input.explanation.trim(),currentSha,attachmentMime,
      attachment?h(attachment):null,attachment,
    ]);
    const status=input.action==="ACCEPT"?"APPROVED":"DECLINED";
    const update=await client.query([
      "update payment_requests set status=$2",
      "where id=$1 and status='ESCALATED' returning id",
    ].join(" "),[input.requestId,status]);
    if(update.rows.length!==1)reject("ESCALATION_STATE_CHANGED");
    await client.query("commit");
    return {
      reviewId:inserted.rows[0].id as string,requestId:input.requestId,
      action:input.action,status,
      approvedForExecution:input.action==="ACCEPT",
      executed:false as const,scheduled:false as const,
      snapshotSha256:currentSha,
      reviewerId:input.reviewerId,
      reviewedAt:(inserted.rows[0].created_at as Date).toISOString(),
      evidenceSha256:attachment?h(attachment):null,
    };
  }catch(error){
    await client.query("rollback").catch(()=>undefined);
    const pg=error as {code?:string};
    if(pg.code==="23505")reject("ESCALATION_ALREADY_REVIEWED");
    throw error;
  }finally{client.release();}
}
