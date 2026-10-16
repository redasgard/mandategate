import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../src/db/pool";
import { storeUntrustedInvoiceArtifact } from "../src/artifacts/postgres-store";
import { ExperientialInvoiceVisionGateway } from "../src/ai/gateway/experiential-vision";
import { analyzeStoredInvoiceImage, getInvoiceImageObservation } from "../src/invoices/image-analysis";
import { prepareStoredPdfSourcePages } from "../src/invoices/pdf-source-store";
import { verifyStoredPdfFieldsAsAdmin } from "../src/authority/pdf-field-verification";
import { prepareInvoicePaymentProposal } from "../src/authority/payment-proposal";
import { createScannedPdf } from "./helpers/pdf-fixture";

// This is a CI-local security regression, never a hosted provider/payment test.
const organizationId = "t1_authority_" + randomUUID();
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
let artifactId = "";
let artifactSha256 = "";
let reviewerId = "";
let modelPosts = 0;

function localVisionGateway() {
  const json = (data: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(data), {
      headers: { "content-type": "application/json", ...headers },
    });
  const fakeFetch: typeof fetch = async (url, options) => {
    const path = String(url);
    if (path.endsWith("/api/whoami")) return json({ org_id: "isolated_ci" });
    if (path.endsWith("/api/orgs/isolated_ci/zero-data-retention"))
      return json({ enabled: true, partial: false });
    if (path.endsWith("/api/orgs/isolated_ci/provider-policy"))
      return json({ require_zdr: true, require_no_training: true });
    if (path.endsWith("/api/orgs/isolated_ci/telemetry-settings"))
      return json({ capture_prompt_content: false });
    if (path.endsWith("/v1/models"))
      return json({ data: [{ id: "glm-5.3-flash", data_policy: { zdr_on_request: true }, uncensored: false }] });
    if (path.endsWith("/v1/chat/completions")) {
      modelPosts++;
      const request = JSON.parse(String(options?.body));
      if (request.model !== "glm-5.3-flash")
        throw Error("UNEXPECTED_MODEL");
      const field = (value: string | null, quote: string) => ({
        value,
        confidence: 0.99,
        evidence: value ? [{
          artifact_id: artifactId, page_number: 1, source_fragment: quote,
        }] : [],
      });
      const extraction = {
        vendor_name: field("Northstar Components", "Northstar Components"),
        invoice_number: field("SCAN-SYNTH-0001", "Invoice SCAN-SYNTH-0001"),
        invoice_date: field("2026-10-15", "Date 2026-10-15"),
        due_date: field(null, ""),
        currency: field("USD", "USD"),
        total_amount_decimal: field("125.00", "Total Due: USD 125.00"),
        invoice_payment_destination: field(
          "fictional-payee@synthetic.invalid",
          "Printed receiver: fictional-payee@synthetic.invalid",
        ),
        observed_instructions: [],
        line_items: [],
      };
      return json({
        model: "glm-5.3-flash",
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify(extraction) } }],
      }, {
        "x-gateway-zdr": "true",
        "x-gateway-provider": "ci-mock-only",
        "x-gateway-canonical-model": "glm-5.3-flash",
        "x-request-id": "synthetic-ci-observation-only",
      });
    }
    throw Error("UNEXPECTED_EXTERNAL_REQUEST");
  };
  return new ExperientialInvoiceVisionGateway({
    apiKey: "ci-local-fake-key", fetchImpl: fakeFetch,
  });
}

beforeAll(async () => {
  const user = await pool.query(
    'select id from "user" where email=$1',
    [process.env.DEMO_ADMIN_EMAIL ?? "admin@mandategate.local"],
  );
  if (!user.rows[0]?.id) throw Error("CI_ADMIN_SEED_REQUIRED");
  reviewerId = user.rows[0].id as string;
  await pool.query("insert into organizations (id,name) values($1,$2)", [
    organizationId, "Isolated model-to-authority regression",
  ]);
  await pool.query(
    "insert into organization_admin_memberships(user_id,organization_id,role) values($1,$2,'ADMIN')",
    [reviewerId, organizationId],
  );
  const stored = await storeUntrustedInvoiceArtifact({
    organizationId,
    contentType: "application/pdf",
    content: await createScannedPdf(),
  });
  artifactId = stored.artifactId;
  artifactSha256 = stored.sha256;
});
afterAll(async () => { await pool.end(); });

