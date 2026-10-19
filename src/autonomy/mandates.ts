import {createHash,randomUUID} from "node:crypto";
import type {PoolClient} from "pg";
import {pool} from "../db/pool";

export class AutopayMandateError extends Error {
  constructor(public readonly code:string,public readonly httpStatus=409){
    super(code);this.name="AutopayMandateError";
  }
}
const fail=(code:string,status=409):never=>{throw new AutopayMandateError(code,status)};
const digest64=/^[a-f0-9]{64}$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha=(x:string)=>createHash("sha256").update(x).digest("hex");
const TTL_MS=15*60*1000;
const DAY_MS=86400000;

type MandateSnapshot={
  id:string;organizationId:string;vendorId:string;
  destinationId:string;destination:string;policyId:string;
  source:"agent_api";maxAmountCents:number;maxTotalAmountCents:number;
  maxPaymentCount:number;actorId:string;
  currentPolicyLimitCents:number;currentVendorLimitCents:number;
  createdAt:string;expiresAt:string;
};
export function digestMandate(snapshot:MandateSnapshot):string {
  return sha("mandategate/autonomous-grant/v1\0"+JSON.stringify([
    snapshot.id,snapshot.organizationId,snapshot.vendorId,
    snapshot.destinationId,snapshot.destination,snapshot.policyId,
    snapshot.source,snapshot.maxAmountCents,snapshot.maxTotalAmountCents,
    snapshot.maxPaymentCount,snapshot.actorId,
    snapshot.currentPolicyLimitCents,snapshot.currentVendorLimitCents,
    snapshot.createdAt,snapshot.expiresAt,
  ]));
}
async function lockOrg(db:PoolClient,org:string) {
  await db.query("select pg_advisory_xact_lock(hashtext($1))",
    ["mandategate/autopay/"+org]);
}
async function assertAdmin(db:PoolClient,org:string,user:string) {
  const m=await db.query([
    "select 1 from organization_admin_memberships",
    "where organization_id=$1 and user_id=$2 and role='ADMIN' and active=true",
    "for share",
  ].join(" "),[org,user]);
  if(m.rows.length!==1)fail("AUTOPAY_ORGANIZATION_NOT_FOUND",404);
}
async function currentScope(db:PoolClient,org:string,vendorId:string) {
  const v=await db.query([
    "select id,name,normal_max_amount_cents from vendors",
    "where id=$1 and organization_id=$2 for share",
  ].join(" "),[vendorId,org]);
  if(v.rows.length!==1)fail("AUTOPAY_VENDOR_NOT_FOUND",404);
  const p=await db.query([
    "select id,auto_pay_max_amount_cents from policies",
    "where organization_id=$1 and active=true for share",
  ].join(" "),[org]);
  if(p.rows.length!==1)fail("AUTOPAY_POLICY_NOT_UNAMBIGUOUS");
  const d=await db.query([
    "select id,destination from vendor_destinations",
    "where vendor_id=$1 and trusted=true for share",
  ].join(" "),[vendorId]);
  if(d.rows.length!==1)fail("AUTOPAY_TRUSTED_DESTINATION_NOT_UNAMBIGUOUS");
  const trust=await db.query([
    "select c.id from vendor_reverification_cases c",
    "left join vendor_reverification_resolutions r on r.case_id=c.id",
    "where c.organization_id=$1 and c.vendor_id=$2",
    "and (r.id is null or r.resolution='SIMULATED_REVERIFIED') limit 1",
  ].join(" "),[org,vendorId]);
  if(trust.rows.length!==0)fail("AUTOPAY_VENDOR_REVERIFICATION_REQUIRED");
  return {
    vendorName:String(v.rows[0].name),
    vendorLimitCents:Number(v.rows[0].normal_max_amount_cents),
    policyId:String(p.rows[0].id),
    policyLimitCents:Number(p.rows[0].auto_pay_max_amount_cents),
    destinationId:String(d.rows[0].id),
    destination:String(d.rows[0].destination),
  };
}
const explanationValid=(x:string)=>typeof x==="string"&&
  x.trim().length>=16&&x.length<=2000;

/**
 * Prepare a SINGLE inert, exact-scope, time-bounded standing authorization.
 * No payment execution or API client is imported. Only signed-in caller
 * sessions at the route may reach this mutating method.
 */
