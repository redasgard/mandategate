import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseApHistoryCsv } from "../src/history/csv-import";
import { detectApHistoryRisk, type ApPaidSample } from "../src/history/anomaly";

const input=readFileSync(join(process.cwd(),"public/demo/northstar-fictional-ap-history.csv"));
const parsed=parseApHistoryCsv(input);
const paid:ApPaidSample[]=parsed.rows.map(row=>({
  vendorId:"vendor_northstar",
  invoiceNumber:row.invoiceNumber,
  amountCents:row.amountCents,
  invoiceDate:row.invoiceDate,
  importId:"FICTIONAL_IMPORT_ID",
  sourceSha256:parsed.sourceSha256,
  rowSha256:row.rowSha256,
}));
const risk=(invoiceNumber:string,amountCents:number)=>detectApHistoryRisk({
  vendorId:"vendor_northstar",invoiceNumber,amountCents,currency:"USD",
},paid);

describe("static fictional AP history judge pack",()=>{
  it("contains only five valid fictional, paid-status CSV observations",()=>{
    expect(parsed.rowCount).toBe(5);
    expect(parsed.rows).toHaveLength(5);
    expect(parsed.quarantined).toEqual([]);
    expect(parsed.duplicatesCollapsed).toBe(0);
    expect(parsed.rows.every(row=>
      row.vendorName==="Northstar Components" && row.currency==="USD" &&
      row.status==="PAID" && row.paymentDestination===null &&
      row.department==="FICTIONAL_DEMO" && row.costCenter==="MOCK_AP_ONLY"
    )).toBe(true);
    expect(input.toString("utf8")).not.toMatch(/https?:\/\/|paypal\.com|@/i);
  });
  it("escalates a later amount above the imported, fixed baseline",()=>{
    const observed=risk("NS-AP-NEW-OUTLIER",280000);
    expect(observed.reasonCodes).toContain("AP_AMOUNT_OUTLIER");
    expect(observed.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code:"AP_AMOUNT_OUTLIER",observed:280000,expected:105000,
        provenance:expect.objectContaining({
          sourceSha256:parsed.sourceSha256,sampleCount:5,
        }),
      }),
    ]));
    expect(observed).not.toHaveProperty("paymentAuthorized");
    expect(observed).not.toHaveProperty("outcome");
  });
  it("detects exact historical invoice replay without admitting payment authority",()=>{
    const observed=risk("NS-AP-003",105000);
    expect(observed.reasonCodes).toContain("AP_INVOICE_NUMBER_REPLAY");
    expect(observed.evidence[0].provenance).toMatchObject({
      sourceSha256:parsed.sourceSha256,
    });
    expect(observed).not.toHaveProperty("outcome");
  });
  it("abstains on a safe ordinary future payment after the imported baseline",()=>{
    const observed=risk("NS-AP-006",120000);
    expect(observed.reasonCodes).toEqual([]);
    expect(observed.evidence).toEqual([]);
  });
});
