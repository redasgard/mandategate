import { loadLocalEnv } from "../src/env/load";
import {
  assertNegativeCaseResult,checkBoundedSandboxPayout,
  GateHSandboxError,makeSinglePayoutPostFence,
  requireSingleGateHCount,validateGateHSandboxEnvironment,
} from "../src/gate-h/sandbox-proof";
import { pool } from "../src/db/pool";
import { prepareInvoicePaymentProposal } from "../src/authority/payment-proposal";
import { consumeApprovedInvoiceBinding } from "../src/authority/consume-invoice-binding";
import { executeAuthorizedPayment } from "../src/payments/executor/service";
import { postgresExecutionStore } from "../src/payments/executor/postgres-store";
import { PayPalPayoutsClient } from "../src/payments/paypal/client";
import { ExperientialInvoiceVisionGateway } from "../src/ai/gateway/experiential-vision";
import { assertActualGateHGlmObservation } from "../src/gate-h/glm-evidence";

loadLocalEnv();
const mode=process.argv[2];
if(mode!=="preflight" && mode!=="submit" && mode!=="verify")
  throw new GateHSandboxError("GATE_H_MODE_REQUIRED:preflight|submit|verify");
const config=validateGateHSandboxEnvironment(process.env,mode);
const org=config.GATE_H_ORGANIZATION_ID;
const bindingId=config.GATE_H_ALLOW_BINDING_ID;
const negativeIds=[config.GATE_H_ESCALATE_ARTIFACT_ID,config.GATE_H_DENY_ARTIFACT_ID];

