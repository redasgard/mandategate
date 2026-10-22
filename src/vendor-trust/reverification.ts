import {createHash,randomUUID} from "node:crypto";
import {pool} from "../db/pool";

export class VendorTrustCaseError extends Error{
  constructor(public readonly code:string,public readonly httpStatus=409){
    super(code);this.name="VendorTrustCaseError";
  }
}
const digest=(value:string)=>createHash("sha256").update(value).digest("hex");
const reject=(code:string,status=409):never=>{throw new VendorTrustCaseError(code,status);};
export type VendorTrustAction="REJECT"|"SIMULATE_VERIFY";
const approvedSimulationRef=/^synthetic-demo:[A-Za-z0-9._:/-]{12,112}$/;

export async function resolveVendorReverificationCase(input:{
  actorUserId:string;caseId:string;
  action:VendorTrustAction;reason:string;evidenceReference:string;
  confirmedSyntheticSimulation:boolean;
}){
  if(!input.actorUserId||!input.caseId ||
     !["REJECT","SIMULATE_VERIFY"].includes(input.action)||
     input.reason.trim().length<16||input.reason.length>2000||
     !approvedSimulationRef.test(input.evidenceReference))
    reject("VENDOR_REVERIFICATION_INPUT_INVALID",422);
  if(input.action==="SIMULATE_VERIFY"){
    // A fake issuer is NEVER evidence for live PayPal or a production vendor.
    // This action is gated to a concrete Sandbox PayPal base URL.
    if(process.env.PAYPAL_BASE_URL!=="https://api-m.sandbox.paypal.com")
      reject("SYNTHETIC_REVERIFICATION_SANDBOX_ONLY",403);
    if(input.confirmedSyntheticSimulation!==true)
      reject("SYNTHETIC_REVERIFICATION_NOT_ACKNOWLEDGED",422);
  }
  const client=await pool.connect();
  try{
    await client.query("begin");
    const lookup=await client.query([
      "select c.id,c.organization_id,c.vendor_id,c.payment_request_id,",
      "c.observed_destination_sha256,pr.requested_destination,pr.status,",
      "pd.outcome,pd.reason_codes",
      "from vendor_reverification_cases c",
      "join payment_requests pr on pr.id=c.payment_request_id",
      "and pr.organization_id=c.organization_id and pr.vendor_id=c.vendor_id",
      "join payment_decisions pd on pd.payment_request_id=pr.id",
      "where c.id=$1 for update of c",
    ].join(" "),[input.caseId]);
    const row=lookup.rows[0];
    if(!row)reject("VENDOR_REVERIFICATION_CASE_NOT_FOUND",404);
    const membership=await client.query([
      "select 1 from organization_admin_memberships",
      "where user_id=$1 and organization_id=$2 and role='ADMIN' and active=true",
      "for share",
    ].join(" "),[input.actorUserId,row.organization_id]);
    if(membership.rows.length!==1)reject("VENDOR_REVERIFICATION_NOT_AUTHORIZED",404);
    const previous=await client.query(
      "select id from vendor_reverification_resolutions where case_id=$1",
      [input.caseId],
    );
    if(previous.rows[0])reject("VENDOR_REVERIFICATION_ALREADY_RESOLVED");
    const originalDeniedMismatch=row.status==="DENIED" && row.outcome==="DENY" &&
      Array.isArray(row.reason_codes) && row.reason_codes.includes("DESTINATION_MISMATCH");
    // A separate, authenticated, already-declined ESCALATE may also have a
    // case when trust changed AFTER its original behavioral evaluation.
    // The old request stays terminal and cannot be revived by changing trust.
    let declinedEscalation=false;
    if(row.status==="DECLINED" && row.outcome==="ESCALATE"){
      const reviewed=await client.query(
        "select 1 from payment_escalation_reviews where payment_request_id=$1 and action='DECLINE' limit 1",
        [row.payment_request_id],
      );
      declinedEscalation=reviewed.rows.length===1;
    }
    if(!originalDeniedMismatch && !declinedEscalation)
      reject("VENDOR_REVERIFICATION_INELIGIBLE_CASE");
    if(digest(row.requested_destination)!==row.observed_destination_sha256)
      reject("VENDOR_DESTINATION_SOURCE_TAMPERED");
    let newDestinationId:string|null=null;
    if(input.action==="SIMULATE_VERIFY"){
      // A request cannot mutate vendor trust without an explicit, separately
      // logged verification workflow and organization-admin membership.
      const vendor=await client.query(
        "select id from vendors where id=$1 and organization_id=$2 for update",
        [row.vendor_id,row.organization_id],
      );
      if(!vendor.rows[0])reject("VENDOR_NOT_FOUND",404);
      const previousDestination=await client.query(
        "select id,destination from vendor_destinations where vendor_id=$1 and trusted=true for update",
        [row.vendor_id],
      );
      if(previousDestination.rows.some(x=>x.destination===row.requested_destination))
        reject("DESTINATION_ALREADY_TRUSTED");
      await client.query(
        "update vendor_destinations set trusted=false where vendor_id=$1 and trusted=true",
        [row.vendor_id],
      );
      newDestinationId="v_dest_"+randomUUID();
      await client.query(
        "insert into vendor_destinations(id,vendor_id,destination,trusted) values($1,$2,$3,true)",
        [newDestinationId,row.vendor_id,row.requested_destination],
      );
    }
    await client.query([
      "insert into vendor_reverification_resolutions",
      "(organization_id,case_id,actor_user_id,resolution,reason,",
      "evidence_reference_sha256,new_destination_id)",
      "values($1,$2,$3,$4,$5,$6,$7)",
    ].join(" "),[
      row.organization_id,input.caseId,input.actorUserId,
      input.action==="SIMULATE_VERIFY"?"SIMULATED_REVERIFIED":"REJECTED",
      input.reason.trim(),digest(input.evidenceReference),newDestinationId,
    ]);
    await client.query("commit");
    return{
      caseId:input.caseId,organizationId:row.organization_id,
      vendorId:row.vendor_id,requestId:row.payment_request_id,
      status:input.action==="SIMULATE_VERIFY"?"SIMULATED_REVERIFIED":"REJECTED",
      newDestinationId,
      originalPaymentDecision:row.outcome as "DENY"|"ESCALATE",
      originalPaymentExecuted:false as const,
      externallyVerified:false as const,
      syntheticEvidenceOnly:true as const,
    };
  }catch(error){
    await client.query("rollback").catch(()=>undefined);
    const pg=error as {code?:string};
    if(pg.code==="23505")reject("VENDOR_REVERIFICATION_ALREADY_RESOLVED");
    throw error;
  }finally{client.release();}
}

