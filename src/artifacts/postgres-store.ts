import { createHash, randomUUID } from "node:crypto";
import { pool } from "../db/pool";
import { inspectInvoiceArtifact, type InvoiceArtifactMime } from "./admission";

export type InvoiceArtifactMetadata = {
  artifactId: string;
  mimeType: InvoiceArtifactMime;
  byteSize: number;
  sha256: string;
  analysisStatus: "STORED_UNTRUSTED" | "PENDING" | "EXTRACTED" | "ESCALATED" | "FAILED";
  createdAt: Date;
};

function metadata(row: any): InvoiceArtifactMetadata {
  return {
    artifactId: row.id,
    mimeType: row.mime_type,
    byteSize: Number(row.byte_size),
    sha256: row.sha256,
    analysisStatus: row.analysis_status,
    createdAt: row.created_at,
  };
}

export const MAX_ORGANIZATION_ARTIFACT_BYTES = 128 * 1024 * 1024;
export const MAX_ORGANIZATION_ARTIFACT_COUNT = 500;

/** Admin upload denies inactive or foreign organization membership without disclosing org state. */
export class ArtifactAdminAccessError extends Error {
  readonly code = "ORGANIZATION_NOT_FOUND";
  readonly httpStatus = 404;
  constructor() {
    super("ORGANIZATION_NOT_FOUND");
    this.name="ArtifactAdminAccessError";
  }
}

export class ArtifactQuotaError extends Error {
  readonly code = "INVOICE_ARTIFACT_ORGANIZATION_QUOTA_EXCEEDED";
  readonly httpStatus = 429;

  constructor() {
    super("INVOICE_ARTIFACT_ORGANIZATION_QUOTA_EXCEEDED");
    this.name = "ArtifactQuotaError";
  }
}

export function assertInvoiceArtifactQuota(
  existingBytes: number,
  existingCount: number,
  additionalBytes: number,
) {
  if (
    !Number.isSafeInteger(existingBytes) ||
    !Number.isSafeInteger(existingCount) ||
    existingBytes < 0 || existingCount < 0 ||
    existingBytes + additionalBytes > MAX_ORGANIZATION_ARTIFACT_BYTES ||
    existingCount >= MAX_ORGANIZATION_ARTIFACT_COUNT
  ) {
    throw new ArtifactQuotaError();
  }
}

export async function storeUntrustedInvoiceArtifact(input: {
  organizationId: string;
  contentType: string;
  content: Buffer;
  /** Only for signed-in admin-assisted uploads; agent principals omit this. */
  adminUserId?: string;
}) {
  const verified = inspectInvoiceArtifact(input.content, input.contentType);
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (input.adminUserId !== undefined) {
      // Hold the live admin membership against concurrent revocation until
      // commit. An arbitrary user-supplied organization ID is never authority.
      const membership=await client.query(
        "select 1 from organization_admin_memberships where user_id=$1 and organization_id=$2 and role='ADMIN' and active=true for share",
        [input.adminUserId,input.organizationId],
      );
      if (membership.rows.length!==1) throw new ArtifactAdminAccessError();
    }
    // Lock the organization row so concurrent uploads cannot race past the
    // per-organization byte/count budget. No global cross-tenant lock.
    const owner = await client.query(
      "select id from organizations where id = $1 for update",
      [input.organizationId],
    );
    if (!owner.rows[0]) throw new Error("INVOICE_ARTIFACT_ORGANIZATION_NOT_FOUND");

    const existing = await client.query(
      [
        "select id, mime_type, byte_size, sha256, analysis_status, created_at",
        "from invoice_artifacts where organization_id = $1 and sha256 = $2",
        "limit 1",
      ].join(" "),
      [input.organizationId, verified.sha256],
    );
    if (existing.rows[0]) {
      await client.query("commit");
      return { ...metadata(existing.rows[0]), replayed: true };
    }

    const usage = await client.query(
      "select count(*)::int as n, coalesce(sum(byte_size), 0)::bigint as bytes from invoice_artifacts where organization_id = $1",
      [input.organizationId],
    );
    assertInvoiceArtifactQuota(
      Number(usage.rows[0]?.bytes ?? 0),
      Number(usage.rows[0]?.n ?? 0),
      verified.byteSize,
    );

    const inserted = await client.query(
      [
        "insert into invoice_artifacts",
        "(id, organization_id, mime_type, byte_size, sha256, content)",
        "values ($1, $2, $3, $4, $5, $6)",
        "returning id, mime_type, byte_size, sha256, analysis_status, created_at",
      ].join(" "),
      [
        randomUUID(),
        input.organizationId,
        verified.mimeType,
        verified.byteSize,
        verified.sha256,
        input.content,
      ],
    );
    await client.query("commit");
    return { ...metadata(inserted.rows[0]), replayed: false };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function findInvoiceArtifactMetadata(
  organizationId: string,
  artifactId: string,
): Promise<InvoiceArtifactMetadata | null> {
  const result = await pool.query(
    [
      "select id, mime_type, byte_size, sha256, analysis_status, created_at",
      "from invoice_artifacts where organization_id = $1 and id = $2 limit 1",
    ].join(" "),
    [organizationId, artifactId],
  );
  return result.rows[0] ? metadata(result.rows[0]) : null;
}

// Internal analysis-only access: never return raw invoice bytes from an agent route.
export async function loadInvoiceArtifactForAnalysis(
  organizationId: string,
  artifactId: string,
) {
  const result = await pool.query(
    "select * from invoice_artifacts where organization_id = $1 and id = $2 limit 1",
    [organizationId, artifactId],
  );
  const row = result.rows[0];
  if (!row) return null;
  const content: Buffer = row.content;
  const actualHash = createHash("sha256").update(content).digest("hex");
  if (content.length !== row.byte_size || actualHash !== row.sha256) {
    throw new Error("INVOICE_ARTIFACT_INTEGRITY_FAILURE");
  }
  return { ...metadata(row), content };
}

/**
 * Admin-only original-byte access for a human reviewing a source artifact.
 * The organization is derived from a live authenticated admin membership,
 * not from a user-supplied organization or model claim.
 */
export async function loadInvoiceArtifactForHumanReview(actorUserId: string, artifactId: string) {
  const result = await pool.query(
    [
      "select a.id,a.organization_id,a.mime_type,a.byte_size,a.sha256,a.analysis_status,",
      "a.created_at,a.content from invoice_artifacts a",
      "join organization_admin_memberships m on m.organization_id=a.organization_id",
      "and m.user_id=$2 and m.role='ADMIN' and m.active=true",
      "where a.id=$1 limit 1",
    ].join(" "),
    [artifactId, actorUserId],
  );
  const row = result.rows[0];
  if (!row) return null;
  const content: Buffer = row.content;
  const actual = createHash("sha256").update(content).digest("hex");
  if (content.length !== Number(row.byte_size) || actual !== row.sha256) {
    throw new Error("INVOICE_ARTIFACT_INTEGRITY_FAILURE");
  }
  return { ...metadata(row), organizationId: row.organization_id as string, content };
}
