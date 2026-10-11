import {describe,expect,it} from "vitest";
import {detectApHistoryRisk,type ApPaidSample} from "../src/history/anomaly";
const row=(invoiceNumber:string,amountCents=10000,vendorId="northstar"):ApPaidSample=>({
  vendorId,invoiceNumber,amountCents,invoiceDate:"2026-10-01",
  importId:"import-1",rowSha256:"a".repeat(64),sourceSha256:"b".repeat(64),
});
const candidate={vendorId:"northstar",invoiceNumber:"INV-1010",amountCents:10000,currency:"USD"};
describe("deterministic AP history risk is escalation-only",()=>{
  it("detects replay of previously paid invoice number",()=>{
    const r=detectApHistoryRisk({...candidate,invoiceNumber:"INV-1001"},[row("INV-1001")]);
    expect(r.reasonCodes).toContain("AP_INVOICE_NUMBER_REPLAY");
    expect(r.evidence[0].provenance).toMatchObject({importId:"import-1"});
  });
  it("flags confusable near duplicate but does not flag ordinary sequence numbers",()=>{
    expect(detectApHistoryRisk({...candidate,invoiceNumber:"INV-1OO1"},[row("INV-1001")])
      .reasonCodes).toContain("AP_NEAR_DUPLICATE_INVOICE");
    expect(detectApHistoryRisk({...candidate,invoiceNumber:"INV-1002"},[row("INV-1001")])
      .reasonCodes).not.toContain("AP_NEAR_DUPLICATE_INVOICE");
  });
  it("escalates vendor amount outliers against paid distribution",()=>{
    const historical=[row("INV-1",10000),row("INV-2",12000),row("INV-3",11000)];
    const r=detectApHistoryRisk({...candidate,invoiceNumber:"INV-999",amountCents:200000},historical);
    expect(r.reasonCodes).toContain("AP_AMOUNT_OUTLIER");
    expect(r.evidence.find(x=>x.code==="AP_AMOUNT_OUTLIER")?.expected).toBe(11000);
  });
  it("uses company baseline only with sufficient samples and never trusts destinations",()=>{
    const samples=[1,2,3,4,5,6].map(i=>row("OTHER-"+i,10000,"other"));
    const r=detectApHistoryRisk({...candidate,invoiceNumber:"NEW",amountCents:999999},samples);
    expect(r.reasonCodes).toContain("AP_AMOUNT_OUTLIER");
    expect(r.evidence.some(x=>x.source.includes("organization"))).toBe(true);
    expect(detectApHistoryRisk(candidate,[]).reasonCodes).toEqual([]);
  });
  it("does not confuse source spelling with a payment authorization decision",()=>{
    const r=detectApHistoryRisk(candidate,[row("INV-1001")]);
    expect(r).not.toHaveProperty("outcome");
    expect(r.reasonCodes).toEqual([]);
  });
});
