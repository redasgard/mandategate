import Link from "next/link";
import type {VendorTrustRequestContext} from "@/src/vendor-trust/review-context";

export function VendorTrustResolutionGuide({paymentId,context}:{
  paymentId?:string;
  context:VendorTrustRequestContext|null;
}){
  if(paymentId && !context){
    return <section id="trust-review" className="mg-surface mg-trust-walkthrough" aria-label="Recipient trust investigation">
      <p className="mg-eyebrow">RECIPIENT TRUST / CASE LOOKUP</p>
      <h2>Payment not found in your authorized organizations</h2>
      <p>No case or vendor information is shown for an unknown or unauthorized request.</p>
      <Link href="/payments">Return to Payments ↗</Link>
    </section>;
  }
  const n=context?.trustedDestinationCount??0;
  const mismatch=context?(
    n!==1 || context.trustedDestination!==context.requestedDestination
  ):false;
  const caseIsActionable=context?.caseId && !context.caseResolution && (
    (context.outcome==="DENY" && context.requestStatus==="DENIED") ||
    (context.outcome==="ESCALATE" && context.requestStatus==="DECLINED")
  );
  const caseHref=context?.caseId?"#vendor-case-"+context.caseId:null;
  return <section id="trust-review" className="mg-surface mg-trust-walkthrough" aria-label="How to resolve vendor trust">
    <p className="mg-eyebrow">TRUST INVESTIGATION / STEP BY STEP</p>
    <h2>{context?"Resolve recipient trust for "+context.vendorName:"How to handle a changed vendor destination"}</h2>
    <p className="mg-trust-intro">
      A changed payee is not an ordinary payment exception. Recipient identity must
      be established independently of the invoice before any payment is attempted.
    </p>
    {context?<div className="mg-trust-comparison" aria-label="Exact payment recipient comparison">
      <div><span>Requested by payment · untrusted</span>
        <strong className="mono">{context.requestedDestination}</strong></div>
      <div><span>Currently trusted in vendor registry</span>
        <strong className="mono">
          {n===1?context.trustedDestination:n===0?"No trusted recipient":"Multiple conflicting trusted records"}
        </strong></div>
      <p><strong>{context.invoiceNumber}</strong> · {context.organizationName} ·
        {mismatch?" Mismatch requires investigation":" Recipient currently matches"}
      </p>
    </div>:null}
    <ol className="mg-trust-steps">
      <li>
        <strong>Verify outside the invoice</strong>
        <p>Use a contact, vendor portal, or ERP channel already known to your
          organization. Never use the telephone number, link, or account
          details supplied in the disputed invoice or payment request.</p>
        <Link href="/vendor-origin-channels">Inspect enrolled issuer channels ↗</Link>
        <small>Channel enrollment records are not themselves recipient verification.</small>
      </li>
      <li>
        <strong>Choose the verified recipient</strong>
        <p>If the new destination cannot be independently confirmed, reject it,
          keep the existing registered recipient, and decline the unsafe
          payment. If the change is genuine, record its independent evidence
          through an authorized vendor-trust process before submitting a new
          payment request.</p>
        <small>Typing a reason in payment review is not a trust update.</small>
      </li>
      <li>
        <strong>Use an available case action, if one exists</strong>
        {context?.caseId ? <>
          <p>Recorded case: <code>{context.caseId}</code>.
            {" "}{context.caseResolution
              ?"Resolution already recorded: "+context.caseResolution+"."
              :caseIsActionable
                ?"The case below can reject the attempted recipient or simulate out-of-band verification in PayPal Sandbox only."
                :"No eligible case action is available for this request."}</p>
          {caseIsActionable && caseHref
            ?<a href={caseHref}>Open this exact recorded trust case ↓</a>:null}
          <small>Sandbox simulation does not authenticate a real vendor and never
            authorizes the original denied or declined payment.</small>
        </>:<p className="mg-trust-limit">
          {context?"No re-verification case exists for this payment. ":""}
          The application still does not implement independent real-world
          recipient verification. {context?.outcome==="ESCALATE" && context.requestStatus==="ESCALATED"
            ?" To open a Sandbox-only investigation for this escalation, first use Decline without payout on its payment page. After declining, choose Open vendor trust investigation to create an exact case here."
            :" An eligible originally denied or explicitly declined escalation can open a Sandbox-only case. Real destination changes require an independently approved external trust process."}
          Do not treat a new channel enrollment as permission to pay.
        </p>}
      </li>
      <li>
        <strong>Re-evaluate, never revive a mismatched payment</strong>
        <p>After a legitimate recipient is independently verified and the vendor
          registry has been updated by an authorized process, have the operations
          agent submit a fresh payment request for independent policy evaluation.
          Do not execute the old request merely because a destination changed.</p>
        {context?<Link href={"/payments/"+encodeURIComponent(context.requestId)}>
          {context.requestStatus==="DECLINED"||context.requestStatus==="DENIED"
            ?"Inspect the stopped payment ↗"
            :"Return to this payment · Decline without payout ↗"}
        </Link>:<Link href="/payments">Return to Payments ↗</Link>}
      </li>
    </ol>
  </section>;
}
