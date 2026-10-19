import {
  SANDBOX_AMOUNT_CENTS,SANDBOX_INVOICE,
  SANDBOX_ORG_ID,SANDBOX_VENDOR_ID,SANDBOX_KEY,
} from "./sandbox-payout-constants";
import {DEMO_ORG_ID,DEMO_VENDOR_ID} from "./scenarios";

/**
 * PayPal Sandbox only. This classifier never grants payment authority:
 * verified_invoice must still pass the existing consumed T4 binding check in
 * PostgresExecutionStore.getAuthoritativePayment before any gateway call.
 *
 * The demo invoice originates in the same org as the signed-in reviewer UI.
 * No paid money, real supplier assertion, or production payout is supported.
 */
export type SandboxRailEnvelope={
  source:string;
  organizationId:string;
  vendorId:string;
  invoiceNumber:string;
  amountCents:number;
  currency:string;
  requestedDestination:string;
  currentTrustedDestination:string;
  authorityBindingId:string|null;
  idempotencyKey:string|null;
  status:string;
  outcome:string;
  effectiveOutcome:string;
};
export type SandboxRailKind="FIXED_MANUAL_FIXTURE"|"EXACT_REVIEWED_INVOICE";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function classifySandboxPaymentRail(
  p:SandboxRailEnvelope,env:Record<string,string|undefined>=process.env,
):SandboxRailKind|null{
  if(env.MANDATEGATE_RUNTIME_MODE!=="neon-sandbox"||
    env.MANDATEGATE_DISABLE_PAYMENTS!=="0"||
    env.PAYPAL_BASE_URL!=="https://api-m.sandbox.paypal.com"||
    !env.DEMO_PAYPAL_RECEIVER_EMAIL||
    p.amountCents!==SANDBOX_AMOUNT_CENTS||
    p.currency!=="USD"||
    p.invoiceNumber!==SANDBOX_INVOICE||
    p.requestedDestination!==env.DEMO_PAYPAL_RECEIVER_EMAIL||
    p.currentTrustedDestination!==env.DEMO_PAYPAL_RECEIVER_EMAIL||
    p.status!=="ALLOWED"||p.outcome!=="ALLOW"||p.effectiveOutcome!=="ALLOW")
    return null;
  if(p.source==="sandbox_fixture" &&
    env.MANDATEGATE_SANDBOX_VERIFIED_INVOICE_DEMO!=="1" &&
    p.organizationId===SANDBOX_ORG_ID &&
    p.vendorId===SANDBOX_VENDOR_ID &&
    p.authorityBindingId===null &&
    p.idempotencyKey===SANDBOX_KEY)
    return "FIXED_MANUAL_FIXTURE";
  if(p.source==="verified_invoice" &&
    env.MANDATEGATE_SANDBOX_VERIFIED_INVOICE_DEMO==="1" &&
    p.organizationId===DEMO_ORG_ID &&
    p.vendorId===DEMO_VENDOR_ID &&
    typeof p.authorityBindingId==="string" &&
    uuid.test(p.authorityBindingId) &&
    p.idempotencyKey==="invoice-verified-binding:"+p.authorityBindingId)
    return "EXACT_REVIEWED_INVOICE";
  return null;
}
