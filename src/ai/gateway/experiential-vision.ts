import { createHash } from "node:crypto";
import { loadInvoiceVisionPrompt, invoiceImageUserInstruction } from "../../invoices/prompts";
import { INVOICE_VISION_RESPONSE_FORMAT } from "../../invoices/vision-json-schema";
import type { InvoiceArtifactMime } from "../../artifacts/admission";
import { isSyntheticNonZdrSourceAllowlisted } from "./non-zdr-test-policy";

export const INVOICE_VISION_MODEL = "glm-5.3-flash" as const;
export const EXPERIENTIAL_VISION_ORIGIN = "https://api.experientiallabs.ai";
const PREFLIGHT_TIMEOUT_MS = 8_000;
const INFERENCE_TIMEOUT_MS = 40_000;
const MAX_GATEWAY_RESPONSE_BYTES = 512 * 1024;

export class InvoiceVisionGatewayError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "InvoiceVisionGatewayError";
  }
}

function refused(code: string): never {
  throw new InvoiceVisionGatewayError(code);
}

type FetchLike = typeof fetch;
type GatewayOptions = { apiKey?: string; fetchImpl?: FetchLike };

type RouteProof = {
  requestId: string;
  model: typeof INVOICE_VISION_MODEL;
  provider: string;
  zdr: boolean;
  syntheticNonZdrTest: boolean;
  promptVersion: string;
  promptSha256: string;
  inputArtifactSha256: string;
  usage: { promptTokens: number | null; completionTokens: number | null };
};

export type InvoiceVisionResponse = {
  candidate: unknown;
  routeProof: RouteProof;
};

// Only fields actually validated against the provider metadata API appear in
// this receipt. It contains no key, prompt, document or model response.
export type PrivacyPreflightReceipt = {
  checkedAt: string;
  accountOrgId: string;
  targetModel: typeof INVOICE_VISION_MODEL;
  accountZdr: boolean;
  providerRequiresZdr: boolean;
  providerRequiresNoTraining: boolean;
  promptCaptureDisabled: boolean;
  targetModelHasZdrCapability: boolean;
  syntheticNonZdrTest: boolean;
  documentBytesSubmitted: false;
  servingRouteVerified: false;
};

async function readBoundedJson(response: Response, maxBytes = MAX_GATEWAY_RESPONSE_BYTES): Promise<any> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > maxBytes) {
    refused("EXPERIENTIAL_RESPONSE_TOO_LARGE");
  }
  if (!response.body) refused("EXPERIENTIAL_EMPTY_RESPONSE");
  const reader = response.body.getReader();
  const buffers: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) refused("EXPERIENTIAL_RESPONSE_TOO_LARGE");
      buffers.push(chunk.value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  try {
    const result = new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.concat(buffers.map((b) => Buffer.from(b)), bytes),
    );
    return JSON.parse(result);
  } catch {
    refused("EXPERIENTIAL_RESPONSE_NOT_JSON");
  }
}

function acceptsExactFlashIdentity(value: unknown) {
  return typeof value === "string" &&
    (value === INVOICE_VISION_MODEL || value.endsWith("/" + INVOICE_VISION_MODEL));
}

// Log model *identifiers* only for source-pinned synthetic diagnostics.
// Never log any model response, invoice, prompt, provider credential or arbitrary header.
function safeModelIdentifier(value: unknown): string {
  if (value === null || value === undefined) return "[missing]";
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$/.test(value)) {
    return "[redacted]";
  }
  return value;
}

function safeTokenCount(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : null;
}

export class ExperientialInvoiceVisionGateway {
  private readonly apiKey: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: GatewayOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.EXPLABS_API_KEY ?? "";
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async getJson(path: string): Promise<any> {
    let response: Response;
    try {
      response = await this.fetchImpl(EXPERIENTIAL_VISION_ORIGIN + path, {
        method: "GET",
        headers: { authorization: "Bearer " + this.apiKey, accept: "application/json" },
        signal: AbortSignal.timeout(PREFLIGHT_TIMEOUT_MS),
        cache: "no-store",
      });
    } catch {
      refused("EXPERIENTIAL_PREFLIGHT_UNAVAILABLE");
    }
    if (!response.ok) refused("EXPERIENTIAL_PREFLIGHT_REFUSED");
    return readBoundedJson(response, 4 * 1024 * 1024);
  }

