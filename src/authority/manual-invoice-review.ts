import { createHash } from "node:crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { validateInvoiceImageContainer } from "../invoices/image-integrity";
import { verifyFieldEvidenceBinding } from "../invoices/semantic-evidence";
import { hashUnverifiedClaimSnapshot } from "./contracts";
import { invoiceDecimalToCents } from "../invoices/normalize";

const fieldNames=[
  "vendor_name","invoice_number","currency","total_amount_decimal","invoice_payment_destination",
] as const;

const manualFact=z.object({
  value:z.string().min(1).max(320),
  sourceFragment:z.string().min(3).max(1000),
  pageNumber:z.number().int().min(1).max(20),
}).strict();

export const manualInvoiceReviewSchema=z.object({
  artifactId:z.string().uuid(),
  expectedArtifactSha256:z.string().regex(/^[a-f0-9]{64}$/),
  facts:z.object(Object.fromEntries(
    fieldNames.map(name=>[name,manualFact])
  ) as Record<(typeof fieldNames)[number],typeof manualFact>).strict(),
  reviewerReason:z.string().min(16).max(500),
}).strict();

export class ManualInvoiceReviewError extends Error {
  constructor(public readonly code:string,public readonly httpStatus:number) {
    super(code);
    this.name="ManualInvoiceReviewError";
  }
}
function reject(code:string,status=422):never{throw new ManualInvoiceReviewError(code,status);}
const sha=(value:string|Buffer)=>createHash("sha256").update(value).digest("hex");

/**
 * Gate F: explicit independent ADMIN visual transcription. A model cannot
 * invoke this, authenticate as an admin, or elevate its self-reported quotes.
 * A human attests to checking the actual stored image independently.
 * Typed fragments are HUMAN ATTESTATION, not machine-parsed source proof.
 * These records stay UNVERIFIED / T1 until independent source corroboration;
 * no payment proposal may elevate the values merely because admin typed them.
 * This does NOT authenticate the issuer and DOES NOT approve a payment.
 */
