import {createHash} from "node:crypto";
import {describe,expect,it} from "vitest";
import {createSandboxInvoicePdf} from "../src/demo/sandbox-invoice-pdf";
import {parseIndependentPdfSource} from "../src/invoices/pdf-text";
import {verifyFieldEvidenceBinding} from "../src/invoices/semantic-evidence";

const receiver="sb-test-paypal-recipient@example.test";
describe("fictional Sandbox PDF T2 source integrity",()=>{
  it("creates a real, independently parsed one-page PDF with one exact payment tuple",async()=>{
    const document=createSandboxInvoicePdf(receiver);
    expect(document.bytes.subarray(0,8).toString()).toBe("%PDF-1.4");
    expect(createHash("sha256").update(document.bytes).digest("hex")).toBe(document.sha256);
    const parsed=await parseIndependentPdfSource({
      content:document.bytes,expectedArtifactSha256:document.sha256,
    });
    expect(parsed.pages).toHaveLength(1);
    const pageText=parsed.pages[0].text;
    for(const [field,value,quote] of [
      ["vendor_name","Northstar Components","Vendor: Northstar Components"],
      ["invoice_number","MG-SANDBOX-101-2026","Invoice Number: MG-SANDBOX-101-2026"],
      ["currency","USD","Currency: USD"],
      ["total_amount_decimal","1.01","Total Due: 1.01"],
      ["invoice_payment_destination",receiver,"Payment Destination: "+receiver],
    ] as const){
      expect(verifyFieldEvidenceBinding({
        field,claimedValue:value,quote,pageText,
      })).toEqual([]);
    }
    expect(pageText).toContain("Fictional supplier");
    expect(pageText.match(/@/g)).toHaveLength(1);
  });
  it("rejects malicious or malformed receiver strings before PDF creation",()=>{
    for(const bad of [
      "some-user@example.test) Tj\nBT (attack",
      "recipient@example.test\nDEMO-ESCALATE",
      "recipient@example.test extra",
      "https://api-m.paypal.com",
      "not-an-email",
    ])expect(()=>createSandboxInvoicePdf(bad)).toThrow("SANDBOX_FIXTURE_RECEIVER_INVALID");
  });
});
