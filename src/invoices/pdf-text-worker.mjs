import { parentPort, workerData } from "node:worker_threads";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

// Entire PDF parsing operation runs outside the payment server's main thread.
// This worker has no database, app credentials, webhook or PayPal access.
const MAX_PAGES = 20;
const MAX_TEXT_ITEMS_PER_PAGE = 10000;
const MAX_PAGE_CHARACTERS = 100000;
const MAX_TOTAL_CHARACTERS = 250000;
const MAX_PAGE_DIMENSION_POINTS = 14400;

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
    maxImageSize: 20000000,
    verbosity: 0,
  });
  const pdf = await task.promise;
  if (!Number.isInteger(pdf.numPages) || pdf.numPages < 1 || pdf.numPages > MAX_PAGES) {
    refuse("PDF_PAGE_COUNT_UNSUPPORTED");
  }
  if (pdf.isPureXfa || (await pdf.hasJSActions())) {
    refuse("PDF_ACTIVE_CONTENT_UNSUPPORTED");
  }
  const attachments = await pdf.getAttachments();
  if (attachments && (
    (attachments instanceof Map && attachments.size > 0) ||
    (!(attachments instanceof Map) && Object.keys(attachments).length > 0)
  )) refuse("PDF_EMBEDDED_FILE_UNSUPPORTED");

  const pages = [];
  let totalCharacters = 0;
  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number);
    const viewport = page.getViewport({ scale: 1 });
    if (!Number.isFinite(viewport.width) || !Number.isFinite(viewport.height) ||
        viewport.width <= 0 || viewport.height <= 0 ||
        viewport.width > MAX_PAGE_DIMENSION_POINTS ||
        viewport.height > MAX_PAGE_DIMENSION_POINTS) {
      refuse("PDF_PAGE_DIMENSIONS_UNSUPPORTED");
    }
    const content = await page.getTextContent();
    if (!Array.isArray(content.items) || content.items.length > MAX_TEXT_ITEMS_PER_PAGE) {
      refuse("PDF_TEXT_COMPLEXITY_EXCEEDED");
    }
    const pieces = [];
    let characters = 0;
    for (const item of content.items) {
      if (typeof item.str !== "string") continue;
      characters += item.str.length;
      if (characters > MAX_PAGE_CHARACTERS) refuse("PDF_TEXT_TOO_LARGE");
      pieces.push(item.str, item.hasEOL ? "\n" : " ");
    }
    // PDF.js text items are joined deterministically. This is a digest of the
    // extracted text, NOT a cryptographic digest of individual PDF page bytes.
    const text = pieces.join("").replace(/\s+/gu, " ").trim();
    if (!text) refuse("PDF_PAGE_TEXT_UNAVAILABLE");
    totalCharacters += text.length;
    if (totalCharacters > MAX_TOTAL_CHARACTERS) refuse("PDF_TOTAL_TEXT_TOO_LARGE");
    pages.push({ pageNumber: number, text });
    page.cleanup();
  }
  parentPort?.postMessage({ ok: true, pages });
} catch (error) {
  // CI-only diagnostic: emit error type/code, never PDF text, document names,
  // URIs, credentials or the raw exception message.
  if (process.env.PDF_PARSER_DIAGNOSTICS === "1" &&
      process.env.GITHUB_ACTIONS === "true") {
    // Only synthetic GitHub CI fixtures may expose a bounded diagnostic
    // message. Never enable this for a deployed service or customer invoice.
    const kind=typeof error?.name==="string"?error.name.slice(0,70):"unknown";
    const identifier=typeof error?.code==="string"?error.code.slice(0,70):"none";
    const detail=typeof error?.message==="string"?error.message.slice(0,220):"none";
    console.error("[PDF_PARSER_CI_DIAGNOSTIC]",kind,identifier,detail);
  }
  const code = error?.code
    ?? (error?.name === "PasswordException" ? "PDF_PASSWORD_REQUIRED" : "PDF_PARSE_FAILED");
  parentPort?.postMessage({
    ok: false,
    code: typeof code === "string" && /^PDF_[A-Z_]+$/.test(code) ? code : "PDF_PARSE_FAILED",
  });
} finally {
  try { await task?.destroy(); } catch { /* worker is disposable */ }
}
