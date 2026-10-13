import { createHash, randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { pool } from "../src/db/pool";
import { createPdf } from "./helpers/pdf-fixture";
import { PDF_RASTERIZER_VERSION } from "../src/invoices/pdf-raster";
import { storeUntrustedInvoiceArtifact } from "../src/artifacts/postgres-store";
import { ExperientialInvoiceVisionGateway } from "../src/ai/gateway/experiential-vision";
import { analyzeStoredInvoiceImage, getInvoiceImageObservation } from "../src/invoices/image-analysis";

const owner = "vision_test_" + randomUUID();
const outsider = "vision_test_" + randomUUID();
const recovered = "vision_test_" + randomUUID();
const exhausted = "vision_test_" + randomUUID();
const concurrent = "vision_test_" + randomUUID();
const synthetic = "vision_test_" + randomUUID();
const extraArtifacts: Record<string, string> = {};
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
  "base64",
);
let artifactId = "";
let postCount = 0;

function mockedGateway(zdrEnabled = true, servedZdr = true) {
  const fakeFetch: typeof fetch = async (input: any, init: any = {}) => {
    const url = String(input);
    const json = (data: unknown, headers: Record<string, string> = {}) =>
      new Response(JSON.stringify(data), { headers: { "content-type": "application/json", ...headers } });
    if (url.endsWith("/api/whoami")) return json({ org_id: "vision_test_org" });
    if (url.endsWith("/api/orgs/vision_test_org/zero-data-retention")) {
      return json({ enabled: zdrEnabled, partial: false });
    }
    if (url.endsWith("/api/orgs/vision_test_org/provider-policy")) {
      return json({ require_zdr: true, require_no_training: true });
    }
    if (url.endsWith("/api/orgs/vision_test_org/telemetry-settings")) {
      return json({ capture_prompt_content: false });
    }
    if (url.endsWith("/v1/models")) {
      return json({ data: [{ id: "glm-5.3-flash", data_policy: { zdr_on_request: true }, uncensored: false }] });
    }
    if (url.endsWith("/v1/chat/completions")) {
      postCount++;
      const body = JSON.parse(String(init.body));
      const field = (value: string | null, text: string) => ({
        value, confidence: 0.99,
        evidence: value ? [{ artifact_id: artifactId, page_number: 1, source_fragment: text }] : [],
      });
      const output = {
        vendor_name: field("Vendor A", "Vendor A"),
        invoice_number: field("INV-101", "INV-101"),
        invoice_date: field(null, ""),
        due_date: field(null, ""),
        currency: field("USD", "USD"),
        total_amount_decimal: field("1.01", "1.01"),
        invoice_payment_destination: field("untrusted@example.com", "untrusted@example.com"),
        line_items: [],
        observed_instructions: [],
      };
      if (body.model !== "glm-5.3-flash") throw new Error("wrong model");
      return json({
        model: "glm-5.3-flash",
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify(output) } }],
      }, {
        "x-gateway-zdr": String(servedZdr),
        "x-gateway-provider": "zai",
        "x-gateway-canonical-model": "glm-5.3-flash",
        "x-request-id": "req-vision-test",
      });
    }
    throw new Error("unexpected url " + url);
  };
  return new ExperientialInvoiceVisionGateway({ apiKey: "ci-fake-key", fetchImpl: fakeFetch });
}

beforeAll(async () => {
  for (const id of [owner, outsider, recovered, exhausted, concurrent, synthetic]) {
    await pool.query("insert into organizations(id, name) values ($1, 'Image test org')", [id]);
  }
  const artifact = await storeUntrustedInvoiceArtifact({
    organizationId: owner,
    contentType: "image/png",
    content: png,
  });
  artifactId = artifact.artifactId;
  for (const organizationId of [recovered, exhausted, concurrent, synthetic]) {
    const extra = await storeUntrustedInvoiceArtifact({ organizationId, contentType: "image/png", content: png });
    extraArtifacts[organizationId] = extra.artifactId;
  }
});

afterAll(async () => {
  await pool.query("delete from invoice_image_observations where organization_id=$1", [synthetic]);
  await pool.query("delete from invoice_artifacts where organization_id=$1", [synthetic]);
  await pool.query("delete from organizations where id=$1", [synthetic]);
  await pool.query("delete from invoice_image_observations where organization_id = any($1::text[])", [[owner, outsider, recovered, exhausted, concurrent]]);
  await pool.query("delete from invoice_artifacts where organization_id = any($1::text[])", [[owner, outsider]]);
  await pool.query("delete from organizations where id = any($1::text[])", [[owner, outsider]]);
  await pool.end();
});

