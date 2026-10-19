import {createHash} from "node:crypto";
import {pool} from "../db/pool";
import type {PoolClient} from "pg";

export type AutopayTuple={
  requestId:string;logicalPaymentId:string;organizationId:string;
  vendorId:string;invoiceNumber:string;amountCents:number;currency:string;
  requestedDestination:string;idempotencyKey:string;
  mandateId:string;grantDigest:string;destinationId:string;policyId:string;
};
export function digestAutopayTuple(t:AutopayTuple):string {
  return createHash("sha256").update("mandategate/autopay-request/v1\0"+
    JSON.stringify([
      t.requestId,t.logicalPaymentId,t.organizationId,t.vendorId,
      t.invoiceNumber,t.amountCents,t.currency,t.requestedDestination,
      t.idempotencyKey,t.mandateId,t.grantDigest,t.destinationId,t.policyId,
    ])).digest("hex");
}

export type AutopayBindingState={
  requestId:string;logicalPaymentId:string;mandateId:string;grantDigest:string;
  amountCents:number;remainingCents:string;remainingPayments:number;
  existingReservation:boolean;
};
export class AutopayBudgetError extends Error {
  constructor(public readonly code:string){
    super(code);this.name="AutopayBudgetError";
  }
}

const validationSql=[
  "select b.payment_request_id,b.organization_id,b.vendor_id,b.mandate_id,",
  "b.destination_id,b.policy_id,b.amount_cents,b.currency,b.grant_digest,",
  "b.request_tuple_sha256,",
  "pr.logical_payment_id,pr.invoice_number,pr.requested_destination,",
  "pr.idempotency_key,",
  "g.max_amount_cents,g.max_total_amount_cents,g.max_payment_count,",
  "coalesce(bud.total,0)::text as reserved_cents,",
  "coalesce(bud.n,0)::int as reserved_count,",
  "exists(select 1 from autopay_budget_reservations ar",
  "where ar.payment_request_id=pr.id and ar.mandate_id=g.id) as already_reserved",
  "from autopay_payment_bindings b",
  "join payment_requests pr on pr.id=b.payment_request_id",
  "and pr.organization_id=b.organization_id and pr.vendor_id=b.vendor_id",
  "join payment_decisions pd on pd.payment_request_id=pr.id",
  "join autopay_mandates g on g.id=b.mandate_id",
  "and g.organization_id=b.organization_id and g.vendor_id=b.vendor_id",
  "and g.destination_id=b.destination_id and g.policy_id=b.policy_id",
  "join autopay_mandate_events ge on ge.id=b.grant_event_id",
  "and ge.mandate_id=g.id and ge.event_type='GRANTED'",
  "and ge.organization_id=g.organization_id and ge.mandate_digest=g.approval_digest",
  "and ge.actor_user_id=g.approved_by_user_id",
  "join organization_admin_memberships m",
  "on m.organization_id=g.organization_id and m.user_id=g.approved_by_user_id",
  "and m.role='ADMIN' and m.active=true",
  "join policies p on p.id=g.policy_id and p.organization_id=g.organization_id",
  "and p.active=true",
  "join vendors v on v.id=g.vendor_id and v.organization_id=g.organization_id",
  "join vendor_destinations d on d.id=g.destination_id",
  "and d.vendor_id=g.vendor_id and d.trusted=true",
  "left join lateral (select count(*)::int as n,sum(amount_cents)::numeric as total",
  "from autopay_budget_reservations rb where rb.mandate_id=g.id) bud on true",
  "where pr.id=$1 and pr.status='ALLOWED' and pd.outcome='ALLOW'",
  "and pr.source='agent_api' and pr.currency='USD'",
  "and b.currency='USD' and b.amount_cents=pr.amount_cents",
  "and b.grant_digest=g.approval_digest",
  "and g.active=true and g.revoked_at is null and g.expires_at>now()",
  "and g.max_total_amount_cents>=pr.amount_cents and g.max_payment_count>0",
  "and pr.amount_cents<=g.max_amount_cents",
  "and pr.amount_cents<=p.auto_pay_max_amount_cents",
  "and pr.amount_cents<=v.normal_max_amount_cents",
  "and pr.requested_destination=d.destination",
  "and ge.created_at<pr.created_at",
  "and (select count(*) from policies cp",
  "where cp.organization_id=pr.organization_id and cp.active=true)=1",
  "and (select count(*) from vendor_destinations cd",
  "where cd.vendor_id=pr.vendor_id and cd.trusted=true)=1",
  "and not exists(select 1 from vendor_reverification_cases vc",
  "left join vendor_reverification_resolutions vr on vr.case_id=vc.id",
  "where vc.organization_id=pr.organization_id and vc.vendor_id=pr.vendor_id",
  "and (vr.id is null or vr.resolution='SIMULATED_REVERIFIED'))",
  "and not exists(select 1 from payment_executions pe",
  "where pe.logical_payment_id=pr.logical_payment_id)",
].join(" ");