describe("persisted GLM scanned invoice cannot acquire payment authority", () => {
  it("binds a fully shaped high-confidence T1 observation to the original scan but not a T2 source", async () => {
    const result = await analyzeStoredInvoiceImage(
      organizationId, artifactId, localVisionGateway(),
    );
    expect(modelPosts).toBe(1);
    expect(result.status).toBe("ESCALATE");
    expect(result.paymentAuthorized).toBe(false);
    expect(result.reasonCodes).toContain("IMAGE_EVIDENCE_NOT_VERIFIED");
    expect(result.reasonCodes).toContain("SCANNED_PDF_VISUAL_OBSERVATION_UNVERIFIED");
    expect(result.evidence.sourceRasterization?.sourceSha256).toBe(artifactSha256);
    expect(result.evidence.sourceRasterization?.renderedPngSha256).toMatch(/^[a-f0-9]{64}$/);

    const observed = await getInvoiceImageObservation(organizationId, artifactId);
    expect(observed).toMatchObject({
      artifact_id: artifactId,
      state: "ESCALATE",
      error_code: null,
      input_sha256: artifactSha256,
      gateway_request_id: "synthetic-ci-observation-only",
      provider_name: "ci-mock-only",
      gateway_zdr: true,
    });
    expect(observed.reason_codes).toContain("IMAGE_EVIDENCE_NOT_VERIFIED");
    expect(observed.extraction.vendor_name.value).toBe("Northstar Components");
    expect(observed.extraction.total_amount_decimal.value).toBe("125.00");
    expect(await getInvoiceImageObservation("foreign_org", artifactId)).toBeNull();

    await expect(prepareStoredPdfSourcePages(organizationId, artifactId))
      .rejects.toMatchObject({ code: "PDF_PAGE_TEXT_UNAVAILABLE" });
    const review = {
      artifactId,
      expectedArtifactSha256: artifactSha256,
      reviewerReason: "CI-only negative control: raster text is not source-verified PDF text",
      facts: {
        vendor_name: { value: "Northstar Components", sourceFragment: "Northstar Components", pageNumber: 1 },
        invoice_number: { value: "SCAN-SYNTH-0001", sourceFragment: "Invoice SCAN-SYNTH-0001", pageNumber: 1 },
        currency: { value: "USD", sourceFragment: "USD", pageNumber: 1 },
        total_amount_decimal: { value: "125.00", sourceFragment: "Total Due: USD 125.00", pageNumber: 1 },
        invoice_payment_destination: {
          value: "fictional-payee@synthetic.invalid",
          sourceFragment: "Printed receiver: fictional-payee@synthetic.invalid",
          pageNumber: 1,
        },
      },
    };
    await expect(verifyStoredPdfFieldsAsAdmin({
      actorUserId: reviewerId, organizationId, review,
    })).rejects.toMatchObject({ code: "PDF_INDEPENDENT_SOURCE_NOT_PREPARED" });

    // Adversarial database-fixture attempt: even a preexisting model-kind
    // claim stamped VERIFIED with apparently complete metadata cannot enter
    // proposal authority. The test does not expose this SQL as an API route.
    for (const status of ["UNVERIFIED", "VERIFIED"] as const) {
      const claimed = await pool.query([
        "insert into invoice_verified_claim_sets",
        "(organization_id,artifact_id,artifact_sha256,observation_sha256,",
        "snapshot_sha256,source_kind,verification_status,",
        "verifier_method,verifier_actor,verifier_proof_sha256)",
        "values($1,$2,$3,$4,$5,'GLM_IMAGE',$6,$7,$8,$9) returning id",
      ].join(" "), [
        organizationId, artifactId, artifactSha256,
        sha("mock-model-observation:" + status),
        sha("mock-claim-snapshot:" + status),
        status, status === "VERIFIED" ? "ADMIN_EXPLICIT" : null,
        status === "VERIFIED" ? reviewerId : null,
        status === "VERIFIED" ? sha("false-proof-not-a-source") : null,
      ]);
      const proposal = await prepareInvoicePaymentProposal({
        organizationId, artifactId,
        claimSetId: claimed.rows[0].id as string,
        attestationId: randomUUID(),
      });
      expect(proposal).toMatchObject({
        outcome: "ESCALATE",
        reasonCodes: ["SOURCE_CLAIM_NOT_INDEPENDENTLY_VERIFIED"],
        bindingId: null, tupleSha256: null, paymentAuthorized: false,
      });
    }

    const counts = await pool.query([
      "select",
      "(select count(*)::int from invoice_pdf_source_pages where organization_id=$1 and artifact_id=$2) as t2_pages,",
      "(select count(*)::int from invoice_verified_claim_sets where organization_id=$1 and artifact_id=$2",
      "and source_kind='PDF_TEXT' and verification_status='VERIFIED') as t2_claims,",
      "(select count(*)::int from invoice_origin_attestations where organization_id=$1 and artifact_id=$2) as issuer_attestations,",
      "(select count(*)::int from payment_authority_bindings where organization_id=$1 and artifact_id=$2) as bindings,",
      "(select count(*)::int from payment_requests where organization_id=$1) as payment_requests",
    ].join(" "), [organizationId, artifactId]);
    expect(counts.rows[0]).toMatchObject({
      t2_pages: 0,
      t2_claims: 0,
      issuer_attestations: 0,
      bindings: 0,
      payment_requests: 0,
    });
    expect(modelPosts).toBe(1); // CI stub only, never a real inference.
  });
});
