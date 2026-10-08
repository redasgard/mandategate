import { createHash } from "node:crypto";
import { pool } from "../db/pool";

/**
 * Gate D: independent vendor-origin attestation.
 *
 * The API actor MUST be derived from an authenticated Better Auth session.
 * No model/agent route may supply or call this operation. A channel is
 * separately enrolled in the vendor registry before the invoice exists.
 * This creates an immutable human attestation, NOT payment authorization.
 */
export class OriginAttestationError extends Error {
  constructor(public readonly code: string, public readonly status: number) {
    super(code);
    this.name = "OriginAttestationError";
  }
}
function reject(code: string, status = 403): never {
  throw new OriginAttestationError(code, status);
}

const referencePattern = /^(?:callback-record|portal-event|erp-entry|synthetic-fixture):[A-Za-z0-9][A-Za-z0-9._:/-]{7,119}$/;
function evidenceHash(ref: string, actorId: string, artifactHash: string, channelId: string) {
  return createHash("sha256")
    .update("mandategate/out-of-band-attestation/v1\0")
    .update(Buffer.from(String(ref.length) + ":" + ref, "utf8"))
    .update(Buffer.from(String(actorId.length) + ":" + actorId, "utf8"))
    .update(Buffer.from(String(artifactHash.length) + ":" + artifactHash, "utf8"))
    .update(Buffer.from(String(channelId.length) + ":" + channelId, "utf8"))
    .digest("hex");
}

export async function attestInvoiceIssuerFromTrustedChannel(input: {
  actorUserId: string;
  organizationId: string;
  artifactId: string;
  vendorId: string;
  channelId: string;
  independentEvidenceReference: string;
}, opts: { allowSyntheticFixture?: boolean } = {}) {
  if (!input.actorUserId || !input.organizationId || !input.artifactId || !input.vendorId || !input.channelId) {
    reject("INVALID_ATTESTATION_INPUT", 400);
  }
  if (!referencePattern.test(input.independentEvidenceReference)) {
    reject("INDEPENDENT_EVIDENCE_REFERENCE_REQUIRED", 422);
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    const membership = await client.query(
      [
        "select user_id from organization_admin_memberships",
        "where user_id = $1 and organization_id = $2",
        "and role = 'ADMIN' and active = true for share",
      ].join(" "),
      [input.actorUserId, input.organizationId],
    );
    if (!membership.rows[0]) reject("ADMIN_ORGANIZATION_ROLE_REQUIRED");

    const artifact = await client.query(
      "select id, sha256 from invoice_artifacts where id=$1 and organization_id=$2 for share",
      [input.artifactId, input.organizationId],
    );
    if (!artifact.rows[0]) reject("ATTESTATION_ARTIFACT_NOT_FOUND", 404);

    const enrolled = await client.query(
      [
        "select id, kind from vendor_origin_channels",
        "where id=$1 and organization_id=$2 and vendor_id=$3 and active=true for share",
      ].join(" "),
      [input.channelId, input.organizationId, input.vendorId],
    );
    const channel = enrolled.rows[0];
    if (!channel) reject("TRUSTED_VENDOR_ORIGIN_CHANNEL_REQUIRED", 409);

    const kind: string = channel.kind;
    const prefix: Record<string, string> = {
      KNOWN_CALLBACK: "callback-record:",
      TRUSTED_PORTAL: "portal-event:",
      ERP_INTEGRATION: "erp-entry:",
      SYNTHETIC_FIXTURE: "synthetic-fixture:",
    };
    if (!input.independentEvidenceReference.startsWith(prefix[kind] ?? "never:")) {
      reject("EVIDENCE_CHANNEL_TYPE_MISMATCH", 422);
    }
    if (kind === "SYNTHETIC_FIXTURE") {
      if (opts.allowSyntheticFixture !== true || process.env.NODE_ENV === "production") {
        reject("SYNTHETIC_ORIGIN_NOT_PERMITTED");
      }
    }

    const artifactHash: string = artifact.rows[0].sha256;
    const hash = evidenceHash(input.independentEvidenceReference, input.actorUserId, artifactHash, input.channelId);
    const method = kind === "SYNTHETIC_FIXTURE" ? "SYNTHETIC_FIXTURE" : "ADMIN_OUT_OF_BAND";
    const result = await client.query(
      [
        "insert into invoice_origin_attestations",
        "(organization_id, artifact_id, artifact_sha256, vendor_id, origin_channel_id,",
        "method, verifier_actor, proof_sha256, independent_evidence_reference, expires_at)",
        "values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now()+interval '24 hours')",
        "on conflict (organization_id, artifact_id, origin_channel_id, proof_sha256)",
        "do nothing returning id, organization_id, artifact_id, artifact_sha256, vendor_id,",
        "origin_channel_id, method, verifier_actor, proof_sha256, expires_at",
      ].join(" "),
      [
        input.organizationId, input.artifactId, artifactHash, input.vendorId,
        input.channelId, method, input.actorUserId, hash, input.independentEvidenceReference,
      ],
    );
    let attestation = result.rows[0];
    if (!attestation) {
      const previous = await client.query(
        [
          "select id, organization_id, artifact_id, artifact_sha256, vendor_id,",
          "origin_channel_id, method, verifier_actor, proof_sha256, expires_at",
          "from invoice_origin_attestations",
          "where organization_id=$1 and artifact_id=$2 and origin_channel_id=$3 and proof_sha256=$4",
        ].join(" "),
        [input.organizationId, input.artifactId, input.channelId, hash],
      );
      attestation = previous.rows[0];
    }
    if (!attestation) throw new Error("ATTESTATION_PERSISTENCE_FAILURE");
    await client.query("commit");
    return {
      id: attestation.id as string,
      organizationId: attestation.organization_id as string,
      artifactId: attestation.artifact_id as string,
      vendorId: attestation.vendor_id as string,
      channelId: attestation.origin_channel_id as string,
      method: attestation.method as string,
      evidenceHash: attestation.proof_sha256 as string,
      expiresAt: attestation.expires_at as Date,
      paymentAuthorized: false as const,
      independentEvidenceClaim: "HUMAN_ATTESTATION" as const,
    };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
