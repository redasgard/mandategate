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

export async function storeUntrustedInvoiceArtifact(input: {
  organizationId: string;
  contentType: string;
  content: Buffer;
}) {
  const verified = inspectInvoiceArtifact(input.content, input.contentType);
  const inserted = await pool.query(
    [
      "insert into invoice_artifacts",
      "(id, organization_id, mime_type, byte_size, sha256, content)",
      "values ($1, $2, $3, $4, $5, $6)",
      "on conflict (organization_id, sha256) do nothing",
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
  const replayed = inserted.rowCount === 0;
  const row = inserted.rows[0] ?? (await pool.query(
    [
      "select id, mime_type, byte_size, sha256, analysis_status, created_at",
      "from invoice_artifacts where organization_id = $1 and sha256 = $2",
      "limit 1",
    ].join(" "),
    [input.organizationId, verified.sha256],
  )).rows[0];
  if (!row) throw new Error("INVOICE_ARTIFACT_STORE_INCONSISTENT");
  return { ...metadata(row), replayed };
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
