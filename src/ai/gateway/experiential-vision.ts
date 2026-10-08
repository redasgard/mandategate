import { loadInvoiceVisionPrompt, invoiceImageUserInstruction } from "../../invoices/prompts";
import { INVOICE_VISION_RESPONSE_FORMAT } from "../../invoices/vision-json-schema";
import type { InvoiceArtifactMime } from "../../artifacts/admission";

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
  zdr: true;
  promptVersion: string;
  promptSha256: string;
  inputArtifactSha256: string;
  usage: { promptTokens: number | null; completionTokens: number | null };
};

export type InvoiceVisionResponse = {
  candidate: unknown;
  routeProof: RouteProof;
};

async function readBoundedJson(response: Response): Promise<any> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > MAX_GATEWAY_RESPONSE_BYTES) {
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
      if (bytes > MAX_GATEWAY_RESPONSE_BYTES) refused("EXPERIENTIAL_RESPONSE_TOO_LARGE");
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
    return readBoundedJson(response);
  }

  async verifyPrivacyAndModel(): Promise<void> {
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
    if (zdr?.enabled !== true || zdr?.partial === true) {
      refused("EXPERIENTIAL_ACCOUNT_ZDR_REQUIRED");
    }
    if (policy?.require_zdr !== true || policy?.require_no_training !== true) {
      refused("EXPERIENTIAL_NO_TRAINING_POLICY_REQUIRED");
    }
    if (telemetry?.capture_prompt_content !== false) {
      refused("EXPERIENTIAL_PROMPT_CAPTURE_MUST_BE_OFF");
    }
    const model = Array.isArray(models?.data)
      ? models.data.find((item: any) => item?.id === INVOICE_VISION_MODEL)
      : null;
    if (!model || model.uncensored === true) refused("EXPERIENTIAL_FLASH_MODEL_UNAVAILABLE");
    if (
      model.data_policy?.zdr !== true &&
      model.data_policy?.zdr_on_request !== true
    ) {
      refused("EXPERIENTIAL_FLASH_ZDR_ROUTE_UNAVAILABLE");
    }
  }

  async observeImage(input: {
    artifactId: string;
    artifactSha256: string;
    mimeType: InvoiceArtifactMime;
    content: Buffer;
  }): Promise<InvoiceVisionResponse> {
    if (input.mimeType !== "image/png" && input.mimeType !== "image/jpeg") {
      refused("INVOICE_VISION_IMAGES_ONLY");
    }
    if (input.content.length === 0 || input.content.length > 10 * 1024 * 1024 ||
      !/^[a-f0-9]{64}$/.test(input.artifactSha256)) {
      refused("INVOICE_IMAGE_INPUT_INVALID");
    }
    await this.verifyPrivacyAndModel();
    const prompt = await loadInvoiceVisionPrompt();

    const requestBody = {
      model: INVOICE_VISION_MODEL,
      stream: false,
      max_tokens: 8192,
      provider: { zdr: true },
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

    if (response.headers.get("x-gateway-zdr") !== "true") {
      refused("EXPERIENTIAL_SERVING_ROUTE_NOT_ZDR");
    }
    const canonical = response.headers.get("x-gateway-canonical-model");
    if (!acceptsExactFlashIdentity(canonical) || !acceptsExactFlashIdentity(body?.model)) {
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
        zdr: true,
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
