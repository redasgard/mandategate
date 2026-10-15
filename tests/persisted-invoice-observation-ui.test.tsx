import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PersistedInvoiceObservation } from "../app/invoice-artifacts/[id]/persisted-observation";

const artifactId="11111111-1111-4111-8111-111111111111";
const field=(value:string|null)=>({
  value,confidence:0.94,
  evidence:value ? [{ artifact_id:artifactId,page_number:1,source_fragment:value }] : [],
});
const extraction={
  vendor_name:field("Northstar Components"),
  invoice_number:field("DEMO-GLM-004"),
  invoice_date:field("2026-10-15"),
  due_date:field(null),
  currency:field("USD"),
  total_amount_decimal:field("125.00"),
  invoice_payment_destination:field("fictional-payee@synthetic.invalid"),
  observed_instructions:[],
  line_items:[],
};
const record={
  state:"ESCALATE",model:"glm-5.3-flash",provider_name:"fireworks",
  gateway_request_id:"request-fixture",
  reason_codes:["SYNTHETIC_NON_ZDR_TEST_ONLY","IMAGE_EVIDENCE_NOT_VERIFIED"],
  gateway_zdr:false,
  prompt_version:"invoice-vision-observer-v2",
  prompt_sha256:"a".repeat(64),
  input_sha256:"b".repeat(64),
  rendered_input_sha256:"c".repeat(64),
  extraction,
};
const render=(r:unknown)=>renderToStaticMarkup(createElement(PersistedInvoiceObservation,{record:r}));

describe("saved GLM observation source review",()=>{
  it("survives a server render with all six source fields and provenance",()=>{
    const html=render(record);
    for(const literal of [
      "Northstar Components","DEMO-GLM-004","2026-10-15",
      "USD","125.00","fictional-payee@synthetic.invalid",
      "request-fixture","invoice-vision-observer-v2",
      "Model-proposed source quotations","Quote evidence is unverified",
    ])expect(html).toContain(literal);
    expect(html).toContain("Provider retention may apply");
    expect(html).toContain("Synthetic exception: ZDR metadata is not compliance proof");
    expect(html).not.toContain("Gateway ZDR receipt");
    expect(html).not.toContain("Accept and execute");
    expect(html).toContain("independent PDF source");
  });

  it("refuses to present failed or malformed extraction as verified fields",()=>{
    const html=render({...record,state:"FAILED",error_code:"EXTRACTION_INVALID",extraction:{vendor_name:"forged"}});
    expect(html).toContain("FAILED");
    expect(html).toContain("No schema-accepted field observations");
    expect(html).not.toContain("Northstar Components");
    expect(html).not.toContain("forged");
  });

  it("escapes malicious model text and displays no persisted data without an observation",()=>{
    const payload='<img src=x onerror="alert(1)">';
    const html=render({...record,extraction:{...extraction,vendor_name:field(payload)}});
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img src=x");
    expect(render(null)).toBe("");
  });
});