import { createHash } from "node:crypto";
import { pool } from "../db/pool";
import { manualInvoiceReviewSchema } from "./manual-invoice-review";
import { hashUnverifiedClaimSnapshot } from "./contracts";
import { invoiceDecimalToCents } from "../invoices/normalize";
import { verifyFieldEvidenceBinding } from "../invoices/semantic-evidence";
import { PDF_SOURCE_PARSER_VERSION } from "../invoices/pdf-text";

const requiredFields = [
  "vendor_name", "invoice_number", "currency",
  "total_amount_decimal", "invoice_payment_destination",
] as const;
const sha = (text: string | Buffer) => createHash("sha256").update(text).digest("hex");

export class PdfFieldReviewError extends Error {
  constructor(public readonly code: string, public readonly httpStatus=422) {
    super(code);
    this.name = "PdfFieldReviewError";
  }
}
function reject(code: string, status=422): never {
  throw new PdfFieldReviewError(code,status);
}

/**
 * Human identity and typed facts are recorded independently of GLM. T2 means
 * the exact labeled value appears in the PDF.js text derived from immutable
 * source bytes. It does NOT establish issuer authenticity or payment intent.
 */
export async function verifyStoredPdfFieldsAsAdmin(input: {
  actorUserId: string;
  organizationId: string;
  review: unknown;
}) {
  const parsed=manualInvoiceReviewSchema.safeParse(input.review);
  if (!parsed.success) reject("INVALID_PDF_FACTS_SCHEMA",400);
  const {artifactId,expectedArtifactSha256,facts,reviewerReason}=parsed.data;
  const client=await pool.connect();
  try {
    await client.query("begin");
    const actor=await client.query(
      [
        "select user_id from organization_admin_memberships",
        "where user_id=$1 and organization_id=$2 and role='ADMIN'",
        "and active=true for share",
      ].join(" "),
      [input.actorUserId,input.organizationId],
    );
    if (!actor.rows[0]) reject("PDF_REVIEWER_NOT_AUTHORIZED",403);

    const artifact=await client.query(
      [
        "select mime_type,sha256,content,byte_size from invoice_artifacts",
        "where organization_id=$1 and id=$2 for share",
      ].join(" "),
      [input.organizationId,artifactId],
    );
    const file=artifact.rows[0];
    if(!file)reject("PDF_REVIEW_ARTIFACT_NOT_FOUND",404);
    if(file.mime_type!=="application/pdf")reject("PDF_ARTIFACT_REQUIRED");
    if(file.sha256!==expectedArtifactSha256)reject("PDF_REVIEW_ARTIFACT_STALE",409);
    if(!Buffer.isBuffer(file.content) || file.content.length!==file.byte_size ||
       sha(file.content)!==file.sha256)reject("PDF_REVIEW_ARTIFACT_INTEGRITY_FAILED");

    const saved=await client.query(
      [
        "select page_number,total_pages,page_text,page_text_sha256,artifact_sha256",
        "from invoice_pdf_source_pages",
        "where organization_id=$1 and artifact_id=$2 and parser_version=$3",
        "order by page_number for share",
      ].join(" "),
      [input.organizationId,artifactId,PDF_SOURCE_PARSER_VERSION],
    );
    const rows=saved.rows;
    if(!rows.length)reject("PDF_INDEPENDENT_SOURCE_NOT_PREPARED",409);
    const count=Number(rows[0].total_pages);
    if(!Number.isInteger(count) || count<1 || count>20 || rows.length!==count)
      reject("PDF_SOURCE_PAGE_RECORDS_INCOMPLETE");
    const pages=rows.map((row,index)=>{
      if(Number(row.page_number)!==index+1 ||
         Number(row.total_pages)!==count ||
         row.artifact_sha256!==file.sha256 ||
         typeof row.page_text!=="string" ||
         sha(row.page_text)!==row.page_text_sha256)
        reject("PDF_SOURCE_PAGE_RECORDS_INVALID");
      return {text:row.page_text as string,digest:row.page_text_sha256 as string};
    });
    const fullDocumentText=pages.map(p=>p.text).join(" ");
    if(fullDocumentText.length>200000)
      reject("PDF_SOURCE_TEXT_TOO_COMPLEX");

    const snapshots=requiredFields.map(name=>{
      const fact=facts[name];
      const page=pages[fact.pageNumber-1];
      if(!page)reject("PDF_FACT_PAGE_NOT_FOUND");
      const pageIssues=verifyFieldEvidenceBinding({
        field:name,claimedValue:fact.value,quote:fact.sourceFragment,
        pageText:page.text,
      });
      // Re-run over the entire document to catch totals/invoice identifiers
      // that contradict the selected page elsewhere in the same artifact.
      const globalIssues=verifyFieldEvidenceBinding({
        field:name,claimedValue:fact.value,quote:fact.sourceFragment,
        pageText:fullDocumentText,
      });
      if(pageIssues.length || globalIssues.length)
        reject("PDF_FIELD_NOT_INDEPENDENTLY_CORROBORATED");
      if(name==="total_amount_decimal" &&
         invoiceDecimalToCents(fact.value)===null)
        reject("PDF_PAYMENT_AMOUNT_INVALID");
      return {
        fieldName:name,
        observedValue:fact.value,
        sourcePage:fact.pageNumber,
        sourceQuoteSha256:sha(fact.sourceFragment),
        pageTextSha256:page.digest,
      };
    });

    const sourceDigest=sha([
      "mandategate/pdf-parser-source/v1",
      file.sha256,PDF_SOURCE_PARSER_VERSION,
      ...pages.map((p,i)=>String(i+1)+":"+p.digest),
    ].join("\0"));
    const claimSnapshot=hashUnverifiedClaimSnapshot({
      organizationId:input.organizationId,
      artifactId,
      artifactSha256:file.sha256,
      observationSha256:sourceDigest,
      sourceKind:"PDF_TEXT",
      fields:snapshots.map(({fieldName,observedValue,sourcePage,sourceQuoteSha256})=>({
        fieldName,observedValue,sourcePage,sourceQuoteSha256,
      })),
    });
    const proofSha=sha([
      "mandategate/admin-pdf-source-verification/v1",
      input.actorUserId,input.organizationId,artifactId,file.sha256,
      PDF_SOURCE_PARSER_VERSION,sourceDigest,claimSnapshot,reviewerReason.trim(),
    ].join("\0"));
    const inserted=await client.query(
      [
        "insert into invoice_verified_claim_sets",
        "(organization_id,artifact_id,artifact_sha256,observation_sha256,",
        "snapshot_sha256,source_kind,verification_status,verifier_method,",
        "verifier_actor,verifier_proof_sha256)",
        "values($1,$2,$3,$4,$5,'PDF_TEXT','VERIFIED','ADMIN_EXPLICIT',$6,$7)",
        "on conflict do nothing returning id",
      ].join(" "),
      [input.organizationId,artifactId,file.sha256,sourceDigest,claimSnapshot,
       input.actorUserId,proofSha],
    );
    const claimSetId=inserted.rows[0]?.id as string | undefined;
    if(!claimSetId)reject("PDF_CLAIM_ALREADY_VERIFIED",409);

    for(const snap of snapshots) {
      await client.query(
        [
          "insert into invoice_claim_field_sources",
          "(organization_id,artifact_id,claim_set_id,field_name,evidence_index,",
          "raw_value,normalized_value,source_page,source_quote_sha256,",
          "claimed_value_sha256,trust_tier,verifier_proof_sha256,",
          "source_parser_version,source_page_text_sha256)",
          "values($1,$2,$3,$4,0,$5,$5,$6,$7,$8,2,$9,$10,$11)",
        ].join(" "),
        [
          input.organizationId,artifactId,claimSetId,snap.fieldName,
          snap.observedValue,snap.sourcePage,snap.sourceQuoteSha256,
          sha(snap.observedValue),proofSha,PDF_SOURCE_PARSER_VERSION,
          snap.pageTextSha256,
        ],
      );
    }
    await client.query(
      [
        "insert into invoice_review_actions",
        "(organization_id,artifact_id,claim_set_id,actor_user_id,",
        "action,reason,evidence_sha256)",
        "values($1,$2,$3,$4,'FACTS_VERIFIED',$5,$6)",
      ].join(" "),
      [input.organizationId,artifactId,claimSetId,input.actorUserId,
       reviewerReason,proofSha],
    );
    await client.query("commit");
    return {
      artifactId,artifactSha256:file.sha256,claimSetId,
      sourceVersion:PDF_SOURCE_PARSER_VERSION,
      sourceVerified:true as const,
      issuerAuthenticated:false as const,
      paymentAuthorized:false as const,
      fieldEvidence:snapshots.map(({fieldName,sourcePage,pageTextSha256})=>({
        fieldName,sourcePage,pageTextSha256,
      })),
    };
  } catch(error) {
    await client.query("rollback").catch(()=>undefined);
    throw error;
  } finally {
    client.release();
  }
}
