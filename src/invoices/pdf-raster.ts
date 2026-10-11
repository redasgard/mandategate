import { createHash } from "node:crypto";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { inspectInvoiceArtifact } from "../artifacts/admission";
import { validateInvoiceImageContainer } from "./image-integrity";
import { PdfSourceError } from "./pdf-text";

export const PDF_RASTERIZER_VERSION = "pdfjs-dist@6.4.299/napi-canvas@1.0.10/1.5x-v1";
const RASTER_TIMEOUT_MS = 15_000;
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

export type RenderedPdfPage = {
  sourceArtifactSha256: string;
  renderedPngSha256: string;
  rasterizerVersion: typeof PDF_RASTERIZER_VERSION;
  pageNumber: number;
  pageCount: number;
  width: number;
  height: number;
  png: Buffer;
};

/**
 * A bounded raster of one PDF page, not an OCR result or a trusted field
 * source. The original PDF remains the immutable invoice artifact.
 */
export async function rasterizeStoredPdfPage(input: {
  content: Buffer;
  expectedArtifactSha256: string;
  pageNumber?: number;
}): Promise<RenderedPdfPage> {
  let inspected: ReturnType<typeof inspectInvoiceArtifact>;
  try { inspected = inspectInvoiceArtifact(input.content, "application/pdf"); }
  catch { throw new PdfSourceError("PDF_ADMISSION_FAILED"); }
  if (inspected.sha256 !== input.expectedArtifactSha256) {
    throw new PdfSourceError("PDF_ARTIFACT_DIGEST_MISMATCH");
  }
  if (/\/Encrypt\b/.test(input.content.toString("latin1"))) {
    throw new PdfSourceError("PDF_ENCRYPTED_UNSUPPORTED");
  }
  const pageNumber = input.pageNumber ?? 1;
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > 20) {
    throw new PdfSourceError("PDF_PAGE_NUMBER_UNSUPPORTED");
  }
  const rendered = await new Promise<unknown>((resolve,reject) => {
    let worker: Worker;
    try {
      worker = new Worker(join(process.cwd(), "src", "invoices", "pdf-raster-worker.mjs"), {
        workerData: {data: Uint8Array.from(input.content), pageNumber},
        resourceLimits: {maxOldGenerationSizeMb:192, maxYoungGenerationSizeMb:32, stackSizeMb:4},
      });
    } catch {
      reject(new PdfSourceError("PDF_RASTER_WORKER_UNAVAILABLE"));
      return;
    }
    let done = false;
    const finish = (error?:PdfSourceError, value?:unknown) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      void worker.terminate().catch(() => undefined);
      if (error) reject(error); else resolve(value);
    };
    const timeout = setTimeout(() => finish(new PdfSourceError("PDF_RASTER_TIMEOUT")), RASTER_TIMEOUT_MS);
    worker.on("message", (message:unknown) => {
      if (!message || typeof message!=="object") {
        finish(new PdfSourceError("PDF_RASTER_RESULT_INVALID")); return;
      }
      const m=message as {ok?:unknown;code?:unknown};
      if (m.ok!==true) {
        finish(new PdfSourceError(typeof m.code==="string" && /^PDF_[A-Z_]+$/.test(m.code)
          ?m.code:"PDF_RASTER_FAILED"));return;
      }
      finish(undefined,message);
    });
    worker.on("error",() => finish(new PdfSourceError("PDF_RASTER_WORKER_FAILED")));
    worker.on("exit",() => finish(new PdfSourceError("PDF_RASTER_WORKER_TERMINATED")));
  });
  if (!rendered || typeof rendered !== "object") {
    throw new PdfSourceError("PDF_RASTER_RESULT_INVALID");
  }
  const result=rendered as {
    ok?:unknown; pageNumber?:unknown; pageCount?:unknown;
    width?:unknown;height?:unknown;pngBytes?:unknown;
  };
  const png = result.pngBytes instanceof Uint8Array ? Buffer.from(result.pngBytes) : null;
  if (result.ok !== true || result.pageNumber !== pageNumber ||
      !Number.isSafeInteger(result.pageCount) || Number(result.pageCount)<1 ||
      Number(result.pageCount)>20 || !Number.isSafeInteger(result.width) ||
      !Number.isSafeInteger(result.height) || !png || png.length===0 ||
      png.length>10*1024*1024) {
    throw new PdfSourceError("PDF_RASTER_RESULT_INVALID");
  }
  try { validateInvoiceImageContainer(png,"image/png"); }
  catch { throw new PdfSourceError("PDF_RASTER_CONTAINER_INVALID"); }
  return {
    sourceArtifactSha256: inspected.sha256,
    renderedPngSha256:hash(png),
    rasterizerVersion: PDF_RASTERIZER_VERSION,
    pageNumber,
    pageCount:Number(result.pageCount),
    width:Number(result.width),
    height:Number(result.height),
    png,
  };
}