async function getBound(){
  const r=await pool.query([
    "select b.id,b.organization_id,b.authorization_status,b.amount_cents,",
    "b.currency,b.artifact_sha256,b.tuple_sha256,b.approval_actor,",
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
  ].join(" "),[bindingId,org]);
  if(r.rows.length!==1)throw new GateHSandboxError("GATE_H_ALLOW_BINDING_NOT_FOUND");
  const b=r.rows[0];
  checkBoundedSandboxPayout({
    amountCents:b.amount_cents,currency:b.currency,receiver:b.receiver,
    artifactSha256:b.artifact_sha256,tupleSha256:b.tuple_sha256,
    authorizationStatus:b.authorization_status,sourceKind:b.source_kind,
    verificationStatus:b.verification_status,originMethod:b.origin_method,
    originChannelKind:b.origin_channel_kind,
    channelPredatesArtifact:b.channel_predates_artifact,
    approvalActor:b.approval_actor,
  },{
    receiver:config.DEMO_PAYPAL_RECEIVER_EMAIL,
    artifactSha256:config.GATE_H_ALLOW_ARTIFACT_SHA256,
    tupleSha256:config.GATE_H_ALLOW_TUPLE_SHA256,
  });
  return b;
}
async function countOrgExecutions(){
  const r=await pool.query([
    "select count(*)::int as n from payment_executions e",
    "join payment_requests pr on pr.id=e.payment_request_id",
    "where pr.organization_id=$1",
  ].join(" "),[org]);
  return requireSingleGateHCount(r.rows,"GATE_H_EXECUTION_COUNT_UNAVAILABLE");
}
async function assertNoNegativePayments(){
  const result=await pool.query([
    "select count(*)::int as n from payment_requests pr",
    "join payment_authority_bindings b on b.id=pr.authority_binding_id",
    "where b.organization_id=$1 and b.artifact_id=any($2::text[])",
  ].join(" "),[org,negativeIds]);
  if(requireSingleGateHCount(result.rows,"GATE_H_NEGATIVE_REQUEST_COUNT_UNAVAILABLE")!==0)
    throw new GateHSandboxError("GATE_H_NEGATIVE_PAYMENT_REQUEST_EXISTS");
}
async function assertNegativeArtifactsOwned(){
  const r=await pool.query(
    "select count(*)::int as n from invoice_artifacts where organization_id=$1 and id=any($2::text[])",
    [org,negativeIds],
  );
  if(requireSingleGateHCount(r.rows,"GATE_H_NEGATIVE_ARTIFACT_COUNT_UNAVAILABLE")!==2)
    throw new GateHSandboxError("GATE_H_NEGATIVE_ARTIFACTS_NOT_OWNED");
}
async function outcomeChecks(){
  const before=await countOrgExecutions();
  await assertNoNegativePayments();
  const results=[];
  const specs=[
    {
      artifactId:config.GATE_H_ESCALATE_ARTIFACT_ID,
      claimSetId:config.GATE_H_ESCALATE_CLAIM_SET_ID,
      attestationId:config.GATE_H_ESCALATE_ATTESTATION_ID,
      expected:"ESCALATE" as const,
      requiredReason:"ISSUER_ORIGIN_UNVERIFIED_OR_EXPIRED",
    },
    {
      artifactId:config.GATE_H_DENY_ARTIFACT_ID,
      claimSetId:config.GATE_H_DENY_CLAIM_SET_ID,
      attestationId:config.GATE_H_DENY_ATTESTATION_ID,
      expected:"DENY" as const,
      requiredReason:"INVOICE_DESTINATION_SUBSTITUTION",
    },
  ];
  for(const c of specs){
    const proposal=await prepareInvoicePaymentProposal({
      organizationId:org,artifactId:c.artifactId,
      claimSetId:c.claimSetId,attestationId:c.attestationId,
    });
    assertNegativeCaseResult(proposal,c.expected);
    if(!proposal.reasonCodes.includes(c.requiredReason))
      throw new GateHSandboxError("GATE_H_NEGATIVE_REASON_NOT_CAUSAL");
    results.push({
      artifactId:c.artifactId,
      outcome:proposal.outcome,reasonCodes:proposal.reasonCodes,
      traceId:proposal.traceId,payoutPosts:0,
    });
  }
  await assertNoNegativePayments();
  if(await countOrgExecutions()!==before)
    throw new GateHSandboxError("GATE_H_NEGATIVE_EXECUTION_SIDE_EFFECT");
  return results;
}
async function metrics(){
  const result=await pool.query([
    "select pr.id as request_id,pr.logical_payment_id,e.status,",
    "e.paypal_payout_batch_id,e.paypal_payout_item_id,",
    "count(*) filter (where ev.event_type='PAYPAL_SUBMITTED')::int as submitted_events,",
    "count(*) filter (where ev.event_type='PAYPAL_WEBHOOK_VERIFIED')::int as verified_webhooks,",
    "count(*) filter (where ev.event_type='PAYPAL_RECONCILED')::int as reconciled_events,",
    "count(*) filter (where ev.event_type='PAYPAL_WEBHOOK_RECONCILE_FAILED')::int as webhook_failures",
    "from payment_authority_bindings b",
    "join payment_requests pr on pr.id=b.linked_payment_request_id",
    "join payment_executions e on e.payment_request_id=pr.id",
    "left join payment_execution_events ev on ev.logical_payment_id=pr.logical_payment_id",
    "where b.id=$1 and b.organization_id=$2",
    "group by pr.id,pr.logical_payment_id,e.status,",
    "e.paypal_payout_batch_id,e.paypal_payout_item_id",
  ].join(" "),[bindingId,org]);
  if(result.rows.length!==1)
    throw new GateHSandboxError("GATE_H_ALLOW_PAYOUT_PROOF_MISSING");
  return result.rows[0];
}
try{
  await assertNegativeArtifactsOwned();
  if(mode==="preflight"){
    const b=await getBound();
    await assertNoNegativePayments();
    console.log(JSON.stringify({
      gate:"H",mode:"preflight",result:"READY_FOR_EXTERNAL_EVIDENCE_CHECK",
      bindingId:b.id,tupleSha256:b.tuple_sha256,
      warnings:[
        "This is not evidence of real vendor callback or GLM serving route",
        "No payout is permitted by preflight",
        "Staging database isolation is operator-attested, not runtime-enforced",
      ],
      payoutPosts:0,
    },null,2));
  }else if(mode==="submit"){
    const b=await getBound();
    await assertActualGateHGlmObservation({
      organizationId: org,
      artifactId: process.env.GATE_H_ACTUAL_GLM_ARTIFACT_ID!,
      gatewayRequestId: process.env.GATE_H_ACTUAL_GLM_GATEWAY_REQUEST_ID!,
    });
    // Recheck actual provider account policy immediately before any payment
    // movement. A historical mock or old GLM request ID is insufficient.
    await new ExperientialInvoiceVisionGateway().verifyPrivacyAndModel();
    // All three cases are now fixed to exactly one organization and approved
    // SHA identities. Negative controls are evaluated before any PayPal client
    // exists or any approved binding is consumed.
    const negativeResults=await outcomeChecks();
    const prior=await pool.query([
      "select count(*)::int as n from payment_executions e",
      "join payment_requests pr on pr.id=e.payment_request_id",
      "where pr.authority_binding_id=$1",
    ].join(" "),[bindingId]);
    if(requireSingleGateHCount(prior.rows,"GATE_H_PRIOR_PAYOUT_COUNT_UNAVAILABLE")!==0)
      throw new GateHSandboxError("GATE_H_ALLOW_PAYOUT_ALREADY_ATTEMPTED");
    const claimed=await consumeApprovedInvoiceBinding(bindingId);
    if(claimed.replayed || claimed.decision.outcome!=="ALLOW")
      throw new GateHSandboxError("GATE_H_ALLOW_BINDING_NOT_FRESH");
    const fence=makeSinglePayoutPostFence(fetch);
    const paypal=new PayPalPayoutsClient({
      baseUrl:"https://api-m.sandbox.paypal.com",
      clientId:process.env.PAYPAL_CLIENT_ID!,
      clientSecret:process.env.PAYPAL_CLIENT_SECRET!,
      webhookId:process.env.PAYPAL_WEBHOOK_ID!,
      fetchImpl:fence.outbound,
    });
    const result=await executeAuthorizedPayment(claimed.requestId,{
      store:postgresExecutionStore,gateway:paypal,
    });
    if(fence.getPostCount()!==1)
      throw new GateHSandboxError("GATE_H_EXACTLY_ONE_OUTBOUND_PAYOUT_REQUIRED");
    const evidence=await metrics();
    console.log(JSON.stringify({
      gate:"H",mode:"submit",
      status:result.status,bindingId:b.id,requestId:claimed.requestId,
      logicalPaymentId:claimed.logicalPaymentId,
      payoutPosts:fence.getPostCount(),
      batchId:evidence.paypal_payout_batch_id,
      itemId:evidence.paypal_payout_item_id,
      negativeResults,
      verifiedWebhooks:evidence.verified_webhooks,
      note:"Submission is not final Gate H proof until webhook, reconciliation, provider and issuer evidence are independently verified.",
    },null,2));
    if(!evidence.paypal_payout_batch_id||!evidence.paypal_payout_item_id)
      throw new GateHSandboxError("GATE_H_REMOTE_PAYOUT_EVIDENCE_INCOMPLETE");
  }else{
    const data=await metrics();
    await assertNoNegativePayments();
    if(!data.paypal_payout_batch_id||!data.paypal_payout_item_id ||
       data.submitted_events!==1 || data.verified_webhooks<1 ||
       data.reconciled_events<1 || data.webhook_failures!==0)
      throw new GateHSandboxError("GATE_H_WEBHOOK_OR_RECONCILIATION_INCOMPLETE");
    console.log(JSON.stringify({
      gate:"H",mode:"verify",result:"SOURCE_LINKED_SANDBOX_EVIDENCE_PRESENT",
      batchId:data.paypal_payout_batch_id,itemId:data.paypal_payout_item_id,
      status:data.status,submittedEvents:data.submitted_events,
      verifiedWebhooks:data.verified_webhooks,
      reconciledEvents:data.reconciled_events,
      webhookFailures:data.webhook_failures,
      note:"Final critical review and external issuer/model verification still required.",
    },null,2));
  }
}finally{
  await pool.end();
}
