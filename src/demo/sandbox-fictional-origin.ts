import {DEMO_ORG_ID,DEMO_VENDOR_ID} from "./scenarios";
import {SANDBOX_AMOUNT_CENTS,SANDBOX_INVOICE} from "./sandbox-payout-constants";

/**
 * A separately acknowledged FICTIONAL vendor assertion, not authentication.
 * Never use for normal organizations, real invoices or production PayPal.
 */
export function sandboxFictionalIssuerChannelAllowed(
  organizationId:string,vendorId:string,
  env:NodeJS.ProcessEnv=process.env,
):boolean{
  return organizationId===DEMO_ORG_ID &&
    vendorId===DEMO_VENDOR_ID &&
    env.RENDER_SERVICE_ID==="srv-db39vmm7bikc73c55nh0" &&
    env.MANDATEGATE_RUNTIME_MODE==="neon-sandbox" &&
    env.MANDATEGATE_SANDBOX_VERIFIED_INVOICE_DEMO==="1" &&
    env.MANDATEGATE_DISABLE_PAYMENTS==="0" &&
    env.PAYPAL_BASE_URL==="https://api-m.sandbox.paypal.com" &&
    typeof env.DEMO_PAYPAL_RECEIVER_EMAIL==="string" &&
    /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(env.DEMO_PAYPAL_RECEIVER_EMAIL);
}
export function isExactSandboxFictionalInvoice(
  invoice:{
    organizationId:string;vendorId:string;invoiceNumber:string;
    amountCents:number;currency:string;recipient:string;
  },
  env:NodeJS.ProcessEnv=process.env,
):boolean{
  return sandboxFictionalIssuerChannelAllowed(invoice.organizationId,invoice.vendorId,env) &&
    invoice.invoiceNumber===SANDBOX_INVOICE &&
    invoice.amountCents===SANDBOX_AMOUNT_CENTS &&
    invoice.currency==="USD" &&
    invoice.recipient===env.DEMO_PAYPAL_RECEIVER_EMAIL;
}
export function sandboxOriginIsSynthetic(kind:string,method:string){
  return kind==="SYNTHETIC_FIXTURE" || method==="SYNTHETIC_FIXTURE";
}
