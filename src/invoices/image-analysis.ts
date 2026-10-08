import { randomUUID } from "node:crypto";
import { pool } from "../db/pool";
import { loadInvoiceArtifactForAnalysis } from "../artifacts/postgres-store";
import {
  ExperientialInvoiceVisionGateway,
  INVOICE_VISION_MODEL,
  InvoiceVisionGatewayError,
} from "../ai/gateway/experiential-vision";
import { assessUntrustedInvoiceExtraction } from "./schema";
import { validateInvoiceImageContainer, InvoiceImageIntegrityError } from "./image-integrity";

export class InvoiceImageAnalysisError extends Error {
  constructor(public readonly code: string, public readonly httpStatus: number) {
    super(code);
    this.name = "InvoiceImageAnalysisError";
  }
}

export async function getInvoiceImageObservation(
  organizationId: string,
  artifactId: string,
) {
  const result = await pool.query(
    [
      "select artifact_id, state, model, prompt_version, prompt_sha256,",
      "provider_name, gateway_request_id, input_sha256, gateway_zdr,",
      "extraction, reason_codes, error_code, started_at, finished_at",
      "from invoice_image_observations",
      "where organization_id = $1 and artifact_id = $2 limit 1",
    ].join(" "),
    [organizationId, artifactId],
  );
  return result.rows[0] ?? null;
}

/**
 * The image observer is deliberately outside the payment authority path.
 * Its result is always advisory. A vision quote is not an independently
 * verified source, so the current policy assessor escalates images.
 */
const ANALYSIS_LEASE_MS = 90_000;
const MAX_ANALYSIS_ATTEMPTS = 3;

