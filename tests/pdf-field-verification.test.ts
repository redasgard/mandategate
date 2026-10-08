import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../src/db/pool";
import { storeUntrustedInvoiceArtifact } from "../src/artifacts/postgres-store";
import { prepareStoredPdfSourcePages } from "../src/invoices/pdf-source-store";
import { verifyStoredPdfFieldsAsAdmin } from "../src/authority/pdf-field-verification";
import { prepareInvoicePaymentProposal } from "../src/authority/payment-proposal";
import { createPdf } from "./helpers/pdf-fixture";

const org="pdf_verified_"+randomUUID();
const foreign="pdf_verified_"+randomUUID();
const sha=(v:Buffer|string)=>createHash("sha256").update(v).digest("hex");
const realPdf=createPdf([
  "Northstar Components Invoice NS-1009 Date 2026-10-01\nDue 2026-11-01 USD Total 1.01 trusted@example.com",
  "Supplementary terms for purchase NS-1009",
]);
const conflictPdf=createPdf([
  "Northstar Components Invoice NS-2001 USD Total 1.01 trusted@example.com",
  "Conflicting invoice page Grand Total 900.00",
]);
let admin="";
let artifactId="";
let conflictId="";
let claimSetId="";

function review(id:string,digest:string,invoiceNumber="NS-1009") {
  const fact=(value:string,sourceFragment:string,pageNumber=1)=>({
    value,sourceFragment,pageNumber,
  });
  return {
    artifactId:id,expectedArtifactSha256:digest,
    reviewerReason:"Independently compared original PDF and parsed page text in admin workflow",
    facts:{
      vendor_name:fact("Northstar Components","Northstar Components"),
      invoice_number:fact(invoiceNumber,"Invoice "+invoiceNumber),
      currency:fact("USD","USD"),
      total_amount_decimal:fact("1.01","Total 1.01"),
      invoice_payment_destination:fact("trusted@example.com","trusted@example.com"),
    },
  };
}
const verify=(data:ReturnType<typeof review>,organizationId=org,actorUserId=admin)=>
  verifyStoredPdfFieldsAsAdmin({actorUserId,organizationId,review:data});

beforeAll(async()=>{
  const found=await pool.query('select id from "user" where email=$1',[
    process.env.DEMO_ADMIN_EMAIL??"admin@mandategate.local",
  ]);
  if(!found.rows[0])throw new Error("SEED_ADMIN_REQUIRED");
  admin=found.rows[0].id;
  await pool.query(
    "insert into organizations(id,name) values($1,'PDF verified source test'),($2,'Foreign tenant')",
    [org,foreign],
  );
  await pool.query(
    "insert into organization_admin_memberships(user_id,organization_id,role) values($1,$2,'ADMIN')",
    [admin,org],
  );
  artifactId=(await storeUntrustedInvoiceArtifact({
    organizationId:org,contentType:"application/pdf",content:realPdf,
  })).artifactId;
  conflictId=(await storeUntrustedInvoiceArtifact({
    organizationId:org,contentType:"application/pdf",content:conflictPdf,
  })).artifactId;
  await prepareStoredPdfSourcePages(org,artifactId);
  await prepareStoredPdfSourcePages(org,conflictId);
});
afterAll(async()=>{await pool.end();});

