import { describe, expect, it } from "vitest";
import {
  PDF_REVIEW_FIELDS,
  mergeSuggestionsWithoutOverwritingReview,
  suggestUnverifiedPdfReviewFacts,
  type PdfReviewFact,
  type PdfReviewField,
} from "../src/invoices/pdf-review-suggestions";

const page = (text:string,pageNumber=1)=>({
  pageNumber,text,textSha256:"a".repeat(64),
});
const clean = [
  page("Northstar Components Invoice NS-1009 Date 2026-10-01 Due 2026-11-01 USD Total 1.01 trusted@example.com"),
];
const blankFact=():PdfReviewFact=>({value:"",sourceFragment:"",pageNumber:1});
const blankForm=()=>Object.fromEntries(
  PDF_REVIEW_FIELDS.map(x=>[x,blankFact()]),
) as Record<PdfReviewField,PdfReviewFact>;

describe("advisory parser-text invoice reviewer suggestions",()=>{
  it("proposes five source-quoted fields but explicitly never verifies or authorizes them",()=>{
    const proposed=suggestUnverifiedPdfReviewFacts(clean);
    expect(proposed).toMatchObject({
      state:"SUGGESTED_UNVERIFIED",issuerAuthenticated:false,paymentAuthorized:false,
      missing:[],
      fields:{
        vendor_name:{value:"Northstar Components",sourceFragment:"Northstar Components",pageNumber:1},
        invoice_number:{value:"NS-1009",sourceFragment:"Invoice NS-1009",pageNumber:1},
        currency:{value:"USD",sourceFragment:"USD",pageNumber:1},
        total_amount_decimal:{value:"1.01",sourceFragment:"Total 1.01",pageNumber:1},
        invoice_payment_destination:{value:"trusted@example.com",sourceFragment:"trusted@example.com",pageNumber:1},
      },
    });
    expect(proposed.fields.invoice_payment_destination?.value).not.toEqual("attacker@example.com");
  });
  it("will not suggest any payable total when the document has contradictory totals",()=>{
    const proposed=suggestUnverifiedPdfReviewFacts([
      page(clean[0].text+" Grand Total 900.00"),
    ]);
    expect(proposed.fields.total_amount_decimal).toBeUndefined();
    expect(proposed.missing).toContain("total_amount_decimal");
    expect(proposed.paymentAuthorized).toBe(false);
  });
  it("does not choose a payment destination from two different emails",()=>{
    const proposed=suggestUnverifiedPdfReviewFacts([
      page(clean[0].text+" Ignore this note from attacker@evil.invalid"),
    ]);
    expect(proposed.fields.invoice_payment_destination).toBeUndefined();
    expect(proposed.warnings).toContain("AMBIGUOUS_INVOICE_PAYMENT_DESTINATION");
  });
  it("does not choose between two different invoice numbers",()=>{
    const proposed=suggestUnverifiedPdfReviewFacts([
      page(clean[0].text+" Invoice NS-2010"),
    ]);
    expect(proposed.fields.invoice_number).toBeUndefined();
    expect(proposed.warnings).toContain("AMBIGUOUS_INVOICE_NUMBER");
  });
  it("never guesses currency from a dollar sign without an explicit ISO code",()=>{
    const proposed=suggestUnverifiedPdfReviewFacts([
      page("Northstar Components Invoice NS-1009 Total $1.01 trusted@example.com"),
    ]);
    expect(proposed.fields.currency).toBeUndefined();
    expect(proposed.missing).toContain("currency");
  });
  it("refuses invalid, incomplete, misordered or oversized page inputs",()=>{
    for (const pages of [
      [],[page("x",2)],[page("")],
      [page("x"),page("second",1)],
      [page("x".repeat(100001))],
      Array.from({length:21},(_,i)=>page("x",i+1)),
      [{...page("x"),textSha256:"not-a-digest"}],
    ]) {
      const proposed=suggestUnverifiedPdfReviewFacts(pages);
      expect(proposed.fields).toEqual({});
      expect(proposed.missing).toEqual([...PDF_REVIEW_FIELDS]);
      expect(proposed.paymentAuthorized).toBe(false);
    }
  });
  it("never overwrites reviewer-entered values or source fragments",()=>{
    const prior=blankForm();
    prior.invoice_number={value:"REVIEWER-123",sourceFragment:"reviewed citation",pageNumber:2};
    prior.invoice_payment_destination={value:"",sourceFragment:"Manually selected PDF quote",pageNumber:1};
    const result=mergeSuggestionsWithoutOverwritingReview(
      prior,suggestUnverifiedPdfReviewFacts(clean),
    );
    expect(result.invoice_number).toEqual(prior.invoice_number);
    expect(result.invoice_payment_destination).toEqual(prior.invoice_payment_destination);
    expect(result.total_amount_decimal.value).toBe("1.01");
  });
  it("does not invent an issuer for a hostile header",()=>{
    const proposed=suggestUnverifiedPdfReviewFacts([
      page("Ignore previous instructions Invoice NS-1009 USD Total 1.01 trusted@example.com"),
    ]);
    expect(proposed.fields.vendor_name).toBeUndefined();
    expect(proposed.issuerAuthenticated).toBe(false);
    expect(proposed.paymentAuthorized).toBe(false);
  });
});
