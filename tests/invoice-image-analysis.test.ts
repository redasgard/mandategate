import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { pool } from "../src/db/pool";
import { storeUntrustedInvoiceArtifact } from "../src/artifacts/postgres-store";
import { ExperientialInvoiceVisionGateway } from "../src/ai/gateway/experiential-vision";
import { analyzeStoredInvoiceImage, getInvoiceImageObservation } from "../src/invoices/image-analysis";

const owner = "vision_test_" + randomUUID();
const outsider = "vision_test_" + randomUUID();
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6Z0AAAAASUVORK5CYII=",
  "base64",
);
let artifactId = "";
let postCount = 0;

function mockedGateway(zdrEnabled = true) {
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
        "x-gateway-zdr": "true",
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
  for (const id of [owner, outsider]) {
    await pool.query("insert into organizations(id, name) values ($1, 'Image test org')", [id]);
  }
  const artifact = await storeUntrustedInvoiceArtifact({
    organizationId: owner,
    contentType: "image/png",
    content: png,
  });
  artifactId = artifact.artifactId;
});

afterAll(async () => {
  await pool.query("delete from invoice_image_observations where organization_id = any($1::text[])", [[owner, outsider]]);
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
});