async function inspect(db:PoolClient,requestId:string):Promise<AutopayBindingState|null> {
  const results=await db.query(validationSql,[requestId]);
  if(results.rows.length!==1)return null;
  const x=results.rows[0];
  if(!x.idempotency_key || typeof x.idempotency_key!=="string")return null;
  const digest=digestAutopayTuple({
    requestId:String(x.payment_request_id),
    logicalPaymentId:String(x.logical_payment_id),
    organizationId:String(x.organization_id),vendorId:String(x.vendor_id),
    invoiceNumber:String(x.invoice_number),amountCents:Number(x.amount_cents),
    currency:String(x.currency),requestedDestination:String(x.requested_destination),
    idempotencyKey:String(x.idempotency_key),
    mandateId:String(x.mandate_id),grantDigest:String(x.grant_digest),
    destinationId:String(x.destination_id),policyId:String(x.policy_id),
  });
  if(digest!==x.request_tuple_sha256)return null;
  const amountCents=Number(x.amount_cents);
  const maxTotal=BigInt(x.max_total_amount_cents);
  const reserved=BigInt(x.reserved_cents);
  const remaining=maxTotal-reserved;
  const remainingPayments=Number(x.max_payment_count)-Number(x.reserved_count);
  if(amountCents<1||!Number.isSafeInteger(amountCents))return null;
  return {
    requestId:String(x.payment_request_id),
    logicalPaymentId:String(x.logical_payment_id),
    mandateId:String(x.mandate_id),grantDigest:String(x.grant_digest),
    amountCents,remainingCents:remaining.toString(),remainingPayments,
    existingReservation:Boolean(x.already_reserved),
  };
}

/** Non-mutating preview for CI, audit and the later guarded queue. */
export async function inspectAutopayBinding(requestId:string):
  Promise<AutopayBindingState|null>{
  const db=await pool.connect();
  try{return await inspect(db,requestId)}
  finally{db.release()}
}

/**
 * Durable, conservative, lifetime authorization reservation.
 * Serialized on the exact mandate row, so concurrent workers cannot exceed
 * the count/sum ceilings. Never release automatically on unknown PayPal state.
 * An existing reservation is returned identically, never double counted.
 * This reserves ACCOUNTING authority; it does not submit a payout.
 */
export async function reserveAutopayBudget(requestId:string):
  Promise<AutopayBindingState>{
  if(typeof requestId!=="string"||requestId.length>128||!requestId)
    throw new AutopayBudgetError("AUTOPAY_REQUEST_INVALID");
  const db=await pool.connect();
  try{
    await db.query("begin");
    const identity=await db.query(
      "select mandate_id from autopay_payment_bindings where payment_request_id=$1",
      [requestId]);
    if(identity.rows.length!==1)throw new AutopayBudgetError("AUTOPAY_REQUEST_NOT_BOUND");
    // FOR UPDATE enforces a strict single writer even across independent
    // containers/processes. Revoke and another reservation must wait.
    const mandate=await db.query(
      "select id from autopay_mandates where id=$1 for update",
      [identity.rows[0].mandate_id]);
    if(mandate.rows.length!==1)throw new AutopayBudgetError("AUTOPAY_MANDATE_NOT_FOUND");
    const current=await inspect(db,requestId);
    if(!current)throw new AutopayBudgetError("AUTOPAY_BINDING_STALE");
    if(!current.existingReservation) {
      if(current.remainingPayments<=0||
         BigInt(current.remainingCents)<BigInt(current.amountCents))
        throw new AutopayBudgetError("AUTOPAY_BUDGET_EXHAUSTED");
      await db.query([
        "insert into autopay_budget_reservations",
        "(payment_request_id,mandate_id,amount_cents) values($1,$2,$3)",
      ].join(" "),[current.requestId,current.mandateId,current.amountCents]);
    }
    const next=await inspect(db,requestId);
    if(!next||!next.existingReservation)
      throw new AutopayBudgetError("AUTOPAY_RESERVATION_NOT_VERIFIED");
    await db.query("commit");
    return next;
  }catch(e){
    await db.query("rollback").catch(()=>undefined);
    const message=e instanceof Error?e.message:"AUTOPAY_RESERVATION_ERROR";
    if(message.includes("AUTOPAY_BUDGET_EXHAUSTED"))
      throw new AutopayBudgetError("AUTOPAY_BUDGET_EXHAUSTED");
    throw e;
  }finally{db.release()}
}
