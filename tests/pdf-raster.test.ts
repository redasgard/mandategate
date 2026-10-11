import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createPdf } from "./helpers/pdf-fixture";
import { parseIndependentPdfSource } from "../src/invoices/pdf-text";
import { rasterizeStoredPdfPage, PDF_RASTERIZER_VERSION } from "../src/invoices/pdf-raster";
import { validateInvoiceImageContainer } from "../src/invoices/image-integrity";

const sha=(b:Buffer)=>createHash("sha256").update(b).digest("hex");

describe("bounded PDF-to-image preparation, never authority",()=>{
  it("rasterizes an image-only (no text objects) PDF to actual PNG bytes",async()=>{
    const scan=createPdf([""]);
    await expect(parseIndependentPdfSource({content:scan,expectedArtifactSha256:sha(scan)}))
      .rejects.toMatchObject({code:"PDF_PAGE_TEXT_UNAVAILABLE"});
    const prepared=await rasterizeStoredPdfPage({
      content:scan,expectedArtifactSha256:sha(scan),
    });
    expect(prepared.sourceArtifactSha256).toBe(sha(scan));
    expect(prepared.renderedPngSha256).toBe(sha(prepared.png));
    expect(prepared.rasterizerVersion).toBe(PDF_RASTERIZER_VERSION);
    expect(prepared.pageNumber).toBe(1);
    expect(prepared.pageCount).toBe(1);
    expect(prepared.width).toBeGreaterThan(500);
    expect(prepared.height).toBeGreaterThan(500);
    expect(prepared.png.subarray(0,8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(()=>validateInvoiceImageContainer(prepared.png,"image/png")).not.toThrow();
  });
  it("bounds raster page indices and source hashes before native decoding",async()=>{
    const pdf=createPdf(["page one"]);
    await expect(rasterizeStoredPdfPage({
      content:pdf,expectedArtifactSha256:"0".repeat(64),
    })).rejects.toMatchObject({code:"PDF_ARTIFACT_DIGEST_MISMATCH"});
    await expect(rasterizeStoredPdfPage({
      content:pdf,expectedArtifactSha256:sha(pdf),pageNumber:0,
    })).rejects.toMatchObject({code:"PDF_PAGE_NUMBER_UNSUPPORTED"});
    await expect(rasterizeStoredPdfPage({
      content:pdf,expectedArtifactSha256:sha(pdf),pageNumber:2,
    })).rejects.toMatchObject({code:"PDF_PAGE_NUMBER_UNSUPPORTED"});
  });
  it("rejects encrypted and malformed PDFs without falling into model processing",async()=>{
    const pdf=createPdf([""]);
    const withEncrypt=Buffer.concat([pdf,Buffer.from("\n/Encrypt 9 0 R\n")]);
    await expect(rasterizeStoredPdfPage({
      content:withEncrypt,expectedArtifactSha256:sha(withEncrypt),
    })).rejects.toMatchObject({code:"PDF_ENCRYPTED_UNSUPPORTED"});
    const broken=Buffer.from("%PDF-1.7\ntrailer\n<< /Root 1 0 R >>\n%%EOF");
    await expect(rasterizeStoredPdfPage({
      content:broken,expectedArtifactSha256:sha(broken),
    })).rejects.toMatchObject({code:"PDF_RASTER_FAILED"});
  });
  it("accepts explicit second page but never silently changes page number",async()=>{
    const pdf=createPdf(["first","second"]);
    const rendered=await rasterizeStoredPdfPage({
      content:pdf,expectedArtifactSha256:sha(pdf),pageNumber:2,
    });
    expect(rendered.pageCount).toBe(2);
    expect(rendered.pageNumber).toBe(2);
  });
});