describe("tenant-scoped GLM invoice image observation", () => {
  it("forbids other organizations from observing or retrieving image data", async () => {
    await expect(analyzeStoredInvoiceImage(outsider, artifactId, mockedGateway())).rejects.toMatchObject({
      code: "ARTIFACT_NOT_FOUND",
    });
    expect(await getInvoiceImageObservation(outsider, artifactId)).toBeNull();
    expect(postCount).toBe(0);
  });

  it("rejects a corrupt image before privacy preflight or inference", async () => {
    const corrupt = Buffer.from(png);
    corrupt[42] ^= 1;
    const artifact = await storeUntrustedInvoiceArtifact({
      organizationId: outsider,
      contentType: "image/png",
      content: corrupt,
    });
    const initialPostCount = postCount;
    await expect(analyzeStoredInvoiceImage(outsider, artifact.artifactId, mockedGateway()))
      .rejects.toMatchObject({ code: "PNG_CHUNK_CRC_INVALID", httpStatus: 422 });
    expect(postCount).toBe(initialPostCount);
    const state = await pool.query(
      "select analysis_status from invoice_artifacts where id = $1", [artifact.artifactId],
    );
    expect(state.rows[0].analysis_status).toBe("STORED_UNTRUSTED");
  });

  it("refuses provider capture/ZDR violations before claiming or sending bytes", async () => {
    await expect(analyzeStoredInvoiceImage(owner, artifactId, mockedGateway(false))).rejects.toMatchObject({
      code: "EXPERIENTIAL_ACCOUNT_ZDR_REQUIRED",
    });
    const state = await pool.query("select analysis_status from invoice_artifacts where id = $1", [artifactId]);
    expect(state.rows[0].analysis_status).toBe("STORED_UNTRUSTED");
    expect(postCount).toBe(0);
  });

  it("persists precisely one advisory observation and forbids repeat inference", async () => {
    const result = await analyzeStoredInvoiceImage(owner, artifactId, mockedGateway());
    expect(result.paymentAuthorized).toBe(false);
    expect(result.status).toBe("ESCALATE");
    expect(result.reasonCodes).toContain("IMAGE_EVIDENCE_NOT_VERIFIED");
    expect(result.evidence.model).toBe("glm-5.3-flash");
    expect(result.evidence.zdr).toBe(true);
    expect(postCount).toBe(1);

    const observation = await getInvoiceImageObservation(owner, artifactId);
    expect(observation).toMatchObject({
      artifact_id: artifactId,
      state: "ESCALATE",
      model: "glm-5.3-flash",
      gateway_zdr: true,
    });
    const saved = await pool.query("select analysis_status from invoice_artifacts where id = $1", [artifactId]);
    expect(saved.rows[0].analysis_status).toBe("ESCALATED");
    await expect(analyzeStoredInvoiceImage(owner, artifactId, mockedGateway())).rejects.toMatchObject({
      code: "ARTIFACT_ALREADY_ANALYZED_OR_CLAIMED",
    });
    expect(postCount).toBe(1);
  });
  it("reclaims a stale PENDING job once, preserving one observation", async () => {
    const staleId = extraArtifacts[recovered];
    await pool.query(
      "update invoice_artifacts set analysis_status = 'PENDING', analysis_claim_id = $2, analysis_claimed_at = now() - interval '2 minutes', analysis_attempts = 1 where id = $1",
      [staleId, "crashed-worker"],
    );
    const result = await analyzeStoredInvoiceImage(recovered, staleId, mockedGateway());
    expect(result.status).toBe("ESCALATE");
    const state = await pool.query(
      "select analysis_status, analysis_attempts, analysis_claim_id from invoice_artifacts where id = $1",
      [staleId],
    );
    expect(state.rows[0]).toMatchObject({
      analysis_status: "ESCALATED",
      analysis_attempts: 2,
      analysis_claim_id: null,
    });
    const count = await pool.query(
      "select count(*)::int as n from invoice_image_observations where artifact_id = $1",
      [staleId],
    );
    expect(count.rows[0].n).toBe(1);
  });

  it("refuses attempts beyond the bounded retry cap", async () => {
    const id = extraArtifacts[exhausted];
    await pool.query(
      "update invoice_artifacts set analysis_status = 'FAILED', analysis_attempts = 3 where id = $1",
      [id],
    );
    const before = postCount;
    await expect(analyzeStoredInvoiceImage(exhausted, id, mockedGateway())).rejects.toMatchObject({
      code: "ARTIFACT_ANALYSIS_NOT_CLAIMABLE",
    });
    expect(postCount).toBe(before);
  });

  it("scanned single-page PDF reaches actual PNG vision but always escalates",async()=>{
    const scan=createPdf([""]);
    const stored=await storeUntrustedInvoiceArtifact({
      organizationId:outsider,contentType:"application/pdf",content:scan,
    });
    const originalPostCount=postCount;
    const result=await analyzeStoredInvoiceImage(outsider,stored.artifactId,mockedGateway());
    expect(postCount-originalPostCount).toBe(1);
    expect(result.status).toBe("ESCALATE");
    expect(result.reasonCodes).toContain("SCANNED_PDF_VISUAL_OBSERVATION_UNVERIFIED");
    expect(result.paymentAuthorized).toBe(false);
    const raster=result.evidence.sourceRasterization;
    expect(raster?.pageNumber).toBe(1);
    expect(raster?.pageCount).toBe(1);
    expect(raster?.rasterizerVersion).toBe(PDF_RASTERIZER_VERSION);
    expect(raster?.sourceSha256).toBe(stored.sha256);
    expect(raster?.renderedPngSha256).toMatch(/^[a-f0-9]{64}$/);
    const saved=await getInvoiceImageObservation(outsider,stored.artifactId);
    expect(saved.rendered_input_sha256).toBe(raster?.renderedPngSha256);
    expect(saved.input_sha256).toBe(stored.sha256);
    expect(saved.rendered_page_number).toBe(1);
    expect(saved.rasterizer_version).toBe(PDF_RASTERIZER_VERSION);
  });
  it("multi-page scanned PDF fails closed before contacting vision provider",async()=>{
    const scan=createPdf(["",""]);
    const stored=await storeUntrustedInvoiceArtifact({
      organizationId:outsider,contentType:"application/pdf",content:scan,
    });
    const previous=postCount;
    await expect(analyzeStoredInvoiceImage(outsider,stored.artifactId,mockedGateway()))
      .rejects.toMatchObject({code:"PDF_MULTIPAGE_SCAN_REQUIRES_REVIEW",httpStatus:422});
    expect(postCount).toBe(previous);
    const status=await pool.query("select analysis_status from invoice_artifacts where id=$1",[stored.artifactId]);
    expect(status.rows[0].analysis_status).toBe("STORED_UNTRUSTED");
  });


  it("persists non-ZDR synthetic observations as escalated and never as payment authority", async () => {
    const digest = createHash("sha256").update(png).digest("hex");
    vi.stubEnv("MANDATEGATE_DEPLOYMENT_ROLE", "demo");
    vi.stubEnv("MANDATEGATE_SYNTHETIC_NON_ZDR_TEST", "1");
    vi.stubEnv("PAYPAL_BASE_URL", "https://api-m.sandbox.paypal.com");
    vi.stubEnv("BETTER_AUTH_URL", "http://127.0.0.1:3000");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("RENDER_SERVICE_ID", "");
    vi.stubEnv("MANDATEGATE_SYNTHETIC_NON_ZDR_SOURCE_SHA256_ALLOWLIST", digest);
    try {
      const before = postCount;
      const result = await analyzeStoredInvoiceImage(
        synthetic, extraArtifacts[synthetic], mockedGateway(false, false),
        { syntheticNonZdrTest: true },
      );
      expect(postCount - before).toBe(1);
      expect(result.paymentAuthorized).toBe(false);
      expect(result.status).toBe("ESCALATE");
      expect(result.reasonCodes).toContain("SYNTHETIC_NON_ZDR_TEST_ONLY");
      expect(result.evidence).toMatchObject({ zdr: false, syntheticNonZdrTest: true });
      const stored = await getInvoiceImageObservation(synthetic, extraArtifacts[synthetic]);
      expect(stored).toMatchObject({ state: "ESCALATE", gateway_zdr: false });
      expect(stored.reason_codes).toContain("SYNTHETIC_NON_ZDR_TEST_ONLY");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("permits only one concurrent inference claim for a fresh artifact", async () => {
    const id = extraArtifacts[concurrent];
    const before = postCount;
    const outcomes = await Promise.allSettled([
      analyzeStoredInvoiceImage(concurrent, id, mockedGateway()),
      analyzeStoredInvoiceImage(concurrent, id, mockedGateway()),
    ]);
    expect(outcomes.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((x) => x.status === "rejected")).toHaveLength(1);
    expect(postCount - before).toBe(1);
  });

});