export async function listVendorTrustCases(adminUserId:string,focusPaymentId?:string){
  const result=await pool.query([
    "select c.id,c.organization_id,c.vendor_id,v.name as vendor_name,",
    "c.payment_request_id,c.observed_destination_sha256,c.created_at,",
    "pr.requested_destination,r.resolution,r.created_at as resolution_time,",
    "r.new_destination_id,trust.destination as current_trusted_destination",
    "from vendor_reverification_cases c",
    "join vendors v on v.id=c.vendor_id and v.organization_id=c.organization_id",
    "join payment_requests pr on pr.id=c.payment_request_id",
    "left join lateral (select destination from vendor_destinations",
    "where vendor_id=c.vendor_id and trusted=true",
    "order by created_at desc,id desc limit 1) trust on true",
    "left join vendor_reverification_resolutions r on r.case_id=c.id",
    "join organization_admin_memberships m on m.organization_id=c.organization_id",
    "where m.user_id=$1 and m.role='ADMIN' and m.active=true",
    "order by case when c.payment_request_id=$2 then 0 else 1 end,",
    "c.created_at desc limit 100",
  ].join(" "),[adminUserId,focusPaymentId??null]);
  return result.rows;
}


/**
 * Start an independently logged recipient investigation ONLY AFTER an
 * ESCALATE was explicitly DECLINED by an active organization administrator.
 * Opening a case never changes trust, resurrects a request or sends funds.
 */
