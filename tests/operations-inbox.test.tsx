import {beforeEach,describe,expect,it,vi} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import {createElement} from "react";

const mocks=vi.hoisted(()=>({query:vi.fn()}));
vi.mock("../src/db/pool",()=>({pool:{query:mocks.query}}));
import {readIncomingInvoices} from "../src/db/operations-inbox";
import {IncomingInvoiceQueue} from "../app/components/incoming-invoices";

beforeEach(()=>{mocks.query.mockReset();});

describe("Incoming agent/admin invoice evidence inbox",()=>{
  it("uses current ADMIN membership and immutable artifact-matched observation hints",async()=>{
    mocks.query.mockResolvedValue({rows:[{
      id:"invoice-001",organization:"Demo org",analysis_status:"ESCALATED",
      mime_type:"application/pdf",created_at:new Date("2026-10-20T10:00:00Z"),
      ai_vendor:"Northstar Components",ai_invoice:"INV-100",
      ai_amount:"1.01",ai_currency:"USD",
    }]});
    const rows=await readIncomingInvoices("admin-1",200);
    expect(rows).toHaveLength(1);
    expect(rows[0].suggestedVendor).toBe("Northstar Components");
    expect(rows[0].suggestedAmount).toBe("1.01");

    const [query,params]=mocks.query.mock.calls[0];
    expect(params).toEqual(["admin-1",25]);
    expect(query).toContain("m.user_id=$1");
    expect(query).toContain("m.role='ADMIN' and m.active=true");
    expect(query).toContain("i.organization_id=a.organization_id");
    expect(query).toContain("i.input_sha256=a.sha256");
    expect(query).toContain("i.error_code is null");
    expect(query).toContain("i.finished_at desc nulls last");
    expect(query).toContain("limit 1) obs on true");
    expect(query).not.toContain("i.created_at");
    expect(query.toLowerCase()).not.toMatch(/\b(?:insert|update|delete|truncate|drop|alter)\b/);
  });

  it("escapes untrusted AI suggestions and never advertises an authorized payment",async()=>{
    mocks.query.mockResolvedValue({rows:[{
      id:"invoice-002",organization:"Demo org",analysis_status:"STORED_UNTRUSTED",
      mime_type:"application/pdf",created_at:new Date("2026-10-20T10:00:00Z"),
      ai_vendor:'<img src=x onerror="alert(1)">',ai_invoice:"INV-101",
      ai_amount:"1.01",ai_currency:"USD",
    }]});
    const rows=await readIncomingInvoices("admin-1");
    const html=renderToStaticMarkup(createElement(IncomingInvoiceQueue,{items:rows}));
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("USD 1.01");
    expect(html).toContain("Received · untrusted");
    expect(html).toContain('href="/invoice-artifacts/invoice-002"');
    expect(html).not.toContain("Execute PayPal");
  });

  it("does not fabricate model fields when nothing was observed",async()=>{
    mocks.query.mockResolvedValue({rows:[{
      id:"invoice-003",organization:"Demo org",analysis_status:"FAILED",
      mime_type:"image/png",created_at:new Date("2026-10-20T10:00:00Z"),
      ai_vendor:null,ai_invoice:null,ai_amount:null,ai_currency:null,
    }]});
    const [row]=await readIncomingInvoices("admin-1");
    const html=renderToStaticMarkup(createElement(IncomingInvoiceQueue,{items:[row]}));
    expect(row.suggestedVendor).toBeNull();
    expect(html).toContain("No AI suggestions");
    expect(html).toContain("Analysis failed");
    expect(html).not.toContain("USD 1.01");
  });
});
