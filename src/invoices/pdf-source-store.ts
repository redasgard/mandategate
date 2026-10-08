import { createHash } from "node:crypto";
import { pool } from "../db/pool";
import { loadInvoiceArtifactForAnalysis } from "../artifacts/postgres-store";
import {
  parseIndependentPdfSource, PDF_SOURCE_PARSER_VERSION,
  PdfSourceError, type ParsedPdfSource,
} from "./pdf-text";
import { assessUntrustedInvoiceExtraction } from "./schema";

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

function validateSavedRows(
  rows: Record<string, unknown>[],
  artifactSha256: string,
): ParsedPdfSource | null {
  if (rows.length === 0) return null;
  const first = rows[0];
  const count = Number(first.total_pages);
  if (!Number.isInteger(count) || count < 1 || count > 20 || rows.length !== count) {
    throw new PdfSourceError("PDF_STORED_SOURCE_INCOMPLETE");
  }
  const pages = rows.map((r, index) => {
    const text = r.page_text;
    if (Number(r.page_number) !== index + 1 ||
        Number(r.total_pages) !== count ||
        r.artifact_sha256 !== artifactSha256 ||
        r.parser_version !== PDF_SOURCE_PARSER_VERSION ||
        typeof text !== "string" || !text || text.length > 100000 ||
        sha256(text) !== r.page_text_sha256) {
      throw new PdfSourceError("PDF_STORED_SOURCE_MISMATCH");
    }
    return { pageNumber: index + 1, text, textSha256: r.page_text_sha256 as string };
  });
  return { artifactSha256, parserVersion: PDF_SOURCE_PARSER_VERSION, pages };
}

async function findSavedPages(organizationId: string, artifactId: string, artifactSha256: string) {
  const result = await pool.query(
    [
      "select page_number,total_pages,parser_version,artifact_sha256,page_text,page_text_sha256",
      "from invoice_pdf_source_pages where organization_id=$1 and artifact_id=$2",
      "and parser_version=$3 order by page_number",
    ].join(" "),
    [organizationId, artifactId, PDF_SOURCE_PARSER_VERSION],
  );
  return validateSavedRows(result.rows, artifactSha256);
}

/**
 * Parser output is persisted without ever upgrading a model observation to a
 * verified claim. Only the separate verifier may compare a field with these
 * real bytes, and issuer authentication remains a distinct gate.
 */
export async function prepareStoredPdfSourcePages(organizationId: string, artifactId: string) {
  const artifact = await loadInvoiceArtifactForAnalysis(organizationId, artifactId);
  if (!artifact) return null;
  if (artifact.mimeType !== "application/pdf") throw new PdfSourceError("PDF_ARTIFACT_REQUIRED");
  const existing = await findSavedPages(organizationId, artifactId, artifact.sha256);
  if (existing) return { ...existing, replayed: true };

  const parsed = await parseIndependentPdfSource({
    content: artifact.content,
    expectedArtifactSha256: artifact.sha256,
  });
  const client = await pool.connect();
  try {
    await client.query("begin");
    const pinned = await client.query(
      "select sha256,mime_type from invoice_artifacts where organization_id=$1 and id=$2 for share",
      [organizationId, artifactId],
    );
    if (pinned.rows[0]?.sha256 !== parsed.artifactSha256 ||
        pinned.rows[0]?.mime_type !== "application/pdf") {
      throw new PdfSourceError("PDF_ARTIFACT_CHANGED");
    }
    for (const page of parsed.pages) {
      await client.query(
        [
          "insert into invoice_pdf_source_pages",
          "(organization_id,artifact_id,artifact_sha256,parser_version,page_number,",
          "total_pages,page_text,page_text_sha256)",
          "values($1,$2,$3,$4,$5,$6,$7,$8)",
          "on conflict (organization_id,artifact_id,parser_version,page_number) do nothing",
        ].join(" "),
        [
          organizationId,artifactId,parsed.artifactSha256,PDF_SOURCE_PARSER_VERSION,
          page.pageNumber,parsed.pages.length,page.text,page.textSha256,
        ],
      );
    }
    const stored = await client.query(
      [
        "select page_number,total_pages,parser_version,artifact_sha256,page_text,page_text_sha256",
        "from invoice_pdf_source_pages where organization_id=$1 and artifact_id=$2",
        "and parser_version=$3 order by page_number",
      ].join(" "),
      [organizationId,artifactId,PDF_SOURCE_PARSER_VERSION],
    );
    const verified = validateSavedRows(stored.rows,parsed.artifactSha256);
    if (!verified ||
        verified.pages.some((page,index) => (
          page.textSha256 !== parsed.pages[index]?.textSha256 ||
          page.text !== parsed.pages[index]?.text
        ))) throw new PdfSourceError("PDF_STORED_SOURCE_MISMATCH");
    await client.query("commit");
    return { ...verified, replayed: false };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function loadStoredPdfSourcePages(organizationId: string, artifactId: string) {
  const artifact = await loadInvoiceArtifactForAnalysis(organizationId, artifactId);
  if (!artifact) return null;
  if (artifact.mimeType !== "application/pdf") throw new PdfSourceError("PDF_ARTIFACT_REQUIRED");
  return findSavedPages(organizationId,artifactId,artifact.sha256);
}

/** Advisory only: model-selected values are checked against parser-produced page text. */
export async function assessStoredPdfObservation(
  organizationId: string, artifactId: string, candidate: unknown,
) {
  const source = await loadStoredPdfSourcePages(organizationId,artifactId);
  if (!source) throw new PdfSourceError("PDF_SOURCE_NOT_PREPARED");
  const assessment = assessUntrustedInvoiceExtraction(candidate,{
    artifactId,pages:source.pages.map(page=>({text:page.text})),
  });
  return {
    ...assessment, artifactSha256:source.artifactSha256,
    parserVersion:source.parserVersion,
    pageTextDigests:source.pages.map(page=>({
      pageNumber:page.pageNumber,textSha256:page.textSha256,
    })),
    sourceCorroborated:assessment.state==="EXTRACTED_UNTRUSTED",
    issuerAuthenticated:false as const,
    paymentAuthorized:false as const,
  };
}
