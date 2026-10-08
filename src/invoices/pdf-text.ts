import { createHash } from "node:crypto";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { inspectInvoiceArtifact } from "../artifacts/admission";

export const PDF_SOURCE_PARSER_VERSION = "pdfjs-dist@6.4.299/normalized-text-v1";
export const PDF_SOURCE_MAX_PAGES = 20;
export const PDF_SOURCE_MAX_PAGE_CHARACTERS = 100000;
const PDF_SOURCE_MAX_TOTAL_CHARACTERS = 250000;
const PDF_SOURCE_TIMEOUT_MS = 15000;

export class PdfSourceError extends Error {
  readonly httpStatus = 422;
  constructor(public readonly code: string) {
    super(code);
    this.name = "PdfSourceError";
  }
}
const sha256 = (input: Buffer | string) => createHash("sha256").update(input).digest("hex");

export type PdfSourcePage = {
  pageNumber: number;
  text: string;
  textSha256: string;
};
export type ParsedPdfSource = {
  artifactSha256: string;
  parserVersion: typeof PDF_SOURCE_PARSER_VERSION;
  pages: PdfSourcePage[];
};

// Only bytes read from the immutable ArtifactStore may call this for authority
// provenance. This parser never marks claim fields VERIFIED, grants T2, or
// creates a payment request.
export async function parseIndependentPdfSource(input: {
  content: Buffer;
  expectedArtifactSha256?: string;
}): Promise<ParsedPdfSource> {
  let inspected: ReturnType<typeof inspectInvoiceArtifact>;
  try { inspected = inspectInvoiceArtifact(input.content, "application/pdf"); }
  catch { throw new PdfSourceError("PDF_ADMISSION_FAILED"); }
  if (input.expectedArtifactSha256 && inspected.sha256 !== input.expectedArtifactSha256) {
    throw new PdfSourceError("PDF_ARTIFACT_DIGEST_MISMATCH");
  }

  const rawPages = await new Promise<unknown>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(join(process.cwd(), "src", "invoices", "pdf-text-worker.mjs"), {
        workerData: { data: Uint8Array.from(input.content) },
        resourceLimits: {
          maxOldGenerationSizeMb: 192,
          maxYoungGenerationSizeMb: 32,
          stackSizeMb: 4,
        },
      });
    } catch {
      reject(new PdfSourceError("PDF_WORKER_UNAVAILABLE"));
      return;
    }
    let completed = false;
    const finish = (error?: PdfSourceError, value?: unknown) => {
      if (completed) return;
      completed = true;
      clearTimeout(timeout);
      void worker.terminate().catch(() => undefined);
      if (error) reject(error); else resolve(value);
    };
    const timeout = setTimeout(
      () => finish(new PdfSourceError("PDF_PARSER_TIMEOUT")),
      PDF_SOURCE_TIMEOUT_MS,
    );
    worker.on("message", (result: unknown) => {
      if (!result || typeof result !== "object") {
        finish(new PdfSourceError("PDF_WORKER_RESULT_INVALID"));
        return;
      }
      const msg = result as { ok?: unknown; code?: unknown; pages?: unknown };
      if (msg.ok !== true) {
        const code = typeof msg.code === "string" && /^PDF_[A-Z_]+$/.test(msg.code)
          ? msg.code : "PDF_PARSE_FAILED";
        finish(new PdfSourceError(code));
      } else finish(undefined, msg.pages);
    });
    worker.on("error", () => finish(new PdfSourceError("PDF_WORKER_FAILED")));
    worker.on("exit", () => finish(new PdfSourceError("PDF_WORKER_TERMINATED")));
  });

  if (!Array.isArray(rawPages) || rawPages.length < 1 || rawPages.length > PDF_SOURCE_MAX_PAGES) {
    throw new PdfSourceError("PDF_PAGE_COUNT_UNSUPPORTED");
  }
  let total = 0;
  const pages: PdfSourcePage[] = [];
  for (const [index, entry] of rawPages.entries()) {
    if (!entry || typeof entry !== "object") throw new PdfSourceError("PDF_WORKER_RESULT_INVALID");
    const page = entry as { pageNumber?: unknown; text?: unknown };
    if (page.pageNumber !== index + 1 || typeof page.text !== "string" ||
        !page.text || page.text.length > PDF_SOURCE_MAX_PAGE_CHARACTERS ||
        page.text !== page.text.replace(/\s+/gu, " ").trim()) {
      throw new PdfSourceError("PDF_WORKER_RESULT_INVALID");
    }
    total += page.text.length;
    if (total > PDF_SOURCE_MAX_TOTAL_CHARACTERS) {
      throw new PdfSourceError("PDF_TOTAL_TEXT_TOO_LARGE");
    }
    pages.push({
      pageNumber: page.pageNumber,
      text: page.text,
      textSha256: sha256(page.text),
    });
  }
  return {
    artifactSha256: inspected.sha256,
    parserVersion: PDF_SOURCE_PARSER_VERSION,
    pages,
  };
}
