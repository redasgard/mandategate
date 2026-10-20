import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks=vi.hoisted(()=>({
  session:vi.fn(),query:vi.fn(),
}));
vi.mock("next/headers",()=>({headers:async()=>new Headers()}));
vi.mock("next/navigation",()=>({
  redirect:(path:string)=>{throw new Error("REDIRECT:"+path);},
}));
vi.mock("../src/auth/auth",()=>({auth:{api:{getSession:mocks.session}}}));
vi.mock("../src/db/pool",()=>({pool:{query:mocks.query}}));
vi.mock("../app/invoice-artifacts/upload-form",()=>({
  InvoiceArtifactUpload:()=>"SAFE_INVOICE_UPLOAD_FORM",
}));
import InvoiceArtifactListPage from "../app/invoice-artifacts/page";

const base={
  id:"5b4537c7-3bf7-4884-95b9-fd321015ccf1",
  organization_id:"org_demo",
  mime_type:"application/pdf",
  byte_size:4500,
  sha256:"a".repeat(64),
  analysis_status:"ESCALATED",
  created_at:new Date("2026-10-15T19:54:30.526Z"),
};
function rows(artifacts:Record<string,unknown>[]) {
  mocks.query.mockResolvedValueOnce({rows:artifacts});
  mocks.query.mockResolvedValueOnce({rows:[{id:"org_demo",name:"MandateGate Demo Org"}]});
}

beforeEach(()=>{
  mocks.session.mockReset();
  mocks.query.mockReset();
  mocks.session.mockResolvedValue({user:{id:"reviewer_admin"}});
});

describe("signed-in invoice intake discoverability without authority confusion",()=>{
  it("links to the Northstar $125 fictional document by its saved unverified model fields",async()=>{
    rows([{
      ...base,ai_vendor:"Northstar Components",
      ai_invoice:"DEMO-GLM-004",ai_amount:"125.00",ai_currency:"USD",
    }]);
    const html=renderToStaticMarkup(await InvoiceArtifactListPage());
    expect(html).toContain("DEMO-GLM-004");
    expect(html).toContain("Northstar Components");
    expect(html).toContain("USD 125.00");
    expect(html).toContain('href="/invoice-artifacts/'+base.id+'"');
    expect(html).toContain("Saved AI only. Not T2 verification, issuer proof, or payment approval");
    expect(html).toContain("Viewing the list does not initiate an AI request or a PayPal payout");
    expect(html).toContain("SAFE_INVOICE_UPLOAD_FORM");

    expect(mocks.query).toHaveBeenCalledTimes(2);
    const [sourceSql, params]=mocks.query.mock.calls[0];
    expect(params).toEqual(["reviewer_admin"]);
    expect(sourceSql).toContain("m.user_id=$1 and m.role='ADMIN' and m.active=true");
    expect(sourceSql).toContain("o.organization_id=a.organization_id");
    expect(sourceSql).toContain("o.state in ('ESCALATE','EXTRACTED_UNTRUSTED')");
    expect(sourceSql).toContain("o.error_code is null");
    expect(sourceSql).not.toContain("SYNTHETIC_NON_ZDR_TEST_ONLY");
    expect(sourceSql).toContain("o.input_sha256=a.sha256");
    expect(sourceSql).toContain("^[0-9]{1,12}[.][0-9]{2}$");
    expect(sourceSql).not.toMatch(/\b(?:insert|update|delete|truncate|drop|alter)\b/i);
  });

  it("keeps missing or failed model fields absent instead of inventing an invoice",async()=>{
    rows([{...base,analysis_status:"FAILED",ai_vendor:null,ai_invoice:null,ai_amount:null,ai_currency:null}]);
    const html=renderToStaticMarkup(await InvoiceArtifactListPage());
    expect(html).toContain("No eligible saved AI suggestions");
    expect(html).toContain("FAILED");
    expect(html).not.toContain("DEMO-GLM-004");
    expect(html).not.toContain("USD 125.00");
  });

  it("escapes attacker-controlled model text in server-rendered HTML",async()=>{
    rows([{
      ...base,ai_vendor:"<script>alert('x')</script>",
      ai_invoice:"DEMO-GLM-004",ai_amount:"fake",ai_currency:"<BAD>",
    }]);
    const html=renderToStaticMarkup(await InvoiceArtifactListPage());
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<BAD>");
    expect(html).toContain("Amount suggestion:");
  });

  it("never loads invoices for a visitor without a session",async()=>{
    mocks.session.mockResolvedValue(null);
    await expect(InvoiceArtifactListPage()).rejects.toThrow("REDIRECT:/sign-in");
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