export async function prepareAutopayMandate(input:{
  organizationId:string;vendorId:string;actorId:string;
  maxAmountCents:number;maxTotalAmountCents:number;
  maxPaymentCount:number;validityDays:number;
}) {
  if(!input.organizationId||!input.vendorId||!input.actorId||
    !Number.isSafeInteger(input.maxAmountCents)||input.maxAmountCents<1||
    input.maxAmountCents>2_000_000_000||
    !Number.isSafeInteger(input.maxTotalAmountCents)||
    input.maxTotalAmountCents<input.maxAmountCents||
    input.maxTotalAmountCents>100_000_000_000||
    !Number.isSafeInteger(input.maxPaymentCount)||
    input.maxPaymentCount<1||input.maxPaymentCount>1000||
    !Number.isSafeInteger(input.validityDays)||
    input.validityDays<1||input.validityDays>30)
    fail("AUTOPAY_PREPARE_INVALID",422);
  const db=await pool.connect();
  try{
    await db.query("begin");
    await lockOrg(db,input.organizationId);
    await assertAdmin(db,input.organizationId,input.actorId);
    const current=await currentScope(db,input.organizationId,input.vendorId);
    if(input.maxAmountCents>current.policyLimitCents||
       input.maxAmountCents>current.vendorLimitCents)
      fail("AUTOPAY_CAP_EXCEEDS_CURRENT_AUTHORITY",422);
    const existing=await db.query([
      "select id from autopay_mandates",
      "where organization_id=$1 and vendor_id=$2 and source='agent_api'",
      "and (active=true or (revoked_at is null",
      "and created_at>now()-interval '15 minutes')) for update",
    ].join(" "),[input.organizationId,input.vendorId]);
    if(existing.rows.length)fail("AUTOPAY_MANDATE_ALREADY_OPEN");
    const id=randomUUID(),now=new Date();
    const createdAt=now.toISOString();
    const expiresAt=new Date(now.valueOf()+input.validityDays*DAY_MS).toISOString();
    const snapshot:MandateSnapshot={
      id,organizationId:input.organizationId,vendorId:input.vendorId,
      destinationId:current.destinationId,destination:current.destination,
      policyId:current.policyId,source:"agent_api",maxAmountCents:input.maxAmountCents,
      maxTotalAmountCents:input.maxTotalAmountCents,maxPaymentCount:input.maxPaymentCount,
      actorId:input.actorId,currentPolicyLimitCents:current.policyLimitCents,
      currentVendorLimitCents:current.vendorLimitCents,createdAt,expiresAt,
    };
    const digest=digestMandate(snapshot);
    await db.query([
      "insert into autopay_mandates",
      "(id,organization_id,vendor_id,destination_id,policy_id,source,",
      "max_amount_cents,max_total_amount_cents,max_payment_count,",
      "approved_by_user_id,approval_digest,active,expires_at,created_at)",
      "values($1,$2,$3,$4,$5,'agent_api',$6,$7,$8,$9,$10,false,$11,$12)",
    ].join(" "),[id,input.organizationId,input.vendorId,current.destinationId,
      current.policyId,input.maxAmountCents,input.maxTotalAmountCents,
      input.maxPaymentCount,input.actorId,digest,expiresAt,createdAt]);
    await db.query("commit");
    return {
      id,organizationId:input.organizationId,vendorId:input.vendorId,
      vendorName:current.vendorName,destination:current.destination,
      maxAmountCents:input.maxAmountCents,
      maxTotalAmountCents:input.maxTotalAmountCents,maxPaymentCount:input.maxPaymentCount,expiresAt,
      digest,confirmationDeadline:new Date(now.valueOf()+TTL_MS).toISOString(),
      state:"PREPARED" as const,active:false,paymentExecuted:false,
    };
  }catch(e){
    await db.query("rollback").catch(()=>undefined);
    if((e as {code?:string}).code==="23505")fail("AUTOPAY_MANDATE_ALREADY_OPEN");
    throw e;
  }finally{db.release()}
}

/**
 * Activation and revocation are separate authenticated decisions.
 * A pre-existing ALLOW or chat message is never an approval.
 */
