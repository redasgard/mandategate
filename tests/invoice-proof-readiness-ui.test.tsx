import {describe,expect,it} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import {InvoiceProofReadiness} from "../app/invoice-artifacts/proof-readiness";

describe("Invoice proof readiness is informational",()=>{
 it("does not render an organization selector without any authorized organizations",()=>{
  expect(renderToStaticMarkup(<InvoiceProofReadiness organizations={[]}/>)).toBe("");
 });
 it("labels the non-authorizing invoice state and exposes only read-only controls",()=>{
  const markup=renderToStaticMarkup(<InvoiceProofReadiness organizations={[
   {id:"org_demo",name:"Demo Organization"},
  ]}/>);
  expect(markup).toContain("Verification readiness");
  expect(markup).toContain("No payment authorization");
  expect(markup).toContain("Organization-wide evidence counts only");
  expect(markup).toContain("Checking recorded evidence");
  expect(markup).toContain("Refresh evidence");
  expect(markup).toContain("Known supplier sources".toLowerCase().split(" ")[0]);
  expect(markup).toContain('value="org_demo"');
  expect(markup).not.toContain("<form");
  expect(markup).not.toContain("/api/paypal/");
  expect(markup).not.toContain("Submit payment");
 });
});
