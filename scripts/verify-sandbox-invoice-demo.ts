import {loadLocalEnv} from "../src/env/load";
import {
  assertSandboxInvoiceReviewedBinding,validateSandboxInvoiceDemoEnvironment,
  SandboxInvoiceDemoError,type SandboxInvoiceDemoMode,
} from "../src/demo/sandbox-invoice-proof";
import {DEMO_ORG_ID} from "../src/demo/scenarios";
import {SANDBOX_INVOICE} from "../src/demo/sandbox-payout-constants";
import {pool} from "../src/db/pool";
import {consumeApprovedInvoiceBinding} from "../src/authority/consume-invoice-binding";
import {executeAuthorizedPayment} from "../src/payments/executor/service";
import {postgresExecutionStore} from "../src/payments/executor/postgres-store";
import {PayPalPayoutsClient} from "../src/payments/paypal/client";
import {makeSinglePayoutPostFence,requireSingleGateHCount}
  from "../src/gate-h/sandbox-proof";

loadLocalEnv();
const mode=process.argv[2] as SandboxInvoiceDemoMode;
if(!["preflight","submit","verify"].includes(mode))
  throw new SandboxInvoiceDemoError("SANDBOX_INVOICE_MODE_PRECHECK_REQUIRED");
const cfg=validateSandboxInvoiceDemoEnvironment(process.env,mode);
const bindingId=cfg.SANDBOX_INVOICE_BINDING_ID;

async function getReviewed(){
  const r=await pool.query([
    "select b.id,b.organization_id,b.vendor_id,b.invoice_number,b.amount_cents,",
    "b.currency,b.authorization_status,b.linked_payment_request_id,",
    "b.artifact_sha256,b.tuple_sha256,b.approval_actor,",
    "vd.destination as receiver,c.source_kind,c.verification_status,",
    "a.method as origin_method,ch.kind as origin_channel_kind,",
    "(ch.created_at<art.created_at) as channel_predates_artifact",
    "from payment_authority_bindings b",
    "join invoice_verified_claim_sets c on c.id=b.verified_claim_set_id",
    "and c.organization_id=b.organization_id and c.artifact_id=b.artifact_id",
    "join invoice_origin_attestations a on a.id=b.origin_attestation_id",
    "and a.organization_id=b.organization_id and a.artifact_id=b.artifact_id",
    "join vendor_origin_channels ch on ch.id=a.origin_channel_id",
    "and ch.organization_id=b.organization_id and ch.vendor_id=b.vendor_id",
    "join invoice_artifacts art on art.id=b.artifact_id",
    "and art.organization_id=b.organization_id",
    "join vendor_destinations vd on vd.id=b.destination_id and vd.vendor_id=b.vendor_id",
    "where b.id=$1 and b.organization_id=$2",
  ].join(" "),[bindingId,DEMO_ORG_ID]);
  if(r.rows.length!==1)throw new SandboxInvoiceDemoError("SANDBOX_INVOICE_APPROVAL_NOT_FOUND");
  const b=r.rows[0];
  const label=assertSandboxInvoiceReviewedBinding({
    organizationId:b.organization_id,vendorId:b.vendor_id,
    invoiceNumber:b.invoice_number,amountCents:Number(b.amount_cents),
    currency:b.currency,receiver:b.receiver,
    artifactSha256:b.artifact_sha256,tupleSha256:b.tuple_sha256,
    authorizationStatus:b.authorization_status,
    linkedPaymentRequestId:b.linked_payment_request_id??null,
    sourceKind:b.source_kind,verificationStatus:b.verification_status,
    originMethod:b.origin_method,originChannelKind:b.origin_channel_kind,
    channelPredatesArtifact:b.channel_predates_artifact===true,
    approvalActor:b.approval_actor??null,
  },{
    receiver:cfg.DEMO_PAYPAL_RECEIVER_EMAIL,
    artifactSha256:cfg.SANDBOX_INVOICE_ARTIFACT_SHA256,
    tupleSha256:cfg.SANDBOX_INVOICE_TUPLE_SHA256,
  });
  return {binding:b,label};
}
async function countInvoiceRequests(){
  const r=await pool.query([
    "select count(*)::int as n from payment_requests",
    "where organization_id=$1 and invoice_number=$2 and source='verified_invoice'",
  ].join(" "),[DEMO_ORG_ID,SANDBOX_INVOICE]);
  return requireSingleGateHCount(r.rows,"SANDBOX_INVOICE_REQUEST_COUNT_MISSING");
}
async function negativeControl(){
  const r=await pool.query([
    "select count(*)::int as n from payment_executions x",
    "join payment_requests p on p.id=x.payment_request_id",
    "where p.organization_id=$1 and p.invoice_number=any($2::text[])",
  ].join(" "),[DEMO_ORG_ID,["DEMO-ANOMALY-2026","DEMO-SUBSTITUTION-2026"]]);
  if(requireSingleGateHCount(r.rows,"SANDBOX_INVOICE_NEGATIVE_COUNT_UNKNOWN")!==0)
    throw new SandboxInvoiceDemoError("SANDBOX_NEGATIVE_CASE_WAS_PAID");
}
async function proof(){
  const r=await pool.query([
    "select p.id as request_id,p.logical_payment_id,p.source,p.invoice_number,",
    "p.amount_cents,p.currency,e.status,e.paypal_payout_batch_id,",
    "e.paypal_payout_item_id,",
    "count(ev.id) filter(where ev.event_type='PAYPAL_SUBMITTED')::int as posts,",
    "count(ev.id) filter(where ev.event_type='PAYPAL_WEBHOOK_VERIFIED')::int as webhooks,",
    "count(ev.id) filter(where ev.event_type='PAYPAL_RECONCILED')::int as reconciled,",
    "count(ev.id) filter(where ev.event_type='PAYPAL_WEBHOOK_RECONCILE_FAILED')::int as webhook_failures",
    "from payment_requests p join payment_executions e on e.payment_request_id=p.id",
    "left join payment_execution_events ev on ev.logical_payment_id=p.logical_payment_id",
    "where p.organization_id=$1 and p.authority_binding_id=$2",
    "group by p.id,p.logical_payment_id,p.source,p.invoice_number,",
    "p.amount_cents,p.currency,e.status,e.paypal_payout_batch_id,e.paypal_payout_item_id",
  ].join(" "),[DEMO_ORG_ID,bindingId]);
  if(r.rows.length!==1)throw new SandboxInvoiceDemoError("SANDBOX_INVOICE_EXECUTION_MISSING");
  const row=r.rows[0];
  if(row.source!=="verified_invoice"||row.invoice_number!==SANDBOX_INVOICE||
    Number(row.amount_cents)!==101||row.currency!=="USD")
    throw new SandboxInvoiceDemoError("SANDBOX_INVOICE_EXECUTION_TUPLE_MISMATCH");
  return {
    requestId:row.request_id,logicalPaymentId:row.logical_payment_id,
    status:row.status,batchId:row.paypal_payout_batch_id,itemId:row.paypal_payout_item_id,
    submittedEvents:Number(row.posts),verifiedWebhookEvents:Number(row.webhooks),
    reconciledEvents:Number(row.reconciled),webhookFailures:Number(row.webhook_failures),
  };
}