export async function decideAutopayMandate(input:{
  id:string;actorId:string;expectedDigest:string;
  action:"ACTIVATE"|"REVOKE";confirmation:"ENABLE AUTOPAY"|"REVOKE";
  explanation:string;
}) {
  if(!uuid.test(input.id)||!digest64.test(input.expectedDigest)||
     !explanationValid(input.explanation)||
     (input.action==="ACTIVATE"&&input.confirmation!=="ENABLE AUTOPAY")||
     (input.action==="REVOKE"&&input.confirmation!=="REVOKE")||
     !["ACTIVATE","REVOKE"].includes(input.action))
    fail("AUTOPAY_DECISION_INVALID",422);
  const db=await pool.connect();
  try{
    await db.query("begin");
    const identity=await db.query("select organization_id from autopay_mandates where id=$1",[input.id]);
    if(identity.rows.length!==1)fail("AUTOPAY_MANDATE_NOT_FOUND",404);
    const org=String(identity.rows[0].organization_id);
    await lockOrg(db,org);
    await assertAdmin(db,org,input.actorId);
    const q=await db.query("select * from autopay_mandates where id=$1 and organization_id=$2 for update",
      [input.id,org]);
    if(q.rows.length!==1)fail("AUTOPAY_MANDATE_NOT_FOUND",404);
    const row=q.rows[0];
    if(row.approval_digest!==input.expectedDigest)
      fail("AUTOPAY_SNAPSHOT_CHANGED");
    if(input.action==="ACTIVATE"){
      if(row.active || row.revoked_at!==null)fail("AUTOPAY_NOT_PREPARED");
      if(row.approved_by_user_id!==input.actorId)
        fail("AUTOPAY_PREPARER_CONFIRMATION_REQUIRED",403);
      const now=Date.now(),created=new Date(row.created_at).valueOf();
      if(!Number.isFinite(created)||now-created>=TTL_MS||now<created)
        fail("AUTOPAY_PREPARATION_EXPIRED");
      if(new Date(row.expires_at).valueOf()<=now)
        fail("AUTOPAY_MANDATE_EXPIRED");
      const scope=await currentScope(db,org,String(row.vendor_id));
      if(row.policy_id!==scope.policyId||
         row.destination_id!==scope.destinationId||
         (Number(row.max_total_amount_cents)<Number(row.max_amount_cents))||
         Number(row.max_payment_count)<1||
         Number(row.max_amount_cents)>scope.policyLimitCents||
         Number(row.max_amount_cents)>scope.vendorLimitCents)
        fail("AUTOPAY_SCOPE_CHANGED");
      const latest=digestMandate({
        id:row.id,organizationId:org,vendorId:row.vendor_id,
        destinationId:row.destination_id,destination:scope.destination,
        policyId:row.policy_id,source:"agent_api",
        maxAmountCents:Number(row.max_amount_cents),
        maxTotalAmountCents:Number(row.max_total_amount_cents),
        maxPaymentCount:Number(row.max_payment_count),actorId:row.approved_by_user_id,
        currentPolicyLimitCents:scope.policyLimitCents,
        currentVendorLimitCents:scope.vendorLimitCents,
        createdAt:new Date(row.created_at).toISOString(),
        expiresAt:new Date(row.expires_at).toISOString(),
      });
      if(latest!==row.approval_digest)fail("AUTOPAY_SNAPSHOT_CHANGED");
      const other=await db.query([
        "select id from autopay_mandates",
        "where organization_id=$1 and vendor_id=$2 and source='agent_api'",
        "and active=true for update",
      ].join(" "),[org,row.vendor_id]);
      if(other.rows.length)fail("AUTOPAY_ALREADY_ACTIVE");
      await db.query([
        "insert into autopay_mandate_events",
        "(mandate_id,organization_id,actor_user_id,event_type,mandate_digest,explanation)",
        "values($1,$2,$3,'GRANTED',$4,$5)",
      ].join(" "),[row.id,org,input.actorId,row.approval_digest,input.explanation.trim()]);
      await db.query("update autopay_mandates set active=true where id=$1",[row.id]);
    }else{
      if(!row.active||row.revoked_at!==null)fail("AUTOPAY_NOT_ACTIVE");
      await db.query([
        "insert into autopay_mandate_events",
        "(mandate_id,organization_id,actor_user_id,event_type,mandate_digest,explanation)",
        "values($1,$2,$3,'REVOKED',$4,$5)",
      ].join(" "),[row.id,org,input.actorId,row.approval_digest,input.explanation.trim()]);
      await db.query("update autopay_mandates set active=false,revoked_at=now() where id=$1",[row.id]);
    }
    await db.query("commit");
    return {id:row.id,organizationId:org,
      state:input.action==="ACTIVATE"?"ACTIVE" as const:"REVOKED" as const,
      active:input.action==="ACTIVATE",paymentExecuted:false,
      digest:row.approval_digest};
  }catch(e){
    await db.query("rollback").catch(()=>undefined);
    if((e as {code?:string}).code==="23505")fail("AUTOPAY_DECISION_CONFLICT");
    throw e;
  }finally{db.release()}
}

