import { randomUUID } from "node:crypto";
import { pool } from "../db/pool";
import { loadInvoiceArtifactForAnalysis } from "../artifacts/postgres-store";
import {
  ExperientialInvoiceVisionGateway,
  INVOICE_VISION_MODEL,
  InvoiceVisionGatewayError,
} from "../ai/gateway/experiential-vision";
import { assessUntrustedInvoiceExtraction } from "./schema";

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
  if (artifact.analysisStatus !== "STORED_UNTRUSTED") {
    throw new InvoiceImageAnalysisError("ARTIFACT_ALREADY_ANALYZED_OR_CLAIMED", 409);
  }

  // Fail closed before claiming work or transmitting any document content.
  await gateway.verifyPrivacyAndModel();

  const claim = await pool.query(
    [
      "update invoice_artifacts",
      "set analysis_status = 'PENDING'",
      "where id = $1 and organization_id = $2",
      "and analysis_status = 'STORED_UNTRUSTED'",
      "returning id",
    ].join(" "),
    [artifactId, organizationId],
  );
  if (!claim.rows[0]) {
    throw new InvoiceImageAnalysisError("ARTIFACT_ANALYSIS_CLAIM_CONFLICT", 409);
  }

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
    const status = assessment.state === "ESCALATE" ? "ESCALATED" : "EXTRACTED";
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(
        [
          "insert into invoice_image_observations",
          "(artifact_id, organization_id, state, model, prompt_version,",
          "prompt_sha256, provider_name, gateway_request_id, input_sha256,",
          "gateway_zdr, extraction, reason_codes, started_at, finished_at)",
          "values ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10::jsonb, $11::jsonb, now(), now())",
        ].join(" "),
        [
          artifactId, organizationId, assessment.state, routeProof.model,
          routeProof.promptVersion, routeProof.promptSha256,
          routeProof.provider, routeProof.requestId, routeProof.inputArtifactSha256,
          JSON.stringify(assessment.extracted),
          JSON.stringify(assessment.reasonCodes),
        ],
      );
      const updated = await client.query(
        [
          "update invoice_artifacts set analysis_status = $3",
          "where id = $1 and organization_id = $2 and analysis_status = 'PENDING'",
          "returning id",
        ].join(" "),
        [artifactId, organizationId, status],
      );
      if (!updated.rows[0]) throw new Error("INVOICE_IMAGE_STATE_CONFLICT");
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

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
    // Never place raw model output, invoice text, or credential material in
    // errors, application logs, or the public API.
    const code = error instanceof InvoiceVisionGatewayError
      ? error.code
      : "INVOICE_VISION_PROCESSING_FAILED";
    await pool.query(
      [
        "update invoice_artifacts set analysis_status = 'FAILED'",
        "where id = $1 and organization_id = $2 and analysis_status = 'PENDING'",
      ].join(" "),
      [artifactId, organizationId],
    );
    await pool.query(
      [
        "insert into invoice_image_observations",
        "(artifact_id, organization_id, state, model, input_sha256, error_code)",
        "values ($1, $2, 'FAILED', $3, $4, $5)",
        "on conflict (artifact_id) do nothing",
      ].join(" "),
      [artifactId, organizationId, INVOICE_VISION_MODEL, artifact.sha256, code],
    );
    throw new InvoiceImageAnalysisError(code, 503);
  }
}
