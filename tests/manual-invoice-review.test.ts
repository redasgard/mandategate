import { createHash, randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { pool } from "../src/db/pool";
import { storeUntrustedInvoiceArtifact, loadInvoiceArtifactForHumanReview } from "../src/artifacts/postgres-store";
import { recordExplicitHumanInvoiceFacts } from "../src/authority/manual-invoice-review";

const org = "manual_review_" + randomUUID();
const outsiderOrg = "manual_review_" + randomUUID();
const sha = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=", "base64");
const pdf = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
let adminId = "";
let artifactId = "";
let pdfId = "";

const fact = (value: string, sourceFragment: string, pageNumber = 1) => ({
  value, sourceFragment, pageNumber,
});
function sampleReview(artifact: string, digest: string) {
  return {
    artifactId: artifact,
    expectedArtifactSha256: digest,
    reviewerReason: "Inspected original stored PNG image and manually transcribed five fields",
    facts: {
      vendor_name: fact("Trusted Components", "Trusted Components"),
      invoice_number: fact("INV-309", "Invoice INV-309"),
      currency: fact("USD", "USD"),
      total_amount_decimal: fact("1.01", "Total Due 1.01"),
      invoice_payment_destination: fact("trusted@example.com", "trusted@example.com"),
    },
  };
}

beforeAll(async () => {
  const user = await pool.query('select id from "user" where email=$1', [
    process.env.DEMO_ADMIN_EMAIL ?? "admin@mandategate.local",
  ]);
  if (!user.rows[0]) throw new Error("SEED_ADMIN_REQUIRED");
  adminId = user.rows[0].id;
  await pool.query("insert into organizations(id,name) values($1,'Manual review tests'),($2,'Other')", [org,outsiderOrg]);
  await pool.query(
    "insert into organization_admin_memberships(user_id,organization_id,role) values($1,$2,'ADMIN')",
    [adminId, org],
  );
  artifactId = (await storeUntrustedInvoiceArtifact({ organizationId:org, contentType:"image/png", content:png })).artifactId;
  pdfId = (await storeUntrustedInvoiceArtifact({ organizationId:org, contentType:"application/pdf", content:pdf })).artifactId;
});
afterAll(async () => { await pool.end(); });

describe("Admin-attested exact-artifact source verification", () => {
  it("refuses source bytes to a foreign tenant or unaffiliated reviewer", async () => {
    expect(await loadInvoiceArtifactForHumanReview("no-such-user", artifactId)).toBeNull();
    const src = await loadInvoiceArtifactForHumanReview(adminId, artifactId);
    expect(src?.content.equals(png)).toBe(true);
    expect(src?.sha256).toBe(sha(png));
    await expect(recordExplicitHumanInvoiceFacts({
      actorUserId:adminId,organizationId:outsiderOrg,
      review:sampleReview(artifactId,sha(png)),
    })).rejects.toMatchObject({code:"REVIEWER_ADMIN_MEMBERSHIP_REQUIRED"});
  });
  it("refuses a mismatched reviewed-artifact digest", async () => {
    await expect(recordExplicitHumanInvoiceFacts({
      actorUserId:adminId, organizationId:org,
      review:sampleReview(artifactId,"0".repeat(64)),
    })).rejects.toMatchObject({code:"ARTIFACT_REVIEW_DIGEST_MISMATCH"});
  });
  it("does not verify a PDF with made-up page references before parser rollout", async () => {
    await expect(recordExplicitHumanInvoiceFacts({
      actorUserId:adminId,organizationId:org,
      review:sampleReview(pdfId,sha(pdf)),
    })).rejects.toMatchObject({code:"MANUAL_SOURCE_FORMAT_NOT_YET_SUPPORTED"});
  });
  it("requires a single image page and a valid final-total label", async () => {
    const wrongPage=sampleReview(artifactId,sha(png));
    wrongPage.facts.vendor_name.pageNumber=2;
    await expect(recordExplicitHumanInvoiceFacts({
      actorUserId:adminId,organizationId:org,review:wrongPage,
    })).rejects.toMatchObject({code:"IMAGE_PAGE_NUMBER_INVALID"});

    const subtotal=sampleReview(artifactId,sha(png));
    subtotal.facts.total_amount_decimal.sourceFragment="Subtotal 1.01";
    await expect(recordExplicitHumanInvoiceFacts({
      actorUserId:adminId,organizationId:org,review:subtotal,
    })).rejects.toMatchObject({code:"MANUAL_LABELED_FIELD_NOT_SUPPORTED"});
  });
  it("records five immutable human-attested fields without granting payment authority", async () => {
    const result=await recordExplicitHumanInvoiceFacts({
      actorUserId:adminId, organizationId:org,
      review:sampleReview(artifactId,sha(png)),
    });
    expect(result).toMatchObject({
      artifactId,artifactSha256:sha(png),issuerAuthenticated:false,
      paymentAuthorized:false,humanAttested:true,machineCorroborated:false,
      sourceCorroborated:false,
    });
    const rows=await pool.query(
      "select field_name,trust_tier,source_page from invoice_claim_field_sources where claim_set_id=$1",
      [result.claimSetId],
    );
    expect(rows.rows).toHaveLength(5);
    expect(rows.rows.every(r=>r.trust_tier===1 && r.source_page===1)).toBe(true);
    const claim = await pool.query("select verification_status from invoice_verified_claim_sets where id=$1",[result.claimSetId]);
    expect(claim.rows[0].verification_status).toBe("UNVERIFIED");
    const actions=await pool.query(
      "select action from invoice_review_actions where claim_set_id=$1",
      [result.claimSetId],
    );
    expect(actions.rows).toHaveLength(1);
    expect(actions.rows[0].action).toBe("FACTS_VERIFIED");
    const payments=await pool.query(
      "select count(*)::int as n from payment_requests where organization_id=$1",[org],
    );
    expect(payments.rows[0].n).toBe(0);
    await expect(pool.query(
      "update invoice_claim_field_sources set normalized_value='999.00' where claim_set_id=$1",
      [result.claimSetId],
    )).rejects.toThrow(/AUTHORITY_PROVENANCE_IMMUTABLE/);
  });
});