export async function readAutopayMandateConsole(actorId:string) {
  const [opts,grants]=await Promise.all([
    pool.query([
      "select v.id as vendor_id,v.organization_id,v.name as vendor_name,",
      "v.normal_max_amount_cents,p.auto_pay_max_amount_cents as policy_limit_cents,",
      "d.destination,",
      "p.id as policy_id",
      "from vendors v",
      "join policies p on p.organization_id=v.organization_id and p.active=true",
      "join vendor_destinations d on d.vendor_id=v.id and d.trusted=true",
      "join organization_admin_memberships m",
      "on m.organization_id=v.organization_id and m.user_id=$1",
      "and m.role='ADMIN' and m.active=true",
      "where (select count(*) from policies pp where pp.organization_id=v.organization_id",
      "and pp.active=true)=1",
      "and (select count(*) from vendor_destinations dd where dd.vendor_id=v.id",
      "and dd.trusted=true)=1",
      "and not exists(select 1 from vendor_reverification_cases c",
      "left join vendor_reverification_resolutions r on r.case_id=c.id",
      "where c.organization_id=v.organization_id and c.vendor_id=v.id",
      "and (r.id is null or r.resolution='SIMULATED_REVERIFIED'))",
      "order by v.organization_id,v.name limit 100",
    ].join(" "),[actorId]),
    pool.query([
      "select g.id,g.organization_id,g.vendor_id,v.name as vendor_name,",
      "d.destination,g.policy_id,g.max_amount_cents,g.max_total_amount_cents,",
      "g.max_payment_count,g.approval_digest,",
      "g.approved_by_user_id,g.active,g.expires_at,g.created_at,g.revoked_at,",
      "(select count(*)::int from autopay_budget_reservations br",
      "where br.mandate_id=g.id) as reservation_count,",
      "(select coalesce(sum(br.amount_cents),0)::text from autopay_budget_reservations br",
      "where br.mandate_id=g.id) as reserved_cents,",
      "exists(select 1 from autopay_mandate_events e where e.mandate_id=g.id",
      "and e.event_type='GRANTED') as has_grant",
      "from autopay_mandates g",
      "join vendors v on v.id=g.vendor_id and v.organization_id=g.organization_id",
      "join vendor_destinations d on d.id=g.destination_id and d.vendor_id=g.vendor_id",
      "join organization_admin_memberships m on m.organization_id=g.organization_id",
      "where m.user_id=$1 and m.role='ADMIN' and m.active=true",
      "order by g.created_at desc limit 100",
    ].join(" "),[actorId]),
  ]);
  return {
    vendors:opts.rows.map(r=>({
      id:String(r.vendor_id),organizationId:String(r.organization_id),
      name:String(r.vendor_name),destination:String(r.destination),
      limitCents:Math.min(Number(r.policy_limit_cents),Number(r.normal_max_amount_cents)),
      policyId:String(r.policy_id),
    })),
    mandates:grants.rows.map(r=>({
      id:String(r.id),organizationId:String(r.organization_id),
      vendorId:String(r.vendor_id),vendorName:String(r.vendor_name),
      destination:String(r.destination),policyId:String(r.policy_id),
      maxAmountCents:Number(r.max_amount_cents),
      maxTotalAmountCents:Number(r.max_total_amount_cents),
      maxPaymentCount:Number(r.max_payment_count),
      reservedCents:String(r.reserved_cents),
      reservedCount:Number(r.reservation_count),
      digest:String(r.approval_digest),
      preparedBy:String(r.approved_by_user_id),
      expiresAt:new Date(r.expires_at).toISOString(),
      createdAt:new Date(r.created_at).toISOString(),storedActive:Boolean(r.active),
      revokedAt:r.revoked_at?new Date(r.revoked_at).toISOString():null,
      state:r.revoked_at?"REVOKED" as const:
        (new Date(r.expires_at).valueOf()<=Date.now()?"EXPIRED" as const:
          r.active?"ACTIVE" as const:
          (Date.now()-new Date(r.created_at).valueOf()>=TTL_MS?"PREPARATION_EXPIRED" as const:"PREPARED" as const)),
      active:Boolean(r.active)&&!r.revoked_at&&
        new Date(r.expires_at).valueOf()>Date.now()&&Boolean(r.has_grant),
    })),
  };
}