try{
  await negativeControl();
  if(mode==="preflight"){
    const reviewed=await getReviewed();
    if(await countInvoiceRequests()!==0)
      throw new SandboxInvoiceDemoError("SANDBOX_INVOICE_ALREADY_CONSUMED");
    console.log(JSON.stringify({
      lane:"FICTIONAL_INVOICE_TO_REAL_PAYPAL_SANDBOX",
      stage:"READY_FOR_OWNER_SANDBOX_TEST_APPROVAL",
      identity:{organizationId:DEMO_ORG_ID,
        invoiceNumber:SANDBOX_INVOICE,amountCents:101,currency:"USD"},
      artifactSha256:reviewed.binding.artifact_sha256,
      tupleSha256:reviewed.binding.tuple_sha256,
      evidence:"PDF_TEXT + SIMULATED_OUT_OF_BAND + EXACT_HUMAN_T4",
      issuerRealWorldAuthenticated:false,paymentSubmitted:false,
    },null,2));
  }else if(mode==="submit"){
    const reviewed=await getReviewed();
    if(await countInvoiceRequests()!==0)
      throw new SandboxInvoiceDemoError("SANDBOX_INVOICE_ALREADY_CONSUMED");
    const consumed=await consumeApprovedInvoiceBinding(bindingId);
    if(consumed.replayed||consumed.decision.outcome!=="ALLOW")
      throw new SandboxInvoiceDemoError("SANDBOX_INVOICE_NOT_FRESH");
    const fence=makeSinglePayoutPostFence(fetch);
    const gateway=new PayPalPayoutsClient({
      baseUrl:"https://api-m.sandbox.paypal.com",
      clientId:process.env.PAYPAL_CLIENT_ID!,
      clientSecret:process.env.PAYPAL_CLIENT_SECRET!,
      webhookId:process.env.PAYPAL_WEBHOOK_ID!,
      fetchImpl:fence.outbound,
    });
    const result=await executeAuthorizedPayment(consumed.requestId,{
      store:postgresExecutionStore,gateway,
    });
    const output={
      lane:"FICTIONAL_INVOICE_TO_REAL_PAYPAL_SANDBOX",
      stage:"SUBMITTED_NOT_YET_RECONCILED",
      issuerRealWorldAuthenticated:false,
      bindingId:reviewed.binding.id,requestId:consumed.requestId,
      payoutPosts:fence.getPostCount(),
      status:result.status,
      batchId:result.paypalPayoutBatchId,
      itemId:result.paypalPayoutItemId,
    };
    console.log(JSON.stringify(output,null,2));
    if(fence.getPostCount()!==1 || !result.paypalPayoutBatchId)
      throw new SandboxInvoiceDemoError("SANDBOX_INVOICE_ONE_POST_NOT_CONFIRMED");
  }else{
    const r=await proof();
    const reconciled=r.batchId && r.itemId &&
      r.submittedEvents===1 && r.verifiedWebhookEvents>=1 &&
      r.reconciledEvents>=1 && r.webhookFailures===0;
    console.log(JSON.stringify({
      lane:"FICTIONAL_INVOICE_TO_REAL_PAYPAL_SANDBOX",
      stage:reconciled?"VERIFIED_PROVIDER_AND_WEBHOOK":"INCOMPLETE_RECONCILIATION",
      issuerRealWorldAuthenticated:false,...r,
    },null,2));
    if(!reconciled)throw new SandboxInvoiceDemoError("SANDBOX_INVOICE_RECONCILIATION_INCOMPLETE");
  }
}finally{await pool.end();}