  async verifyPrivacyAndModel(options: {
    syntheticNonZdrSourceSha256?: string;
  } = {}): Promise<PrivacyPreflightReceipt> {
    const syntheticTest = options.syntheticNonZdrSourceSha256 !== undefined;
    if (syntheticTest &&
        !isSyntheticNonZdrSourceAllowlisted(options.syntheticNonZdrSourceSha256!)) {
      refused("SYNTHETIC_NON_ZDR_TEST_NOT_ALLOWED");
    }
    if (!this.apiKey) refused("EXPERIENTIAL_API_KEY_REQUIRED");

    // No image bytes are sent in any of these preflight requests.
    const whoami = await this.getJson("/api/whoami");
    const orgId = whoami?.org_id;
    if (typeof orgId !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(orgId)) {
      refused("EXPERIENTIAL_ORG_ID_UNVERIFIED");
    }

    const root = "/api/orgs/" + encodeURIComponent(orgId);
    const [zdr, policy, telemetry, models] = await Promise.all([
      this.getJson(root + "/zero-data-retention"),
      this.getJson(root + "/provider-policy"),
      this.getJson(root + "/telemetry-settings"),
      this.getJson("/v1/models"),
    ]);

    // The account switch atomically enforces provider ZDR, no training,
    // and disabled content capture. Reject partial/drifted configurations.
    if (!syntheticTest && zdr?.enabled !== true) {
      refused("EXPERIENTIAL_ACCOUNT_ZDR_REQUIRED");
    }
    if (!syntheticTest && zdr?.partial === true) {
      refused("EXPERIENTIAL_ACCOUNT_ZDR_PARTIAL");
    }
    // Paid privacy controls remain mandatory for the strict route.
    // The exact-fixture synthetic demo records their actual states instead.
    if (!syntheticTest && policy?.require_no_training !== true) {
      refused("EXPERIENTIAL_NO_TRAINING_POLICY_REQUIRED");
    }
    if (!syntheticTest && policy?.require_zdr !== true) {
      refused("EXPERIENTIAL_NO_TRAINING_POLICY_REQUIRED");
    }
    if (!syntheticTest && telemetry?.capture_prompt_content !== false) {
      refused("EXPERIENTIAL_PROMPT_CAPTURE_MUST_BE_OFF");
    }
    const model = Array.isArray(models?.data)
      ? models.data.find((item: any) => item?.id === INVOICE_VISION_MODEL)
      : null;
    if (!model || model.uncensored === true) refused("EXPERIENTIAL_FLASH_MODEL_UNAVAILABLE");
    const modelSupportsZdr = model.data_policy?.zdr === true ||
      model.data_policy?.zdr_on_request === true;
    if (!syntheticTest && !modelSupportsZdr) {
      refused("EXPERIENTIAL_FLASH_ZDR_ROUTE_UNAVAILABLE");
    }
    return {
      checkedAt: new Date().toISOString(),
      accountOrgId: orgId,
      targetModel: INVOICE_VISION_MODEL,
      accountZdr: zdr?.enabled === true && zdr?.partial !== true,
      providerRequiresZdr: policy?.require_zdr === true,
      providerRequiresNoTraining: policy?.require_no_training === true,
      promptCaptureDisabled: telemetry?.capture_prompt_content === false,
      targetModelHasZdrCapability: modelSupportsZdr,
      syntheticNonZdrTest: syntheticTest,
      documentBytesSubmitted: false,
      servingRouteVerified: false,
    };
  }

