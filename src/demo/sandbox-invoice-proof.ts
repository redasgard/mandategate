import {z} from "zod";
import {DEMO_ORG_ID,DEMO_VENDOR_ID} from "./scenarios";
import {SANDBOX_AMOUNT_CENTS,SANDBOX_INVOICE} from "./sandbox-payout-constants";
import {isExactSandboxFictionalInvoice,sandboxOriginIsSynthetic} from "./sandbox-fictional-origin";

const sha=z.string().regex(/^[a-f0-9]{64}$/);
const uuid=z.string().uuid();
const configSchema=z.object({
  MANDATEGATE_RUNTIME_MODE:z.literal("neon-sandbox"),
  MANDATEGATE_DISABLE_PAYMENTS:z.literal("0"),
  MANDATEGATE_SANDBOX_VERIFIED_INVOICE_DEMO:z.literal("1"),
  PAYPAL_BASE_URL:z.literal("https://api-m.sandbox.paypal.com"),
  DEMO_PAYPAL_RECEIVER_EMAIL:z.email(),
  SANDBOX_INVOICE_BINDING_ID:uuid,
  SANDBOX_INVOICE_ARTIFACT_SHA256:sha,
  SANDBOX_INVOICE_TUPLE_SHA256:sha,
}).strict();
export type SandboxInvoiceDemoMode="preflight"|"submit"|"verify";
export class SandboxInvoiceDemoError extends Error{
  constructor(public readonly code:string){super(code);this.name="SandboxInvoiceDemoError";}
}
export function validateSandboxInvoiceDemoEnvironment(
  env:NodeJS.ProcessEnv,mode:SandboxInvoiceDemoMode,
){
  const obj=Object.fromEntries(
    Object.keys(configSchema.shape).map(k=>[k,env[k]]),
  );
  const parsed=configSchema.safeParse(obj);
  if(!parsed.success)throw new SandboxInvoiceDemoError("SANDBOX_INVOICE_CONFIG_INVALID");
  if(mode==="submit"){
    if(env.SANDBOX_INVOICE_SUBMIT_GRANT!=="SUBMIT_ONE_101_CENT_SANDBOX_INVOICE")
      throw new SandboxInvoiceDemoError("SANDBOX_INVOICE_EXPLICIT_GRANT_REQUIRED");
    if(!env.PAYPAL_CLIENT_ID||!env.PAYPAL_CLIENT_SECRET||!env.PAYPAL_WEBHOOK_ID)
      throw new SandboxInvoiceDemoError("SANDBOX_INVOICE_PAYPAL_CREDENTIALS_REQUIRED");
  }
  return parsed.data;
}
export type SandboxInvoiceReviewedBinding={
  organizationId:string;vendorId:string;invoiceNumber:string;
  amountCents:number;currency:string;receiver:string;
  artifactSha256:string;tupleSha256:string;
  authorizationStatus:string;sourceKind:string;verificationStatus:string;
  originMethod:string;originChannelKind:string;
  channelPredatesArtifact:boolean;approvalActor:string|null;
  linkedPaymentRequestId:string|null;
};
/**
 * Demonstrates a fictional invoice's T2 PDF fields, human-asserted simulated
 * issuer channel, and exact T4 approval. These checks DO NOT authenticate a
 * real vendor or assert that AI produced the payment instruction.
 */
export function assertSandboxInvoiceReviewedBinding(
  b:SandboxInvoiceReviewedBinding,
  expected:{receiver:string;artifactSha256:string;tupleSha256:string},
){
  if(b.organizationId!==DEMO_ORG_ID||b.vendorId!==DEMO_VENDOR_ID||
    b.invoiceNumber!==SANDBOX_INVOICE||
    b.amountCents!==SANDBOX_AMOUNT_CENTS||b.currency!=="USD")
    throw new SandboxInvoiceDemoError("SANDBOX_INVOICE_FIXED_IDENTITY_REQUIRED");
  if(b.receiver!==expected.receiver ||
    b.artifactSha256!==expected.artifactSha256 ||
    b.tupleSha256!==expected.tupleSha256)
    throw new SandboxInvoiceDemoError("SANDBOX_INVOICE_EXPECTED_DIGEST_MISMATCH");
  const synthetic=sandboxOriginIsSynthetic(b.originChannelKind,b.originMethod);
  const provenanceAllowed=synthetic
    ? b.originMethod==="SYNTHETIC_FIXTURE" &&
      b.originChannelKind==="SYNTHETIC_FIXTURE" &&
      isExactSandboxFictionalInvoice({
        organizationId:b.organizationId,vendorId:b.vendorId,
        invoiceNumber:b.invoiceNumber,amountCents:b.amountCents,
        currency:b.currency,recipient:b.receiver,
      })
    : b.originMethod==="ADMIN_OUT_OF_BAND";
  if(b.authorizationStatus!=="AUTHORIZED" ||
    b.linkedPaymentRequestId!==null ||
    b.sourceKind!=="PDF_TEXT"||
    b.verificationStatus!=="VERIFIED"||
    !provenanceAllowed||
    !b.channelPredatesArtifact||
    !b.approvalActor)
    throw new SandboxInvoiceDemoError("SANDBOX_INVOICE_UNAPPROVED_OR_UNVERIFIED");
  return {fixtureIssuerSimulated:true as const,paymentAuthorized:false as const};
}
