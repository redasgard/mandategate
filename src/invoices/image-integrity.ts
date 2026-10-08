import { inflateSync } from "node:zlib";
import type { InvoiceArtifactMime } from "../artifacts/admission";

const MAX_DECODED_PNG_BYTES = 32 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export class InvoiceImageIntegrityError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "InvoiceImageIntegrityError";
  }
}

function invalid(code: string): never {
  throw new InvoiceImageIntegrityError(code);
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let n = 0; n < 8; n++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function checkPng(content: Buffer) {
  if (content.length < 45 || !content.subarray(0, 8).equals(PNG_SIGNATURE)) {
    invalid("PNG_CONTAINER_INVALID");
  }
  let offset = 8;
  let hasHeader = false;
  let hasData = false;
  let hasEnd = false;
  let dataEnded = false;
  let hasPalette = false;
  let width = 0;
  let height = 0;
  let components = 0;
  let bitDepth = 0;
  const idat: Buffer[] = [];
  let compressedSize = 0;

  while (offset + 12 <= content.length) {
    const length = content.readUInt32BE(offset);
    if (length > content.length - offset - 12) invalid("PNG_CHUNK_TRUNCATED");
    const kind = content.toString("ascii", offset + 4, offset + 8);
    const end = offset + 12 + length;
    const storedCrc = content.readUInt32BE(offset + 8 + length);
    const computedCrc = crc32(content.subarray(offset + 4, offset + 8 + length));
    if (storedCrc !== computedCrc) invalid("PNG_CHUNK_CRC_INVALID");
    if (!hasHeader && kind !== "IHDR") invalid("PNG_IHDR_MISSING");

    if (kind === "IHDR") {
      if (hasHeader || length !== 13 || offset !== 8) invalid("PNG_IHDR_INVALID");
      width = content.readUInt32BE(offset + 8);
      height = content.readUInt32BE(offset + 12);
      bitDepth = content[offset + 16];
      const color = content[offset + 17];
      const compression = content[offset + 18];
      const filter = content[offset + 19];
      const interlace = content[offset + 20];
      if (!width || !height || width * height > 20_000_000 ||
        width > 8192 || height > 8192 ||
        compression !== 0 || filter !== 0 || interlace !== 0) {
        invalid("PNG_UNSUPPORTED_DIMENSIONS_OR_LAYOUT");
      }
      const validDepths: Record<number, number[]> = {
        0: [1, 2, 4, 8, 16],
        2: [8, 16],
        3: [1, 2, 4, 8],
        4: [8, 16],
        6: [8, 16],
      };
      if (!validDepths[color]?.includes(bitDepth)) invalid("PNG_COLOR_FORMAT_INVALID");
      components = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[color];
      hasHeader = true;
    } else if (kind === "PLTE") {
      if (!hasHeader || hasData || hasPalette || length < 3 || length > 768 || length % 3 !== 0) {
        invalid("PNG_PALETTE_INVALID");
      }
      hasPalette = true;
    } else if (kind === "IDAT") {
      if (dataEnded || hasEnd) invalid("PNG_IDAT_ORDER_INVALID");
      compressedSize += length;
      if (compressedSize > 10 * 1024 * 1024) invalid("PNG_COMPRESSED_DATA_TOO_LARGE");
      idat.push(content.subarray(offset + 8, offset + 8 + length));
      hasData = true;
    } else if (kind === "IEND") {
      if (length !== 0 || !hasData || end !== content.length) invalid("PNG_IEND_INVALID");
      hasEnd = true;
      offset = end;
      break;
    } else {
      if (hasData) dataEnded = true;
      // Reject unknown critical chunks; benign ancillary chunks are validated
      // structurally, but are never interpreted as instructions.
      if (kind[0] === kind[0].toUpperCase()) {
        invalid("PNG_UNKNOWN_CRITICAL_CHUNK");
      }
    }
    offset = end;
  }
  if (!hasHeader || !hasData || !hasEnd || offset !== content.length) {
    invalid("PNG_CONTAINER_INCOMPLETE");
  }

  const rowBytes = Math.ceil(width * components * bitDepth / 8);
  const expectedBytes = (rowBytes + 1) * height;
  if (expectedBytes > MAX_DECODED_PNG_BYTES) invalid("PNG_DECODE_BUDGET_EXCEEDED");
  let raw: Buffer;
  try {
    raw = inflateSync(Buffer.concat(idat, compressedSize), {
      maxOutputLength: MAX_DECODED_PNG_BYTES + 1,
    });
  } catch {
    invalid("PNG_DECODE_FAILED");
  }
  if (raw.length !== expectedBytes) invalid("PNG_DECODED_LENGTH_MISMATCH");
  for (let y = 0; y < height; y++) {
    if (raw[y * (rowBytes + 1)] > 4) invalid("PNG_INVALID_ROW_FILTER");
  }
}

function checkJpeg(content: Buffer) {
  if (content.length < 16 || content[0] !== 0xff || content[1] !== 0xd8 ||
    content[content.length - 2] !== 0xff ||
    content[content.length - 1] !== 0xd9) {
    invalid("JPEG_CONTAINER_INCOMPLETE");
  }
  let offset = 2;
  let foundFrame = false;
  let foundScan = false;
  while (offset < content.length - 2) {
    if (content[offset] !== 0xff) invalid("JPEG_MARKER_INVALID");
    while (content[offset] === 0xff) offset++;
    const marker = content[offset++];
    if (marker === 0xd9) invalid("JPEG_PREMATURE_END");
    if (marker === 0xda) {
      if (offset + 2 > content.length - 2) invalid("JPEG_SCAN_TRUNCATED");
      const size = content.readUInt16BE(offset);
      if (size < 6 || offset + size >= content.length - 2) invalid("JPEG_SCAN_TRUNCATED");
      foundScan = true;
      break;
    }
    if (marker === 0xd8 || marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)) {
      invalid("JPEG_MARKER_UNEXPECTED");
    }
    if (offset + 2 > content.length - 2) invalid("JPEG_SEGMENT_TRUNCATED");
    const size = content.readUInt16BE(offset);
    if (size < 2 || offset + size > content.length - 2) {
      invalid("JPEG_SEGMENT_TRUNCATED");
    }
    if ((marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)) {
      if (size < 7) invalid("JPEG_FRAME_INVALID");
      foundFrame = true;
    }
    offset += size;
  }
  if (!foundFrame || !foundScan) invalid("JPEG_FRAME_OR_SCAN_MISSING");
  // Full entropy decoding and EXIF rotation are future image-pipeline work.
}

export function validateInvoiceImageContainer(content: Buffer, mime: InvoiceArtifactMime) {
  if (mime === "image/png") return checkPng(content);
  if (mime === "image/jpeg") return checkJpeg(content);
  invalid("INVOICE_IMAGE_REQUIRED");
}
