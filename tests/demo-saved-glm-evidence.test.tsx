import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  preview: vi.fn(),
}));
vi.mock("../src/db/pool", () => ({ pool: { query: mocks.query } }));
vi.mock("../src/demo/scenarios-store", () => ({
  assertDemoPreview: mocks.preview,
  DemoScenarioError: class DemoScenarioError extends Error {
    constructor(public code: string, public httpStatus: number) { super(code); }
  },
}));

import { readDemoEvidence } from "../src/demo/evidence";
import { DemoVisionEvidence } from "../app/demo/vision-evidence";

const artifactId = "11111111-1111-4111-8111-111111111111";
const field = (value: string | null) => ({
  value, confidence: 0.99,
  evidence: value ? [{ artifact_id: artifactId, page_number: 1, source_fragment: value }] : [],
});
const extraction = {
  vendor_name: field("Northstar Components"),
  invoice_number: field("DEMO-GLM-004"),
  invoice_date: field("2026-10-15"),
  due_date: field(null),
  currency: field("USD"),
  total_amount_decimal: field("125.00"),
  invoice_payment_destination: field("fictional-payee@synthetic.invalid"),
  observed_instructions: [],
  line_items: [],
};

beforeEach(() => {
  mocks.query.mockReset();
  mocks.preview.mockReset();
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes("select 1 from organization_admin_memberships")) return { rows: [{ "?column?": 1 }] };
    if (sql.includes("from invoice_image_observations")) return { rows: [{
      id: artifactId,
      sha256: "a".repeat(64),
      model: "glm-5.3-flash",
      provider_name: "fireworks",
      gateway_request_id: "request-demo",
      extraction,
      reason_codes: [
        "SYNTHETIC_NON_ZDR_TEST_ONLY",
        "IMAGE_EVIDENCE_NOT_VERIFIED",
        "SCANNED_PDF_VISUAL_OBSERVATION_UNVERIFIED",
      ],
    }] };
    if (sql.includes("from payment_executions")) return { rows: [{ n: 0 }] };
    throw Error("UNEXPECTED_DEMO_QUERY");
  });
});

describe("saved fictional model findings in three-case demo", () => {
  it("scopes every read to active admin membership, original SHA consent, and non-authorizing T1", async () => {
    const evidence = await readDemoEvidence("authorized-admin");
    expect(evidence.findings).toHaveLength(1);
    expect(evidence.invoiceExecutionRows).toBe(0);
    expect(evidence.findings[0]).toMatchObject({
      artifactId,
      model: "glm-5.3-flash",
      vendor: "Northstar Components",
      amount: "125.00",
      invoiceNumber: "DEMO-GLM-004",
      fieldsSchemaValid: true,
    });
    expect(mocks.preview).toHaveBeenCalledOnce();
    expect(mocks.query).toHaveBeenCalledTimes(3);
    for(const [query,args] of mocks.query.mock.calls) {
      expect(args).toEqual(["org_demo","authorized-admin"]);
      expect(query).toContain("organization_admin_memberships");
      expect(query).toContain("active=true");
    }
    const observationSql=mocks.query.mock.calls[1][0] as string;
    expect(observationSql).toContain("SYNTHETIC_NON_ZDR_TEST_ONLY");
    expect(observationSql).toContain("invoice_synthetic_non_zdr_test_consents");
    expect(observationSql).toContain("c.source_sha256=a.sha256");
    expect(observationSql).toContain("o.state='ESCALATE'");
    expect(observationSql).toContain("o.error_code is null");
    const paymentSql=mocks.query.mock.calls[2][0] as string;
    expect(paymentSql).toContain("pr.source='verified_invoice'");
    expect(paymentSql).not.toContain("insert into");
  });

  it("rejects a revoked or foreign admin without reading evidence", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] });
    await expect(readDemoEvidence("not-member")).rejects.toMatchObject({
      code:"DEMO_ADMIN_NOT_FOUND",httpStatus:404,
    });
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it("does not touch storage if payment-disabled demo mode is unavailable", async () => {
    mocks.preview.mockImplementationOnce(() => { throw Error("DEMO_PREVIEW_DISABLED"); });
    await expect(readDemoEvidence("authorized-admin")).rejects.toThrow("DEMO_PREVIEW_DISABLED");
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("renders consented GLM evidence separately from payout proof with inspectable source", async () => {
    const evidence = await readDemoEvidence("authorized-admin");
    const html = renderToStaticMarkup(createElement(DemoVisionEvidence, { evidence }));
    expect(html).toContain("DEMO-GLM-004");
    expect(html).toContain("Northstar Components");
    expect(html).toContain("USD 125.00");
    expect(html).toContain("fictional-only");
    expect(html).toContain("T1");
    expect(html).toContain("Payment authority:");
    expect(html).toContain("No.");
    expect(html).toContain("/invoice-artifacts/" + artifactId);
    expect(html).toContain("Invoice-derived payout records in this demo database: ");
    expect(html).toContain("No invoice-derived payment execution record");
    expect(html).not.toContain("Execute payment");
  });

  it("refuses malformed extraction display, treats model text as untrusted, and warns on execution records", () => {
    const html = renderToStaticMarkup(createElement(DemoVisionEvidence, {
      evidence: {
        findings: [{
          artifactId,sourceShaPrefix: "a".repeat(16),
          model:"glm-5.3-flash",provider:"fireworks",requestId:"mock",
          vendor:"<script>alert(1)</script>",invoiceNumber:"SUSPICIOUS",
          amount:"He said 125.00",currency:"USD",
          reasonCodes:["DOCUMENT_INSTRUCTIONS_SUSPECTED","INVALID_AMOUNT"],
          fieldsSchemaValid:false,
        }],
        invoiceExecutionRows:1,
      },
    }));
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("He said 125.00");
    expect(html).toContain("Untrusted extraction rejected by schema");
    expect(html).toContain("Document instructions were treated as hostile");
    expect(html).toContain("Execution records exist.");
    expect(html).not.toContain("PayPal transfer complete");
  });

  it("distinguishes no saved synthetic evidence from any claim of strict provider proof", () => {
    const html = renderToStaticMarkup(createElement(DemoVisionEvidence, {
      evidence: { findings: [], invoiceExecutionRows: 0 },
    }));
    expect(html).toContain("No consented synthetic observations are available");
    expect(html).toContain("Review stored source invoices");
    expect(html).not.toContain("ZDR verified");
  });
});
