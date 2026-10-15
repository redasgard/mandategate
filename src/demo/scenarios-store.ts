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

  // Historical AP import changes deterministic risk outcomes. Never pretend the
  // fixed three-case demonstration is truthful if this fixture has been modified.
  const history=await pool.query("select count(*)::int as n from ap_imports where organization_id=$1",[DEMO_ORG_ID]);
  if(history.rows[0].n!==0)fail("DEMO_HISTORY_NOT_EMPTY");
  const vendor=await pool.query([
    "select d.destination from vendor_destinations d",
    "join vendors v on v.id=d.vendor_id",
    "where v.id=$1 and v.organization_id=$2 and d.trusted=true",
    "order by d.id limit 2",
  ].join(" "),[DEMO_VENDOR_ID,DEMO_ORG_ID]);
  if(vendor.rows.length!==1||vendor.rows[0].destination!==DEMO_TRUSTED_DESTINATION)
    fail("DEMO_TRUSTED_RECEIVER_CHANGED");
  const existingExecutions=await pool.query("select count(*)::int as n from payment_executions");
  if(existingExecutions.rows[0].n!==0)fail("DEMO_REQUIRES_ZERO_EXECUTIONS");

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