  async observeImage(input: {
    artifactId: string;
    artifactSha256: string;
    mimeType: InvoiceArtifactMime;
    content: Buffer;
    /** Original stored source hash, not a PDF raster hash. Test mode only. */
    syntheticNonZdrSourceSha256?: string;
  }): Promise<InvoiceVisionResponse> {
    if (input.mimeType !== "image/png" && input.mimeType !== "image/jpeg") {
      refused("INVOICE_VISION_IMAGES_ONLY");
    }
    if (input.content.length === 0 || input.content.length > 10 * 1024 * 1024 ||
      !/^[a-f0-9]{64}$/.test(input.artifactSha256) ||
      createHash("sha256").update(input.content).digest("hex") !== input.artifactSha256) {
      refused("INVOICE_IMAGE_INPUT_INVALID");
    }
    const syntheticTest = input.syntheticNonZdrSourceSha256 !== undefined;
    await this.verifyPrivacyAndModel(syntheticTest
      ? { syntheticNonZdrSourceSha256: input.syntheticNonZdrSourceSha256 }
      : {});
    const prompt = await loadInvoiceVisionPrompt();

    const requestBody = {
      model: INVOICE_VISION_MODEL,
      stream: false,
      max_tokens: 8192,
      // A synthetic non-ZDR test cannot request a ZDR guarantee it lacks.
      // Provider-side policy may still refuse this request, which is safe.
      ...(syntheticTest ? {} : { provider: { zdr: true } }),
      response_format: INVOICE_VISION_RESPONSE_FORMAT,
      messages: [
        { role: "system", content: prompt.systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: invoiceImageUserInstruction(input.artifactId) },
            {
              type: "image_url",
              image_url: {
                url: "data:" + input.mimeType + ";base64," + input.content.toString("base64"),
              },
            },
          ],
        },
      ],
    };

    let response: Response;
    try {
      response = await this.fetchImpl(EXPERIENTIAL_VISION_ORIGIN + "/v1/chat/completions", {
        method: "POST",
        headers: {
          authorization: "Bearer " + this.apiKey,
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(INFERENCE_TIMEOUT_MS),
        cache: "no-store",
      });
    } catch {
      refused("EXPERIENTIAL_VISION_REQUEST_FAILED");
    }

    if (!response.ok) refused("EXPERIENTIAL_VISION_REFUSED");
    const body = await readBoundedJson(response);

    const servedZdr = response.headers.get("x-gateway-zdr") === "true";
    if (!syntheticTest && !servedZdr) {
      refused("EXPERIENTIAL_SERVING_ROUTE_NOT_ZDR");
    }
    const canonical = response.headers.get("x-gateway-canonical-model");
    const canonicalMatches = acceptsExactFlashIdentity(canonical);
    const responseMatches = acceptsExactFlashIdentity(body?.model);
    if (!canonicalMatches || !responseMatches) {
      if (syntheticTest) {
        // Restricted, model-identity-only metadata. A missing proof remains a hard failure.
        console.warn("GLM_SYNTHETIC_MODEL_IDENTITY", JSON.stringify({
          expected: INVOICE_VISION_MODEL,
          canonical: safeModelIdentifier(canonical),
          responseModel: safeModelIdentifier(body?.model),
          gatewayAlias: safeModelIdentifier(response.headers.get("x-gateway-alias")),
          canonicalMatches, responseMatches,
        }));
      }
      refused("EXPERIENTIAL_MODEL_MISMATCH");
    }

    const provider = response.headers.get("x-gateway-provider");
    const requestId = response.headers.get("x-request-id");
    if (!provider || !requestId) refused("EXPERIENTIAL_ROUTE_PROOF_INCOMPLETE");

    const ignored = body?.["x-experiential-ignored-parameters"];
    if (ignored !== undefined && (!Array.isArray(ignored) || ignored.length !== 0)) {
      refused("EXPERIENTIAL_REQUEST_FIELDS_IGNORED");
    }
    const choice = body?.choices?.[0];
    if (choice?.finish_reason !== "stop" || typeof choice?.message?.content !== "string") {
      refused("EXPERIENTIAL_EXTRACTION_INCOMPLETE");
    }

    let candidate: unknown;
    try {
      candidate = JSON.parse(choice.message.content);
    } catch {
      refused("EXPERIENTIAL_EXTRACTION_INVALID_JSON");
    }

    return {
      candidate,
      routeProof: {
        requestId,
        model: INVOICE_VISION_MODEL,
        provider,
        zdr: servedZdr,
        syntheticNonZdrTest: syntheticTest,
        promptVersion: prompt.version,
        promptSha256: prompt.sha256,
        inputArtifactSha256: input.artifactSha256,
        usage: {
          promptTokens: safeTokenCount(body?.usage?.prompt_tokens),
          completionTokens: safeTokenCount(body?.usage?.completion_tokens),
        },
      },
    };
  }
}
