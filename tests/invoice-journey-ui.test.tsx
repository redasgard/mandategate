import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import {InvoiceJourney} from "../app/components/invoice-journey";
import {InvoiceArtifactReview} from "../app/invoice-artifacts/[id]/review-actions";
import {PersistedInvoiceObservation} from "../app/invoice-artifacts/[id]/persisted-observation";

const render=(node:React.ReactElement)=>renderToStaticMarkup(node);
const SHA="a".repeat(64);
const artifactId="11111111-1111-4111-8111-111111111111";

describe("hackathon invoice payment journey",()=>{
  it("shows four understandable steps and truthful current stage",()=>{
    const markup=render(createElement(InvoiceJourney,{stage:"review"}));
    for(const label of ["Upload","AI &amp; review","Approve","PayPal"])
      expect(markup).toContain(label);
    expect(markup).toContain('aria-current="step"');
    expect(markup).not.toMatch(/T2|T3|T4|SHA-256|Origin Attestation/);
  });
  it("shows one guided review task and collapses PDF quotations",()=>{
    const markup=render(createElement(InvoiceArtifactReview,{
      artifactId,artifactSha256:SHA,
      initialPages:[{
        pageNumber:1,text:"Northstar Components Invoice Number MG-SANDBOX-101-2026 Currency USD Total Due 1.01",
        textSha256:SHA,
      }],
      eligibleChannels:[],initialClaims:[],initialAttestations:[],
    }));
    expect(markup).toContain("Confirm the invoice details");
    expect(markup).toContain("Verify invoice details &amp; continue");
    expect(markup).toContain("Source quote");
    expect(markup).toContain("<details");
    expect(markup).not.toContain('aria-label="Confirm invoice supplier"');
    expect(markup).not.toContain('aria-label="Review payment policy"');
    expect(markup).not.toContain("Execute PayPal Sandbox payout");
  });
  it("shows high-level extraction and plain-language review reasons",()=>{
    const fact=(value:string|null,confidence=0.94)=>({
      value,confidence,evidence:value?[{
        artifact_id:artifactId,page_number:1,source_fragment:value,
      }]:[],
    });
    const markup=render(createElement(PersistedInvoiceObservation,{record:{
      state:"ESCALATE",reason_codes:[
        "IMAGE_EVIDENCE_NOT_VERIFIED","LOW_CONFIDENCE_VENDOR_NAME",
        "SCANNED_PDF_VISUAL_OBSERVATION_UNVERIFIED",
      ],
      extraction:{
        vendor_name:fact("Northstar Components",0.5),
        invoice_number:fact("MG-SANDBOX-101-2026"),
        invoice_date:fact(null,0),
        due_date:fact(null,0),
        currency:fact("USD"),
        total_amount_decimal:fact("1.01"),
        invoice_payment_destination:fact("test@example.test"),
        observed_instructions:[],line_items:[],
      },
    }}));
    expect(markup).toContain("what GLM found");
    expect(markup).toContain("Review needed");
    expect(markup).toContain("Supplier name needs a closer look");
    expect(markup).toContain("AI evidence and technical details");
    expect(markup).toContain("Northstar Components");
    expect(markup).not.toContain("Accept and execute");
  });
});
