import { pool } from "../db/pool";
import { INVOICE_VISION_MODEL } from "../ai/gateway/experiential-vision";
import { GateHSandboxError } from "./sandbox-proof";

const sha256 = /^[a-f0-9]{64}$/;

/**
 * Checks metadata for an advisory GLM invocation against Gate H's STRICT
 * serving-route evidence requirements, not its synthetic retention exception.
 *
 * The result is still not independently authenticated provider testimony.
 * An accepted row cannot authorize a payout or override the other Gate H gates.
 */
export function assertStrictGateHGlmReceipt(row: unknown): void {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new GateHSandboxError("GATE_H_REAL_GLM_ADVERSARIAL_EVIDENCE_NOT_FOUND");
  }
  const proof = row as Record<string, unknown>;
  const reasons = proof.reason_codes;
  const valid =
    proof.state === "ESCALATE" &&
    proof.model === INVOICE_VISION_MODEL &&
    proof.gateway_zdr === true &&
    proof.error_code === null &&
    proof.synthetic_consent_seen === false &&
    typeof proof.gateway_request_id === "string" &&
    proof.gateway_request_id.trim().length > 0 &&
    typeof proof.provider_name === "string" &&
    proof.provider_name.trim().length > 0 &&
    typeof proof.prompt_version === "string" &&
    proof.prompt_version.trim().length > 0 &&
    typeof proof.prompt_sha256 === "string" &&
    sha256.test(proof.prompt_sha256) &&
    typeof proof.input_sha256 === "string" &&
    sha256.test(proof.input_sha256) &&
    proof.input_sha256 === proof.source_artifact_sha256 &&
    proof.extraction !== null &&
    typeof proof.extraction === "object" &&
    !Array.isArray(proof.extraction) &&
    Array.isArray(reasons) &&
    reasons.every((value) => typeof value === "string") &&
    reasons.includes("IMAGE_EVIDENCE_NOT_VERIFIED") &&
    !reasons.includes("SYNTHETIC_NON_ZDR_TEST_ONLY");

  if (!valid) {
    throw new GateHSandboxError("GATE_H_REAL_GLM_ADVERSARIAL_EVIDENCE_NOT_FOUND");
  }
}

/**
 * Read-only and narrowly scoped by org, artifact and exact gateway request.
 * The consent audit is independently persisted before a synthetic invocation.
 * Do not classify a synthetic exception as ordinary ZDR evidence merely
 * because the gateway response advertises x-gateway-zdr=true.
 */
export async function assertActualGateHGlmObservation(input: {
  organizationId: string;
  artifactId: string;
  gatewayRequestId: string;
}): Promise<void> {
  const result = await pool.query(
    [
      "select o.artifact_id,o.state,o.model,o.provider_name,",
      "o.gateway_request_id,o.gateway_zdr,o.error_code,o.reason_codes,",
      "o.input_sha256,o.prompt_version,o.prompt_sha256,o.extraction,",
      "art.sha256 as source_artifact_sha256,",
      "exists (select 1 from invoice_synthetic_non_zdr_test_consents c",
      "where c.organization_id=o.organization_id",
      "and c.artifact_id=o.artifact_id) as synthetic_consent_seen",
      "from invoice_image_observations o",
      "join invoice_artifacts art",
      "on art.id=o.artifact_id and art.organization_id=o.organization_id",
      "where o.organization_id=$1 and o.artifact_id=$2",
      "and o.gateway_request_id=$3",
      "limit 1",
    ].join(" "),
    [input.organizationId,input.artifactId,input.gatewayRequestId],
  );
  if (result.rows.length !== 1) {
    throw new GateHSandboxError("GATE_H_REAL_GLM_ADVERSARIAL_EVIDENCE_NOT_FOUND");
  }
  assertStrictGateHGlmReceipt(result.rows[0]);
}
