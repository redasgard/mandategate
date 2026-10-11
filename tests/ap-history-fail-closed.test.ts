import { describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { assessHistoricalPaymentRisk } from "../src/history/anomaly";

const request = {
  organizationId:"synthetic-org",vendorId:"synthetic-vendor",
  invoiceNumber:"INV-NEW",amountCents:100,currency:"USD",
};

// This unit seam deliberately supplies an inert, synthetic database client.
// It never uses the real AP table and never calls a PayPal endpoint.
describe("bounded paid-history lookup failures",()=>{
  it("rejects query outages instead of manufacturing a clean risk result",async()=>{
    const client={
      query:async()=>{throw new Error("SYNTHETIC_AP_STORE_UNAVAILABLE");},
    } as unknown as PoolClient;
    await expect(assessHistoricalPaymentRisk(request,client))
      .rejects.toThrow("SYNTHETIC_AP_STORE_UNAVAILABLE");
  });

  it("holds payment review if the 2000-row risk window is incomplete",async()=>{
    const rows=Array.from({length:2001},(_,i)=>({
      vendor_id:"synthetic-vendor",
      invoice_number:"INV-"+i,
      amount_cents:100,
      invoice_date:"2026-09-01",
      import_id:"import-"+i,
      normalized_row_sha256:String(i).padStart(64,"0"),
      source_sha256:"0".repeat(64),
    }));
    const client={query:async()=>({rows})} as unknown as PoolClient;
    const risk=await assessHistoricalPaymentRisk(request,client);
    expect(risk.reasonCodes).toContain("AP_HISTORY_WINDOW_INCOMPLETE");
    expect(risk.evidence).toContainEqual(expect.objectContaining({
      code:"AP_HISTORY_WINDOW_INCOMPLETE",
      source:"ap_history.paid_sample_window",
    }));
  });
});
