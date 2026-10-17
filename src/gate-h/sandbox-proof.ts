import { z } from "zod";

const uuid=z.string().uuid();
const digest=z.string().regex(/^[a-f0-9]{64}$/);
const settings=z.object({
  PAYPAL_BASE_URL:z.literal("https://api-m.sandbox.paypal.com"),
  GATE_H_ORGANIZATION_ID:z.string().min(1).max(120),
  GATE_H_ALLOW_BINDING_ID:uuid,
  GATE_H_ALLOW_ARTIFACT_SHA256:digest,
  GATE_H_ALLOW_TUPLE_SHA256:digest,
  DEMO_PAYPAL_RECEIVER_EMAIL:z.email(),
  GATE_H_ESCALATE_ARTIFACT_ID:uuid,
  GATE_H_ESCALATE_CLAIM_SET_ID:uuid,
  GATE_H_ESCALATE_ATTESTATION_ID:uuid,
  GATE_H_DENY_ARTIFACT_ID:uuid,
  GATE_H_DENY_CLAIM_SET_ID:uuid,
  GATE_H_DENY_ATTESTATION_ID:uuid,
}).strict();
const payoutGrant="SUBMIT_SINGLE_101_CENT_SANDBOX_PAYOUT";

export class GateHSandboxError extends Error {
  constructor(public readonly code:string){
    super(code);
    this.name="GateHSandboxError";
  }
}

/**
 * Database COUNT aggregates must return exactly one finite nonnegative integer.
 * Never convert an absent row, NULL, a malformed string, or an overflow into
 * zero when that zero can release a financial safety guard.
 */
export function requireSingleGateHCount(
  rows: unknown,
  errorCode: string,
): number {
  if (!Array.isArray(rows) || rows.length !== 1 ||
      !rows[0] || typeof rows[0] !== "object") {
    throw new GateHSandboxError(errorCode);
  }
  const raw = (rows[0] as {n?: unknown}).n;
  const count = typeof raw === "string" && /^(0|[1-9][0-9]*)$/.test(raw)
    ? Number(raw) : raw;
  if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) {
    throw new GateHSandboxError(errorCode);
  }
  return count;
}

/** This performs syntactic checks only, NOT proof of external authorization. */
export function validateGateHSandboxEnvironment(
  env: NodeJS.ProcessEnv,
  mode:"preflight"|"submit"|"verify",
) {
  const parsed=settings.safeParse(
    Object.fromEntries(Object.keys(settings.shape).map(k=>[k,env[k]])),
  );
  if(!parsed.success)throw new GateHSandboxError("GATE_H_SANDBOX_PROOF_CONFIG_INCOMPLETE");
  const data=parsed.data;
  const artifacts=[
    data.GATE_H_ESCALATE_ARTIFACT_ID,
    data.GATE_H_DENY_ARTIFACT_ID,
  ];
  if(new Set(artifacts).size!==2)
    throw new GateHSandboxError("GATE_H_NEGATIVE_CASES_MUST_BE_DISTINCT");
  if(mode==="submit"){
    if(env.GATE_H_PAYPAL_SINGLE_POST_GRANT!==payoutGrant)
      throw new GateHSandboxError("GATE_H_EXPLICIT_ONE_TIME_PAYOUT_GRANT_REQUIRED");
    if(env.GATE_H_ISSUER_PROOF_INDEPENDENTLY_REVIEWED!=="1")
      throw new GateHSandboxError("GATE_H_REAL_ISSUER_PROOF_REVIEW_REQUIRED");
    if(!env.PAYPAL_CLIENT_ID||!env.PAYPAL_CLIENT_SECRET||!env.PAYPAL_WEBHOOK_ID)
      throw new GateHSandboxError("GATE_H_SANDBOX_PAYPAL_CREDENTIALS_REQUIRED");
    if(!env.GATE_H_ACTUAL_GLM_ARTIFACT_ID ||
      !uuid.safeParse(env.GATE_H_ACTUAL_GLM_ARTIFACT_ID).success ||
      !env.GATE_H_ACTUAL_GLM_GATEWAY_REQUEST_ID)
      throw new GateHSandboxError("GATE_H_ACTUAL_GLM_PROOF_REQUIRED");
  }
  return data;
}

export function checkBoundedSandboxPayout(
  payment: {
    amountCents:number;currency:string;receiver:string;
    artifactSha256:string;tupleSha256:string;
    authorizationStatus:string;sourceKind:string;
    verificationStatus:string;originMethod:string;
    originChannelKind:string;channelPredatesArtifact:boolean;
    approvalActor:string|null;
  },
  expected:{
    receiver:string;artifactSha256:string;tupleSha256:string;
  },
){
  if(payment.amountCents!==101 || payment.currency!=="USD")
    throw new GateHSandboxError("GATE_H_AMOUNT_MUST_BE_101_CENTS_USD");
  if(payment.receiver!==expected.receiver)
    throw new GateHSandboxError("GATE_H_SANDBOX_RECEIVER_MISMATCH");
  if(payment.artifactSha256!==expected.artifactSha256 ||
     payment.tupleSha256!==expected.tupleSha256)
    throw new GateHSandboxError("GATE_H_BINDING_IDENTITY_MISMATCH");
  if(payment.authorizationStatus!=="AUTHORIZED" ||
     payment.sourceKind!=="PDF_TEXT" ||
     payment.verificationStatus!=="VERIFIED" ||
     payment.originMethod!=="ADMIN_OUT_OF_BAND" ||
     payment.originChannelKind==="SYNTHETIC_FIXTURE" ||
     !payment.channelPredatesArtifact ||
     !payment.approvalActor)
    throw new GateHSandboxError("GATE_H_SOURCE_OR_APPROVAL_NOT_TRUSTED");
}

export function assertNegativeCaseResult(
  actual:{outcome:string;bindingId:string|null;paymentAuthorized:false},
  expected:"DENY"|"ESCALATE",
) {
  if(actual.outcome!==expected || actual.bindingId!==null ||
     actual.paymentAuthorized!==false)
    throw new GateHSandboxError("GATE_H_NEGATIVE_CASE_DID_NOT_BLOCK_PAYMENT");
}

/**
 * Physical Payouts POST attempt limiter. PayPal's normal network client
 * retries transient responses, but Gate H promises at most ONE network POST.
 */
export function makeSinglePayoutPostFence(
  delegate: typeof fetch,
) {
  let posts=0;
  const outbound:typeof fetch=async(input,init)=>{
    let url:URL;
    try{url=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url);}
    catch{throw new GateHSandboxError("GATE_H_INVALID_EXTERNAL_URL");}
    if(url.hostname!=="api-m.sandbox.paypal.com" ||
       url.protocol!=="https:")
      throw new GateHSandboxError("GATE_H_EXTERNAL_HOST_DENIED");
    if(url.pathname==="/v1/payments/payouts" && init?.method==="POST"){
      if(posts!==0)throw new GateHSandboxError("GATE_H_SECOND_PAYOUT_POST_DENIED");
      posts++;
    }
    return delegate(input,init);
  };
  return {outbound, getPostCount:()=>posts};
}
