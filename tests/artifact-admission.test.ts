import { describe, expect, it } from "vitest";
import {
  ArtifactAdmissionError,
  MAX_INVOICE_ARTIFACT_BYTES,
  inspectInvoiceArtifact,
  readBoundedInvoiceBody,
} from "../src/artifacts/admission";

const pdf = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");

function png(width = 1, height = 1) {
  const data = Buffer.alloc(45);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(data);
  data.writeUInt32BE(13, 8);
  data.write("IHDR", 12, "ascii");
  data.writeUInt32BE(width, 16);
  data.writeUInt32BE(height, 20);
  return data;
}

function jpeg(width = 2, height = 2) {
  return Buffer.from([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00,
    0x03, 0x11, 0x00, 0xff, 0xd9,
  ]);
}

function errorCode(action: () => unknown) {
  try { action(); } catch (error) {
    if (error instanceof ArtifactAdmissionError) return error.code;
    throw error;
  }
  return "NONE";
}

describe("bounded invoice artifact admission", () => {
  it("admits a PDF only as immutable untrusted evidence", () => {
    const accepted = inspectInvoiceArtifact(pdf, "application/pdf");
    expect(accepted.analysisStatus).toBe("STORED_UNTRUSTED");
    expect(accepted.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("checks supplied MIME against magic bytes", () => {
    expect(errorCode(() => inspectInvoiceArtifact(pdf, "image/png"))).toBe("ARTIFACT_MAGIC_MISMATCH");
    expect(errorCode(() => inspectInvoiceArtifact(pdf, "multipart/form-data"))).toBe("UNSUPPORTED_ARTIFACT_MEDIA_TYPE");
  });

  it("accepts bounded PNG and JPEG headers", () => {
    expect(inspectInvoiceArtifact(png(), "image/png").mimeType).toBe("image/png");
    expect(inspectInvoiceArtifact(jpeg(), "image/jpeg").mimeType).toBe("image/jpeg");
  });

  it("rejects oversized decoded-image dimensions", () => {
    expect(errorCode(() => inspectInvoiceArtifact(png(8192, 8192), "image/png"))).toBe("IMAGE_DIMENSIONS_EXCEEDED");
    expect(errorCode(() => inspectInvoiceArtifact(jpeg(8192, 8192), "image/jpeg"))).toBe("IMAGE_DIMENSIONS_EXCEEDED");
  });

  it("rejects an incomplete PDF and corrupt JPEG SOF header", () => {
    expect(errorCode(() => inspectInvoiceArtifact(Buffer.from("%PDF-1.7\n"), "application/pdf"))).toBe("ARTIFACT_MAGIC_MISMATCH");
    expect(errorCode(() => inspectInvoiceArtifact(Buffer.from([0xff, 0xd8, 0xff, 0xc0]), "image/jpeg"))).toBe("ARTIFACT_MAGIC_MISMATCH");
  });

  it("bounds the actual stream even when length is absent", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Buffer.alloc(6 * 1024 * 1024));
        controller.enqueue(Buffer.alloc(5 * 1024 * 1024));
        controller.close();
      },
    });
    await expect(readBoundedInvoiceBody(body, null)).rejects.toMatchObject({ code: "ARTIFACT_TOO_LARGE" });
  });

  it("rejects claimed size above limit before reading", async () => {
    await expect(
      readBoundedInvoiceBody(null, String(MAX_INVOICE_ARTIFACT_BYTES + 1)),
    ).rejects.toMatchObject({ code: "ARTIFACT_TOO_LARGE" });
  });

  it("enforces actual length against claimed length", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(pdf);
        controller.close();
      },
    });
    await expect(readBoundedInvoiceBody(body, "1000")).rejects.toMatchObject({ code: "CONTENT_LENGTH_MISMATCH" });
  });

  it("preserves the exact bytes of bounded uploaded content", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(pdf.subarray(0, 10));
        controller.enqueue(pdf.subarray(10));
        controller.close();
      },
    });
    expect((await readBoundedInvoiceBody(body, String(pdf.length))).equals(pdf)).toBe(true);
  });
});