describe("admin-attested PDF T2 fields derived from actual stored page text",()=>{
  it("rejects absent admin membership and cross-tenant claim creation",async()=>{
    const input=review(artifactId,sha(realPdf));
    await expect(verify(input,foreign)).rejects.toMatchObject({
      code:"PDF_REVIEWER_NOT_AUTHORIZED",
    });
    await expect(verify(input,org,"not-a-real-user")).rejects.toMatchObject({
      code:"PDF_REVIEWER_NOT_AUTHORIZED",
    });
  });
  it("rejects a stale exact artifact SHA before any claim insert",async()=>{
    await expect(verify(review(artifactId,"0".repeat(64)))).rejects.toMatchObject({
      code:"PDF_REVIEW_ARTIFACT_STALE",
    });
  });
  it("rejects invoice-value substitution and quote-only value laundering",async()=>{
    const wrong=review(artifactId,sha(realPdf));
    wrong.facts.total_amount_decimal.value="900.00";
    await expect(verify(wrong)).rejects.toMatchObject({
      code:"PDF_FIELD_NOT_INDEPENDENTLY_CORROBORATED",
    });
    const sourceFake=review(artifactId,sha(realPdf));
    sourceFake.facts.total_amount_decimal.sourceFragment="Total 900.00";
    await expect(verify(sourceFake)).rejects.toMatchObject({
      code:"PDF_FIELD_NOT_INDEPENDENTLY_CORROBORATED",
    });
    const forgedReceiver=review(artifactId,sha(realPdf));
    forgedReceiver.facts.invoice_payment_destination.value="attacker@example.com";
    forgedReceiver.facts.invoice_payment_destination.sourceFragment="attacker@example.com";
    await expect(verify(forgedReceiver)).rejects.toMatchObject({
      code:"PDF_FIELD_NOT_INDEPENDENTLY_CORROBORATED",
    });
  });
  it("refuses page misattribution or contradictory totals elsewhere in the same PDF",async()=>{
    const badPage=review(artifactId,sha(realPdf));
    badPage.facts.total_amount_decimal.pageNumber=2;
    await expect(verify(badPage)).rejects.toMatchObject({
      code:"PDF_FIELD_NOT_INDEPENDENTLY_CORROBORATED",
    });
    const conflict=review(conflictId,sha(conflictPdf),"NS-2001");
    await expect(verify(conflict)).rejects.toMatchObject({
      code:"PDF_FIELD_NOT_INDEPENDENTLY_CORROBORATED",
    });
  });
  it("stores verified T2 claims with each immutable parser page digest",async()=>{
    const result=await verify(review(artifactId,sha(realPdf)));
    claimSetId=result.claimSetId;
    expect(result).toMatchObject({
      artifactId,artifactSha256:sha(realPdf),
      sourceVerified:true,issuerAuthenticated:false,paymentAuthorized:false,
    });
    expect(result.fieldEvidence).toHaveLength(5);
    const c=await pool.query(
      "select source_kind,verification_status,verifier_actor from invoice_verified_claim_sets where id=$1",
      [claimSetId],
    );
    expect(c.rows[0]).toMatchObject({
      source_kind:"PDF_TEXT",verification_status:"VERIFIED",verifier_actor:admin,
    });
    const fields=await pool.query(
      [
        "select f.field_name,f.trust_tier,f.source_parser_version,f.source_page_text_sha256,",
        "p.page_text_sha256 as persisted_page_digest",
        "from invoice_claim_field_sources f",
        "join invoice_pdf_source_pages p on p.organization_id=f.organization_id",
        "and p.artifact_id=f.artifact_id and p.parser_version=f.source_parser_version",
        "and p.page_number=f.source_page",
        "where f.claim_set_id=$1",
      ].join(" "),
      [claimSetId],
    );
    expect(fields.rows).toHaveLength(5);
    expect(fields.rows.every(x=>
      x.trust_tier===2 &&
      x.source_parser_version==="pdfjs-dist@6.4.299/normalized-text-v1" &&
      x.source_page_text_sha256===x.persisted_page_digest
    )).toBe(true);
    const actions=await pool.query(
      "select action from invoice_review_actions where claim_set_id=$1",[claimSetId],
    );
    expect(actions.rows).toHaveLength(1);
    expect(actions.rows[0].action).toBe("FACTS_VERIFIED");
  });
  it("enforces source-parser FK, immutability and identical-review replay denial",async()=>{
    const repeated=review(artifactId,sha(realPdf));
    await expect(verify(repeated)).rejects.toMatchObject({
      code:"PDF_CLAIM_ALREADY_VERIFIED",
    });
    await expect(pool.query(
      "update invoice_claim_field_sources set source_page_text_sha256=$2 where claim_set_id=$1",
      [claimSetId,"0".repeat(64)],
    )).rejects.toThrow(/AUTHORITY_PROVENANCE_IMMUTABLE/);

    const client=await pool.connect();
    try {
      await client.query("begin");
      const mock=(await client.query(
        [
          "insert into invoice_verified_claim_sets",
          "(organization_id,artifact_id,artifact_sha256,observation_sha256,",
          "snapshot_sha256,source_kind,verification_status,verifier_method,",
          "verifier_actor,verifier_proof_sha256)",
          "values($1,$2,$3,$4,$5,'PDF_TEXT','VERIFIED','ADMIN_EXPLICIT',$6,$7)",
          "returning id",
        ].join(" "),
        [org,artifactId,sha(realPdf),sha("unique-src-"+randomUUID()),
         sha("unique-snapshot-"+randomUUID()),admin,sha("proof")],
      )).rows[0].id;
      await expect(client.query(
        [
          "insert into invoice_claim_field_sources",
          "(organization_id,artifact_id,claim_set_id,field_name,",
          "normalized_value,claimed_value_sha256,trust_tier,verifier_proof_sha256)",
          "values($1,$2,$3,'total_amount_decimal','1.01',$4,2,$5)",
        ].join(" "),
        [org,artifactId,mock,sha("1.01"),sha("proof")],
      )).rejects.toThrow(/PDF_FIELD_PAGE_SOURCE_REQUIRED/);
    } finally {
      await client.query("rollback").catch(()=>undefined);
      client.release();
    }
  });
  it("blocks payment proposal without independent origin proof even for genuine PDF T2",async()=>{
    const result=await prepareInvoicePaymentProposal({
      organizationId:org,artifactId,claimSetId,
      attestationId:randomUUID(),
    });
    expect(result).toMatchObject({
      outcome:"ESCALATE",paymentAuthorized:false,
      reasonCodes:["ISSUER_ORIGIN_UNVERIFIED_OR_EXPIRED"],
    });
    const payments=await pool.query(
      "select count(*)::int as n from payment_requests where organization_id=$1",[org],
    );
    expect(payments.rows[0].n).toBe(0);
  });
});
