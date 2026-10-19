import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/src/auth/auth";
import { pool } from "@/src/db/pool";
import { assessHistoricalPaymentRisk } from "@/src/history/anomaly";
import { InvoiceReviewActions } from "./review-actions";
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
  return <main className="shell narrow">
    <Link href="/dashboard" className="back">← Dashboard</Link>
    <section className="panel detail">
      <p className="eyebrow">Exact-tuple invoice review</p>
      <h1>Review {binding.invoice_number}</h1>
      <p>Source assertions are not payment authority. Verify the vendor, source channel, and exact payment fields independently before approving.</p>
      <dl>
        <div><dt>Status</dt><dd>{binding.authorization_status}</dd></div>
        <div><dt>Vendor (trusted registry)</dt><dd>{binding.vendor_name}</dd></div>
        <div><dt>Amount</dt><dd>{binding.currency} {(amount/100).toFixed(2)}</dd></div>
        <div><dt>Receiver (trusted registry)</dt><dd>{binding.trusted_destination}</dd></div>
        <div><dt>Claim verification</dt><dd>{binding.verification_status} ({binding.source_kind})</dd></div>
        <div><dt>Origin attestation</dt><dd>{binding.origin_method} / {binding.origin_channel}</dd></div>
        <div><dt>Independent source reference</dt><dd>{binding.independent_evidence_reference ?? "Not supplied"}</dd></div>
        <div><dt>Expires</dt><dd>{new Date(binding.expires_at).toISOString()}</dd></div>
        <div><dt>Artifact digest</dt><dd className="mono">{binding.artifact_sha256}</dd></div>
        <div><dt>Original source</dt><dd><a href={"/api/admin/invoice-artifacts/"+encodeURIComponent(binding.artifact_id)+"/source"} target="_blank" rel="noopener noreferrer">Inspect stored artifact (admin only)</a></dd></div>
        <div><dt>Frozen tuple digest</dt><dd className="mono">{binding.tuple_sha256}</dd></div>
      </dl>
      <h2>Payment-critical field evidence</h2>
      <div className="chips">{fields.rows.map((f,i)=><span key={i}>
        {f.field_name}: {f.normalized_value} · page {f.source_page ?? "?"} · T{f.trust_tier}
        · evidence SHA {String(f.source_quote_sha256 ?? "missing").slice(0,12)}
      </span>)}</div>
      <h2>Policy findings</h2>
      <pre>{JSON.stringify(binding.proposed_reason_codes,null,2)}</pre>
      <h2>Imported paid-history findings (current)</h2>
      {historyBlocked?<p role="alert">Historical AP risk or unavailable history prevents approval. Reject or investigate the original paid import before starting a new review.</p>
        :<p>No replay, confusable duplicate, or amount anomaly found in the evaluated paid-history window.</p>}
      <pre>{JSON.stringify({reasonCodes:historicalRisk.reasonCodes,evidence:historicalRisk.evidence},null,2)}</pre>
      {binding.authorization_status==="PROPOSED"
        ? <InvoiceReviewActions id={id} expectedTupleSha256={binding.tuple_sha256} approvalBlocked={historyBlocked} />
        : <p>This binding cannot be reviewed again. Its existing authorization is immutable.</p>}
      {sandboxInvoiceDemo && binding.authorization_status==="AUTHORIZED"
        ? <PrepareSandboxInvoiceButton bindingId={id}/>
        : null}
      {sandboxInvoiceDemo && binding.authorization_status==="CONSUMED" && binding.linked_payment_request_id
        ? <p><Link href={"/payments/"+encodeURIComponent(binding.linked_payment_request_id)}>
            Open the prepared fictional Sandbox payment
          </Link></p>
        : null}
      {sandboxInvoiceDemo
        ? <p className="muted">This is a fictional Sandbox issuer simulation, not verification
            of an actual supplier. Only the exact reviewed USD 1.01 tuple can use the
            restricted Sandbox payment rail.</p>
        : null}
    </section>
  </main>;
}
