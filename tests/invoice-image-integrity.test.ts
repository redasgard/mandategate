import { describe, expect, it } from "vitest";
import { validateInvoiceImageContainer, InvoiceImageIntegrityError } from "../src/invoices/image-integrity";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=", "base64");
const jpeg = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA4KCw0LCQ4NDA0QDw4RFiQXFhQUFiwgIRokNC43NjMuMjI6QVNGOj1OPjIySGJJTlZYXV5dOEVmbWVabFNbXVn/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAB//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8ANn//2Q==", "base64");

function assertInvalid(input: Buffer, mime: "image/png" | "image/jpeg", expected: string) {
  try {
    validateInvoiceImageContainer(input, mime);
    throw new Error("Unexpected valid image");
  } catch (error) {
    expect(error).toBeInstanceOf(InvoiceImageIntegrityError);
    expect((error as InvoiceImageIntegrityError).code).toBe(expected);
  }
}

describe("invoice image container validation", () => {
  it("accepts checksum-correct 1x1 PNG and structurally valid baseline JPEG", () => {
    expect(() => validateInvoiceImageContainer(png, "image/png")).not.toThrow();
    expect(() => validateInvoiceImageContainer(jpeg, "image/jpeg")).not.toThrow();
  });

  it("rejects a corrupted PNG IDAT payload using chunk CRC", () => {
    const bad = Buffer.from(png);
    bad[42] ^= 1;
    assertInvalid(bad, "image/png", "PNG_CHUNK_CRC_INVALID");
  });

  it("rejects a PNG lacking its complete IEND chunk", () => {
    const bad = png.subarray(0, png.length - 5);
    assertInvalid(bad, "image/png", "PNG_CONTAINER_INCOMPLETE");
  });

  it("rejects trailing unvalidated bytes after PNG IEND", () => {
    const bad = Buffer.concat([png, Buffer.from("untrusted trailing bytes")]);
    assertInvalid(bad, "image/png", "PNG_IEND_INVALID");
  });

  it("rejects truncated JPEG even if the header is plausible", () => {
    assertInvalid(jpeg.subarray(0, jpeg.length - 2), "image/jpeg", "JPEG_CONTAINER_INCOMPLETE");
  });

  it("rejects header-only JPEG with no scan data", () => {
    const headerOnly = Buffer.from([
      0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08,
      0, 2, 0, 2, 3, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0, 0xff, 0xd9,
    ]);
    assertInvalid(headerOnly, "image/jpeg", "JPEG_FRAME_OR_SCAN_MISSING");
  });

  it("rejects non-image artifacts", () => {
    expect(() => validateInvoiceImageContainer(png, "application/pdf"))
      .toThrowError("INVOICE_IMAGE_REQUIRED");
  });
});