async function persistObservation(
  organizationId: string,
  artifactId: string,
  claimId: string,
  values: {
    state: "EXTRACTED_UNTRUSTED" | "ESCALATE" | "FAILED";
    status: "EXTRACTED" | "ESCALATED" | "FAILED";
    inputSha256: string;
    extracted: unknown;
    reasonCodes: string[];
    model: string;
    promptVersion?: string;
    promptSha256?: string;
    provider?: string;
    requestId?: string;
    gatewayZdr: boolean;
    errorCode?: string;
  },
  startedAt: Date,
) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    // A returning row is the fencing proof. A stale worker whose claim was
    // superseded cannot write an observation or a terminal artifact status.
    const applied = await client.query(
      [
        "update invoice_artifacts",
        "set analysis_status = $4, analysis_claim_id = null, analysis_claimed_at = null",
        "where id = $1 and organization_id = $2",
        "and analysis_claim_id = $3 and analysis_status = 'PENDING'",
        "returning id",
      ].join(" "),
      [artifactId, organizationId, claimId, values.status],
    );
    if (!applied.rows[0]) {
      throw new InvoiceImageAnalysisError("INVOICE_ANALYSIS_CLAIM_SUPERSEDED", 409);
    }

    await client.query(
      [
        "insert into invoice_image_observations",
        "(artifact_id, organization_id, state, model, prompt_version,",
        "prompt_sha256, provider_name, gateway_request_id, input_sha256,",
        "gateway_zdr, extraction, reason_codes, error_code, started_at, finished_at)",
        "values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13, $14, now())",
        "on conflict (artifact_id) do update set",
        "state = excluded.state, model = excluded.model,",
        "prompt_version = excluded.prompt_version, prompt_sha256 = excluded.prompt_sha256,",
        "provider_name = excluded.provider_name, gateway_request_id = excluded.gateway_request_id,",
        "input_sha256 = excluded.input_sha256, gateway_zdr = excluded.gateway_zdr,",
        "extraction = excluded.extraction, reason_codes = excluded.reason_codes,",
        "error_code = excluded.error_code, started_at = excluded.started_at, finished_at = now()",
      ].join(" "),
      [
        artifactId, organizationId, values.state, values.model,
        values.promptVersion ?? null, values.promptSha256 ?? null,
        values.provider ?? null, values.requestId ?? null,
        values.inputSha256, values.gatewayZdr,
        JSON.stringify(values.extracted), JSON.stringify(values.reasonCodes),
        values.errorCode ?? null, startedAt,
      ],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * A vision result is an untrusted observation, never a payment instruction.
 * Claims are serialized, fenced by UUID, and bounded to three attempts.
 * An interrupted request is reclaimable after the 90-second lease.
 */
export async function analyzeStoredInvoiceImage(
  organizationId: string,
  artifactId: string,
  gateway = new ExperientialInvoiceVisionGateway(),
) {
  const artifact = await loadInvoiceArtifactForAnalysis(organizationId, artifactId);
  if (!artifact) throw new InvoiceImageAnalysisError("ARTIFACT_NOT_FOUND", 404);
  if (artifact.mimeType !== "image/jpeg" && artifact.mimeType !== "image/png") {
    throw new InvoiceImageAnalysisError("PDF_PREPARATION_REQUIRED", 422);
  }
  try {
    validateInvoiceImageContainer(artifact.content, artifact.mimeType);
  } catch (error) {
    if (error instanceof InvoiceImageIntegrityError) {
      throw new InvoiceImageAnalysisError(error.code, 422);
    }
    throw error;
  }
  if (!["STORED_UNTRUSTED", "PENDING", "FAILED"].includes(artifact.analysisStatus)) {
    throw new InvoiceImageAnalysisError("ARTIFACT_ALREADY_ANALYZED_OR_CLAIMED", 409);
  }

  // No image bytes leave the server before external privacy checks pass.
  await gateway.verifyPrivacyAndModel();

  const claimId = randomUUID();
  const staleBefore = new Date(Date.now() - ANALYSIS_LEASE_MS);
  const claim = await pool.query(
    [
      "update invoice_artifacts",
      "set analysis_status = 'PENDING', analysis_claim_id = $3,",
      "analysis_claimed_at = now(), analysis_attempts = analysis_attempts + 1",
      "where id = $1 and organization_id = $2",
      "and analysis_attempts < $5",
      "and (analysis_status in ('STORED_UNTRUSTED', 'FAILED')",
      "or (analysis_status = 'PENDING'",
      "and (analysis_claimed_at is null or analysis_claimed_at < $4)))",
      "returning id, analysis_claimed_at",
    ].join(" "),
    [artifactId, organizationId, claimId, staleBefore, MAX_ANALYSIS_ATTEMPTS],
  );
  if (!claim.rows[0]) {
    throw new InvoiceImageAnalysisError("ARTIFACT_ANALYSIS_NOT_CLAIMABLE", 409);
  }
  const startedAt: Date = claim.rows[0].analysis_claimed_at;

  try {
    const { candidate, routeProof } = await gateway.observeImage({
      artifactId,
      artifactSha256: artifact.sha256,
      mimeType: artifact.mimeType,
      content: artifact.content,
    });
    const assessment = assessUntrustedInvoiceExtraction(candidate, {
      artifactId,
      pages: [{ text: null }],
    });
    await persistObservation(
      organizationId, artifactId, claimId,
      {
        state: assessment.state,
        status: assessment.state === "ESCALATE" ? "ESCALATED" : "EXTRACTED",
        inputSha256: artifact.sha256,
        extracted: assessment.extracted,
        reasonCodes: assessment.reasonCodes,
        model: routeProof.model,
        promptVersion: routeProof.promptVersion,
        promptSha256: routeProof.promptSha256,
        provider: routeProof.provider,
        requestId: routeProof.requestId,
        gatewayZdr: routeProof.zdr,
      },
      startedAt,
    );

    return {
      artifactId,
      status: assessment.state,
      reasonCodes: assessment.reasonCodes,
      observation: assessment.extracted,
      evidence: {
        promptVersion: routeProof.promptVersion,
        promptSha256: routeProof.promptSha256,
        model: routeProof.model,
        provider: routeProof.provider,
        requestId: routeProof.requestId,
        artifactSha256: artifact.sha256,
        zdr: routeProof.zdr,
      },
      paymentAuthorized: false as const,
    };
  } catch (error) {
    const code = error instanceof InvoiceVisionGatewayError
      ? error.code
      : error instanceof InvoiceImageAnalysisError
        ? error.code
        : "INVOICE_VISION_PROCESSING_FAILED";
    try {
      await persistObservation(
        organizationId, artifactId, claimId,
        {
          state: "FAILED", status: "FAILED", inputSha256: artifact.sha256,
          extracted: null, reasonCodes: ["MODEL_GATEWAY_FAILURE"],
          model: INVOICE_VISION_MODEL, gatewayZdr: false, errorCode: code,
        },
        startedAt,
      );
    } catch {
      // A superseding claim must never be overwritten by the previous worker.
    }
    throw new InvoiceImageAnalysisError(code, code === "INVOICE_ANALYSIS_CLAIM_SUPERSEDED" ? 409 : 503);
  }
}
