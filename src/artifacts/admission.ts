import { createHash } from "node:crypto";

export const MAX_INVOICE_ARTIFACT_BYTES = 10 * 1024 * 1024;
export const MAX_INVOICE_IMAGE_EDGE = 8192;
export const MAX_INVOICE_IMAGE_PIXELS = 20_000_000;

export type InvoiceArtifactMime = "application/pdf" | "image/jpeg" | "image/png";

export class ArtifactAdmissionError extends Error {
  constructor(
    public readonly code: string,
    public readonly httpStatus: number,
  ) {
    super(code);
    this.name = "ArtifactAdmissionError";
  }
}

function fail(code: string, httpStatus: number): never {
  throw new ArtifactAdmissionError(code, httpStatus);
}

function assertImageBounds(width: number, height: number) {
  if (
    width < 1 || height < 1 ||
    width > MAX_INVOICE_IMAGE_EDGE || height > MAX_INVOICE_IMAGE_EDGE ||
    width * height > MAX_INVOICE_IMAGE_PIXELS
  ) {
    fail("IMAGE_DIMENSIONS_EXCEEDED", 422);
  }
}

function inspectJpegDimensions(bytes: Buffer) {
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) break;
    while (offset < bytes.length && bytes[offset] === 0xff) offset++;
    if (offset >= bytes.length) break;
    const marker = bytes[offset++];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0xd9 || marker === 0xda) break;
    if (offset + 2 > bytes.length) break;
    const size = bytes.readUInt16BE(offset);
    if (size < 2 || offset + size > bytes.length) break;
    const sof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (sof) {
      if (size < 7) break;
      assertImageBounds(bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3));
      return;
    }
    offset += size;
  }
  fail("IMAGE_HEADER_INVALID", 422);
}

export function inspectInvoiceArtifact(bytes: Buffer, suppliedContentType: string) {
  if (!bytes.length) fail("ARTIFACT_EMPTY", 400);
  if (bytes.length > MAX_INVOICE_ARTIFACT_BYTES) fail("ARTIFACT_TOO_LARGE", 413);

  const mime = suppliedContentType.split(";", 1)[0].trim().toLowerCase();
  if (mime !== "application/pdf" && mime !== "image/png" && mime !== "image/jpeg") {
    fail("UNSUPPORTED_ARTIFACT_MEDIA_TYPE", 415);
  }

  if (mime === "application/pdf") {
    if (bytes.length < 16 || bytes.toString("ascii", 0, 5) !== "%PDF-") {
      fail("ARTIFACT_MAGIC_MISMATCH", 415);
    }
    // Cheap truncation check only. The PDF parser must still validate xref,
    // page limits, encryption and resource budgets before any model call.
    if (bytes.lastIndexOf(Buffer.from("%%EOF")) < Math.max(0, bytes.length - 4096)) {
      fail("PDF_MISSING_EOF", 422);
    }
  } else if (mime === "image/png") {
    const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (
      bytes.length < 33 ||
      !bytes.subarray(0, 8).equals(pngSignature) ||
      bytes.readUInt32BE(8) !== 13 ||
      bytes.toString("ascii", 12, 16) !== "IHDR"
    ) {
      fail("ARTIFACT_MAGIC_MISMATCH", 415);
    }
    assertImageBounds(bytes.readUInt32BE(16), bytes.readUInt32BE(20));
  } else {
    if (bytes.length < 16 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
      fail("ARTIFACT_MAGIC_MISMATCH", 415);
    }
    inspectJpegDimensions(bytes);
  }

  return {
    mimeType: mime as InvoiceArtifactMime,
    byteSize: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    analysisStatus: "STORED_UNTRUSTED" as const,
  };
}

export async function readBoundedInvoiceBody(
  body: ReadableStream<Uint8Array> | null,
  claimedLength: string | null,
): Promise<Buffer> {
  if (claimedLength !== null) {
    if (!/^\d+$/.test(claimedLength)) fail("INVALID_CONTENT_LENGTH", 400);
    if (BigInt(claimedLength) > BigInt(MAX_INVOICE_ARTIFACT_BYTES)) {
      fail("ARTIFACT_TOO_LARGE", 413);
    }
  }
  if (!body) fail("ARTIFACT_EMPTY", 400);

  const reader = body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) fail("INVALID_ARTIFACT_BODY", 400);
      total += value.byteLength;
      if (total > MAX_INVOICE_ARTIFACT_BYTES) fail("ARTIFACT_TOO_LARGE", 413);
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }

  if (total === 0) fail("ARTIFACT_EMPTY", 400);
  if (claimedLength !== null && BigInt(claimedLength) !== BigInt(total)) {
    fail("CONTENT_LENGTH_MISMATCH", 400);
  }
  return Buffer.concat(chunks, total);
}
