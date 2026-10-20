import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/src/auth/auth";
import { pool } from "@/src/db/pool";
import { assessHistoricalPaymentRisk } from "@/src/history/anomaly";
import { InvoiceReviewActions } from "./review-actions";
import { InvoiceJourney } from "@/app/components/invoice-journey";
import {PrepareSandboxInvoiceButton} from "./prepare-sandbox-invoice-button";
import {DEMO_ORG_ID,DEMO_VENDOR_ID} from "@/src/demo/scenarios";
import {SANDBOX_INVOICE,SANDBOX_AMOUNT_CENTS} from "@/src/demo/sandbox-payout-constants";
import {sandboxPayoutEnabled} from "@/src/demo/sandbox-payout";

export default async function InvoiceBindingReviewPage({params}:{params:Promise<{id:string}>}) {
  const session=await auth.api.getSession({headers:await headers()});
  if(!session)redirect("/sign-in");
  const {id}=await params;
  if(!/^[0-9a-f-]{36}$/i.test(id))notFound();
  const result=await pool.query(
    ["select b.id,b.organization_id,b.vendor_id,b.authorization_status,b.tuple_sha256,b.expires_at,b.invoice_number,",
     "b.amount_cents,b.currency,b.artifact_id,b.artifact_sha256,b.verified_claim_set_id,b.linked_payment_request_id,",
     "b.proposed_reason_codes,b.proposed_outcome,vd.destination as trusted_destination,",
     "v.name as vendor_name,c.verification_status,c.source_kind,a.method as origin_method,",
     "a.independent_evidence_reference,ch.kind as origin_channel",
     "from payment_authority_bindings b",
     "join organization_admin_memberships m on m.organization_id=b.organization_id",
     "and m.user_id=$2 and m.active=true and m.role='ADMIN'",
     "join vendors v on v.id=b.vendor_id and v.organization_id=b.organization_id",
     "join vendor_destinations vd on vd.id=b.destination_id and vd.vendor_id=b.vendor_id",
     "join invoice_verified_claim_sets c on c.id=b.verified_claim_set_id",
     "join invoice_origin_attestations a on a.id=b.origin_attestation_id",
     "join vendor_origin_channels ch on ch.id=a.origin_channel_id",
     "where b.id=$1"].join(" "),
    [id,session.user.id],
  );
  const binding=result.rows[0];
  if(!binding)notFound();
  const fields=await pool.query(
    ["select field_name,normalized_value,source_page,source_quote_sha256,trust_tier",
     "from invoice_claim_field_sources where claim_set_id=$1 order by field_name,evidence_index"].join(" "),
    [binding.verified_claim_set_id],
  );
  const amount=Number(binding.amount_cents);
  // The read-side risk signal is informational; the server authorization
  // guard independently rechecks inside the approval transaction.
  let historicalRisk: Awaited<ReturnType<typeof assessHistoricalPaymentRisk>>;
  try {
    historicalRisk=await assessHistoricalPaymentRisk({
      organizationId:binding.organization_id,vendorId:binding.vendor_id,
      invoiceNumber:binding.invoice_number,amountCents:amount,currency:binding.currency,
    });
  } catch {
    historicalRisk={reasonCodes:["AP_HISTORY_UNAVAILABLE"],evidence:[{
      code:"AP_HISTORY_UNAVAILABLE",source:"ap_history.read",observed:"unavailable",
    }]};
  }
  const historyBlocked=historicalRisk.reasonCodes.length>0;
  const sandboxInvoiceDemo=
    process.env.MANDATEGATE_SANDBOX_VERIFIED_INVOICE_DEMO==="1" &&
    sandboxPayoutEnabled() &&
    binding.organization_id===DEMO_ORG_ID &&
    binding.vendor_id===DEMO_VENDOR_ID &&
    binding.invoice_number===SANDBOX_INVOICE &&
    amount===SANDBOX_AMOUNT_CENTS &&
    binding.currency==="USD" &&
    binding.trusted_destination===process.env.DEMO_PAYPAL_RECEIVER_EMAIL;
  const amountText=new Intl.NumberFormat("en-US",{
    style:"currency",currency:binding.currency,
  }).format(amount/100);
  return <main className="shell invoice-product">
    <Link href={"/invoice-artifacts/"+encodeURIComponent(binding.artifact_id)}
      className="back">← Invoice review</Link>
    <InvoiceJourney stage="approve"/>
    <section className="panel invoice-main">
      <header className="invoice-overview">
        <div><p className="eyebrow">Approval required</p>
          <h1>Authorize this payment</h1>
          <p className="muted">Invoice {binding.invoice_number} from {binding.vendor_name}.
            Verify the exact recipient and amount before approving.</p>
          <a className="invoice-secondary-link" target="_blank" rel="noopener noreferrer"
            href={"/api/admin/invoice-artifacts/"+encodeURIComponent(binding.artifact_id)+"/source"}>
            View original invoice ↗</a>
        </div>
        <div className="invoice-overview-aside">
          <span>Requested payment</span>
          <strong>{amountText}</strong>
          <span className={"invoice-status "+(binding.authorization_status==="AUTHORIZED"?"approved":"needs-review")}>
            {binding.authorization_status==="PROPOSED"?"Awaiting your approval":
              binding.authorization_status==="AUTHORIZED"?"Approved":
              binding.authorization_status==="CONSUMED"?"Payment prepared":
              "Payment not approved"}
          </span>
        </div>
      </header>
      <div className="invoice-workspace-body">
        <div className="invoice-payment-preview">
          <div><span>Supplier</span><strong>{binding.vendor_name}</strong></div>
          <div><span>Invoice</span><strong>{binding.invoice_number}</strong></div>
          <div><span>Amount</span><strong>{amountText}</strong></div>
          <div><span>PayPal recipient</span><strong>{binding.trusted_destination}</strong></div>
        </div>
        {historyBlocked ? <div className="invoice-review-notes" role="alert">
          <strong>Payment held for review</strong>
          <p>Paid-invoice history is incomplete or contains a possible duplicate.
            Investigate this before approving.</p>
        </div> : <p className="invoice-small-note">No blocking duplicates or
          amount anomalies found in the available paid-invoice history.</p>}
        {binding.authorization_status==="PROPOSED"
          ? <InvoiceReviewActions id={id} expectedTupleSha256={binding.tuple_sha256}
              approvalBlocked={historyBlocked}/>
          : null}
        {sandboxInvoiceDemo && binding.authorization_status==="AUTHORIZED"
          ? <PrepareSandboxInvoiceButton bindingId={id}/>:null}
        {sandboxInvoiceDemo && binding.authorization_status==="CONSUMED" &&
          binding.linked_payment_request_id
          ? <a className="invoice-primary-link"
              href={"/payments/"+encodeURIComponent(binding.linked_payment_request_id)}>
              Continue to PayPal execution →
            </a>:null}
        {binding.authorization_status!=="PROPOSED"&&
          binding.authorization_status!=="AUTHORIZED"&&
          binding.authorization_status!=="CONSUMED"
          ? <p role="status">This payment cannot be approved again.
              Previous decisions are immutable.</p>:null}
        <details className="invoice-technical">
          <summary>Security evidence and complete audit details</summary>
          <dl>
            <div><dt>Binding status</dt><dd>{binding.authorization_status}</dd></div>
            <div><dt>Verified source</dt><dd>{binding.verification_status} ({binding.source_kind})</dd></div>
            <div><dt>Origin check</dt><dd>{binding.origin_method} / {binding.origin_channel}</dd></div>
            <div><dt>Source reference</dt><dd>{binding.independent_evidence_reference??"Not supplied"}</dd></div>
            <div><dt>Approval expires</dt><dd>{new Date(binding.expires_at).toISOString()}</dd></div>
            <div><dt>Invoice SHA-256</dt><dd className="mono">{binding.artifact_sha256}</dd></div>
            <div><dt>Frozen payment tuple SHA-256</dt><dd className="mono">{binding.tuple_sha256}</dd></div>
          </dl>
          <h3>Verified source fields</h3>
          <div className="chips">{fields.rows.map((field,index)=><span key={index}>
            {field.field_name}: {field.normalized_value} · page {field.source_page??"?"} ·
            T{field.trust_tier} · evidence SHA {String(field.source_quote_sha256??"missing").slice(0,12)}
          </span>)}</div>
          <h3>Policy reasons</h3>
          <pre>{JSON.stringify(binding.proposed_reason_codes,null,2)}</pre>
          <h3>Imported paid-history findings</h3>
          <pre>{JSON.stringify({
            reasons:historicalRisk.reasonCodes,evidence:historicalRisk.evidence,
          },null,2)}</pre>
        </details>
      </div>
    </section>
  </main>;
}
