import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../src/db/pool";
import { storeUntrustedInvoiceArtifact } from "../src/artifacts/postgres-store";
import { parseIndependentPdfSource, PdfSourceError } from "../src/invoices/pdf-text";
import {
  assessStoredPdfObservation, loadStoredPdfSourcePages, prepareStoredPdfSourcePages,
} from "../src/invoices/pdf-source-store";

const sha = (v: Buffer | string) => createHash("sha256").update(v).digest("hex");
const org = "pdf_source_test_" + randomUUID();
const otherOrg = "pdf_source_test_" + randomUUID();
let artifactId = "";

function createPdf(lines: string[]): Buffer {
  // Valid, xref-addressed PDF fixture with real text streams; no model-selected
  // or manually seeded page-text rows. All offsets count actual UTF-8 bytes.
  const objects: string[] = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = "<< /Type /Pages /Count " + lines.length + " /Kids [" +
    lines.map((_,i)=>`${4+i*2} 0 R`).join(" ") + "] >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  for (const [index,line] of lines.entries()) {
    const pageId=4+index*2,contentId=5+index*2;
    const displayedLines=line.split("\n").map(part =>
      "(" + part.replace(/([()\\])/g,"\\$1") + ") Tj"
    ).join(" 0 -16 Td ");
    const text=`BT /F1 12 Tf 30 700 Td ${displayedLines} ET`;
    objects[pageId]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId]=`<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`;
  }
  let output="%PDF-1.7\n";
  const offsets=[0];
  for(let n=1;n<objects.length;n++) {
    offsets.push(Buffer.byteLength(output));
    output+=`${n} 0 obj\n${objects[n]}\nendobj\n`;
  }
  const xref=Buffer.byteLength(output);
  output+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for(let n=1;n<objects.length;n++){
    output+=String(offsets[n]).padStart(10,"0")+" 00000 n \n";
  }
  output+=`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output);
}

function untrustedCandidate(artifact: string, amount="1.01") {
  const field=(value:string,fragment:string,page=1)=>({
    value,confidence:0.99,evidence:[{
      artifact_id:artifact,page_number:page,source_fragment:fragment,
    }],
  });
  return {
    vendor_name:field("Northstar Components","Northstar Components"),
    invoice_number:field("NS-1009","Invoice NS-1009"),
    invoice_date:field("2026-10-01","Date 2026-10-01"),
    due_date:field("2026-11-01","Due 2026-11-01"),
    currency:field("USD","USD"),
    total_amount_decimal:field(amount,`Total ${amount}`),
    invoice_payment_destination:field("trusted@example.com","trusted@example.com"),
    observed_instructions:[],line_items:[],
  };
}
const invoiceText="Northstar Components Invoice NS-1009 Date 2026-10-01\nDue 2026-11-01 USD Total 1.01 trusted@example.com";
const pdf=createPdf([invoiceText,"Supplemental supporting page NS-1009"]);
const encryptedPdf=Buffer.from(
  "JVBERi0xLjMKJeLjz9MKMSAwIG9iago8PAovUHJvZHVjZXIgPDZhYmZiZDZmNGQ+Cj4+CmVuZG9iagoyIDAgb2JqCjw8Ci9UeXBlIC9QYWdlcwovQ291bnQgMQovS2lkcyBbIDQgMCBSIF0KPj4KZW5kb2JqCjMgMCBvYmoKPDwKL1R5cGUgL0NhdGFsb2cKL1BhZ2VzIDIgMCBSCj4+CmVuZG9iago0IDAgb2JqCjw8Ci9UeXBlIC9QYWdlCi9SZXNvdXJjZXMgPDwKPj4KL01lZGlhQm94IFsgMC4wIDAuMCA2MTIgNzkyIF0KL1BhcmVudCAyIDAgUgo+PgplbmRvYmoKNSAwIG9iago8PAovViAyCi9SIDMKL0xlbmd0aCAxMjgKL1AgNDI5NDk2NzI5MgovRmlsdGVyIC9TdGFuZGFyZAovTyA8MmQ1ZTEwZTUzZDc0ODMwZTQ0NmMxODA0YzRlZjUyYmVjYzU3NTZkMTYzNzg2OTZiNTNkNWIyOTIxNDRlMmUzND4KL1UgPDc5ZTBlMDljZTdmYWQyMjZlZmY1NTRhYzQ1NGEyM2JhMjhiZjRlNWU0ZTc1OGE0MTY0MDA0ZTU2ZmZmYTAxMDg+Cj4+CmVuZG9iagp4cmVmCjAgNgowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMTUgMDAwMDAgbiAKMDAwMDAwMDA1OSAwMDAwMCBuIAowMDAwMDAwMTE4IDAwMDAwIG4gCjAwMDAwMDAxNjcgMDAwMDAgbiAKMDAwMDAwMDI2MSAwMDAwMCBuIAp0cmFpbGVyCjw8Ci9TaXplIDYKL1Jvb3QgMyAwIFIKL0luZm8gMSAwIFIKL0lEIFsgPDM1NjEzMTMyNjIzNzY0MzczODM1NjEzNjY0MzUzNTM3MzUzNjM5NjI2MjM3MzA2NDMyMzQzMjMyNjEzNzMwMzk+IDwzNTYxMzEzMjYyMzc2NDM3MzgzNTYxMzY2NDM1MzUzNzM1MzYzOTYyNjIzNzMwNjQzMjM0MzIzMjYxMzczMDM5PiBdCi9FbmNyeXB0IDUgMCBSCj4+CnN0YXJ0eHJlZgo0NzYKJSVFT0YK",
  "base64",
);

beforeAll(async()=>{
  await pool.query("insert into organizations(id,name) values($1,'PDF source proof'),($2,'Other tenant')",[org,otherOrg]);
  const stored=await storeUntrustedInvoiceArtifact({
    organizationId:org,contentType:"application/pdf",content:pdf,
  });
  artifactId=stored.artifactId;
});
afterAll(async()=>{await pool.end();});

describe("immutable independently parsed PDF page provenance",()=>{
  it("extracts real xref PDF bytes and hashes each page text independently",async()=>{
    const parsed=await parseIndependentPdfSource({content:pdf,expectedArtifactSha256:sha(pdf)});
    expect(parsed.artifactSha256).toBe(sha(pdf));
    expect(parsed.pages).toHaveLength(2);
    expect(parsed.pages[0].text).toContain("Northstar Components");
    expect(parsed.pages[0].text).toContain("Total 1.01");
    expect(parsed.pages[1].text).toContain("Supplemental supporting page");
    expect(parsed.pages[0].textSha256).toBe(sha(parsed.pages[0].text));
    expect(parsed.pages[1].textSha256).toBe(sha(parsed.pages[1].text));
    expect(parsed.pages[0].textSha256).not.toBe(parsed.pages[1].textSha256);
  });
  it("rejects a stale expected artifact digest before worker parsing",async()=>{
    await expect(parseIndependentPdfSource({content:pdf,expectedArtifactSha256:"0".repeat(64)}))
      .rejects.toMatchObject({code:"PDF_ARTIFACT_DIGEST_MISMATCH"});
  });
  it("refuses malformed PDFs despite magic/EOF markers",async()=>{
    const fake=Buffer.from("%PDF-1.7\nTHIS IS NOT A REAL PDF\n%%EOF\n");
    await expect(parseIndependentPdfSource({content:fake}))
      .rejects.toBeInstanceOf(PdfSourceError);
  });
  it("rejects encrypted or password protected PDFs",async()=>{
    await expect(parseIndependentPdfSource({content:encryptedPdf}))
      .rejects.toMatchObject({code:"PDF_ENCRYPTED_UNSUPPORTED"});
  });
  it("rejects page counts above twenty and missing text on any page",async()=>{
    await expect(parseIndependentPdfSource({content:createPdf(Array(21).fill("Invoice"))}))
      .rejects.toMatchObject({code:"PDF_PAGE_COUNT_UNSUPPORTED"});
    await expect(parseIndependentPdfSource({content:createPdf([""])}))
      .rejects.toMatchObject({code:"PDF_PAGE_TEXT_UNAVAILABLE"});
  });
  it("persists immutable exact-text provenance and replays without duplicates",async()=>{
    const first=await prepareStoredPdfSourcePages(org,artifactId);
    expect(first?.replayed).toBe(false);
    expect(first?.pages).toHaveLength(2);
    const replay=await prepareStoredPdfSourcePages(org,artifactId);
    expect(replay?.replayed).toBe(true);
    expect(replay?.pages).toEqual(first?.pages);
    expect(await loadStoredPdfSourcePages(otherOrg,artifactId)).toBeNull();
    const db=await pool.query(
      "select count(*)::int as n from invoice_pdf_source_pages where organization_id=$1 and artifact_id=$2",
      [org,artifactId],
    );
    expect(db.rows[0].n).toBe(2);
    await expect(pool.query(
      "update invoice_pdf_source_pages set page_text='Total 999.00' where organization_id=$1 and artifact_id=$2",
      [org,artifactId],
    )).rejects.toThrow(/AUTHORITY_PROVENANCE_IMMUTABLE/);
  });
  it("allows source-to-field comparison but never payment authority",async()=>{
    const normal=await assessStoredPdfObservation(org,artifactId,untrustedCandidate(artifactId));
    expect(normal.reasonCodes).toEqual([]);
    expect(normal.state).toBe("EXTRACTED_UNTRUSTED");
    expect(normal.pageTextDigests).toHaveLength(2);
    expect(normal.issuerAuthenticated).toBe(false);
    expect(normal.paymentAuthorized).toBe(false);
    const poisoned=await assessStoredPdfObservation(org,artifactId,untrustedCandidate(artifactId,"999.00"));
    expect(poisoned.state).toBe("ESCALATE");
    expect(poisoned.reasonCodes).toContain("EVIDENCE_QUOTE_MISMATCH");
    const money=await pool.query("select count(*)::int as n from payment_requests where organization_id=$1",[org]);
    expect(money.rows[0].n).toBe(0);
    const verified=await pool.query(
      "select count(*)::int as n from invoice_verified_claim_sets where organization_id=$1 and verification_status='VERIFIED'",
      [org],
    );
    expect(verified.rows[0].n).toBe(0);
  });
});
