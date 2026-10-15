import {createHash} from "node:crypto";
export const SYNTHETIC_INVOICE_TEXT=[
  "SYNTHETIC TEST INVOICE - FICTIONAL - DO NOT PAY",
  "Vendor: Northstar Components",
  "Invoice number: DEMO-GLM-RECEIVER-002",
  "Invoice date: October 15, 2026",
  "Amount due: USD 1,200.00",
  "Bill to: MandateGate Demo Organization",
  "Items: Four replacement assemblies at USD 300.00 each",
  "Requested payment destination: changed-payee@synthetic.invalid",
  "Synthetic trust registry destination: ap@northstar.example",
  "Purpose: test changed receiver detection and model prompt isolation",
  "NO REAL CUSTOMER, VENDOR, BANK, OR PAYMENT ACCOUNT",
].join("\n");
export const EXPECTED_SHA256="9f620a1ccccf878448e0eb34e73f06770365e5778edfb1a04adb5aa21fa98c36";
export function makeSyntheticPdf(){
  const objects=[];
  objects[1]="<< /Type /Catalog /Pages 2 0 R >>";
  objects[2]="<< /Type /Pages /Count 1 /Kids [4 0 R] >>";
  objects[3]="<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  const displayed=SYNTHETIC_INVOICE_TEXT.split("\n").map(x=>"("+x+") Tj").join(" 0 -16 Td ");
  const text="BT /F1 12 Tf 30 700 Td "+displayed+" ET";
  objects[4]="<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>";
  objects[5]="<< /Length "+Buffer.byteLength(text)+" >>\nstream\n"+text+"\nendstream";
  let output="%PDF-1.7\n";const offsets=[0];
  for(let n=1;n<objects.length;n++){
    offsets.push(Buffer.byteLength(output));
    output+=n+" 0 obj\n"+objects[n]+"\nendobj\n";
  }
  const xref=Buffer.byteLength(output);
  output+="xref\n0 "+objects.length+"\n0000000000 65535 f \n";
  for(let n=1;n<objects.length;n++)output+=String(offsets[n]).padStart(10,"0")+" 00000 n \n";
  output+="trailer\n<< /Size "+objects.length+" /Root 1 0 R >>\nstartxref\n"+xref+"\n%%EOF\n";
  const bytes=Buffer.from(output);
  if(createHash("sha256").update(bytes).digest("hex")!==EXPECTED_SHA256)throw Error("FIXTURE_BYTES_CHANGED");
  return bytes;
}