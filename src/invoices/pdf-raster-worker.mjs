import { parentPort, workerData } from "node:worker_threads";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";

// No application credentials or database handles are passed to this worker;
// it receives only bounded bytes and a page number. This is NOT an OS-level
// network sandbox. All output remains T1 untrusted observation material.
const MAX_PAGES = 20;
const MAX_RENDERED_EDGE = 4096;
const MAX_RENDERED_PIXELS = 6_000_000;
const MAX_PNG_BYTES = 10 * 1024 * 1024;
const PAGE_SCALE = 1.5;

function refuse(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

let task;
try {
  task = getDocument({
    data: new Uint8Array(workerData.data),
    stopAtErrors: true,
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
    useWasm: false,
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
    maxImageSize: 6_000_000,
    verbosity: 0,
  });
  const pdf = await task.promise;
  if (!Number.isInteger(pdf.numPages) || pdf.numPages < 1 || pdf.numPages > MAX_PAGES) {
    refuse("PDF_PAGE_COUNT_UNSUPPORTED");
  }
  if (pdf.isPureXfa || (await pdf.hasJSActions())) refuse("PDF_ACTIVE_CONTENT_UNSUPPORTED");
  const attachments = await pdf.getAttachments();
  if (attachments && (
    (attachments instanceof Map && attachments.size > 0) ||
    (!(attachments instanceof Map) && Object.keys(attachments).length > 0)
  )) refuse("PDF_EMBEDDED_FILE_UNSUPPORTED");
  const pageNumber = workerData.pageNumber;
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pdf.numPages) {
    refuse("PDF_PAGE_NUMBER_UNSUPPORTED");
  }
  const page = await pdf.getPage(pageNumber);
  const vp = page.getViewport({ scale: PAGE_SCALE });
  const width = Math.ceil(vp.width);
  const height = Math.ceil(vp.height);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width <= 0 || height <= 0 || width > MAX_RENDERED_EDGE ||
      height > MAX_RENDERED_EDGE || width * height > MAX_RENDERED_PIXELS) {
    refuse("PDF_RASTER_DIMENSIONS_UNSUPPORTED");
  }
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  await page.render({
    canvasContext: context,
    canvas,
    viewport: vp,
    background: "rgb(255,255,255)",
  }).promise;
  const png = canvas.toBuffer("image/png");
  if (!png.length || png.length > MAX_PNG_BYTES) refuse("PDF_RASTER_PNG_TOO_LARGE");
  const transferable = Uint8Array.from(png);
  parentPort?.postMessage({
    ok: true, pageNumber, pageCount: pdf.numPages,
    width, height, pngBytes: transferable,
  }, [transferable.buffer]);
  page.cleanup();
} catch (error) {
  const code = error?.code ??
    (error?.name === "PasswordException" ? "PDF_PASSWORD_REQUIRED" : "PDF_RASTER_FAILED");
  parentPort?.postMessage({
    ok: false,
    code: typeof code === "string" && /^PDF_[A-Z_]+$/.test(code)
      ? code : "PDF_RASTER_FAILED",
  });
} finally {
  try { await task?.destroy(); } catch { /* worker is disposable */ }
}
