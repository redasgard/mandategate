import {NextRequest} from "next/server";
import {auth} from "@/src/auth/auth";
import {isTrustedMutationOrigin} from "@/src/auth/same-origin";
import {pool} from "@/src/db/pool";
import {DEMO_ORG_ID} from "@/src/demo/scenarios";
import {sandboxPayoutEnabled} from "@/src/demo/sandbox-payout";
import {
  assertSandboxInvoiceReviewedBinding,SandboxInvoiceDemoError,
} from "@/src/demo/sandbox-invoice-proof";
import {consumeApprovedInvoiceBinding} from "@/src/authority/consume-invoice-binding";
import {AuthorityBindingRejected} from "@/src/authority/binding-guard";

export const runtime="nodejs";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * This admin-only action PREPARES a one-shot fictional invoice-derived
 * Sandbox payment. It does NOT call PayPal or grant independent issuer trust.
 * The separate payment-detail Execute action performs any Sandbox POST.
 */
export async function POST(request:NextRequest,{params}:{
  params:Promise<{id:string}>
}){
  if(!isTrustedMutationOrigin(request))
    return Response.json({error:"INVALID_ORIGIN"},{status:403});
  const session=await auth.api.getSession({headers:request.headers});
  if(!session)return Response.json({error:"UNAUTHORIZED"},{status:401});
  const {id}=await params;
  if(!uuid.test(id))return Response.json({error:"NOT_FOUND"},{status:404});
  if(process.env.MANDATEGATE_SANDBOX_VERIFIED_INVOICE_DEMO!=="1"||
    !sandboxPayoutEnabled())
    return Response.json({error:"SANDBOX_INVOICE_DEMO_DISABLED"},{status:503});

  const member=await pool.query([
    "select 1 from organization_admin_memberships",
    "where user_id=$1 and organization_id=$2",
    "and role='ADMIN' and active=true limit 1",
  ].join(" "),[session.user.id,DEMO_ORG_ID]);
  if(member.rows.length!==1)
    return Response.json({error:"NOT_FOUND"},{status:404});

  const existing=await pool.query([
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
    "join vendor_destinations vd on vd.id=b.destination_id",
    "and vd.vendor_id=b.vendor_id",
    "where b.id=$1 and b.organization_id=$2",
  ].join(" "),[id,DEMO_ORG_ID]);
  if(existing.rows.length!==1)return Response.json({error:"NOT_FOUND"},{status:404});
  const b=existing.rows[0];
  try{
    // The source and tuple hashes come from the immutable DB binding; the
    // consume helper re-derives each digest against current original records.
    assertSandboxInvoiceReviewedBinding({
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
      receiver:process.env.DEMO_PAYPAL_RECEIVER_EMAIL!,
      artifactSha256:b.artifact_sha256,
      tupleSha256:b.tuple_sha256,
    });
    const result=await consumeApprovedInvoiceBinding(id);
    if(result.replayed||result.decision.outcome!=="ALLOW")
      throw new SandboxInvoiceDemoError("SANDBOX_INVOICE_ALREADY_CONSUMED");
    return Response.json({
      requestId:result.requestId,
      state:"PREPARED_NOT_SUBMITTED",
      paymentSubmittedByThisAction:false,
      fictionalIssuerSimulation:true,
      sandboxOnly:true,
    },{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    if(error instanceof SandboxInvoiceDemoError)
      return Response.json({error:error.code},{status:409});
    if(error instanceof AuthorityBindingRejected)
      return Response.json({error:error.code},{status:409});
    if(error instanceof Error &&
      /^(?:BINDING_|PAYMENT_BINDING_|AP_HISTORY_)/.test(error.message))
      return Response.json({error:error.message},{status:409});
    throw error;
  }
}
