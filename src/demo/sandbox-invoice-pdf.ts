import {createHash} from "node:crypto";
import {DEMO_VENDOR_ID} from "./scenarios";
import {SANDBOX_INVOICE} from "./sandbox-payout-constants";

const email=/^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){1,4}$/;
function escapePdf(value:string){
  return value.replaceAll("\\","\\\\").replaceAll("(","\\(").replaceAll(")","\\)");
}

/**
 * One-page, ASCII-only PDF. This document is an obviously fictional
 * hackathon test asset; it is NOT signed by any supplier or payment provider.
 */
export function createSandboxInvoicePdf(receiver:string){
  if(!email.test(receiver)||receiver.length>150)
    throw Error("SANDBOX_FIXTURE_RECEIVER_INVALID");
  const lines=[
    "MandateGate - Controlled Sandbox Test",
    "Vendor: Northstar Components",
    "Invoice Number: "+SANDBOX_INVOICE,
    "Currency: USD",
    "Total Due: 1.01",
    "Payment Destination: "+receiver,
    "Fictional supplier and source. No real vendor contacted.",
    "Test balances only. No production funds.",
  ];
  const commands=[
    "BT",
    "/F1 18 Tf",
    "72 730 Td",
    "("+escapePdf(lines[0])+") Tj",
    "/F1 12 Tf",
    ...lines.slice(1).flatMap(line=>[
      "0 -34 Td","("+escapePdf(line)+") Tj",
    ]),
    "ET",
  ].join("\n")+"\n";
  const objects=[
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Length "+Buffer.byteLength(commands,"ascii")+" >>\nstream\n"+commands+"endstream",
  ];
  let pdf="%PDF-1.4\n";
  const offsets=[0];
  for(let index=0;index<objects.length;index++){
    offsets.push(Buffer.byteLength(pdf,"ascii"));
    pdf+=(index+1)+" 0 obj\n"+objects[index]+"\nendobj\n";
  }
  const xrefOffset=Buffer.byteLength(pdf,"ascii");
  pdf+="xref\n0 "+offsets.length+"\n";
  pdf+="0000000000 65535 f \n";
  for(const offset of offsets.slice(1))
    pdf+=String(offset).padStart(10,"0")+" 00000 n \n";
  pdf+="trailer\n<< /Size "+offsets.length+" /Root 1 0 R >>\n";
  pdf+="startxref\n"+xrefOffset+"\n%%EOF\n";
  const bytes=Buffer.from(pdf,"ascii");
  return {
    bytes,sha256:createHash("sha256").update(bytes).digest("hex"),
    synthetic:true as const,recipient:receiver,invoiceNumber:SANDBOX_INVOICE,
    vendorId:DEMO_VENDOR_ID,
  };
}