export async function openTrustCaseForDeclinedEscalation(input:{
  actorUserId:string;requestId:string;
}){
  if(!input.actorUserId || !input.requestId)
    reject("VENDOR_CASE_INPUT_INVALID",422);
  const client=await pool.connect();
  try{
    await client.query("begin");
    const payment=await client.query([
      "select pr.id,pr.organization_id,pr.vendor_id,",
      "pr.requested_destination,pr.status,pd.outcome",
      "from payment_requests pr",
      "join payment_decisions pd on pd.payment_request_id=pr.id",
      "where pr.id=$1 for update of pr",
    ].join(" "),[input.requestId]);
    const row=payment.rows[0];
    if(!row)reject("VENDOR_CASE_PAYMENT_NOT_FOUND",404);
    const membership=await client.query([
      "select 1 from organization_admin_memberships",
      "where user_id=$1 and organization_id=$2",
      "and role='ADMIN' and active=true for share",
    ].join(" "),[input.actorUserId,row.organization_id]);
    if(membership.rows.length!==1)reject("VENDOR_CASE_PAYMENT_NOT_FOUND",404);
    if(row.status!=="DECLINED"||row.outcome!=="ESCALATE")
      reject("VENDOR_CASE_REQUIRES_DECLINED_ESCALATION");
    const review=await client.query(
      "select 1 from payment_escalation_reviews where payment_request_id=$1 and action='DECLINE' limit 1",
      [input.requestId],
    );
    if(review.rows.length!==1)reject("VENDOR_CASE_REQUIRES_RECORDED_DECLINE");
    const executed=await client.query(
      "select 1 from payment_executions where payment_request_id=$1 limit 1",
      [input.requestId],
    );
    if(executed.rows.length)reject("VENDOR_CASE_EXECUTION_EXISTS");
    const vendor=await client.query([
      "select id from vendors",
      "where id=$1 and organization_id=$2 for share",
    ].join(" "),[row.vendor_id,row.organization_id]);
    if(vendor.rows.length!==1)reject("VENDOR_CASE_VENDOR_NOT_FOUND");
    const trusted=await client.query(
      "select destination from vendor_destinations where vendor_id=$1 and trusted=true for share",
      [row.vendor_id],
    );
    if(trusted.rows.length===1 && trusted.rows[0].destination===row.requested_destination)
      reject("VENDOR_CASE_RECIPIENT_ALREADY_TRUSTED");
    const existing=await client.query(
      "select id from vendor_reverification_cases where payment_request_id=$1",
      [input.requestId],
    );
    if(existing.rows[0]){
      await client.query("commit");
      return {caseId:String(existing.rows[0].id),paymentRequestId:input.requestId,
        replayed:true,originalPaymentStatus:"DECLINED" as const,
        paymentAuthorized:false as const,paymentExecuted:false as const};
    }
    const created=await client.query([
      "insert into vendor_reverification_cases",
      "(organization_id,vendor_id,payment_request_id,observed_destination_sha256)",
      "values($1,$2,$3,$4) returning id",
    ].join(" "),[
      row.organization_id,row.vendor_id,input.requestId,
      digest(String(row.requested_destination)),
    ]);
    await client.query("commit");
    return {caseId:String(created.rows[0].id),paymentRequestId:input.requestId,
      replayed:false,originalPaymentStatus:"DECLINED" as const,
      paymentAuthorized:false as const,paymentExecuted:false as const};
  }catch(error){
    await client.query("rollback").catch(()=>undefined);
    const pg=error as {code?:string;cause?:{code?:string}};
    if((pg.cause?.code??pg.code)==="23505")
      reject("VENDOR_CASE_CONCURRENT_RESOLUTION");
    throw error;
  }finally{client.release();}
}
