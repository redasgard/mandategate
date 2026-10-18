import {pool} from "@/src/db/pool";
import {submitCanonicalPaymentRequest} from "@/src/payments/submit";
import {
 DEMO_ORG_ID,DEMO_VENDOR_ID,DEMO_CASES,DEMO_TRUSTED_DESTINATION,
 demoKeys,demoRequests,demoPreviewEnabled,
} from "./scenarios";

export class DemoScenarioError extends Error {
  constructor(public readonly code:string, public readonly httpStatus:number=409) {
    super(code);this.name="DemoScenarioError";
  }
}
const fail=(code:string,httpStatus=409):never=>{throw new DemoScenarioError(code,httpStatus);};
export function assertDemoPreview(){
  if(!demoPreviewEnabled(process.env))fail("DEMO_PREVIEW_DISABLED",404);
}
async function authorize(adminUserId:string){
  assertDemoPreview();
  const result=await pool.query(
    "select 1 from organization_admin_memberships where organization_id=$1 and user_id=$2 and role='ADMIN' and active=true limit 1",
    [DEMO_ORG_ID,adminUserId]);
  if(result.rows.length!==1)fail("DEMO_ADMIN_NOT_FOUND",404);
}
export async function listDemoScenarios(adminUserId:string) {
  await authorize(adminUserId);
  const rows=await pool.query([
    "select pr.id,pr.idempotency_key,pr.invoice_number,pr.source,pr.status,",
    "pd.outcome,pd.reason_codes,(pe.id is not null) as has_execution",
    "from payment_requests pr",
    "join payment_decisions pd on pd.payment_request_id=pr.id",
    "left join payment_executions pe on pe.payment_request_id=pr.id",
    "where pr.organization_id=$1 and pr.idempotency_key=any($2::text[])",
  ].join(" "),[DEMO_ORG_ID,demoKeys]);
  const byKey=new Map(rows.rows.map(r=>[r.idempotency_key,r]));
  return DEMO_CASES.map(def=>{
    const row=byKey.get("mandategate-p0-synthetic-20261015-"+def.id+"-v1");
    return {
      id:def.id,title:def.title,invoiceNumber:def.invoiceNumber,
      amountCents:def.amountCents,explanation:def.explanation,
      expectedOutcome:def.expectedOutcome,
      requestId:row?.source==="demo_fixture"?String(row.id):null,
      outcome:row?.source==="demo_fixture"?String(row.outcome):null,
      status:row?.source==="demo_fixture"?String(row.status):null,
      reasonCodes:row?.source==="demo_fixture"?row.reason_codes as string[]:[],
      hasExecution:Boolean(row?.has_execution),
    };
  });
}
export async function createDemoScenarios(adminUserId:string) {
  await authorize(adminUserId);
  const prior=await pool.query(
    "select idempotency_key,source from payment_requests where organization_id=$1 and idempotency_key=any($2::text[])",
    [DEMO_ORG_ID,demoKeys]);
  if(prior.rows.some(r=>r.source!=="demo_fixture"))
    fail("DEMO_IDEMPOTENCY_OWNED_BY_OTHER_SOURCE");
  const allExisting=prior.rows.length===DEMO_CASES.length;

  // Historical AP import changes deterministic risk outcomes. Never pretend the
  // fixed three-case demonstration is truthful if this fixture has been modified.
  const history=await pool.query("select count(*)::int as n from ap_imports where organization_id=$1",[DEMO_ORG_ID]);
  if(history.rows[0].n!==0 && !allExisting)fail("DEMO_HISTORY_NOT_EMPTY");
  const vendor=await pool.query([
    "select d.destination from vendor_destinations d",
    "join vendors v on v.id=d.vendor_id",
    "where v.id=$1 and v.organization_id=$2 and d.trusted=true",
    "order by d.id limit 2",
  ].join(" "),[DEMO_VENDOR_ID,DEMO_ORG_ID]);
  if(vendor.rows.length!==1||vendor.rows[0].destination!==DEMO_TRUSTED_DESTINATION)
    fail("DEMO_TRUSTED_RECEIVER_CHANGED");
  const limits=await pool.query([
    "select v.normal_max_amount_cents,p.auto_pay_max_amount_cents",
    "from vendors v",
    "join lateral (select auto_pay_max_amount_cents from policies",
    "  where organization_id=v.organization_id and active=true",
    "  order by created_at desc,id desc limit 1) p on true",
    "where v.id=$1 and v.organization_id=$2",
  ].join(" "),[DEMO_VENDOR_ID,DEMO_ORG_ID]);
  if(limits.rows.length!==1||Number(limits.rows[0].normal_max_amount_cents)!==250000||
     Number(limits.rows[0].auto_pay_max_amount_cents)!==300000)
    fail("DEMO_POLICY_CHANGED");
  // Enforce the same organization-wide zero-execution invariant as the judge
  // page. Existing fixtures do not waive it: any payout row must halt replay
  // before submitCanonicalPaymentRequest can touch canonical request state.
  const existingExecutions=await pool.query([
    "select (select count(*)::int from payment_executions e",
    "join payment_requests pr on pr.id=e.payment_request_id",
    "where pr.organization_id=$1) as n,",
    "exists (select 1 from organization_admin_memberships m",
    "where m.organization_id=$1 and m.user_id=$2",
    "and m.role='ADMIN' and m.active=true) as admin_authorized",
  ].join(" "),[DEMO_ORG_ID,adminUserId]);
  const current=existingExecutions.rows.length===1
    ? existingExecutions.rows[0]:null;
  const authorized:unknown=current?.admin_authorized;
  if(authorized===false)fail("DEMO_ADMIN_NOT_FOUND",404);
  if(authorized!==true)fail("DEMO_EXECUTION_COUNT_INVALID",503);
  const executionCount:unknown=current?.n;
  if(typeof executionCount!=="number" ||
     !Number.isSafeInteger(executionCount) || executionCount<0)
    fail("DEMO_EXECUTION_COUNT_INVALID",503);
  if(executionCount!==0)fail("DEMO_REQUIRES_ZERO_EXECUTIONS");

  for(const input of demoRequests(String(vendor.rows[0].destination))){
    const {expectedOutcome,...submission}=input;
    const created=await submitCanonicalPaymentRequest(submission);
    if(created.paymentExecuted!==false || created.decision.outcome!==expectedOutcome)
      fail("DEMO_DECISION_UNEXPECTED");
  }
  const result=await listDemoScenarios(adminUserId);
  if(result.some(x=>!x.requestId||x.outcome!==x.expectedOutcome||x.hasExecution))
    fail("DEMO_POSTCONDITION_FAILED");
  return result;
}
