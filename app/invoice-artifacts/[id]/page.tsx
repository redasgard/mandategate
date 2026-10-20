import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/src/auth/auth";
import { loadInvoiceArtifactForHumanReview } from "@/src/artifacts/postgres-store";
import { loadStoredPdfSourcePages } from "@/src/invoices/pdf-source-store";
import { pool } from "@/src/db/pool";
import {sandboxFictionalIssuerChannelAllowed} from "@/src/demo/sandbox-fictional-origin";
import { InvoiceArtifactReview } from "./review-actions";
import { InvoiceVisionObservation } from "./observation-actions";
import { PersistedInvoiceObservation } from "./persisted-observation";
import { InvoiceJourney } from "@/app/components/invoice-journey";
import {invoiceExtractionSchema} from "@/src/invoices/schema";


export default async function InvoiceArtifactReviewPage({
  params,
}:{params:Promise<{id:string}>}) {
  const session=await auth.api.getSession({headers:await headers()});
  if(!session)redirect("/sign-in");
  const {id}=await params;
  if(!/^[a-f0-9-]{36}$/i.test(id))notFound();
  const artifact=await loadInvoiceArtifactForHumanReview(session.user.id,id);
  if(!artifact)notFound();
  // This query remains tenant-bound only after the signed-in admin artifact lookup.
  const savedObservation = await pool.query([
    "select state, error_code, extraction, reason_codes, model,",
    "provider_name, gateway_request_id, gateway_zdr, prompt_version,",
    "prompt_sha256, input_sha256, rendered_input_sha256",
    "from invoice_image_observations where organization_id=$1 and artifact_id=$2 limit 1",
  ].join(" "), [artifact.organizationId,id]);
  const observation = savedObservation.rows[0] ?? null;
  const extraction=invoiceExtractionSchema.safeParse(observation?.extraction);
  const hasAiResult=Boolean(
    extraction.success &&
    ["ESCALATE","EXTRACTED_UNTRUSTED"].includes(observation?.state) &&
    !observation?.error_code,
  );
  const suggestions=hasAiResult&&extraction.success?extraction.data:null;
  const supplier=suggestions?.vendor_name.value??"Supplier to review";
  const number=suggestions?.invoice_number.value??"New invoice";
  const amount=suggestions?.total_amount_decimal.value;
  const currency=suggestions?.currency.value;
  const paymentText=amount&&currency?`${currency} ${amount}`:"Amount to review";
  const originalSource="/api/admin/invoice-artifacts/"+encodeURIComponent(id)+"/source";

  if(artifact.mimeType!=="application/pdf") {
    return <main className="shell invoice-product">
      <Link href="/invoice-artifacts" className="back">← All invoices</Link>
      <InvoiceJourney stage="review"/>
      <section className="panel invoice-main">
        <header className="invoice-overview">
          <div>
            <p className="eyebrow">AI-assisted invoice processing</p>
            <h1>{number}</h1>
            <p className="muted">Review what AI extracted from the image.
              Source verification is not available for images on this payment path.</p>
          </div>
          <div className="invoice-overview-aside">
            <span>AI-suggested total</span>
            <strong>{paymentText}</strong>
            <span className="invoice-status needs-review">Needs document verification</span>
          </div>
        </header>
        <div className="invoice-workspace-body">
          <a className="invoice-secondary-link" href={originalSource} target="_blank"
            rel="noopener noreferrer">View original invoice ↗</a>
          {hasAiResult?<PersistedInvoiceObservation record={observation}/>:null}
          <InvoiceVisionObservation artifactId={id}
            artifactSha256={artifact.sha256} mimeType={artifact.mimeType}/>
          {!hasAiResult?<PersistedInvoiceObservation record={observation}/>:null}
          <div className="invoice-review-notes">
            <strong>Payment not yet available</strong>
            <p>Image-only fields cannot satisfy the independent PDF evidence
              required by the current PayPal invoice execution flow.
              A human-reviewed PDF source is needed before authorization.</p>
          </div>
          <details className="invoice-technical">
            <summary>Document metadata</summary>
            <dl><div><dt>Media type</dt><dd>{artifact.mimeType}</dd></div>
              <div><dt>SHA-256</dt><dd className="mono">{artifact.sha256}</dd></div></dl>
          </details>
        </div>
      </section>
    </main>;
  }
  const [pages,channelRows,claimRows,attRows]=await Promise.all([
    loadStoredPdfSourcePages(artifact.organizationId,id),
    pool.query([
      "select ch.id,ch.vendor_id,v.name as vendor_name,ch.kind,ch.created_at",
      "from vendor_origin_channels ch",
      "join vendors v on v.id=ch.vendor_id and v.organization_id=ch.organization_id",
      "join invoice_artifacts art on art.id=$2 and art.organization_id=ch.organization_id",
      "where ch.organization_id=$1 and ch.active=true",
      "and (ch.kind <> 'SYNTHETIC_FIXTURE' or ($3::boolean and ch.enrolled_by_user_id is not null",
      "and ch.organization_id='org_demo' and ch.vendor_id='vendor_northstar'))",
      "and ch.created_at < art.created_at",
      "order by v.name,ch.created_at",
    ].join(" "),[artifact.organizationId,id,
      sandboxFictionalIssuerChannelAllowed(artifact.organizationId,"vendor_northstar")]),
    pool.query([
      "select id,created_at from invoice_verified_claim_sets",
      "where organization_id=$1 and artifact_id=$2",
      "and source_kind='PDF_TEXT' and verification_status='VERIFIED'",
      "order by created_at desc",
    ].join(" "),[artifact.organizationId,id]),
    pool.query([
      "select a.id,a.vendor_id,a.independent_evidence_reference,a.expires_at",
      "from invoice_origin_attestations a",
      "join vendor_origin_channels ch on ch.id=a.origin_channel_id",
      "and ch.organization_id=a.organization_id and ch.vendor_id=a.vendor_id",
      "join invoice_artifacts art on art.id=a.artifact_id",
      "and art.organization_id=a.organization_id",
      "where a.organization_id=$1 and a.artifact_id=$2",
      "and (a.method='ADMIN_OUT_OF_BAND' or ($3::boolean and a.method='SYNTHETIC_FIXTURE'",
      "and ch.enrolled_by_user_id is not null and a.vendor_id='vendor_northstar'))",
      "and a.expires_at>now()",
      "and ch.active=true and ch.created_at<art.created_at",
      "order by a.created_at desc",
    ].join(" "),[artifact.organizationId,id,
      sandboxFictionalIssuerChannelAllowed(artifact.organizationId,"vendor_northstar")]),
  ]);
  const eligibleChannels=channelRows.rows.map(r=>({
    id:r.id as string,vendorId:r.vendor_id as string,
    vendorName:r.vendor_name as string,kind:r.kind as string,
  }));
  const existingClaims=claimRows.rows.map(r=>({
    id:r.id as string,createdAt:(r.created_at as Date).toISOString(),
  }));
  const existingAttestations=attRows.rows.map(r=>({
    id:r.id as string,vendorId:r.vendor_id as string,
    evidenceReference:r.independent_evidence_reference as string,
    expiresAt:(r.expires_at as Date).toISOString(),
  }));
  return <main className="shell invoice-product">
    <Link href="/invoice-artifacts" className="back">← All invoices</Link>
    <InvoiceJourney stage="review"/>
    <section className="panel invoice-main">
      <header className="invoice-overview">
        <div>
          <p className="eyebrow">AI-assisted invoice processing</p>
          <h1>{number}</h1>
          <p className="muted">
            {supplier}{supplier!=="Supplier to review"?" · AI suggested":""}.
            Review the printed facts, approve the exact payment and
            complete the transfer in PayPal Sandbox.
          </p>
          <a className="invoice-secondary-link" target="_blank" rel="noopener noreferrer"
            href={originalSource}>View original invoice ↗</a>
        </div>
        <div className="invoice-overview-aside">
          <span>Invoice total {hasAiResult?"(AI suggestion)":""}</span>
          <strong>{paymentText}</strong>
          <span className={"invoice-status "+(hasAiResult?"needs-review":"pending")}>
            {hasAiResult?"Ready for your review":"Awaiting AI analysis"}
          </span>
        </div>
      </header>
      <div className="invoice-workspace-body">
        {hasAiResult ? <PersistedInvoiceObservation record={observation}/>:null}
        {hasAiResult?<details className="invoice-technical">
          <summary>Analyze this invoice again</summary>
          <p className="muted">The saved result is already available.
            Rerun AI only when you need a fresh observation.</p>
          <InvoiceVisionObservation artifactId={id}
            artifactSha256={artifact.sha256} mimeType={artifact.mimeType}/>
        </details>:<InvoiceVisionObservation artifactId={id}
          artifactSha256={artifact.sha256} mimeType={artifact.mimeType}/>}
        {!hasAiResult?<PersistedInvoiceObservation record={observation}/>:null}
        <InvoiceArtifactReview artifactId={id} artifactSha256={artifact.sha256}
          initialPages={pages?.pages??[]} initialClaims={existingClaims}
          initialAttestations={existingAttestations} eligibleChannels={eligibleChannels}/>
        <details className="invoice-technical">
          <summary>Document metadata and audit reference</summary>
          <dl>
            <div><dt>File type</dt><dd>{artifact.mimeType}</dd></div>
            <div><dt>File size</dt><dd>{artifact.byteSize.toLocaleString()} bytes</dd></div>
            <div><dt>Original source SHA-256</dt><dd className="mono">{artifact.sha256}</dd></div>
          </dl>
        </details>
      </div>
    </section>
  </main>;
}
