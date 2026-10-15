/**
 * Three deterministic, explicitly synthetic MandateGate decisions.
 * These are not bank instructions, issuer confirmations, or real invoices.
 */
export const DEMO_ORG_ID = "org_demo";
export const DEMO_VENDOR_ID = "vendor_northstar";
export const DEMO_TRUSTED_DESTINATION = "ap@northstar.example";
export const DEMO_CASES = [
  { id:"normal", title:"Normal vendor invoice", invoiceNumber:"DEMO-NORMAL-2026",
    amountCents:120000, expectedOutcome:"ALLOW" as const,
    explanation:"Trusted destination and amount within configured policy limits." },
  { id:"anomaly", title:"Unusual vendor amount", invoiceNumber:"DEMO-ANOMALY-2026",
    amountCents:280000, expectedOutcome:"ESCALATE" as const,
    explanation:"Above this vendor's configured normal amount. Requires human review." },
  { id:"substitution", title:"Changed invoice destination", invoiceNumber:"DEMO-SUBSTITUTION-2026",
    amountCents:120000, expectedOutcome:"DENY" as const,
    explanation:"Document claims a different destination; vendor re-verification is required." },
] as const;
export const demoKey=(id:string)=>"mandategate-p0-synthetic-20261015-"+id+"-v1";
export const demoKeys=DEMO_CASES.map(x=>demoKey(x.id));
const allowedNeonHosts = new Set([
  "ep-silent-poetry-arjowm4d.c-4.us-west-2.aws.neon.tech",
  "ep-silent-poetry-arjowm4d-pooler.c-4.us-west-2.aws.neon.tech",
]);
export function demoPreviewEnabled(env:Record<string,string|undefined>):boolean {
  if(env.MANDATEGATE_RUNTIME_MODE!=="neon-preview" ||
     env.MANDATEGATE_DISABLE_PAYMENTS!=="1") return false;
  try {
    const url=new URL(env.DATABASE_URL??"");
    return ["postgres:","postgresql:"].includes(url.protocol) &&
      allowedNeonHosts.has(url.hostname) && url.pathname==="/neondb";
  } catch {return false;}
}
export function demoRequests(trustedDestination:string) {
  if(trustedDestination!==DEMO_TRUSTED_DESTINATION)
    throw new Error("DEMO_RECEIVER_NOT_SYNTHETIC");
  return DEMO_CASES.map(x=>({
    organizationId:DEMO_ORG_ID, vendorId:DEMO_VENDOR_ID,
    invoiceNumber:x.invoiceNumber, amountCents:x.amountCents,
    currency:"USD", paymentDestination:x.id==="substitution"
      ?"changed-payee@synthetic.invalid":trustedDestination,
    idempotencyKey:demoKey(x.id), source:"demo_fixture" as const,
    expectedOutcome:x.expectedOutcome,
  }));
}
