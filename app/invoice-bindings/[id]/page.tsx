import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/src/auth/auth";
import { pool } from "@/src/db/pool";
import { InvoiceReviewActions } from "./review-actions";

export default async function InvoiceBindingReviewPage({params}:{params:Promise<{id:string}>}) {
  const session=await auth.api.getSession({headers:await headers()});
  if(!session)redirect("/sign-in");
  const {id}=await params;
  if(!/^[0-9a-f-]{36}$/i.test(id))notFound();
  const result=await pool.query(
    ["select b.id,b.authorization_status,b.tuple_sha256,b.expires_at,b.invoice_number,",
     "b.amount_cents,b.currency,b.artifact_sha256,b.verified_claim_set_id,",
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
        <div><dt>Frozen tuple digest</dt><dd className="mono">{binding.tuple_sha256}</dd></div>
      </dl>
      <h2>Payment-critical field evidence</h2>
      <div className="chips">{fields.rows.map((f,i)=><span key={i}>
        {f.field_name}: {f.normalized_value} · page {f.source_page ?? "?"} · T{f.trust_tier}
        · evidence SHA {String(f.source_quote_sha256 ?? "missing").slice(0,12)}
      </span>)}</div>
      <h2>Policy findings</h2>
      <pre>{JSON.stringify(binding.proposed_reason_codes,null,2)}</pre>
      {binding.authorization_status==="PROPOSED"
        ? <InvoiceReviewActions id={id} expectedTupleSha256={binding.tuple_sha256} />
        : <p>This binding cannot be reviewed again. Its existing authorization is immutable.</p>}
    </section>
  </main>;
}