export async function recordExplicitHumanInvoiceFacts(input:{
  actorUserId:string;
  organizationId:string;
  review:unknown;
}) {
  const parsed=manualInvoiceReviewSchema.safeParse(input.review);
  if(!parsed.success)reject("INVALID_MANUAL_FACTS_SCHEMA");
  const {artifactId,expectedArtifactSha256,facts,reviewerReason}=parsed.data;

  const client=await pool.connect();
  try {
    await client.query("begin");
    const admin=await client.query(
      [
        "select user_id from organization_admin_memberships",
        "where user_id=$1 and organization_id=$2 and role='ADMIN' and active=true for share",
      ].join(" "),
      [input.actorUserId,input.organizationId],
    );
    if(!admin.rows[0])reject("REVIEWER_ADMIN_MEMBERSHIP_REQUIRED",403);

    const artifact=await client.query(
      [
        "select sha256,mime_type,byte_size,content",
        "from invoice_artifacts where id=$1 and organization_id=$2 for share",
      ].join(" "),
      [artifactId,input.organizationId],
    );
    if(!artifact.rows[0])reject("INVOICE_ARTIFACT_NOT_FOUND",404);
    const row=artifact.rows[0];
    const raw:Buffer=row.content;
    if(raw.length!==row.byte_size || sha(raw)!==row.sha256)reject("INVOICE_ARTIFACT_INTEGRITY_FAILURE");
    if(expectedArtifactSha256!==row.sha256)reject("ARTIFACT_REVIEW_DIGEST_MISMATCH",409);
    // The first auditable human-transcription path covers PNG only. JPEG's
    // entropy decoding and PDF's page parsing have not been verified here.
    // Neither format may be promoted to source corroboration by typed text.
    if(row.mime_type!=="image/png")reject("MANUAL_SOURCE_FORMAT_NOT_YET_SUPPORTED");
    validateInvoiceImageContainer(raw,"image/png");
    if(fieldNames.some(name=>facts[name].pageNumber!==1))reject("IMAGE_PAGE_NUMBER_INVALID");
    // Never attempt to derive verification from the model's own responses.
    // The reviewer asserts visible labels from the original downloaded file.
    const snapshots=fieldNames.map(name=>{
      const field=facts[name];
      if(!field.sourceFragment.includes(field.value)) {
        reject("MANUAL_SOURCE_FRAGMENT_VALUE_MISMATCH");
      }
      const issues=verifyFieldEvidenceBinding({
        field:name,claimedValue:field.value,
        quote:field.sourceFragment,pageText:field.sourceFragment,
      });
      if(issues.length)reject("MANUAL_LABELED_FIELD_NOT_SUPPORTED");
      if(name==="total_amount_decimal" && invoiceDecimalToCents(field.value)===null) {
        reject("MANUAL_AMOUNT_INVALID");
      }
      return {
        fieldName:name,observedValue:field.value,sourcePage:field.pageNumber,
        sourceQuoteSha256:sha(field.sourceFragment),
      };
    });
    const snapshotSha=hashUnverifiedClaimSnapshot({
      organizationId:input.organizationId,artifactId,artifactSha256:row.sha256,
      observationSha256:sha("human-transcription:"+artifactId+":"+input.actorUserId),
      sourceKind:"HUMAN_TRANSCRIPTION",fields:snapshots,
    });
    const proofSha=sha([
      "mandategate/admin-source-review/v2",input.actorUserId,
      input.organizationId,artifactId,row.sha256,snapshotSha,reviewerReason,
    ].join("\0"));
    const inserted=await client.query(
      [
        "insert into invoice_verified_claim_sets",
        "(organization_id,artifact_id,artifact_sha256,observation_sha256,snapshot_sha256,",
        "source_kind,verification_status,verifier_method,verifier_actor,verifier_proof_sha256)",
        "values($1,$2,$3,$4,$5,'HUMAN_TRANSCRIPTION','UNVERIFIED','ADMIN_EXPLICIT',$6,$7) returning id",
      ].join(" "),
      [
        input.organizationId,artifactId,row.sha256,
        sha("human-transcription:"+artifactId+":"+input.actorUserId),snapshotSha,
        input.actorUserId,proofSha,
      ],
    );
    const claimSetId=inserted.rows[0].id as string;
    for(const snap of snapshots) {
      const value=facts[snap.fieldName];
      await client.query(
        [
          "insert into invoice_claim_field_sources",
          "(organization_id,artifact_id,claim_set_id,field_name,evidence_index,",
          "raw_value,normalized_value,source_page,source_quote_sha256,claimed_value_sha256,",
          "trust_tier,verifier_proof_sha256)",
          "values($1,$2,$3,$4,0,$5,$5,$6,$7,$8,1,$9)",
        ].join(" "),
        [
          input.organizationId,artifactId,claimSetId,snap.fieldName,value.value,
          value.pageNumber,snap.sourceQuoteSha256,sha(value.value),proofSha,
        ],
      );
    }
    await client.query(
      [
        "insert into invoice_review_actions",
        "(organization_id,artifact_id,claim_set_id,actor_user_id,action,reason,evidence_sha256)",
        "values($1,$2,$3,$4,'FACTS_VERIFIED',$5,$6)",
      ].join(" "),
      [input.organizationId,artifactId,claimSetId,input.actorUserId,reviewerReason,proofSha],
    );
    await client.query("commit");
    return {
      claimSetId,artifactId,artifactSha256:row.sha256,
      reviewer:input.actorUserId,verification:"HUMAN_TRANSCRIPTION_RECORDED_UNVERIFIED",
      humanAttested:true as const,machineCorroborated:false as const,
      sourceCorroborated:false as const,
      issuerAuthenticated:false as const,paymentAuthorized:false as const,
    };
  } catch(error) {
    await client.query("rollback").catch(()=>undefined);
    throw error;
  } finally {
    client.release();
  }
}
