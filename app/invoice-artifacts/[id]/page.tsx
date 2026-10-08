import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/src/auth/auth";
import { loadInvoiceArtifactForHumanReview } from "@/src/artifacts/postgres-store";
import { loadStoredPdfSourcePages } from "@/src/invoices/pdf-source-store";
import { pool } from "@/src/db/pool";
import { InvoiceArtifactReview } from "./review-actions";

export default async function InvoiceArtifactReviewPage({
  params,
}:{params:Promise<{id:string}>}) {
  const session=await auth.api.getSession({headers:await headers()});
  if(!session)redirect("/sign-in");
  const {id}=await params;
  if(!/^[a-f0-9-]{36}$/i.test(id))notFound();
  const artifact=await loadInvoiceArtifactForHumanReview(session.user.id,id);
  if(!artifact || artifact.mimeType!=="application/pdf")notFound();
  const [pages,channelRows,claimRows,attRows]=await Promise.all([
    loadStoredPdfSourcePages(artifact.organizationId,id),
    pool.query([
      "select ch.id,ch.vendor_id,v.name as vendor_name,ch.kind,ch.created_at",
      "from vendor_origin_channels ch",
      "join vendors v on v.id=ch.vendor_id and v.organization_id=ch.organization_id",
      "join invoice_artifacts art on art.id=$2 and art.organization_id=ch.organization_id",
      "where ch.organization_id=$1 and ch.active=true",
      "and ch.kind <> 'SYNTHETIC_FIXTURE' and ch.created_at < art.created_at",
      "order by v.name,ch.created_at",
    ].join(" "),[artifact.organizationId,id]),
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
      "and a.method='ADMIN_OUT_OF_BAND' and a.expires_at>now()",
      "and ch.active=true and ch.created_at<art.created_at",
      "order by a.created_at desc",
    ].join(" "),[artifact.organizationId,id]),
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
  return <main className="shell narrow">
    <Link href="/dashboard" className="back">← Dashboard</Link>
    <section className="panel detail">
      <p className="eyebrow">Gate H / source &amp; origin review</p>
      <h1>Verify invoice source before approving payment</h1>
      <p className="muted">The PDF is untrusted. Read its exact original bytes, verify independently extracted text, then confirm the issuer using a channel that was enrolled before this invoice. None of these actions executes a payment.</p>
      <dl>
        <div><dt>Original media type</dt><dd>{artifact.mimeType}</dd></div>
        <div><dt>Artifact size</dt><dd>{artifact.byteSize.toLocaleString()} bytes</dd></div>
        <div><dt>Source artifact SHA-256</dt><dd className="mono">{artifact.sha256}</dd></div>
        <div><dt>Original source</dt><dd><a href={"/api/admin/invoice-artifacts/"+encodeURIComponent(id)+"/source"} target="_blank" rel="noopener noreferrer">Inspect original PDF (admin-only download)</a></dd></div>
      </dl>
      <InvoiceArtifactReview
        artifactId={id} artifactSha256={artifact.sha256}
        initialPages={pages?.pages ?? []}
        initialClaims={existingClaims}
        initialAttestations={existingAttestations}
        eligibleChannels={eligibleChannels}
      />
    </section>
  </main>;
}
